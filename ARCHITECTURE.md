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

- **Frontend:** Next.js (App Router) + React + TypeScript. Tailwind for styling (Design will
  specify the system). Two reactive surfaces matter: the **live draft room** and the **live "vs
  the field" screen**; everything else is ordinary CRUD.
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
                 |                                                                 |
                 |  Cron Job: daily FAAB batch (~06:00 league-local, pre-kickoff)  |
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
| **Schedule sync** | hourly + daily | `matches` | keep kickoff times / statuses / scores current; kickoff times drive FAAB gating, period closes, and entry into "live" mode. |
| **Pre-match** | at each kickoff | `match_lineups` | confirmed starting XIs -> **lock all starters** (set `locked_at`). |
| **Live** | while any match `in_progress` | `match_events` (~60s), plus `player_match_stats` / `match_shots` / `team_match_stats` | **lock each substitute at his entry minute**; cards (w/ minute); goals; own goals; live-updating event points. |
| **Settle** | after FT until values stabilize | `player_match_stats`, `match_shots`, **rating source** | stats can lag *hours*; the **rating lands near/after FT** -> keep recomputing as values arrive. |

Live latency is a few minutes on the feed itself, so polling faster than ~60s is wasted — a sub
who enters becomes lockable within a couple of minutes, which is fine.

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
  - **`waiver_order_position` enforcement (locked — scaffold thread):** the **DB owns uniqueness** via a
    plain `@@unique([league_id, waiver_order_position])` (non-deferrable — vanilla Prisma, no drift). The
    **FAAB batch owns contiguity** (1..N, no gaps — not expressible as a constraint) and runs
    move-to-bottom as a **two-phase reassignment** (shift the affected rows to a disjoint temp range,
    then write the final 1..N), keeping the plain unique satisfied at every checkpoint.
- `app_user` — Supabase auth user; allowlist gate for joining.

**Football reference (mirrored from feed)**
- `fifa_team`, `player` (id <-> balldontlie player_id, position, team, country),
  `fifa_match` (datetime **UTC**, status, scores incl. ET/pens, stage/group/round, formations,
  referee), `fifa_stage`, `fifa_group`.

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
  used, voiding+refunding bids on already-kicked-off players.

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

- **Time:** everything stored in **UTC** (the feed gives UTC). "League-local" exists only for the
  FAAB batch clock and display. One source of truth kills the classic timezone bug.
- **Migrations:** Prisma Migrate (or Drizzle) — versioned, reviewed, boring.
- **Jobs:** host cron + an in-process scheduler in the worker; the worker tightens cadence in live
  windows by reading `fifa_match`. **No queue** (overkill at this scale); add one only if ever
  needed.
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
