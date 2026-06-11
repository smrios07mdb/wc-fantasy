# Architecture & Stack — LOCKED

Build-ready infrastructure spec for the World Cup fantasy app. Spun out of DECISIONS.md
(the way SCORING.md was) because the detail is large. Consumed by **Claude Code**
(implementation) and **Claude Design** (the "vs the field" screen + draft room UX).

Guiding constraint: **"boring and reliable" over clever.** Every choice below is the
well-trodden default for a small team, sized for the real scale: **a private league of ~12
managers, one ~month-long tournament (~104 matches).** Concurrency peaks are a dozen users —
during the draft (≈2h, everyone at once) and inside live match windows. Nothing here is built
for public scale; that would be the un-boring mistake.

---

## 0. TL;DR decision table

| Concern | Decision | One-line why |
|---|---|---|
| Language | **TypeScript end-to-end** | One language across UI, scoring, ingestion → small team holds it all; shared types are the reliability lever. |
| Frontend | **Next.js (React) + TypeScript** | Canonical, deepest ecosystem, what Design + Code target most easily. |
| Backend | **Modular monolith** (Next.js route handlers) **+ separate worker service** | Web traffic and scheduled jobs have different runtimes; one repo, one DB, two processes. |
| Persistence | **PostgreSQL** (via Supabase) | Consistency-critical relational state (unique ownership, sealed bids, no double-spend) = textbook Postgres + constraints + transactions. |
| ORM / migrations | **Prisma** (Drizzle acceptable) | Typed, boring, ubiquitous. |
| Realtime | **Supabase Realtime** (draft room + vs-the-field) | Reuses the DB vendor; server-authoritative state in Postgres, broadcast on change. Fallback: Socket.IO + polling. |
| Auth | **Supabase Auth** — email magic-link (+ optional Google), email allowlist | Passwordless, private, nothing to operate. |
| Compute host | **Render** (Web Service + Cron Jobs + Background Workers + scraper Worker) | One platform that hosts a Next.js app *and* real long-running workers + cron. (Railway equivalent; Vercel for the app if you want its DX, accepting a 3rd vendor.) |
| Ingestion | **Polling** the BALLDONTLIE WC API (no webhooks exist at our tier) | Tighter cadence during live windows; idempotent upserts; recompute on settle. |
| Data feed tier | **BALLDONTLIE GOAT — $39.99/mo, single FIFA product** | Unlocks every endpoint we use; 600 req/min; 48h trial for dev. |
| Sofascore rating | **Isolated scraper — PRIMARY source** (BALLDONTLIE rating = fallback) | The ladder is calibrated to Sofascore; BALLDONTLIE's rating provenance is unknown, so it backs up the scrape rather than replacing it. |
| Vendors total | **2** (Render + Supabase) | Each does what it's best at; data is plain SQL → low lock-in. |
| Est. run cost | **≈ $40/mo feed + low-double-digit hosting** | A season, not forever. |

---

## 1. Stack

**TypeScript everywhere.** The scoring model is integer/fraction bucketing — no need for a
Python data stack — so a single language removes context-switching and, more importantly, lets
the **scoring rules, the lock logic, the feed-ingestion shapes, and the API contract share one
set of types.** For a small team that is the single biggest reliability win available.

- **Frontend:** Next.js (App Router) + React + TypeScript. ~~Tailwind for styling~~ — **AMENDED
  (Prompt 19 → 21, see DECISIONS):** Design delivered the system as **plain CSS** (`ds.css` design
  system + per-screen CSS), so the app consumes that as-delivered rather than re-translating to
  Tailwind. **Prompt 20 promoted `ds.css` to the single GLOBAL stylesheet** (root `layout.tsx`,
  imported **after** `globals.css` so it wins cascade ties; canonical copy at `app/styles/ds.css`,
  with the global dark `body` surface now in effect). Tailwind / `globals.css` / Preflight remain
  installed and **coexist** (not the styling system; teardown is post-sprint). The feature/landing
  routes still carry byte-identical per-route `ds.css` copies that double-load harmlessly. The
  authenticated screens (hub `/` + `/draft` + `/lineup` + `/vsfield` + `/waivers` + `/scoring` +
  `/settings`) are wrapped by the **App Shell** top-bar nav (`app/shell/AppShell.tsx`, which absorbed
  the interim CrossNav); auth/landing routes are
  not — they carry their own brand chrome (`/sign-in` + `/auth/denied` ds-skinned off Tailwind onto the
  split-shell `_auth/auth.css` in **Prompt 21**; the marketing landing in Prompt 19). Two reactive
  surfaces matter: the **live draft room** and the **live "vs the field" screen**;
  everything else is ordinary CRUD.
- **Backend:** a **modular monolith** — the Next.js app's route handlers serve the web API
  (auth'd reads/writes: set lineup, submit FAAB bid, make pick, admin overrides). Scheduled and
  long-running work (pollers, FAAB batch, period close, scraper) runs in a **separate worker
  service in the same repo**, sharing the same database and the same TypeScript model code.
  Monorepo, shared `packages/` for the scoring engine + feed client + DB schema.
- **Why not microservices:** at a dozen users they are pure overhead. One deployable app + a
  worker process is the boring shape that still cleanly separates request-serving from
  scheduled jobs.

---

## 2. Hosting / deployment topology

Two managed vendors. Single region near the league. No multi-region, no Kubernetes.

```
                 +---------------------------- Render ----------------------------+
   Browsers ---> |  Web Service: Next.js app (SSR + API route handlers)           |
   (~12)         |                                                                |
                 |  Background Worker: ingestion scheduler                         |
                 |    - schedule sync (hourly)                                     |
                 |    - pre-match lineup pull (at each kickoff)                    |
                 |    - LIVE poll loop (~60s while any match in_progress)          |
                 |    - post-match settle poll (until stats + rating land)         |
                 |    - recompute sweeper (dirty (match,player) -> scores -> table)|
                 |    - FAAB batch trigger (per period, before its 1st kickoff)    |
                 |                                                                 |
                 |  Cron Job: period-close check (when a wave's last match ends)   |
                 |                                                                 |
                 |  Worker (ISOLATED): Sofascore rating scraper [PRIMARY]          |
                 +---------------+-------------------------------------+-----------+
                                 | SQL + Realtime                      | writes rating only
                                 v                                     v
                 +------------------------- Supabase ------------------------------+
                 |  Postgres (all state)  -  Auth (magic-link)  -  Realtime (WS)   |
                 +----------------------------------------------------------------+
                                 ^
                                 | pull (REST, cursor-paginated, polling)
                 +---------------+---------------+      +----------------------------+
                 | BALLDONTLIE FIFA WC API (GOAT) |      | Sofascore (scrape, PRIMARY) |
                 +-------------------------------+      +----------------------------+
```

- **App on Render Web Service.** Render hosts a Next.js app *and* gives first-class **Cron Jobs**
  and **Background Workers**, so the schedulers/scraper live on the same platform with the same
  build. (Railway is an equivalent one-platform swap. If the team wants Vercel's Next.js DX, put
  the app on Vercel and keep the workers on Render/Railway — a 3rd vendor, documented but not the
  default.)
- **Supabase = the stateful backend**: managed Postgres (the source of truth), Auth, and
  Realtime — three needs, one vendor. The data is plain Postgres, so migrating off later (RDS,
  Neon) is a connection-string change, not a rewrite. Low lock-in.

### Can it get *even* simpler later?
In principle the architecture is shaped to collapse: **if the rating scrape ever became
unnecessary** (see §3) **and ~1/min live polling via external cron sufficed**, the whole thing
could drop to **Vercel + Supabase only** (Vercel Cron hits a fast `/api/poll` route; no always-on
worker, no Playwright). **In practice that path is now unlikely:** Sofascore is the *primary*
rating source (see §3 / Data source), so the scraper Worker stays. We keep the two-vendor + worker
setup as the default; the collapse is a documented option only if rating sourcing is ever revisited
— "boring now, with a clear
path to one fewer moving part."

---

## 3. Ingestion architecture

**Polling, not webhooks** — confirmed by the OpenAPI spec (pure REST + cursor pagination, no
subscription contract) and by pricing (webhooks are an ALL-ACCESS-only feature; we run on GOAT).
The brief's "webhook receiver" is therefore **not built**; the "live event consumer" collapses
into a **frequent poll of `match_events` during live windows.** Simpler and cheaper.

### Feed tier (the brief's open question, now answered)
- **GOAT, $39.99/mo, on the FIFA product specifically** (tiers are per-sport). Unlocks every
  endpoint we use: `matches`, `match_lineups`, `match_events`, `player_match_stats`,
  `team_match_stats`, `match_shots`. (`group_standings` requires "ALL-STAR or higher" — GOAT
  satisfies it.) Paid rate limit **600 req/min** (vastly more than a dozen live matches need).
  A **48-hour GOAT trial** (5 req/min) covers development.
- **We do NOT need ALL-ACCESS** ($299.99/mo) — its only relevant extra is webhooks, which we've
  designed away.

### The scheduler (worker service)
A single worker with a cadence that depends on the fixture calendar (read from our `fifa_match`
table each tick):

| Mode | When | Pulls | Purpose |
|---|---|---|---|
| **Squad sync** | boot + slow (~daily) | `rosters` (season 2026) | bootstrap the **`player` + `fifa_team`** pool the draft and scoring reference — `player.id`/`name`/`position` (`G/D/M/F` → `GK/DEF/MID/FWD`) + national team (`team_id`). The ONLY path that creates `player` rows; every later mode just references them. Squads are static, so it stays off the 60s tick (own slow cadence). |
| **Schedule sync** | hourly + daily | `matches` | keep kickoff times / statuses / scores current; kickoff times drive FAAB gating, period closes, and entry into "live" mode. |
| **Pre-match** | at each kickoff | `match_lineups` | confirmed starting XIs -> **lock all starters** (set `locked_at`). |
| **Live** | while any match `in_progress` | `match_events` (~60s), plus `player_match_stats` / `match_shots` / `team_match_stats` | **lock each substitute at his entry minute**; cards (w/ minute); goals; own goals; live-updating event points. |
| **Settle** | after FT until values stabilize | `player_match_stats`, `match_shots`, **rating source** | stats can lag *hours*; the **rating lands near/after FT** -> keep recomputing as values arrive. |
| **FAAB batch** | per period, at its deadline | (DB only) | clear the league's blind bids ONCE per scoring period, before that period's first kickoff (Theme-D amendment, below). Selects periods whose deadline has passed and that have not cleared, runs the unchanged `@app/faab` `resolveFaabBatch`, latches `period.batch_cleared_at`. Replaced the retired daily cron. |

Live latency is a few minutes on the feed itself, so polling faster than ~60s is wasted — a sub
who enters becomes lockable within a couple of minutes, which is fine.

#### FAAB cadence: per-period batch + acquisition window (Theme-D amendment — deferred ARCHITECTURE update, now landed)

**Supersedes the retired daily 06:00 FAAB cron.** One blind-bid batch per scoring period (each group
matchday, each knockout round), cleared **before that period's first kickoff** (= MIN fixture kickoff
in the period). The clearing algorithm (`resolveFaabBatch`, the locked §D 8 steps) is **unchanged** —
only the cadence and the acquisition cutoff moved.

- **Trigger (worker tick, not a cron).** `apps/worker/src/faab/`: a pure selector (`selectPeriodsToClear`
  — periods whose `effectiveBatchAt ≤ now` and `batch_cleared_at IS NULL`) drives `dispatchFaabBatches`,
  which runs `runFaabBatch` once per due period and stamps `period.batch_cleared_at`. **Idempotent via
  the latch** (not a flag): the 60s tick may fire repeatedly; the batch runs once per period. A batch may
  legitimately run *after* first kickoff (worker downtime) — the resolver's per-player void-refund branch
  is kept as a **defensive guard** for that case (unreachable in normal flow, since deadline < kickoff).
- **Deadline.** `period.waiver_batch_at` (commissioner-configurable per period); default
  `first_kickoff − FAAB_BATCH_LEAD_MIN` (**360 min = 6 h**, reproducing the old "06:00 before a ~noon
  kickoff"; `// TODO(confirm): batch lead`).
- **Acquisition cutoff → the period's first kickoff (league-wide).** Bid submission (`@app/faab`
  `validateBidSubmission`) now gates on the add target's **period** first kickoff (`acquisitionCutoffAt`),
  not the per-player kickoff. The batch keeps the per-player kickoff only for the defensive void-refund.
  Theme-B sub-IN eligibility is unchanged (per-incoming-player kickoff, in the lineup path).
- **Acquisition window** = sealed-bid (before the batch) → $0 free-agency (after clear, before kickoff)
  → hard league-wide lock (at first kickoff). The pure `acquisitionWindowState` predicate (`@app/faab`)
  models the three phases — shared by the worker cadence and the web FA route.
- **$0 free-agency grant (Prompt 48).** Between batch-clear and the period's first kickoff, any manager
  grabs an unclaimed player for **$0, applied immediately** (no bidding, no waiver order). Gated route
  **`POST /api/faab/free-agent`** on the bid-route template: `requireManager` → `assertCanActAsManager
  ({scope:"self"})` → **401/403 before any write** (the shared `faabGate`), then the **free-agency
  window** gate, **snapshot eligibility**, the **same drop + roster rules** as a bid (the shared
  `validateFaGrant` / `checkDropAndRoster`), then an **atomic first-come claim** (`claimFreeAgent`):
  drop the named player + INSERT the add, gated on the `roster_player_active_ownership_uq` partial
  unique so **exactly one** of two concurrent grabs wins and the loser gets a clean `fa-conflict` (the
  tx rolls back). **$0 — budget unchanged, waiver order untouched.**
- **FA eligibility = the BATCH-CLEAR SNAPSHOT, not live-unowned.** A player is grabbable iff he was
  unowned at this period's batch-clear AND is still unowned — so a player **dropped during the window is
  NOT grabbable this window** (he enters the next period's batch pool; this is the anti-snipe property).
  Mechanism (chosen — **no snapshot table**): the single immutable predicate `NOT EXISTS roster_player
  WHERE player=X AND (dropped_at IS NULL OR dropped_at >= period.batch_cleared_at)`, which correctly
  holds batch winners/droppees, mid-window FA drops, and the claimed-then-dropped race. (Equivalent to an
  `fa_open`-per-period marker, but derived from `roster_player` history + the existing `batch_cleared_at`
  — no extra write, no snapshot-idempotency problem.) The 1-cycle waiver hold is removed (never was code).
- **Schema.** `period.waiver_batch_at` + `period.batch_cleared_at` (migration
  `20260610150000_period_faab_cadence`; additive columns, `period` carries no RLS). The FA grant needs
  **no new schema** (history-derived eligibility + the existing active-ownership unique).
- **Playoff rounds** light up via the SAME generic period path once their period rows exist (Theme C);
  no playoff-specific scheduling is hard-forked here.

### Idempotency & recompute (the load-bearing principle)
**Raw inputs are stored immutably-by-upsert; scores are a pure function of stored inputs, so any
score is recomputable at any time.** This is exactly what the late-settling rating requires.

- Raw rows upsert on natural keys (`match_id`, `player_id`, feed event id). Re-polling the same
  match overwrites with the latest values and is **self-correcting** — a feed stat correction is
  just another upsert.
- A write to any raw/manual input marks `(match_id, player_id)` **dirty**; the recompute sweeper
  recomputes `score_player_match` -> marks affected `(manager, period)` dirty -> recomputes
  `score_manager_period` -> recomputes `standing`. No heavy event bus; a dirty-flag sweep is
  plenty at this scale.

### The rating source (resolver)
**Sofascore is the primary rating source** — the locked ladder is calibrated to it. BALLDONTLIE
exposes its own `rating`, but its provenance is unknown, so it is **not** trusted as primary. The
scoring engine reads the rating through **one resolver** with a configurable source priority per
`(match, player)`:

```
rating := first non-null of [ manual_override, sofascore_scrape, balldontlie ]   // config-driven
```

The Sofascore scrape leads; **BALLDONTLIE's native `rating` is the automatic fallback** when the
scrape is missing for a player-match — a strictly better resilience story than "scrape or null."
Caveat: a fallback applies the same 0–10 ladder to BALLDONTLIE's rating, accepting a possible
scale/distribution mismatch; it fires only on a scrape miss (rare), and the commissioner can
override.

- **Action for Code (one-time):** compare BALLDONTLIE's `rating` against Sofascore's on a sample of
  matches — purely to gauge **how good the fallback is** (not to replace the scrape). The scrape
  stays primary regardless; the rest of the model is provider-agnostic.

### Sofascore scraper (isolated; PRIMARY rating source)
- Its **own worker/service**, sandboxed, with **one job**: write one rating value per
  player-match into `rating_player_match (source='scrape')`. Its fragility/blocking can never
  touch the app, the DB writes of other ingestion, or scoring (scoring just reads whatever the
  resolver returns, falling back to BALLDONTLIE, then null).
- Playwright (Node, in-stack). Narrow surface = one field = far more reliable than scraping a
  whole stat line, per the locked Data-source rationale. It is **required** (Sofascore is primary),
  but isolation + the BALLDONTLIE fallback mean a scrape outage **degrades gracefully** rather than
  dropping the rating line.

### Manual override / correction path (Cowork)
- An **admin-only surface** in the Next.js app (commissioner / Cowork operator). It writes to the
  raw/manual layer and triggers the same recompute — **manual corrections and feed corrections
  share one code path** (write raw -> recompute).
- This surface is also the **home for the feed-gap fields** (see §7): the handful of lines
  BALLDONTLIE can't supply (e.g. penalty won/committed) are entered here. And it owns the
  **lock-on-play fallback** (below) and edge cases (abandoned/postponed matches, warmup
  scratches, goalie-emergency role change).

### Lock-on-play fallback (Theme B / Data amendment)
If live appearance/substitution data is missing for a match (feed delay/outage), a **per-match
toggle** reverts that match to **kickoff-locking**: lock all starters at kickoff, don't lock
unentered subs. Robust; reintroduces the benched-starter-0 case; the operator flips it and
fixes up via overrides. Surfaced as a per-match config flag + an alert when the live poller
hasn't succeeded inside a match window.

---

## 4. Persistence — data model

PostgreSQL. The invariants that make this consistency-critical are enforced by the **database**,
not by hopeful application code:

- **Unique player ownership per league** -> unique constraint on active ownership.
- **No FAAB double-spend / no illegal roster** -> each claim resolves in **one transaction**
  (check budget + roster cap + valid drop, then write).
- **Sealed bids stay secret** -> **row-level security**: a manager can read only their own
  *pending* bids; everyone can read outcomes after the batch.
- **Hindsight-proof swaps** -> a lineup slot is editable only while `locked_at IS NULL`, enforced
  in the swap transaction.

### Table sketch (Code will refine; not exhaustive DDL)

**League / managers / users**
- `league` — id, name, season_year (2026), timezone, faab_batch_local_time (default 06:00),
  **result_freeze_hours** (default 6 — how long after a wave's last FT a period stays restatable;
  see §9), **draft_pick_seconds** (commissioner-set per-pick timer), status
  (`draft`/`group`/`playoff`/`complete`).
- `manager` — id, league_id, user_id (-> Supabase auth), display_name, is_commissioner,
  draft_slot, **faab_budget** (reset to 100 at playoff transition), **waiver_order_position**
  (rolling; seeded once by reverse draft order, mutated by move-to-bottom, carried into playoffs).
  - **`display_name` is now user-editable (Prompt 39):** a manager may rename themselves via
    `POST /api/manager/display-name`. Names are **case-insensitively unique within a league**
    enforced by a raw-SQL functional index `(league_id, lower(display_name))` (migration
    `20260610120000_manager_display_name_unique`). No `team_name`/`handle` column exists.
    `app_user.display_name` (nullable, vestigial) is NOT touched by the rename route.
  - **`waiver_order_position` enforcement (locked — scaffold thread):** the **DB owns uniqueness** via a
    plain `@@unique([league_id, waiver_order_position])` (non-deferrable — vanilla Prisma, no drift). The
    **FAAB batch owns contiguity** (1..N, no gaps — not expressible as a constraint) and runs
    move-to-bottom as a **two-phase reassignment** (shift the affected rows to a disjoint temp range,
    then write the final 1..N), keeping the plain unique satisfied at every checkpoint.
- `app_user` — Supabase auth user; allowlist gate for joining.

**Football reference (mirrored from feed)**
- `fifa_team`, `player` (id <-> balldontlie player_id, position, team, country),
  - **`player.country` is never populated by ingestion.** `ingestRosters` stores the national team as a
    `team_id` FK (→ `fifa_team`) but does not write the denormalized `player.country` text column. Any
    loader that feeds a player card **must** derive country from the `fifa_team.name` join at query time
    (`country: p.team?.name ?? null`) — reading `player.country` directly returns `null` for every row and
    the flag badge never renders. Both `loadDraftRoom` (`toPlayer` mapper, `app/draft/loadDraftRoom.ts`) and
    `loadLineup` (`app/lineup/loadLineup.ts`) follow this pattern; future player-card surfaces (vsfield,
    waivers, etc.) must do the same. The source-contract guard lives in
    `apps/web/src/draft/playerAvatarWiring.test.ts` ("joins team name instead of reading player.country").

  `fifa_match` (datetime **UTC**, status, scores incl. ET/pens, stage/group/round, formations,
  referee), `fifa_stage`, `fifa_group`.
  - **`period_id` (Prompt 05a) — the structural match→period link.** Set at schedule-sync from the
    fixture's **structural** round/matchday (knockout `round` -> the `knockout_round` period; group
    matchday -> the `group_md` period), **never** from kickoff-time inference (a postponement would
    reorder kickoffs and corrupt a time-derived matchday). It is the **single source of truth** —
    locking, the recompute dirty-walk, and period-close all read it (this **retired** the earlier
    `opens_at <= kickoff <= closes_at` window inference in the recompute store). **ASSUMPTION
    (permanent):** ONE private league per tournament, so a single FK suffices (`fifa_match` is global;
    `period` is per-league). Multi-league would need a per-league match→period link — out of scope.
    `period_id` is NULL until the matching period row is seeded (group-stage matchday field is a
    `TODO(confirm)` against first live data).
  - **`kickoff_lock_fallback` (Prompt 05a) — per-match lock-on-play fallback flag.** `false` =
    lock-on-play (default); `true` reverts the match to kickoff-locking when live appearance data is
    missing (see §3 Lock-on-play fallback). The operator UI that flips it is a later prompt; the
    poller-silent alert tells the operator when to flip it.
  - **`sofascore_match_id` (`fifa_match`) + `sofascore_player_id` (`player`) (Prompt 05b) — stored
    Sofascore ids** for the isolated scraper's identity resolution. Nullable, `@unique` (mirror
    `balldontlie_*_id`); populated by a **verified one-time `keyMatch` pass** (auto-writes only the
    unambiguous date+codes / team+normalized-name matches; flags the rest for manual entry). The scrape
    path resolves a target by **STORED id ONLY** — never live name-matching — because the resolver
    prefers `scrape` over `balldontlie`, so a wrong id would feed a wrong PRIMARY rating (worse than no
    row). A missing id → no `scrape` row → balldontlie fallback.
  - **Note (Prompt 05a/05b):** the player-match dirty invariant (`STAT_DIRTY_UPDATE` /
    `markStatPlayerDirty`) lives in `@app/db`, imported by both ingestion (05a) and the scraper (05b).

**Roster / lineups (lock timestamps live here)**
- `roster_player` — manager_id, player_id, acquired_at, dropped_at. **Ownership**; unique
  `(league_id, player_id)` where `dropped_at IS NULL`.
- `lineup_slot` — manager_id, **period_id**, player_id, role (`GK`/`DEF`/`MID`/`FWD`),
  is_starter, **`locked_at` (nullable timestamp)**. Per-period arrangement -> "set multiple
  lineups in advance" = rows for future periods. **Swap allowed only when `locked_at IS NULL`.**
  Lock-on-play sets it (starter -> kickoff; sub -> entry minute).

**Periods (Theme C scoring windows)**
- `period` — id, league_id, kind (`group_md`/`knockout_round`), label (MD1…, R32…),
  opens_at, closes_at (derived from fixtures), **cut_count** (knockout rounds only — managers
  eliminated this round; ≈2 early tapering to 1, set at the playoff transition), **frozen_at**
  (set ~`result_freeze_hours` after the wave's last FT; after this, restatement is commissioner-only),
  status. **Close job fires when the wave's last fixture reaches `completed`.**

**Draft (infra; rules locked in Theme C)**
- `draft` — league_id, status, current_pick_no, current_manager_id, **pick_deadline_at**
  (server-authoritative timer; length from `league.draft_pick_seconds`).
- `draft_pick` — draft_id, pick_no, manager_id, player_id, made_at, is_auto.
- `draft_queue` (optional) — manager_id, ordered player_ids; the autopick source on timer expiry
  (falls back to best-available).

**FAAB / waivers (Theme D)**
- `faab_bid` — manager_id, player_add_id, player_drop_id, amount, submitted_at, batch_id,
  status (`pending`/`won`/`lost`/`voided_refunded`), note. **RLS-protected.**
- `faab_batch` — league_id, run_at, status. Processing writes bid outcomes + ownership changes
  atomically, highest-bid-first player-by-player, applying the move-to-bottom tiebreak only when
  used, voiding+refunding bids on already-kicked-off players. **Now fired once per scoring period**
  (the worker-tick trigger), not on the retired daily cron — see §3 "FAAB cadence."
- `period.waiver_batch_at` / `period.batch_cleared_at` — the per-period batch deadline (commissioner-
  configurable; default `first_kickoff − lead`) + the idempotency latch (Theme-D amendment).

**Raw feed layer (recompute inputs; upsert-keyed)**
- `stat_player_match` — PK `(match_id, player_id)`; all `FIFAPlayerMatchStats` fields +
  minutes_played + updated_at.
- `event_match` — feed event id; incident_type/class, time_minute, added_time, period,
  player_id, assist_player_id, player_in_id, player_out_id, rescinded.
- `shot_match` — feed shot id; match_id, player_id, shot_type, situation, … (penalty detection).
- `stat_team_match` — `(match_id, team_id)`; team aggregates (any team-derived lines, offsides
  at team level, etc.).
- `rating_player_match` — `(match_id, player_id, source)`; rating, source
  (`balldontlie`/`scrape`/`manual`), updated_at. Resolver reads this.
- `manual_stat_player_match` — `(match_id, player_id)`; the feed-gap fields (penalty_won,
  penalty_committed, plus any other operator-entered values) + reason. Read by the scoring fn.

**Derived layer (recomputable)**
- `score_player_match` — `(match_id, player_id)`; points, breakdown_json, computed_at. **Pure fn**
  of the raw + manual + rating + role.
- `score_manager_period` — `(manager_id, period_id)`; points, computed_at. Aggregation over the
  manager's **locked** lineup_slots for the period.
- `standing` — league_id, manager_id, scope; all_play_all_W / _L, total_points, seed. Derived
  across managers (all-play-all).

> **Late-correction freeze policy (DECIDED — Theme C):** because scores recompute, a stat/rating
> correction landing *after* a period closes would restate that period. Policy: a period stays
> restatable for **`result_freeze_hours` (default 6)** after the wave's last FT (enough for the
> rating to settle), then `frozen_at` is stamped and the result is **final** — later corrections
> recompute only under a **commissioner override**, never automatically. Implemented as a gate on
> the recompute sweeper for frozen periods.

---

## 5. Real-time layer

Two surfaces, **Supabase Realtime** for both (we already have the vendor); state is always
authoritative in Postgres and **broadcast on change**.

### Live draft room
- **Server-authoritative.** The draft state lives in `draft`/`draft_pick`. A **draft controller**
  (in the worker) advances it transactionally on two triggers: a pick is submitted, **or** the
  server timer (`pick_deadline_at`) expires -> it validates (turn, ownership uniqueness, roster
  legality), writes the pick (autopicking if expired), and advances `current_manager_id` +
  `pick_deadline_at`.
- Clients **subscribe** to the draft channel (Realtime broadcast + presence for "who's online")
  and render the countdown locally **synced to the server's `pick_deadline_at`** — never trusting
  client clocks for the actual deadline.
- **Rules now locked (Theme C):** **snake** order; per-pick timer = `league.draft_pick_seconds`
  (commissioner-set/adjustable); **autopick on expiry** = highest-ranked available from the
  manager's `draft_queue`, else best-available. This layer just enforces them.
- **Engine built (Prompt 06):** the controller is the pure `@app/draft` — `managerForPick` (snake),
  2/5/5/3 roster legality, `selectAutopick` (queue → best-available, filtered to available +
  position-legal) — plus a store-backed `startDraft` / `submitPick` / `tickDraft` (+ completion at
  15×N) behind a thin `DraftStore` port (Memory + Prisma impls). The ONE transaction — the guarded
  pick + `roster_player` ownership + pointer advance — is `commitPick`; it is idempotent (a monotonic
  `current_pick_no` latch) and backstopped by the `draft_pick` and `roster_player` active-ownership
  uniques. A worker tick hook (`tickActiveDrafts`) fires expiry autopicks. The **default-ranking
  source for "best-available" is an injected SEAM** (`getDefaultRanking` → `[]` + `// TODO(confirm):`;
  no `player.default_rank` column exists). Realtime broadcast + the draft-room UI remain deferred — the
  controller exposes state + `submitPick` / `tickDraft` for them to call. **Auth + the identity gate
  landed in Prompt 06's hand-off prompt (07):** `POST /api/draft/pick` now resolves the session manager
  and rejects 401/403 BEFORE calling the unchanged `submitPick` (see §6).
- **⚠️ AMENDMENT (Prompt 44 — positional caps lifted):** draft roster legality is now **total-based**,
  not per-position — `isPositionLegal` / `isSquadComplete` gate purely on a new **`squadTotal(counts)`**
  helper vs the 15-man `SQUAD_SIZE` (the `2/5/5/3` per-position ceilings above are retired). The draft is
  **shape-unconstrained up to 15**; the XI/formation bounds (DECISIONS Theme B) are unchanged, so an
  over-drafted squad can be locked out of a legal lineup **by choice**. `PositionFullError` is **retained
  but defensive/unreachable** in the snake flow (squad-full now coincides with draft completion at 15×N).

### Live "vs the field" screen
- Subscribe to the relevant `score_manager_period` / `standing` rows; when the recompute sweeper
  upserts, clients get the change. (Equivalently, **15–30s polling** is entirely sufficient given
  the feed's own few-minute latency — documented fallback; we default to the subscription since
  it's already there.)
- This screen must show **points-so-far alongside how much is still to come** (the locked UI
  requirement): running score per manager, **count of each manager's starters yet to play**
  (derived from `lineup_slot` vs which matches have kicked off / finished), provisional weekly
  all-play-all record ("6-3 so far"), per-opponent H2H outcome, and the season view (record +
  total points). Data shapes for all of this fall out of §4. -> Design + Code deliverable.

### Fallback transport
If the team prefers not to depend on Supabase Realtime: **Socket.IO** on the worker for the draft
room + **polling** for the vs-the-field screen. That's *more* to operate (a stateful socket
server), which is why Supabase Realtime is the default.

---

## 6. Auth

Minimal, for a private league of friends.

- **Supabase Auth, email magic-link (passwordless)** + optional Google OAuth. No passwords to
  store or reset.
- **Private by allowlist:** only invited emails (or an invite/join code) can join the league.
- **Roles:** an `is_commissioner` flag gates the admin/override surface (the Cowork operator).
- Nothing heavier is warranted.

- **Built (Prompt 07):** the auth-decision core is the pure `@app/auth` — `isEmailAllowed` (the
  allowlist gate, case-insensitive, a `// TODO(confirm):`), `resolveSessionManager` (session →
  `{ manager, isCommissioner }` / `no-session` / `not-allowlisted` / `no-manager`, matching `manager.user_id`
  by the Supabase uid **or** the linked `app_user.email` so it is robust to the unpinned link ceremony),
  and `canActAsManager` (scope-gated: `self` = strict self-match; `admin` = commissioner override) + a
  typed `AuthError` family — all DB/Supabase/clock/env-free (a `purity.test.ts` proves it). The edges
  live in `apps/web`: `@supabase/ssr` server + browser clients (separate from Prisma; server authz reads
  `getUser()`, **never** `getSession()`) + a session-refresh middleware; `getSessionManager` /
  `requireManager` (the **reusable** gate every later authenticated route will use — lineup-set, FAAB,
  admin); the minimal magic-link sign-in / `/auth/callback` (exchange code → enforce the allowlist:
  a non-allowlisted email is signed out + denied, never admitted; the `next` redirect is validated to a
  same-origin relative path via the pure `safeNextPath` — no open redirect) / sign-out; and the first
  consumer `POST /api/draft/pick` (401/403 BEFORE the controller; `submitPick` unchanged). Google OAuth is
  config-gated/seamed. **SEAMS (`// TODO(confirm):`):** the `manager.user_id` provisioning ceremony
  (commissioner pre-provisions + links vs. seeded; whether `app_user.id` is the Supabase uid — managed
  via DB for now, **no** self-serve manager wizard) + email case-sensitivity. The polished auth UI +
  the draft-room UI + Supabase Realtime remain the deferred Design+Code deliverable.
  - **Prompt 39 — `/settings` + `POST /api/manager/display-name` (built, minimal):** the App Shell's
    Settings `TODO(confirm)` seam is now a real route. `/settings` (`app/settings/`) is server-rendered,
    AppShell-mounted (`active="settings"`), auth-gated via `getSessionManager()`. It has one built
    section ("Public profile" — display-name rename, a small `SettingsClient` client island) and five
    explicit `TODO(confirm)` seams (Account / Notifications / Appearance / League / Danger). The rename
    API (`POST /api/manager/display-name`) follows the `handleDraftPick` edge pattern exactly:
    framework-agnostic `handleDisplayNameRename` (`apps/web/src/manager/`) → 401 no-session / 403
    not-allowlisted or no-manager / 400 invalid name (empty / too_long) / 409 name_taken / 200 normalized
    name. Writes ONLY `manager.display_name`; `app_user.display_name` is NOT touched. Renames propagate
    to other clients on next server render / navigation (no Realtime broadcast — intentional; see DECISIONS
    → "Profile rename / Settings route").
  - **Prompt 42 — `/pool` pick'em UI (built; the P40 engine's user-facing surface):** a new authenticated
    route `/pool` (`app/pool/`), server-rendered, **dynamic (`ƒ`)**, AppShell-mounted, auth-gated via
    `getSessionManager()` (no-session → `/sign-in`; not-allowlisted / no-manager → `/auth/denied`). Two
    tabs — **Picks** (per-match Home/Draw/Away picks; knockout phase adds the fixed R32→Final bracket
    skeleton with honest TBD slots) and **Leaderboard** (all league members, ranked by pool points). It is
    **form-driven CRUD**: every pick is a `POST /api/pool/pick` round-trip (the Prompt-40 gated route)
    followed by `router.refresh()` — **NO Realtime, NO polling** (the Realtime subscription is **P43**).
    A SELF-scoped surface (the viewer's own picks), so no 403-not-your-manager at the page; the per-pick
    write gate lives in the route. **NAV ENTRY DEFERRED:** unlike the other AppShell screens, `/pool` is
    **not** in the §1 nav list yet — it's reachable by direct URL only; "pool" isn't a `NavId`, so the
    layout passes a non-member `active` (nothing falsely highlights) until the post-merge nav-wiring step.

---

## 7. OpenAPI verification result (the brief's first build task)

Every SCORING.md category mapped against the BALLDONTLIE FIFA WC OpenAPI spec
(`https://www.balldontlie.io/openapi/fifa.yml`). **Hard dependencies confirmed; most lines map
directly or derive; six lines force a call (all minor/rare).**

### ✅ Hard dependencies — CONFIRMED
- **Card minutes:** `FIFAMatchEvent.time_minute` (+ `added_time`) -> second-yellow / red minute
  buckets work.
- **Live substitution events:** `match_events` with `incident_type=substitution`, `player_in`,
  `player_out`, `time_minute` -> **lock-on-play is feed-supported.**

### ✅ Direct field mappings
| SCORING line | Field(s) |
|---|---|
| Performance rating | Sofascore scrape (PRIMARY); `player_match_stats.rating` = fallback *(see rating finding)* |
| Appearance (minutes) | `minutes_played` |
| Goal / Assist | `goals`, `assists` (also `match_events` goal incidents) |
| Key passes | `key_passes` |
| Successful dribbles (≥3, ≥60%) | `dribbles_completed`, `dribbles_attempted` |
| Duels won (≥3, ≥50%) | `duels_won`, `duels_lost` |
| Passing (≥40, ≥90%) | `passes_total`, `passes_accurate` |
| **Was fouled** | `was_fouled` *(was flagged a suspect gap — PRESENT)* |
| Clearances | `clearances` |
| Interceptions | `interceptions` |
| Tackles won | `tackles_won` |
| Shots blocked | `blocked_shots` *(defensive blocks — CONFIRMED defensive)* |
| Save inside box | `saves_inside_box` *(was flagged — PRESENT)* |
| **Punches + high claims** | `punches` + `high_claims` *(both flagged — BOTH PRESENT)* |
| Yellow / red / 2nd-yellow + minute | `match_events` (class + `time_minute`) |

### ✅ Derivable (compute from present fields)
- **Save outside box** = `saves` − `saves_inside_box`. *(resolves the flagged "split saves" gap.)*
- **Clean sheet (60+ min)** = goals-against 0 (match score / team stats) + `minutes_played` ≥ 60
  + role.
- **Goals conceded** = opponent goals while on pitch (goal-event minutes + `minutes_played`);
  attribute to GK/DEF role.
- **Penalty missed** = `match_shots` where it's a penalty (`situation`) and `shot_type ≠ goal` ->
  charge the shooter (−3).
- **Penalty saved** = same `match_shots` row with `shot_type = save` -> credit the opposing
  on-pitch keeper (+5). *(One row yields both the taker's −3 and the keeper's +5.)*
- **Own goal** = `match_events` goal incident flagged own-goal -> the OG scorer (−2).

### ⚠️ Gaps — forced calls (all minor/rare). See SCORING.md amendments.
| SCORING line | Status | Call |
|---|---|---|
| Clearance off the line (+2) | not in feed, not derivable | **DROP** |
| Successful run-out (+1 ea) | not in feed (no keeper-sweeper) | **DROP** |
| Offsides (−1 / 2), player-level | only **team-level** `offsides` exists | **DROP** player-level |
| Penalty won (+2) | not cleanly attributable from feed | **KEEP via manual entry** (admin surface) |
| Penalty committed (−2) | not cleanly attributable from feed | **KEEP via manual entry** |
| Dispossessed (−1 / 3) | no `dispossessed`; feed has `possession_lost` | **REMAP -> "Possession lost"** (broader; gentle −1/3) |

### ⚙️ Confirm-during-Code (not blockers)
- **`blocked_shots` = defensive blocks — CONFIRMED** (a player blocking an opposing team's shot;
  the attacking-side "shots blocked" is the separate `team_match_stats.shots_blocked` + `match_shots`
  `block`). Design intent is locked; just a 30-second sanity-check on first live data that the feed
  field matches (centre-backs accrue it, strikers don't).
- **Enum values** for `match_shots.situation` (penalty detection) and `match_events.incident_class`
  (own-goal, second-yellow vs red) — verify against the first live data.
- **Rating fallback quality** — the one-time BALLDONTLIE-vs-Sofascore comparison (§3), to gauge the
  fallback only; Sofascore stays primary regardless.

### 💡 Rating finding (Sofascore stays primary)
BALLDONTLIE's FIFA feed exposes its **own** `rating` (and the full Sofascore-style vocabulary —
xG/xGoT, big chances, touches, ball recoveries, attack momentum, best-players/MOTM, average
positions). But its **provenance is unknown**, so it is **not** adopted as primary: the locked
ladder is calibrated to Sofascore, so **the Sofascore scrape remains the primary rating source and
a required component.** BALLDONTLIE's `rating` serves as the **automatic fallback** (resolver order
`[manual, scrape, balldontlie]`), which improves resilience over the original "scrape or null."

---

## 8. Cross-cutting (boring-but-essential)

- **Time:** everything stored in **UTC** (the feed gives UTC). "League-local" exists only for display
  (the FAAB batch is now anchored to the period's first kickoff, not a league-local wall-clock — §3).
  One source of truth kills the classic timezone bug.
- **Migrations:** Prisma Migrate (or Drizzle) — versioned, reviewed, boring.
- **Jobs:** host cron (period-close) + an in-process scheduler in the worker; the worker tightens
  cadence in live windows by reading `fifa_match`, and now also fires the **per-period FAAB batch**
  from the same tick (the daily FAAB cron was retired — §3). **No queue** (overkill at this scale);
  add one only if ever needed.
- **Observability:** structured logs; Sentry (free tier) for errors; an **uptime/alert if the
  live poller hasn't succeeded inside a match window** -> the operator can flip a match to
  kickoff-lock. That single alert is the most valuable piece of monitoring here.
- **Secrets:** feed API key + DB creds in Render/Supabase env config; never in the repo.
- **Backups:** Supabase managed Postgres backups (point-in-time on paid tier) — the league state
  is irreplaceable mid-tournament.
- **Region:** one, near the league.

---

## 9. Theme C items — now RESOLVED (this thread); infra here enforces them
These were left to Theme C; that theme is now locked (see **DECISIONS.md → Theme C**). The
infrastructure to enforce them already lives in this doc:
- **Draft timer = league config** (`draft.pick_seconds`, commissioner-set/adjustable); **pick order
  = snake**; **autopick on expiry** = highest-ranked available from the manager's pre-set queue,
  else best-available. Enforced by the §5 draft controller.
- **Guillotine elimination tiebreak** = lowest **cumulative tournament total points** among the
  tied managers is cut (commissioner backstop if still identical). This is **Σ `score_manager_period`
  across all periods to date — regular season *and* knockout** — computed on the fly; **not**
  `standing.total_points` (which sums `group_md` periods only). `selectGuillotineCuts` receives it as
  a pre-built map; the transition/FAAB prompt assembles it.
- **Playoff field size is flexible (likely 8 or 10)** and the **per-round cut count** (≈2 early,
  tapering to 1) is derived so the bracket collapses to one champion over the WC's 5 knockout
  rounds; fixed at the group→playoff transition once the final manager count is known. `period`
  (kind `knockout_round`) + a per-round `cut_count` config carry it.
- **Late-correction freeze policy = SET (default):** a period's results go **final ~6h after that
  wave's last final whistle** (config `result_freeze_hours`, default 6); later feed/rating
  corrections do **not** auto-restate a frozen period — **commissioner-only** override (recompute
  still works; it's just gated). Before the freeze, recompute runs normally.
- **Trades** -> none (out of brief; possible later theme).

---

## 10. Amendments this thread forces elsewhere
- **SCORING.md** — six verification-forced line changes (3 drops, 2 keep-via-manual, 1 remap).
  Documented as a marked amendment block; model balance untouched.
- **Data source** — (a) rating sourced via a resolver `[manual, scrape, balldontlie]` with the
  **Sofascore scrape PRIMARY and required** (BALLDONTLIE's `rating` = automatic fallback; its
  provenance is unknown so it does not replace the scrape); (b) ingestion is **polling** (no
  webhooks at GOAT), so **no webhook receiver is built**; (c) tier confirmed **GOAT $39.99/mo**
  (not ALL-ACCESS); (d) live latency ≈ a few minutes (reinforces recompute). The "confirm which
  tier / webhooks" open item is resolved.

---

## 11. Dashboard home (Prompt 37)

**`loadDashboard` server loader** (`apps/web/app/_dashboard/loadDashboard.ts`) — mirrors the
placement and thin-IO-edge convention of `loadDraftRoom` / `loadVsField`. Reuses
`loadDraftRoom(sessionManagerId)` DIRECTLY: one call, no second draft-table read, no
re-derivation of draft state. Returns `DashboardData { phase: DashboardPhase; draft:
DraftRoomState | null }`. A null draft (no draft row yet) collapses to `{ phase: "pre-draft",
draft: null }`. The `sessionManagerId` is extracted and session-gated upstream in `page.tsx`
(`outcome.kind === "ok"` guard) before `loadDashboard` is ever called.

**`app/_dashboard/` component directory (new):**
- `src/dashboard/selectDashboardPhase.ts` — pure `DraftStatus → DashboardPhase` selector;
  IO-free; `never` exhaustiveness guard prevents silent fall-through on new `DraftStatus` values;
  5 unit tests in `selectDashboardPhase.test.ts`.
- `PrimaryBanner.tsx` — phase-coloured headline strip. `--phc` is set as a **single** CSS custom
  property on the `.db-banner` container so all children inherit it (eyebrow pill, inset box-shadow
  stripe). `PHASE_COLOR`: `pre-draft → var(--info)`, `draft → var(--live)`, `post-draft →
  var(--info)`. No hex — all functional tokens from the global `ds.css` (BRAND §1/§5: no gold, no
  raw cobalt in the phase stripe).
- `Dashboard.tsx` — pure server component; `modulesFor(phase) → ModuleKey[]` + `renderModule(key,
  data)` router mirrors the design's `desktop.jsx` exactly. Four modules shipped: `LeagueInfoModule`
  + `ReadinessModule` (pre-draft); `DraftFormingModule` + `RecentPicksModule` (draft). All data
  sourced from the `DraftRoomState` passed through from `loadDashboard` — no additional DB reads.
- `dashboard.css` — route-scoped on the global `ds.css` (the `shell.css` / `_auth/auth.css`
  convention). Zero hex, no gold, `--phc` for phase colour, `var(--surface-*)` / `var(--accent)` /
  `var(--hairline)` for structure. `.db-*` class vocabulary.

**`page.tsx` ok→hub branch.** `Hub` is now `async`; it calls `await loadDashboard(managerId)` and
renders `<AppShell active="home" signedInAs={displayName}><Dashboard data={data} /></AppShell>`.
All non-hub branches (`signin` / `unlinked` / `denied`), `selectLandingView()`, `getSessionManager()`,
and `export const dynamic = "force-dynamic"` are **byte-for-byte unchanged**. `/` stays `ƒ`.

**Two STOP seams (data not available in production this prompt):**
1. `draft.scheduled_start_at` — column does not exist; pre-draft countdown deferred (honest empty:
   "waiting for commissioner"). Candidate future migration.
2. Per-manager `is_ready` — does not exist on any server-readable table; readiness grid deferred
   (all dots off; "Live status visible in the draft room."). Candidate future migration or Realtime
   presence hook. Both flagged `STOP(P37)` at the exact render site in source.

### Dashboard group phase extension (Prompt 38)

**`DashboardPhase` widened to a six-member union:** `"pre-draft" | "draft" | "pre-kickoff" |
"group" | "playoff" | "complete"`. The `never`-guard exhaustiveness constraint is on
`modulesFor(phase: DashboardPhase)` in `Dashboard.tsx` — adding a seventh member is a compile
error until handled.

**`selectTournamentPhase(matches: ReadonlyArray<{status, round}>): TournamentPhase`** —
pure, IO-free. Composition point is `loadDashboard.ts`: when `selectDashboardPhase` returns
`"post-draft"`, the loader queries `fifa_match` (`status`, `round`, `kickoffAt` — SELECT only,
no write) and calls `selectTournamentPhase`. The `fifaMatch` table is global (no `league_id`);
the read is inside the authenticated server loader, gated by `requireManager` upstream in
`page.tsx`. No RLS bypass, no engine/scoring touch.

**Group phase data path:** when phase is `"group"`, `loadDashboard` calls
`loadVsField(sessionManagerId)` **READ-ONLY** — reuses the already-built `@app/vsfield` output
without any re-derivation. `DashboardData` extended with `vsField: VsFieldView | null` and
`earliestGroupKickoff: string | null`.

**Group modules** (sourced entirely from `VsFieldView`):
- `RecordModule` — `vsField.season[me]` (W/L/pts/rank) + `vsField.field[me]` (period provisional record).
- `StandingsModule` — `vsField.season` sorted by rank.
- `MatchdayModule` — `vsField.matches` + `vsField.currentPeriod` + starters lock count.

**Banner phase colour** — always via the inline `--phc` CSS custom property set on `.db-banner`
(e.g., `var(--live)` for group/playoff, `var(--info)` for pre-kickoff, `var(--success)` for
complete). `--accent` = cobalt; it is **never** used for phase colour in the banner. The
dashboard.css module carries deferred `.db-br-row` and `.db-pod-row` `.is-me` styles (ported
from the design_reference bracket/podium sections) — but no playoff/complete component renders
them (`modulesFor` returns `[]` for those phases). STOP(P38) seams documented inline.

**`PrimaryBanner.tsx` signature change:** added `vsField: VsFieldView | null` and
`earliestGroupKickoff: string | null` props (both null-safe; pre-draft and draft branches
ignore them).

## 12. Pick'em pool (Prompt 40)

A per-match **pick'em pool** layered on the existing schedule — a SEPARATE scoring system from the
player engine (SCORING.md addendum; DECISIONS → Pool). Prompt 40 = data model + pure engine + server
write/read path only; the pick UI, knockout-bracket layout, leaderboard screen, nav entry, and the
Realtime **client** are **Prompt 41**.

**`pool_pick` table** (`prediction PoolPrediction {HOME DRAW AWAY}`; `UNIQUE(manager_id, match_id)`;
indexes `(league_id, match_id)` + `match_id`; FKs → league / manager / fifa_match, all cascade). RLS
mirrors `faab_bid` (auth.uid() → manager → league): a **league-scoped `authenticated` SELECT** (a
member reads the whole field's picks — for the leaderboard + the post-kickoff reveal — the
`standing_select_league_member` shape, no SECURITY DEFINER helper since the row carries `league_id`),
**own-`manager_id` INSERT/UPDATE**, no DELETE. `pool_pick` is added to the `supabase_realtime`
publication now so Prompt 41's subscription isn't silently empty — the **Realtime-RLS trap**: a table
outside the publication delivers zero `postgres_changes`, and a browser-read table needs its own SELECT
policy or the client sees zero rows (P41 also: `realtime.setAuth(token)` before subscribe, gate on
`INITIAL_SESSION`, re-subscribe on `TOKEN_REFRESHED`). The migration (`20260610130000_pool_pick`)
carries the Theme-F embedded self-test (cross-league isolation + own-row write), verified against a
uuid-returning `auth.uid()`.

**`@app/pool` (pure engine)** mirrors `recompute/standing.ts` purity — no IO/clock/DB, grep-proven by
`purity.test.ts`: `derivePoolResult` (group → H/D/A; knockout → advancer via FT→ET→pens; pending or
`periodKind == null` → null), `scorePick`, `weightForPeriod` (flat 1, escalating-weight seam),
`buildPoolLeaderboard` (`{ played, correct, points }`, deterministic sort), `isPickLocked`,
`validatePickSubmission`.

**Phase discriminator = `period.kind`.** Group-vs-knockout is read from the linked
`fifa_match.periodId → period.kind` (the same signal §3 locking + recompute use), **never** from
`fifa_match.round` (raw feed text — non-null for group games; see the schema comment + DECISIONS). The
IO loader performs this join and hands the pure engine a resolved `periodKind`.

**Write/read path** (`apps/web/src/pool/` + `app/api/pool/pick/route.ts`, the `/api/faab/bid`
template): a store port (Memory + Prisma doubles) + framework-agnostic `handleSubmitPick` /
`handleReadPicks` returning `{ status, body }`. Submit = resolve session → 401/403 (scope "self", no
commissioner override) BEFORE any write → `validatePickSubmission` (locked? DRAW-on-knockout?) →
upsert `(manager, match) → prediction` (server `now` authoritative, like the draft `pick_deadline_at`).
Read = the caller's OWN picks always + OTHER managers' picks ONLY for kicked-off matches — **anti-copying
lives in the query** (`OR [{ managerId }, { match: { kickoffAt: { lte: now } } }]`), NOT in RLS (no
clock in RLS).

### Live updates (Prompt 43) — clock-reveal + leaderboard poll, NO `postgres_changes`

`/pool` is made live **without a Realtime subscription** — two on-read mechanisms, no schema/migration,
no stored score table. This is **explicitly distinct from `/draft` and `/vsfield` (§5), which DO
subscribe to `postgres_changes`**: (1) a **clock-reveal timer** scheduled to the soonest future kickoff
among still-hidden matches → on fire it `router.refresh()`es the gated loader (the server re-applies the
`kickoffAt <= now` reveal gate above), so others' picks reveal the instant their match locks; (2) a
**visibility-gated leaderboard poll** (60s, Page Visibility API) that refetches the on-read loader only
while the Leaderboard tab is active and the document is visible. **No `pool_pick` subscription by design**
(DECISIONS → Pool P43): the anti-copying gate is the clock-based query above and RLS has no clock, so a
raw frame would leak pre-kickoff predictions — and revealable ⇒ past-kickoff ⇒ locked, so there is
nothing live to stream. The live logic is a pure, IO-free `apps/web/src/pool/poolLive.ts` (injected
timers/visibility/clock — the draft `resilience.ts` / vsfield `liveController.ts` shape). The **dormant
P40 `supabase_realtime` publication entry is left in place** (out of scope to remove).

---

## 13. Notifications — Web Push transport (Prompt 41a; triggers in 41b)

Server→device **Web Push over the PWA** (DECISIONS → Notifications). 41a lands the transport + preference
model + Settings UI with the sender **inert** (`dispatchToManager` built + tested, invoked by nothing);
41b wires the three triggers. **No new vendor** (VAPID-signed from Render compute) and **no Realtime** —
push is server→device, sidestepping the `postgres_changes`/RLS-publication path entirely.

**§1 routes + surfaces.** Four gated routes on the `handleDisplayNameRename` edge pattern (framework-
agnostic handler + thin route + injected `resolveManager`; 401/403/400/200): `POST
/api/notifications/{subscribe, unsubscribe, preferences, test}` (all self-only — the target is always the
session manager). The plain service worker is `apps/web/public/sw.js`, served at **`/sw.js`** and
manually registered by the Settings "Enable" button (no `next-pwa`); it shows the push and focuses/opens
on click, with **no fetch interception / no caching**. The Settings **Notifications** section
(`NotificationsClient` island) fills the App Shell's `TODO(confirm)` seam. New shared package
**`@app/notify`** (pure core: payload builders + `validatePreferenceInput` + `dispatchToManager` + the
`NotifyStore` port + memory double; IO on subpaths `@app/notify/send` = `sendPush`, `@app/notify/prisma`
= the adapter) — consumed by the web routes now and the worker in 41b.

**§4 tables (`20260610140000_notifications`, all additive, self-only RLS).**
- `push_subscription` (`manager_id`, `endpoint` UNIQUE, `p256dh`, `auth`, `created_at`) — one row per
  device; SELECT/INSERT/DELETE own.
- `notification_preference` (PK `manager_id`; `draft_turn` / `player_not_starting` / `match_starting`
  bools DEFAULT true) — **lazily upserted-with-defaults on first read**; SELECT/INSERT/UPDATE own.
- `notification_sent` (`manager_id`, `kind`, `subject_id`, `sent_at`; **UNIQUE(manager_id, kind,
  subject_id)**) — the **idempotency ledger** that makes 41b's polling triggers safe to re-fire;
  **RLS enabled + ZERO policies = default-deny** (service-role write only, no client read; history-read
  policy = a `TODO(confirm)` seam). **Invariant:** `dispatchToManager` is idempotent — it sends only if
  the preference is on and the ledger `claimLedger` wins (`createMany skipDuplicates → count === 1`),
  at-most-once. RLS mirrors the `pool_pick`/`faab_bid` `auth.uid()→manager` idiom but **self-only** (not
  league-scoped); Theme-F self-test verified against a uuid-returning `auth.uid()`, zero drift. **None of
  the three tables is in the `supabase_realtime` publication** (push needs no broadcast).

**§2 env (VAPID, on web + worker).** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (build-time inlined for the browser
subscribe AND read server-side by `sendPush`), `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (server-only) — all
`sync:false`, generated by `npx web-push generate-vapid-keys` (never committed). The **worker gains the
`@app/notify` dependency + the VAPID env in 41b but no behavior until then** (the triggers); the keypair
is set on both services now.

### Triggers wired (Prompt 41b) — three worker-side hook points

The sender is now live: three triggers, each a **pure selector** (`apps/worker/src/notify/selectors.ts`,
IO-free) + an **IO dispatch** through the unchanged `dispatchToManager`. Idempotency is the
`notification_sent` UNIQUE ledger (above), so every poller re-fires safely. The pure cores (`@app/draft`
controller, `@app/ingest` `lock.ts`) stay untouched; Supabase/clock/web-push live only in the worker IO
layer. A worker-local trigger-read port (`notify/store.ts`) holds the two reads `@app/ingest` shouldn't.

- **draft_turn** — subject **`${draftId}:${pickNo}`**. Piggybacks the **§5 draft ticker**: a new
  injected `afterTick` hook on `startDraftTicker` (keeps `draft.ts` free of `@app/notify`) dispatches to
  the on-the-clock manager of every active draft each 2s tick, reusing `DraftStore.loadDraft` + the
  shared store the ticker drives (so it sees the post-autopick pointer). Catches a turn advanced by a
  human pick **or** an autopick; the pickNo key makes the re-fire a no-op until the turn advances.
- **player_not_starting** — subject **`${matchId}:${playerId}`**. Hooks the **§3 Pre-match
  `match_lineups` pull**: `ingestLineups` now returns the official-XI starter BDL ids it already fetched
  (no second feed call); the scheduler compares them against the match-period's fantasy **is_starter**
  slots and alerts the owner of any starter not in the XI and still unlocked (`locked_at` null).
- **match_starting** — subject **`${matchId}`**. On each **§3 60s scheduler tick**, alerts managers who
  own ≥1 rostered player on **either** team (owners-only, whole roster) of a fixture kicking off within
  **`NOTIFY_MATCH_LEAD_MIN`** (default **15 min**, config knob). The lead window (`[now, now+lead]`,
  past-kickoff excluded) + the ledger collapse the 60s re-fires to one alert per owner per fixture.

Each dispatch is isolated in its own try/catch so a notify failure never starves the autopick or
ingestion/recompute loops. Actual device delivery stays a live-only inference (no push service in CI).
