# Claude Code — Prompt 05a: BALLDONTLIE ingestion + polling scheduler + lock-on-play (`locked_at`)

> Paste into Claude Code with the four brain files in the repo root
> (`PROJECT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `SCORING.md`) and Prompts 01–04 in place.
> **ARCHITECTURE.md §3 (ingestion architecture) is the spec for this prompt**, with §4 (the raw feed
> layer + `lineup_slot.locked_at`), §7 (the field map), §8 (the poller-silent alert), and
> **DECISIONS.md → Data source** (Amendment 1 lock-on-play, Amendment 2b polling, 2c GOAT) +
> **Theme B (lock-on-play / no auto-subs)**. This is the **first half of Prompt 05**; the isolated
> Sofascore scraper is **Prompt 05b**, kept separate per ARCHITECTURE §3 (the scraper is its own
> sandboxed worker).

---

## Context (read first)
Read **ARCHITECTURE.md §3, §4, §7, §8**, **DECISIONS.md → Data source** (all three amendments) and
**Theme B**, and **SCORING.md → the feed-availability addendum** (which raw field feeds which line).
State of the build: Prompts 01–04 are done. The repo has the monorepo + Postgres schema (01), the pure
scoring engine (02), the recompute pipeline — `resolveRating`, the `buildScoreInput` adapter,
`recomputePlayerMatch` / `recomputeManagerPeriod`, the `RecomputeStore` port, and the dirty-flag
`sweep` (03) — and the standings layer (04). **`packages/feed` is still a `NotImplemented` stub.** This
prompt makes ingestion real: it **fetches from BALLDONTLIE, writes the raw layer, sets `locked_at`, and
drives the existing sweep.** It introduces the **only non-deterministic parts of the system so far**
(network + clock) — keep them at the edges; everything testable stays pure.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Do **not** reopen or
re-derive any locked decision. Where this prompt and the brain files disagree, **the brain files win.**
If a detail is ambiguous, follow ARCHITECTURE §3/§4 / DECISIONS Data source / Theme B, or leave a
`// TODO(prompt-NN):` / `// TODO(confirm):` naming the section — do not invent rules.

## Scope of THIS prompt — BALLDONTLIE ingestion + locking
Four pieces. Network and clock live **only** in thin edge wrappers; the parsing/mapping and the
mode-decision logic are **pure** (testable with fixtures + an injected `now`, no real IO).

1. **BALLDONTLIE feed client (`packages/feed`) — replace the stub with real HTTP.**
   - Implement the endpoints the build polls (ARCHITECTURE §3 / §7): `matches`, `match_lineups`,
     `match_events`, `player_match_stats`, `team_match_stats`, `match_shots`. Keep the typed response
     shapes the Prompt-01 stub declared (extend, don't churn signatures).
   - **Cursor pagination** (the spec is REST + cursor — §3): a helper that follows the cursor to
     exhaustion and returns all rows. **Auth** via the API key from env (`.env.example` already has the
     slot); never commit it.
   - **Rate-limit aware:** GOAT is **600 req/min**; the **48h dev trial is 5 req/min** — make the limit
     a config value and throttle/back off against it (a simple token-bucket or min-interval is plenty —
     no clever client). The dev default should assume the **trial** rate so a trial key isn't throttled
     out.
   - Keep the client a **thin transport + parse**: HTTP in, typed feed objects out. Inject the HTTP
     transport (a `fetch`-shaped function) so tests drive it with **recorded JSON fixtures**, no
     network. No DB here.

2. **Raw-layer ingestion (idempotent upserts).** Map the typed feed objects → the raw tables (§4) and
   **upsert on natural keys**, so a re-poll overwrites and is self-correcting:
   - `stat_player_match` (PK `match_id,player_id`) — every `player_match_stats` field the §7 map +
     SCORING feed-addendum use (minutes, goals, assists, key_passes, dribbles att/comp, duels won/lost,
     passes total/accurate, long_balls total/accurate, was_fouled, clearances, interceptions,
     tackles_won, blocked_shots, saves, saves_inside_box, punches, high_claims, possession_lost, …).
   - `event_match` (feed event id) — `incident_type` / **`incident_class`**, `time_minute`,
     `added_time`, period, `player_id`, `assist_player_id`, `player_in_id`, `player_out_id`,
     `rescinded`. **Carry `incident_class` through faithfully** — the Prompt-03 adapter keys the card
     classification (second-yellow vs red) and own-goal off it; do **not** pre-collapse it here.
   - `shot_match` (feed shot id) — `match_id`, `player_id`, `shot_type`, `situation`, … (penalty
     detection feeds the §7 penalty-missed/-saved derivations the adapter already does).
   - `stat_team_match` (`match_id,team_id`) — team aggregates (incl. team-level offsides; the
     clean-sheet / goals-conceded inputs).
   - `rating_player_match` with **`source='balldontlie'` ONLY** — the native feed rating, which is the
     **fallback** in the resolver. **Do NOT write `source='scrape'` here** — that's Prompt 05b; the
     resolver (Prompt 03) already prefers `scrape` when present.
   - `fifa_team` / `player` / `fifa_match` reference rows from `matches` (+ lineups): kickoff **UTC**,
     status, scores (incl. ET/pens), stage/group/round, formations, referee.
   - **Every raw write marks `(match_id, player_id)` dirty** (the Prompt-01 flag / `recompute_dirty`)
     so the existing sweep recomputes — see piece 4. (Match-level writes mark each affected player.)

3. **`locked_at` / lock-on-play (Theme B / Data-source Amendment 1).** Set `lineup_slot.locked_at` from
   **actual appearance**, per Theme B — the hard dependency the amendment confirmed is feed-supported:
   - **Starters lock at kickoff:** on the **pre-match `match_lineups` pull**, every player in the
     **official starting XI** has played from minute 1 → set `locked_at = kickoff` on **all
     `lineup_slot` rows referencing that player for the match's period** (starter *or* bench — any
     appearance locks, per Theme B's "a bench player who has played is locked on the bench"). A
     fantasy-lineup player **not** in the official XI (benched by the real team) has **not** played →
     leave `locked_at` null (still swappable).
   - **Subs lock at entry minute:** on each `match_events` **substitution** incident (`player_in`,
     `time_minute`), set `locked_at =` the entry time (effective minute incl. `added_time`) on that
     player's `lineup_slot` rows for the period. **Players never subbed on never lock.**
   - This needs the **match→period association** to find the right `lineup_slot` rows. Prompt 03 left a
     `period_id`-on-`fifa_match` / window-inference `// TODO(prompt-NN):` — **pin it here** (derive a
     fixture's period from its stage/round + the `period` rows; for the group stage, MD1/2/3 = each
     team's 1st/2nd/3rd game, per Theme C). If period rows aren't yet seeded for a fixture, leave a
     clear `// TODO(confirm):` rather than guessing the mapping.
   - **`locked_at` governs swap-editability only** — it does **not** affect scoring (Prompt-03
     `recomputeManagerPeriod` reads `is_starter`, never `locked_at`). Don't entangle them.

4. **The worker scheduler + driving the sweep (`apps/worker`).** Replace the Prompt-01 no-op loop with
   the real cadence (ARCHITECTURE §3 scheduler table). Each tick reads `fifa_match` to pick a mode; **the
   mode-decision is a pure function of `(matches, now)`** (inject `now`) — the worker just supplies the
   clock:

   | Mode | When | Pulls → does |
   |---|---|---|
   | **Schedule sync** | hourly + daily | `matches` → upsert `fifa_match` (kickoffs / status / scores) |
   | **Pre-match** | at/after each kickoff, once | `match_lineups` → **lock starters** (piece 3) |
   | **Live** | while any match `in_progress` (~60s) | `match_events` + `player_match_stats` + `match_shots` + `team_match_stats` → upsert raw (piece 2); **lock subs at entry** (piece 3) |
   | **Settle** | after FT until values stabilize | `player_match_stats` + `match_shots` + **`rating` (balldontlie)** → upsert raw; stats lag hours and the rating lands near/after FT, so keep polling until stable |

   - After each ingestion pass, **call the existing Prompt-03 `sweep`** so dirtied `(match,player)` rows
     flow raw → `score_player_match` → `score_manager_period` → `standing`. Re-poll + re-sweep is
     idempotent (upserts + the dirty-flag walk). **Respect the frozen gate** — the sweep already refuses
     to restate a frozen period without the commissioner override; don't bypass it.
   - **Lock-on-play fallback (§3 / §8):** a **per-match config flag** that reverts a match to
     **kickoff-locking** (lock all *fantasy-listed* starters at kickoff; don't lock unentered subs) for
     when live appearance data is missing — and the **single most valuable alert**: if the **live poller
     hasn't succeeded inside a match window**, log/emit it so the operator can flip the flag. Wire the
     flag + the alert; the operator UI that flips it is later.

## Dependency / confirm BEFORE relying on the feed enums (first live data)
The §7 **confirm-in-code** items become real here — encode the mappings **defensively** and leave a
`// TODO(confirm):` for each to verify against the first live match (**not** a blocker):
- **`match_events.incident_class`** values for **own-goal** and **second-yellow vs red** — the adapter
  must see a two-yellow dismissal as *second yellow*, not red (Prompt-02a / §7). Ingestion must pass the
  class through so the adapter can do that; a misclassified red would double-dip.
- **`match_shots.situation`** reliably flags `penalty` (penalty-missed / -saved derivations).
- **`duels_won` includes aerials?** (affects the duel bucket) and **`blocked_shots` is defensive**
  (centre-backs accrue it, strikers don't — §7 says confirmed; 30-second sanity-check on live data).

## Explicitly OUT of scope (later prompts; leave existing stubs/seams intact)
- **The Sofascore scraper — Prompt 05b.** Write **no** `source='scrape'` ratings and build no
  Playwright / scraper worker here. The one-time **BALLDONTLIE-vs-Sofascore rating comparison**
  (ARCHITECTURE §3 "Action for Code") needs both sources, so it lands **with 05b**, not here.
- **The scoring engine / recompute internals** — done (02 / 03). You *call* `sweep`; you don't change
  it, the adapter, the resolver, or the engine. **No churn to their signatures.**
- **Standings math** — done (04). Ingestion just dirties; the sweep handles `standing`.
- **FAAB batch, draft controller, Supabase Realtime + the "vs the field" UI, auth, the manual / Cowork
  override UI, the group→playoff transition / eliminations** — all untouched.

## Tests — fixtures + injected clock; no real network, no real clock
Vitest; root `pnpm test` stays green. Keep the parse/map + mode-decision logic **pure** (fixtures in,
rows/modes out); confine IO to the thin client + store wrappers.
- **Feed client parse:** recorded JSON fixtures per endpoint (incl. a match with a **substitution**,
  **cards** (a two-yellow dismissal), a **penalty** shot, and team stats) → typed feed objects;
  **cursor pagination** assembles multi-page results; the rate-limit throttle respects the configured
  rate (assert with a **fake timer**, no real waiting).
- **Raw upsert idempotency:** ingest a fixture → rows; ingest **again** → identical rows, no dupes; a
  **changed-value** re-poll overwrites; every write set the `(match,player)` **dirty** flag.
- **Lock-on-play:** official-XI fixture → starters' `lineup_slot.locked_at = kickoff`, a
  fantasy-listed-but-benched player stays **null**, a never-appearing player stays **null**; a
  substitution event → that sub's `locked_at = entry minute` (incl. `added_time`); assert
  `is_starter`-only scoring is **unaffected** by `locked_at`.
- **Scheduler mode decision (pure):** fixture `fifa_match` states + an injected `now` → returns
  pre-match / live / settle / schedule-sync correctly (e.g. a just-kicked-off match → pre-match-once
  then live; a match FT 2h ago with no rating yet → settle).
- **Fallback toggle:** with the per-match flag set, locking uses kickoff-lock (fantasy starters lock at
  kickoff, unentered subs don't); the poller-silent condition raises the alert.
- **Sweep wiring + frozen gate:** an ingestion write dirties `(match,player)`, the worker's `sweep` call
  recomputes through `standing`; a late write into a **frozen** period does **not** restate it
  (consistent with Prompt 03).
- **Purity:** grep-clean (no `Date.now` / `new Date` / `fetch(` / network / env) in the parse-map +
  mode modules; IO confined to the client + store/worker edges.

## Definition of done (verify these pass)
- `packages/feed` fetches real BALLDONTLIE data over the six endpoints with cursor pagination + a
  configurable rate limit (no `NotImplemented` left in those endpoints); the worker runs the four modes,
  upserts the raw layer idempotently, sets `locked_at` per lock-on-play, and calls the Prompt-03 `sweep`.
- The parse/map + mode-decision logic is **pure** (fixtures + injected `now`, unit-tested without
  network or DB); only the client transport + the store/worker wrappers do IO.
- `pnpm -w typecheck`, `pnpm lint`, `pnpm format:check` exit 0; `pnpm test` is green (engine + recompute
  + standings + the new ingestion / locking suites).
- No out-of-scope work: **no Sofascore scraper, no `source='scrape'` rating, no rating comparison**; the
  engine / adapter / resolver / `sweep` / standings signatures untouched; FAAB / draft / Realtime / UI /
  auth / transition all untouched.

## When done
Summarize: the feed-client signatures + pagination / rate-limit approach; the raw-layer mapping (which
feed field → which table/column) and the idempotency keys; how `locked_at` is set (starters@kickoff,
subs@entry, never-appear→null) and how you resolved the match→period mapping (or the `TODO` left); the
scheduler modes + the pure mode-decision; the fallback toggle + poller-silent alert; the test count +
coverage (parse, pagination, idempotency, locking, mode decision, fallback, sweep + frozen) and the
purity proof; the `// TODO(confirm):` enum items left for first live data; and the exact commands you
verified. Do not start Prompt 05b or any out-of-scope feature.
