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
  routes still carry byte-identical per-route `ds.css` copies that double-load harmlessly.
  **Shared player-card surface `.pc-*` (Prompt 53 — 2026-06-13 design batch, additive):** the design
  system now carries a shared player-sheet vocabulary — the segmented **Points | Stats** tab strip
  (`.pc-seg*`), the Stats body (`.pc-stats`/`.pc-tiles`/`.pc-tile*`/`.pc-log*`/`.pc-lrow*`/`.pc-statline`/
  `.pc-stat*`), and the standalone sheet chrome (`.pc-scrim`/`.pc-sheet`/`.pc-x`/`.pc-head*`/`.pc-ovr*`).
  Consumed by **every** player sheet (vf-psheet, sl-scoremodal) and the standalone Free Agents / Waivers
  sheets; references EXISTING tokens only (no new variables). Appended byte-for-byte to canonical
  `styles/ds.css` + the four per-route copies (all five stay byte-identical; `appShell.test.ts`). The
  same 2026-06-13 export's deletions were rejected as omissions (`--kit-outline`, the P46 PlayerAvatar/
  `.flag-emoji` block, the P40 overflow backstop — all live dependencies); `playerCardTokens.test.ts`
  guards both the `.pc-*` presence and those survivors. Dormant until a screen renders it.
  The authenticated screens (hub `/` + `/draft` + `/lineup` + `/vsfield` + `/waivers` + `/scoring` +
  `/settings`) are wrapped by the **App Shell** (`app/shell/AppShell.tsx`, which absorbed the interim
  CrossNav). The shell has a **responsive nav** (Prompt 40):
  - **≥ 640 px (tablet/desktop):** contained top strip. `.sh-topnav-scroll` (`overflow-x:auto;
    min-width:0; flex:1`) holds the 8 nav items so they scroll within their own box and never widen
    the document. `min-width:0` on `.sh-app` / `.sh-topbar` lets flex ancestors shrink below intrinsic
    child width. Active-tab `scrollIntoView` is handled by the `MoreSheet` client island — it calls
    `el.scrollIntoView({ inline:'nearest' })` targeting the scroll container, not the document.
    `html, body { overflow-x:hidden; max-width:100% }` in `ds.css` is the document-level backstop.
  - **< 640 px (phones):** top strip hidden; fixed bottom bar (`.sh-btmnav`) shows: **Dashboard ·
    Set lineup · Vs the field · Pool · More**. More opens a slide-up sheet: Scoring · Waivers · Draft
    room · Settings · identity · POST sign-out. Both navs rendered in DOM; swap is pure CSS at **640px
    — no `matchMedia`, no hydration fork** (§18 vsfield precedent; 640 px ≠ vsfield's 760 px). Bar
    clears iOS home indicator via `env(safe-area-inset-bottom)` + `viewport-fit=cover` in
    `app/layout.tsx`. `MoreSheet.tsx` (`"use client"`) is the only stateful island.
  - **"Vs the field" is the phase-aware bracket surface.** No separate bracket tab; bottom bar stays
    Dashboard · Set lineup · Vs the field · Pool · More across all phases (no conditional reshuffling).
  Auth/landing routes are not shell-wrapped — they carry their own brand chrome (`/sign-in` +
  `/auth/denied` ds-skinned in **Prompt 21**; the marketing landing in Prompt 19). Two reactive
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
                 |    - availability peek (match_lineups ~T-75; badge, not lock)   |
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
| **Availability peek** | ~75 min before each kickoff (`LINEUP_PEEK_LEAD_MS`), re-fires every tick across `[kickoff − lead, kickoff)` until rows land | `match_lineups` | persist the announced XI **and bench** to **`match_lineup_entry`** for the Set Lineup **availability badge** (Starting / Not starting). ORTHOGONAL to the lock: the pure selector `matchesNeedingLineupPeek` drives `peekLineup`, which writes ONLY that table — never `locked_at`, never `lineupPulled`, never a notification. This is the only reason the app holds lineup data *before* kickoff (previously the XI was first seen at kickoff). |
| **Pre-match** | at each kickoff | `match_lineups` | confirmed starting XIs -> **lock all starters** (set `locked_at`). Still the SOLE owner of the kickoff lock; the T-75 peek above is disjoint (`< kickoff`) and does not touch it. |
| **Live** | while any match `in_progress` | `match_events` (~60s), plus `player_match_stats` / `match_shots` / `team_match_stats` | **lock each substitute at his entry minute**; cards (w/ minute); goals; own goals; live-updating event points. |
| **Settle** | after FT until values stabilize | `player_match_stats`, `match_shots`, **rating source** | stats can lag *hours*; the **rating lands near/after FT** -> keep recomputing as values arrive. |
| **FAAB batch** | per period, at its deadline | (DB only) | clear the league's blind bids ONCE per scoring period, before that period's first kickoff (Theme-D amendment, below). Selects periods whose deadline has passed and that have not cleared, runs the unchanged `@app/faab` `resolveFaabBatch`, latches `period.batch_cleared_at`. Replaced the retired daily cron. |

Live latency is a few minutes on the feed itself, so polling faster than ~60s is wasted — a sub
who enters becomes lockable within a couple of minutes, which is fine.

**`match_lineups` is a FLAT list of one row per player (verified live GOAT; fix `fix/lineup-feed-shape`).**
Each `data` element IS an entry — a top-level `match_id` + `is_starter`, with the player id nested at
`row.player.id` (NOT `player_id`; same nesting trap as `match_events`). Bench players are their own rows
(`is_starter: false`). There is **no** per-match `{ entries: [...] }` wrapper — the old `FIFAMatchLineup`
type was a never-validated assumption, so both consumers (`peekLineup` and `ingestLineups`) threw
`lineup.entries is not iterable` on live data (the recurring `lineup.peek.error` log). For a window this
**silently disabled** the T-75 availability peek, the **kickoff XI-lock**, and the `player_not_starting`
notification's `officialStarterBdlIds` — masked only by the appearance-reconciliation backstop. Both now
map `res.data` directly by `row.player.id` / `row.is_starter`; the lock-write boundary was byte-untouched.

**Lock write path — the single `lockSlot` boundary + its categorical gate (2026-06-11 / 2026-06-12
premature-lock fixes).** Lock instants are proposed by the pure primitives `lockInstantsFromLineup` /
`lockInstantFromSub` / `lockInstantsFromAppearances` (`packages/ingest/src/lock.ts`); **every** writer —
XI-pull, sub-event, appearance reconcile, and the post-drop sweep — then routes through **one** store method,
`IngestStore.lockSlot(matchBdlId, playerBdlId, lockedAt, now, path)`. Nothing else writes
`lineup_slot.locked_at` (a structural test, `lockBoundary.test.ts`, fails if a second writer appears).
Before stamping, `lockSlot` enforces the pure invariant `isLockWriteAuthorized` against the **source** match:
the player's `team_id` must be one side of that match (**participant proof**), the match `status ∈
{in_progress, completed}` (**in-play-or-later**), the instant must have arrived (`lockedAt <= now`), and the
match must have a period — only then the monotonic, period-scoped write (`updateMany … where locked_at IS
NULL`). This is the **categorical kill for the 2026-06-12 cross-match leak**: a substitution event belonging
to a *different* live fixture — or any `scheduled` match — can never authorise a stamp, regardless of upstream
feed/mapping bugs. **The `now` gate is ONLY a temporal boundary** (never stamp before the instant) — it is
explicitly NOT an identity/scoping guard; the earlier "self-guarding against a wrong match" claim was
falsified by the recurrence (foreign-fixture sub instants are legitimately past). Two **outer defences** feed
the boundary: `ingestLive`/`ingestSettle` drop any feed row whose own `match_id ≠ ctx.bdlId` (logs
`ingest.{live,settle}.foreign_skipped`), and the feed client now scopes every match-scoped pull
**server-side** via the bracketed `match_ids[]=<id>` array param at `per_page=100` (single-page
resolution; the scalar `match_id` is silently ignored by the GOAT FIFA paginated endpoints, which is the
deeper cause of the firehose — `feat/feed-match-ids`), **retaining** the client-side `match_id` re-filter
as belt-and-suspenders. `lockSlot` logs `lock.slot.stamped` / `lock.slot.refused` (with reason) per attempt so the next
incident is diagnosable from Render logs in minutes. **Self-heal:** migration `20260612220000` lets
`enforce_lineup_lock()` permit `locked_at → NULL` **only while the lock-source fixture is `scheduled`** (a
premature stamp, player/role/is_starter unchanged), so the all-periods cleanup
(`ops/2026-06-12-clear-cross-match-locks.sql`) can repair existing rows; a played (in-play-or-later) lock
stays immutable. `now` is threaded through `MatchCtx.now`, set per worker tick in `apps/worker/src/scheduler.ts`.
**Read predicate:** both read sites — `loadLineup.ts` (the `/lineup` editor) and `loadVsField.ts:148`
(the live display) — derive `locked` through the shared pure `isLockedNow(lockedAt, now)` (`@app/shared`):
locked **iff `locked_at != null && locked_at <= now`**, so a future-dated stamp reads as movable.

**Appearance-lock backstop (the opposite failure — UNDER-stamping; 2026-06-12 MD1; merged `e888f66`).**
The two write paths above are racy: the one-shot pre-match XI-pull and per-event live sub-locking miss
appearances the 60s poller never observed (a late/missed XI confirmation, a sub between polls), leaving a
genuinely-played slot `locked_at = NULL` forever (e.g. Rangel, 90′). `reconcileAppearanceLocks`
(`packages/ingest/src/ingest.ts`) closes this: it reads the authoritative appeared set
(`store.listAppearedPlayerBdlIds` → `score_player_match`, i.e. the same `playerAppearedInMatch` participant
gate scoring uses) and stamps every appeared player at **kickoff** via the same monotonic, **period-scoped**
`lockSlot` boundary (only `locked_at IS NULL` slots in the match's own `period_id`, now also team+status
gated — never the ambiguous team→future-fixture join, never an already-set sub lock). It is called from **both `ingestLive` and
`ingestSettle`**, so settle — which holds the appearance proof — finally writes the lock. **Coverage limit — closed by `sweepCompletedMatchLocks`** (added `feat/appearance-lock-sweep`): the
live/settle path reconciles only while the match is `in_progress` or `completed && !hasRating && ≤ kickoff +
12h`. A bounded sweep over completed fixtures within 48h of now closes the post-drop gap: called at the
hourly schedule-sync cadence in `apps/worker/src/scheduler.ts`, it runs `lockInstantsFromAppearances →
lockSlot` per match (the same gated, monotonic boundary — a no-op for already-locked slots; logs
`lock.sweep.stamped` on actual new writes).

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
  kickoff"; `// TODO(confirm): batch lead`). The deadline math — `effectiveBatchAt(period, leadMs)` +
  `PeriodCadenceView` + the `DEFAULT_FAAB_BATCH_LEAD_MIN` constant — lives in **`@app/faab`**
  (`batchTime.ts`), **re-exported** from the worker selector for back-compat (Prompt 49). It moved out of
  the worker for the **same reason `acquisitionWindowState` did**: `apps/web` cannot import `apps/worker`,
  so the **web waivers "next batch" element** (`loadWaivers` → `buildBatchWindowView`) computes the
  **identical instant** the worker fires against — one source of truth, no display-vs-fire drift.
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
- **Waivers-tab FA surface — the route's UI consumer.** `/waivers` renders an in-page free-agent list
  (`FreeAgentPanel`) that consumes **`POST /api/faab/free-agent`** for instant $0 add/drop pickups. The
  SAME `acquisitionWindowState` phase the `BatchBar` shows drives the acquisition surface: sealed-bid →
  the sealed claim form; free-agency → the FA list (instant Add, reusing the composer's `droppableRoster`
  drop picker); locked → Add disabled. The offered pool is the **snapshot-eligible** set the loader
  resolves via `listFaIneligiblePlayerIds` (`@app/faab/prisma`) — the SAME `snapshotOwnershipWhere`
  predicate `getFaTargetFacts` re-checks at grant time, so the list and the route can't drift (a stale
  list only falls through to the `fa-conflict` 409, surfaced inline). **Prompt 48 shipped + tested the
  route but never surfaced it**, so the window's only UI action was a sealed bid that wouldn't clear
  until the next batch — this wiring closes that gap.
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
- **Participant-set invariant (only match participants are scored).** A dirty `(match, player)`
  marker is necessary but **not sufficient** to score — the sweeper writes a `score_player_match`
  row only when the player **actually appeared** in that match. `recomputePlayerMatch` gates on the
  pure `playerAppearedInMatch` (packages/recompute/adapter): the player's `team_id` must be one of
  the match's two teams **AND** there must be an appearance signal (a real, non-stub stat line, a
  named match event, or a shot). A non-participant gets **no row** (any pre-existing bogus row is
  deleted and the affected `(manager, period)` re-enqueued). Why this exists: a stored mis-join
  (cross-team rows) or an all-null `dirty` stub from `markStatPlayerDirty` would otherwise be scored,
  and a stub **GK/DEF** was charged −1 because **goals conceded is gated only on role, not minutes**
  — the live 2026-06-11 MD1 incident (whole field dragged negative by a completed Mexico–South Africa
  fixture). The per-match scoring path is the single chokepoint that refuses non-participants
  regardless of how the upstream stub/mis-join arose.
- **Phase-1 sweep: atomic claim-then-clear (beb1bec).** `RecomputeStore` now exposes
  `claimDirtyPlayerMatches()` (replaces `listDirtyPlayerMatches()`) — one `updateManyAndReturn` per raw
  table flips `dirty=true→false` AND returns the claimed keys atomically, closing the read→compute→clear
  lost-update window. `markPlayerMatchDirty()` replaces `clearRawDirty()` and is called on per-key
  failure to re-surface poison rows. `RecomputeOptions` gains `onPlayerMatchError`; `SweepResult` gains
  `playerMatchFailures`. Per-key try/catch ensures a failure re-dirties the key and continues — every
  claimed key ends with either a fresh score or `dirty=true`, never `dirty=false`-and-stale. The race is
  dormant while raw-layer writers are serialized in the worker; it becomes load-bearing once the
  Sofascore scraper writes ratings concurrently. Real-Postgres atomicity validated only by
  `packages/recompute/src/sweepClaimClear.integration.test.ts` (skipped in CI gate; must run green
  against a real Postgres before concurrent scraper writes begin).

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

**Commissioner lock-on-play carve-out (the override write path).** A deliberate commissioner repair of a
played-player freeze (`commish:lineup --allow-locked-slot`) is exempted from the `enforce_lineup_lock()`
trigger (§4) by a **transaction-local GUC** `app.commish_override`: the override's `saveLineup` issues
`SET LOCAL app.commish_override = 'on'` in its own write transaction, which the trigger reads via
`current_setting('app.commish_override', true)` and exempts. Unset — every normal write, and the
lock-on-play job (which also runs as service_role) — leaves the latch enforcing. No role exemption, no
global flag; scoped to the one transaction (migration `20260611120000_lock_on_play_commish_override`).

---

## 4. Persistence — data model

PostgreSQL. The invariants that make this consistency-critical are enforced by the **database**,
not by hopeful application code:

- **Unique player ownership per league** -> unique constraint on active ownership.
- **No FAAB double-spend / no illegal roster** -> each claim resolves in **one transaction**
  (check budget + roster cap + valid drop, then write).
- **Sealed bids stay secret** -> **row-level security**: a manager can read only their own
  *pending* bids; everyone can read outcomes after the batch.
- **Hindsight-proof swaps -> a DIRECTIONAL lock latch** (the forfeit model, §16; supersedes the old
  bidirectional "editable only while `locked_at IS NULL`" freeze). `enforce_lineup_lock()` enforces, in
  the swap transaction: a played player can never be moved **INTO** the XI (the hindsight block — gated
  on `locked_at`, retained), but a played starter **can** be moved **OUT** as a one-way FORFEIT — the
  trigger permits exactly `is_starter` true->false WITH `voided_at` NULL->set, and back-stops the
  one-way door (no un-void, no start-of-voided). `voided_at` is an editability latch only — never a
  scoring input. The transaction-local `app.commish_override` GUC carve-out (commissioner override; §3,
  migration `20260611120000`) is unchanged. `locked_at` is retired from movability but still stamped +
  read for the IN-direction backstop; retiring its stamping is a post-tournament follow-up.

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
  is_starter, **`locked_at` (nullable timestamp)**, **`voided_at` (nullable timestamp; C1 forfeit
  latch)**. Per-period arrangement -> "set multiple lineups in advance" = rows for future periods.
  Movability is now `frozen_at IS NULL AND voided_at IS NULL` (C1 §16); `locked_at` is retired from
  movability but still stamped + read by the IN-direction hindsight backstop.
  Lock-on-play sets it (starter -> kickoff; sub -> entry minute).
- `match_lineup_entry` — `(match_id, player_id)` UNIQUE, **`is_starter`**. The pre-kickoff official-XI/
  bench **snapshot** the T-75 **Availability peek** (above) writes; drives the Set Lineup **availability
  badge** (`loadLineup` joins it; `resolveStarterStatusByPlayer` keys it to the SAME `fifa_match` row as
  kickoff/opponent). ADDITIVE, starts empty (no backfill), global-read RLS, no Realtime. ORTHOGONAL to
  `lineup_slot` — it is NEVER a lock and the engine never reads it.

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

**Playoffs (survival state)**
- `playoff_entry` — `id`, `league_id`, `manager_id`, `seed` (group-stage seed, carried verbatim — no
  re-seeding), `status` (`alive`/`eliminated`/`champion`), `eliminated_round` (nullable KnockoutRound
  string), `eliminated_at` (nullable timestamptz). `@@unique([league_id, manager_id])`,
  `@@index([league_id, status])`, FKs `ON DELETE CASCADE`. **Row existence = field membership** — non-
  advancers have no row. Phase 2 (guillotine round-loop) flips `status → eliminated`, Phase 4 (theater
  screen) reads it. **RLS:** league-scoped authenticated SELECT (mirrors `standing`/`pool_pick`); no
  write policies (server-only). **Publication:** added to `supabase_realtime` (guarded `ADD-TABLE` idiom
  in migration) so Phase 4's subscription is not silently empty (the Theme F Realtime-publication trap).

**Raw feed layer (recompute inputs; upsert-keyed)**
- `stat_player_match` — PK `(match_id, player_id)`; the promoted `FIFAPlayerMatchStats` columns the
  scoring model consumes + minutes_played + updated_at. feat/scoring-promote-lines added five more
  promoted columns (`shots_on_target`, `ball_recoveries`, `big_chances_created`, `crosses_accurate`,
  `touches`). **The remaining 8 un-promoted feed fields are RETAINED verbatim in `extra` (JSONB)** —
  populated by `mapStatLine`'s catch-all (see §7 / Appendix A); unscored, refreshed on re-poll.
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
- **Complete-state view (Prompt 52):** when `status === "complete"`, `DraftRoomClient` renders the same
  authoritative `<Board>` (full snake grid, all managers' picks) + `<RosterPanel>` squad recap in the
  existing `dr-body/dr-boardwrap/dr-rail` layout. No data-shape change — the loader already hydrates all
  picks and managers for every status. `buildBoard.isCurrent` gates on `status === "active"`, so the board
  is read-only by construction.

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
  attribute to GK/DEF role. **Conceded requires team-in-match:** a goal counts as conceded only
  when the player's `team_id` is the match's home or away team (`concededByPlayerTeam`,
  packages/recompute/adapter). Without this guard an uninvolved team's `scorerTeam != playerTeam`
  is trivially true for **every** goal, so a non-participant "concedes" the whole match (the
  2026-06-11 MD1 −1 bug — defense in depth behind the participant gate above).
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
| Dispossessed (−1 / 3) | no `dispossessed`; feed has `possession_lost` | **REMAP -> "Possession lost"** (broader; recalibrated −1/3 → −1/8 → −1/10) |

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

### 📦 Promoted columns + the un-promoted catch-all (`stat_player_match.extra`)
**PROMOTED COLUMNS (feat/scoring-promote-lines).** Five fields that previously lived only in `extra`
now have their own typed nullable columns the recompute adapter reads + §4 scoring lines (see SCORING.md
§4): `shots_on_target` (+1/3), `ball_recoveries` (+1/5, outfield), `big_chances_created` (+1/1),
`crosses_accurate` (+1/4), `touches` (+1/25). `mapStatLine` maps each onto a `StatLineRow` column AND
adds it to `STAT_EXTRA_OMIT` so it no longer lands in `extra`; `upsertStatLine` writes the five in both
upsert branches. **This IS a scoring change** — a feed re-ingest of completed matches (to populate the
columns) + a full recompute/standings restate are required (mark stat rows `dirty` → the dirty sweep
re-derives via the engine; `job:recompute` alone only re-sums stored breakdowns).

**RETAINED in `extra` (the remaining 8 un-promoted fields).** `expected_goals`, `expected_assists`,
`crosses_total`, `tackles` (total), `aerial_duels_won`, `aerial_duels_lost`, `fouls_committed`,
`big_chances_missed`. `mapStatLine` carries **every own key the feed sends that isn't a promoted column
or an identity field** into a catch-all `extra` (JSONB), values verbatim, `null` when empty — a
**CATCH-ALL by design**, so a field a future feed edition adds is retained automatically, no code change.
The engine does not read `extra`; those eight stay unscored. **Aerials were considered and rejected** as
a scoring line: `aerial_duels_won` ⊂ `duels_won` (already scored) — verified read-only against the live
API (51-row sample: 0 superset violations, non-negative remainders, aerial never present without duels),
so a separate aerial line would double-count. They remain in `extra` for reference only.

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
- **Group→playoff transition is now BUILT** (`feat/playoff-transition`, 87a7e1a→b7dc9d3): `commish:transition`
  CLI + the 6-step `$transaction` (status claim → `cut_count` writes → `playoff_entry` rows → roster
  release → FAAB reset → waiver carry-forward); pure `cutScheduleFor` + `selectPlayoffField` +
  `carryForwardWaiverOrder` in `packages/recompute/src/transition.ts`. See **§20** for the full wiring.

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

**`selectTournamentPhase(matches: ReadonlyArray<{status, periodKind, periodLabel}>): TournamentPhase`**
— pure, IO-free. Group↔knockout keys on **`period.kind`** (`group_md` vs `knockout_round`) and the
Final is detected by **`period.label === "Final"`** — NEVER `fifa_match.round` (the feed labels group
games with the matchday number, so `round !== null` mis-fires; Prompt 44, DECISIONS → Pool /
tournament-phase discriminator). Composition point is `loadDashboard.ts`: when `selectDashboardPhase`
returns `"post-draft"`, the loader queries `fifa_match` (`status`, `kickoffAt`, and the linked
`period.kind`/`period.label` — SELECT only, no write) and calls `selectTournamentPhase`. The `fifaMatch`
table is global (no `league_id`); the read is inside the authenticated server loader, gated by
`requireManager` upstream in `page.tsx`. No RLS bypass, no engine/scoring touch.

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

**Mobile leaderboard fit (Prompt 41):** `LeaderboardTable` renders `.dtable.pl-board`, whose default
auto-layout is forced ~670 px wide by a long team name / email-address fallback in MANAGER (then clipped
by the body backstop). `pool.css` (`≤480`) switches it to **`table-layout: fixed; width: 100%`**:
`#`/PLAYED/CORRECT/POINTS hold narrow fixed widths, MANAGER takes the remainder and **truncates with an
ellipsis on the cell's block child** (`td:nth-child(2) > *` — an inline `<b>` would still report full
geometry past the viewport even when paint-clipped). `row-me` ("YOU") inherits the same fixed layout, so
it never causes its own horizontal scroll.

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

## 14. Lineup + waivers polish (Prompt 51)

Two display-only primitives moved into **`@app/shared`** (the single cross-cutting source; no engine
touched):

- **Canonical period order** — `periodOrderRank` / `comparePeriodLabels` / `sortByPeriodOrder`
  (`periodOrder.ts`). Group matchdays rank by their MD number, then the knockout rounds by their
  `KNOCKOUT_ROUNDS` bracket index (R32→R16→QF→SF→Final). This is the SINGLE source for ordering any
  period selector (the set-lineup matchday tabs today). It replaces `loadLineup`'s `opens_at ASC,
  label ASC`, which degraded to an alphabetical label sort (→ "Final, QF, R16, R32, SF") whenever
  `opens_at` was null — correct now regardless of when fixtures sync.
- **`formatInLeagueTz`** (`time.ts`) — lifted from `apps/web/src/waivers/waiversLogic.ts` so the
  set-lineup screen reuses the EXACT league-tz wall-clock renderer the waivers "next batch" element
  uses; the waivers copy is now an import (behaviour byte-identical).

**Per-player kickoff (closes the Prompt-10 launch-gate seam).** Each squad player's fixture date+time
= his lock/sub deadline, shown on the pitch token + bench row. Resolution is pure in
`src/lineup/view.ts` (`kickoffByTeam` = earliest per team; `resolveKickoffByPlayer` = `player.teamId` →
this period's `fifa_match` → kickoff ISO, or `null` → "TBD" for a TBD/unplaying team). `loadLineup`
selects `player.teamId`, reads each period's `fifa_match` rows, fills `kickoffByPlayer` per period, and
threads `league.timezone` into `SetLineupState` for client-side formatting. The waivers free-agent pool
also gains the draft's collapsible country filter (shared `<NationFilter>` in `apps/web/components`) and
country flags (a `NationFlag` over the sole `<Flag>`/`toIso2` surface; `nation` derived from the
`fifa_team` join since `player.country` is unwritten).

**Per-player opponent (Prompt 53).** The opponent is resolved from the SAME `fifa_match` row as the
kickoff — the `fifaMatch` query in `loadLineup` is extended once to also select `homeTeam.name` and
`awayTeam.name`; `resolveOpponentByPlayer` mirrors `resolveKickoffByPlayer`'s earliest-kickoff tie-break
so kickoff and opponent always reference the same match row and can never diverge. `player.teamId ===
homeTeamId` → opponent is the away side, `isHome = true` ("vs"); `=== awayTeamId` → home side, `isHome
= false` ("@"). Null when the player has no fixture this period or either side is TBD (knockout bracket
not yet determined) — the UI renders "TBD" with no flag. The `OpponentInfo` type lives in
`src/lineup/types.ts`; `<OpponentTag>` in `app/lineup/components.tsx` renders "vs/@ + Flag + name` via
the sole `<Flag>`/`toIso2` surface (no new flag IP). Display-only; engine, resolver, and purity matrix
byte-untouched.

---

## 15. Period-select fix — `selectCurrentPeriod` + per-screen isCurrent latch (Prompt 54)

**Root cause.** `period.opensAt` is never populated by the provisioning CLI. The period queries in
`loadWaivers` and `loadVsField` used `ORDER BY opens_at ASC, label ASC`; with `opensAt = NULL` for
every row, the DB fell back to label-alphabetical — "Final" (F) before "Group MD1" (G). Both screens
resolved to the Final period on WC opening day.

**Shared selector: `selectCurrentPeriod<T>(periods, isCurrent)`.** Lives in
`packages/shared/src/periodOrder.ts` (same module as P51's `sortByPeriodOrder`). Re-sorts the input
array in JS by `matches[0].kickoffAt` (populated by schedule sync, not by provisioning), then applies
a per-screen `isCurrent` predicate. `status === "open"` is a fast-path retained for future-safety;
the pending arm uses the injected `isCurrent`. `period.status` never actually transitions — it stays
`"pending"` from provision to freeze (no code writes `"open"`) — so the open arm is currently dead.

**Per-screen predicates (the split is required).**

- **Waivers:** `p => p.batchClearedAt === null` — the batch has not yet cleared for this period.
  `batchClearedAt` is stamped when `effectiveBatchAt = firstKickoff − DEFAULT_FAAB_BATCH_LEAD_MIN
  (360 min) ≤ now`. This is the correct waivers latch: the period is the active window until its
  batch fires.
- **Vsfield:** `p => now < matches.at(-1)?.kickoffAt + MATCH_DURATION_MS` — at least one match in
  this period is still live. `MATCH_DURATION_MS = 120 * 60 * 1000` (covers regulation + extra time).
  Using `batchClearedAt` for vsfield is **wrong**: the stamp lands ~6h *before* first kickoff, so
  during live MD1 matches `batchClearedAt` is already non-null → vsfield would advance to MD2,
  binding the Realtime subscription and lineup/score reads to the wrong period. The time-based latch
  keeps vsfield on MD1 through its last whistle.

**Query changes.** `loadVsField`'s period query now fetches all matches per period (removed `take: 1`)
so `matches.at(-1)` gives the last scheduled kickoff; `batchClearedAt` removed from the select.
`loadWaivers` unchanged (already had `batchClearedAt: true` + `take: 1`).

`resolveFaabBatch` / `resolve.ts` / purity matrix are byte-unchanged (period selection is a loader
concern, not a resolver concern). `// TODO(confirm)` in `loadVsField` marks the
overlapping-group-waves scope-out (sequential periods only; two concurrent matchdays = future work).

## 15. Set-lineup formation selection + roster-fillability filter (Prompt 54)

The set-lineup module gains a **formation picker** and a **roster-fillability filter** — the
consequence of the Prompt-44 draft cap-lift (squads can now be non-4-3-3-shaped), which stranded a
3-DEF squad on a hardcoded 4-DEF default at 10 starters. **Same validate/save path; no new write path,
no RLS/Realtime change.**

**All new logic is pure**, in `apps/web/src/lineup/view.ts` (consumed by the client, unit-tested in
`formation.test.ts`) — the live model stores no `formation` field (it's emergent from `starterIds`):
- `GROUP_FORMATIONS` — the DECISIONS Theme-B standard 7 (the design `modeConf().forms`), in canonical
  order. Not a new bound — the discrete shapes the picker OFFERS.
- `formationFillable(counts, formation)` — GK ≥ 1 and roster supply ≥ the shape's count per outfield
  lane. **The gap `validateLineup` never covered**: the validator checks a *proposed XI* against the
  bounds, never that the roster owns the bodies to build one.
- `formationLockLegal(formation, locks, squad)` — the live port of the design's `formationLegal`: a
  shape whose position count is below the locked-starter count there is rejected (can't bench a played
  man). Derived from the lock latch alone.
- `offeredFormations(squad, locks)` = fillable ∩ lock-legal, canonical order → the picker's options.
- `reshapeToFormation(squad, starterIds, locks, formation)` — keeps locked starters first, then current
  starters, then promotes only MOVABLE reserves (a locked bench player is never promoted). For a
  fillable ∩ lock-legal target it always yields a complete XI.
- `defaultFormationKey` / `defaultStarterIds` — the seed XI is now the **first fillable** formation
  (canonical 4-3-3 when fillable, else the first fillable in canonical order), built by
  `reshapeToFormation(squad, [], [], …)`. A 3-DEF squad opens on 3-4-3, savable immediately. A
  **persisted** lineup is still loaded as-is by `loadLineup` (`savedStarters.length > 0` arm) — its
  shape is never overridden.

**UI:** `<FormationPicker>` (segmented `.tabs`, offered shapes only) in `app/lineup/components.tsx`,
wired in `SetLineupClient` → a pick `reshape`s the starter set → the **existing** cross-position swap +
`evaluateProposal` (`@app/lineup` `validateLineup`) + `submitLineup` (`POST /api/lineup`) flow takes
over. The `@app/lineup` validator, the route, and the controller/store are **byte-untouched** — the
server stays the sole legality latch; the picker only ensures the manager starts from a fieldable shape.

**Render condition (Prompt 54-fix).** The picker is rendered **directly under the FORMATION panel**
(the `LockHero`), not inside the pitch column — that's where a manager looks to change shape. It is
ALWAYS in the returned JSX; its body is conditional on the offered set: `offered.length > 1` → an
interactive `role="tablist"` of `role="tab"` shape buttons (current shape = `aria-selected`);
`offered.length <= 1` → a **static, non-interactive indicator** (no dead single-tab control). The
control's rendering + interactivity is proven by a real **RTL + jsdom** mount of `SetLineupClient`
(`app/lineup/FormationPicker.test.tsx`), replacing the original source-contract smokes — the P54 lesson
that a "the JSX mentions it" smoke cannot prove a control actually renders and taps. This added the
repo's first DOM test infra: `jsdom` (root devDep, where Vitest resolves the environment),
`@testing-library/react` + `@testing-library/dom` (apps/web devDeps, sharing its React 19 instance),
`oxc: { jsx: "automatic" }` + `.tsx` include globs in `vitest.config.ts`, and a per-file
`// @vitest-environment jsdom` docblock so only component tests pay the jsdom cost (the rest stay Node).

**Responsive pitch sizing (Prompt 41).** The set-lineup body is a grid (`.sl-body`); below 820 px it
collapsed to a bare `1fr` column, which (= `minmax(auto,1fr)`) took its **min-content** from the 5-wide
MID lane and so never shrank to a phone — the pitch column was pinned ~384 px wide and clipped at the
viewport edge. `lineup.css` now uses **`minmax(0, 1fr)`** + `min-width:0` on `.sl-pitchcol`/`.sl-rail`
(the 0 floor lets the column shrink to the viewport, the pitch's `overflow:hidden` + wrapping lanes
reflow inside it), plus `≤480`/`≤360` blocks that scale the screen gutter, pitch padding, lane gap, and
**player-token width (78→62→52 px)** so the full XI shows in a clean formation and stays tappable
(`flex-wrap` on `.sl-lane` is the narrow-width safety net; the header rows — period/formation chips,
LockHero — already `flex-wrap`). `TODO(confirm)`: ~52 px token at 320 px is the practical floor for a
5-wide lane.

## 16. Lineup forfeit engine (C1)

Implements the DECISIONS Theme-B **forfeit model** (the demote-OUT half of the in-matchday-sub
amendment): a played player is no longer hard-locked — benching a played starter is a **final, one-way
FORFEIT**. C1 lands data + server engine + read contract only; the destructive-confirm UI is C2.

**Data.** `lineup_slot.voided_at` (nullable timestamptz) — the one-way forfeit latch (migration
`20260612120000_lineup_forfeit_voided_at`). The same migration CREATE-OR-REPLACEs `enforce_lineup_lock()`
to **co-enforce** the model at the DB level: a locked row's `is_starter` stays frozen EXCEPT the single
forfeit transition (is_starter true→false WITH voided_at NULL→set, locked_at/player/role unchanged), and
`voided_at` is one-way (no un-void, no start-of-voided, born un-voided). The commissioner GUC carve-out is
unchanged. Verified on a throwaway Postgres seeded with a **uuid-returning `auth.uid()` shim** (bare PG
masks the `sub::uuid` cast the earlier RLS migrations' self-tests rely on).

**"Has played" = `score_player_match` row existence** for (player, his match in the period) — the single
authoritative signal (NOT `locked_at`), `pointsAtStake` = that row's `points`. Timing nuance: the row
lands at the first recompute tick, slightly after kickoff.

**Engine (`@app/lineup`).** `validateLineup` now takes per-slot play state (`SlotState`:
`{isStarter, hasPlayed, voided}`) + a `forfeitConfirmed` id set, and enforces three directional rules:
voided→start (`voided-player-started`), played bench→start (`played-player-started`, the hindsight block),
played starter→bench (`forfeit-requires-confirm` unless confirmed). The controller computes the forfeit
set (confirmed played starters being benched) and the store stamps `voided_at` + benches them in one
transaction, then enqueues a manager-period `recompute_dirty` (deduped, mirroring
`@app/recompute.enqueueManagerPeriodDirty`) so standings restate. The memory double mirrors the extended
trigger (forfeit permitted, non-forfeit locked flip refused). The rollup (`scoreManagerPeriod`) is
UNCHANGED — starters-only already excludes a voided/benched player and counts the incoming starter.

**Read contract (for C2).** `loadLineup.ts` adds `PeriodLineup.slotMeta` per squad player:
`{hasPlayed, pointsAtStake, voided, movable}` where `movable = frozen_at IS NULL AND voided_at IS NULL`.
C1 renders NONE of it.

**No live destructive path pre-C2 (deliberate).** Point 3 ("replace the `isLockedNow` movability check at
the read sites") is realized as an **augment, not a replace**, at the live client: `loadLineup.ts` keeps
`locks` (driven by `isLockedNow`) exactly as-is, because the client (`apps/web/src/lineup/view.ts`) derives
all drag legality from `locks` — physically swapping it to the `movable` predicate would make a played,
unvoided starter draggable in the unchanged client, surfacing the forbidden destructive bench affordance.
`loadVsField.ts` is left UNCHANGED (its `locked` is a display/"played" flag, not a movability gate; applying
the formula would blank the live lock indicator). The server is authoritative regardless: with no confirm,
the engine rejects every bench-of-a-played-starter. C2 flips the client to `slotMeta` and wires the confirm.

**`locked_at` verdict.** Retired from movability, NOT deleted: the lock-on-play job still stamps it and the
trigger still reads it (the IN-direction backstop). Retiring the stamping + the latch's locked_at arm is a
proposed C2/follow-up, left intact in C1 so the live lock machinery isn't disturbed mid-tournament.

### C2 — forfeit confirm UI (shipped `9bee8d1`, merged to `main`)

C2 wires the C1 engine to a destruction-confirm UI. No new server paths — the existing `POST
/api/lineup` route simply receives a non-empty `forfeitConfirmedPlayerIds` array for the first
time.

**Read approach (pure, in `view.ts`).** Two new helpers:
- `classifySlot(slot, slotMeta)` — maps a slot to one of `"normal" | "played-starter" |
  "voided"` using the `slotMeta.{hasPlayed, isStarter, voided}` flags from the C1 read contract.
  A `"played-starter"` token gets a live pts badge + the forfeit affordance; a `"voided"` token
  renders strikethrough.
- `fillEligibleIds(squad, slotMeta, locks)` — candidates the bench-fill logic can promote into a
  forfeited slot: un-played, movable, position-compatible reserves. **Not formation-aware** (the
  Save gate backstops any shape violation; deferred minor).

**Client classification split.** `SetLineupClient` classifies played starters via `slotMeta`
(the C1 read contract) while keeping the existing `locks` map for `buildPitch` movability
(drag-and-drop legality). This is deliberate: flipping `buildPitch` from `locks` to `slotMeta`
would surface the drag affordance on played starters in the unchanged UI — the engine rejects it
but UX would be confusing. The split is correct in C2 because the confirm sheet is the explicit
gate.

**Route.** `route.ts` type-validates `forfeitConfirmedPlayerIds: string[]` from the request body
(already the `SetLineupInput` shape from C1); the engine stays the sole legality gate.

**Four locked UX decisions (render-verified):**
- **Q1 — played-starter token:** pts badge + "Forfeit" affordance (no padlock icon — the
  forfeit is NOT a hard lock; the player is movable). `classifySlot` drives the token variant.
- **Q2 — confirm cancel = full undo:** tapping Cancel in `ForfeitConfirmSheet` closes the sheet
  and reverts the in-progress bench swap completely; the starter is restored to the XI.
- **Q3 — pre-flight eligibility block:** if `fillEligibleIds` returns empty (no valid
  replacement), the forfeit affordance is disabled at the token level — the manager cannot
  initiate a forfeit they can't legally complete (Save gate is still the backstop).
- **Q4 — voided render:** a voided slot renders strikethrough text + a muted "Forfeited" label;
  it is excluded from the draggable surface (non-interactive).

**Three deferred minors (non-blocking):**
1. `fillEligibleIds` is not formation-aware — a promoted bench player may yield a shape the
   validator rejects. The Save gate surfaces the error; a formation-aware pre-fill is a follow-up.
2. No in-place undo after a forfeit save — once `voided_at` is stamped the slot is permanent;
   UX shows "Forfeited" with no undo affordance (the one-way door is correct by design).
3. **~1-tick post-kickoff window:** a player who just kicked off may have no `score_player_match`
   row yet (the recompute tick hasn't landed). During this window the client reads
   `hasPlayed: false` — no pts badge, no forfeit affordance — typically ≤60s; resolves on the
   next tick. Surfaced, not worked around.

**Open:** legend-copy wording for "Forfeited" vs "Played" — deferred to a UX pass.

---

## §17 — Player box-score modal (Prompt 52)

### Pure view-model: `packages/player-box` (`@app/player-box`)

`buildPlayerBox(input: BuildPlayerBoxInput): PlayerBoxView` is a **pure function with no IO**: all
inputs (player identity, fixture, score, stats, `now`) are injected; it never calls the DB or clock.
The returned `PlayerBoxView` contains:

- **`header`** — `displayName`, `shortName` ("F. Surname"), `position`, `nation`, `fixture` (nullable
  `FixtureView`), `periodTotal`
- **`state: BoxState`** — `"not-started" | "in-progress-no-score" | "in-progress" | "played" |
  "no-fixture"` — drives empty-state copy in the modal
- **`sections: SectionView[]`** — scored lines from `breakdown_json` grouped by SCORING.md §1→§8
  using `CATEGORY_META` (27-key mapping of `SCORE_CATEGORIES` → section/label/tag)
- **`trackedStats: TrackedStatRow[]`** — unscored context counts (minutes, dribbles attempted, etc.)
- **`season: { total: number } | null`** — always `null` from `buildPlayerBox`; the API route injects
  the real aggregate (see "Season total injection" below)

**Nation derivation pattern:** `player.nation` is sourced from the `player→team→fifa_team.name` join in
`loadPlayerBox.ts` (same as `loadLineup`'s `player.team.name` field). `player.country` is **never
populated by ingestion** and must not be used; see [[player-pool-source]].

### Server read: `GET /api/player-box`

`apps/web/app/api/player-box/route.ts` + `loadPlayerBox.ts` + `handlePlayerBox.ts`.

- **Auth posture:** `getSessionManager()` → 401 (no-session) / 403 (not-allowlisted / no-manager).
  No 403-not-your-manager — this is a league-scoped read (any manager in the league can view any
  player's score). `import "server-only"` in `loadPlayerBox.ts`; Prisma owner-bypass.
- **Query params:** `?periodId=&playerId=`. Client only has `activeId` (periodId); the server resolves
  the match from `(playerId, periodId)` — no `matchId` on the client.
- **Four parallel reads:** `score_player_match`, `stat_player_match`, `fifa_match` (for fixture), and
  `score_player_match` aggregate (season sum). `Promise.all` for parallelism.
- **Fixture fallback:** prefers the match join on `scoreRow?.match`; falls back to a direct
  `fifa_match` query when no score row exists yet (match not started).

**Season total injection:** `buildPlayerBox` always returns `season: null` (pure, can't DB). The loader
computes `_sum.points` across the player's periods for the league and injects
`{ ...view, season: seasonTotal !== null ? { total: seasonTotal } : null }`.

### UI surface: `ScorePill` + `PlayerScoreSheet`

**`ScorePill`** (`apps/web/app/lineup/components.tsx`): rendered on PLAYED/LOCKED tokens. Has `role="button"` + `stopPropagation` so it captures the click without triggering the parent button's
forfeit-confirm handler. `isLive={slotKind === "locked"}` shows an animated dot for players who have
kicked off but have no score row yet.

**`PlayerScoreSheet`** (`apps/web/app/lineup/PlayerScoreSheet.tsx`): surface-agnostic `"use client"`
modal. Fetches `GET /api/player-box` on mount; renders the header, `StatePill`, section rows
(`SectionBlock` → `LineRow`), tracked stats, and season total. Styled inside `.sl-scoremodal` (a
separate card layered above the forfeit overlay) — same `.sl-forfeit-overlay` scrim is reused.

**Dual affordance on played-starters:** the main `PitchToken` button tap = forfeit confirm; the
`ScorePill` tap (with `stopPropagation`) = score modal. Both co-exist on the same token element.

**`BenchRow` — locked bench rows are now clickable:** `disabled` was removed from locked bench rows;
click routing is `movable → onSelect(player.id)`, `!movable → onScore(player.id)`. The `is-locked`
class still applies for visual dimming; `aria-disabled` was also removed (the row is now interactive).

**Wiring:** `SetLineupClient` holds `scorePlayerId: string | null` state; `onScore` callback sets it;
period change resets it to null; `PlayerScoreSheet` renders conditionally after `ForfeitConfirmSheet`.

### Seams (next thread — Prompt 53)

- **Vs-the-Field wiring:** `PlayerScoreSheet` is surface-agnostic and can be mounted on `/vsfield`
  without modification; Prompt 53 wires it there.
- **Scoring feed panel / mini-pitch coloring:** deferred; no scope in Prompt 52.
- **Live score refresh:** `PlayerScoreSheet` fetches once on open; polling/Realtime update for
  in-progress matches is a follow-up.

## §18 — Vs-the-Field Direction-A reskin (feat/vsfield-reskin)

**Component vocabulary swap (`apps/web/app/vsfield/components.tsx`)** — removed: `FieldTable`,
`FieldRow`, `H2HDetail`, `XIList`, `XINode`, `StarterStatePill` (+ `H2HResultChip`, absorbed into the
leaderboard's `da-lb-wld` chip off `h2hVsViewer`). Added: `Leaderboard`/`LbRow` (228px left rail),
`CompareBand` (Facts 1+2), `XIPanel`/`XIPitch`/`XIToken` (flag-kit jersey pitches), and the mobile tree
`MaStandings`/`MaYou`/`MaRow`/`MaCompare`/`MaH2H`. Kept: `MatchStrip` (reclassed `.v2-match*`),
`ConnPill`, `Pos`, `Avatar`, `useScorePulse`, `RecordBadge`, `YouVsField` (reclassed `.v2-agg`),
`SeasonTable` (reclassed `.v2-season`).

**Self/field cockpit detail XI (feat/vsfield-self-xi).** `YouVsField` (the `.v2-agg` self/field view,
rendered when `effSel` resolves to `field`/self on BOTH the desktop `.da-body` and the mobile
`.ma-scroll`) now renders the viewer's **own detailed jersey XI** via the same `XIPitch`/`XIToken` the
H2H compare draws — fed with the viewer's own `StarterView[]` (`me.starters`). Per-player points chips
and tap-to-box-score come from the existing token; `YouVsField` gained `onOpenPlayer`/`dimLive` props and
both `VsFieldClient` call-sites pass `setBoxPlayer` (the already-wired `PlayerScoreSheet` open handler —
no new modal/fetch/endpoint). The lone self pitch is wrapped in `.v2-agg-xi` (rounded/clipped frame, the
role `.da-xi` plays in the two-up H2H) beside the preserved still-to-come/playing/played `.v2-agg-pside`
column; on phones `.v2-agg-pitchsec` stacks (pitch over a horizontal count row). This **replaced** the
abstract dot-node `PitchMini` + `XILegend` hero pitch, which were removed (zero remaining call-sites)
along with their dead `.vf-pitch*`/`.vf-node`/`.vf-legend2` CSS. Pure presentation: no loader/engine/RLS
change; per-player `points` already ship in the server-composed snapshot (Prompt 41 / path a),
`pointsPath.test.ts` stays green, H2H compare untouched. `MaYou` (the compact standings-list hero) never
carried a pitch and is unchanged.

**New pure module `apps/web/app/vsfield/kitOf.ts`** — ISO2 → CSS-gradient jersey map (**30 nations**:
8 original + 22 from the approved jersey-gradients handoff) + `kitOf(nation)`; reuses
`toIso2`/`isHomeNation` from `src/draft/flag.ts` (no second nation table); fallback `var(--surface-4)`.
Croatia is a conic **šahovnica checkerboard** dot over the tricolor (upgraded from a plain
red/white/blue tricolor to break the NED↔CRO collision — both were red/white/blue). England + Scotland
resolve by name via `isHomeNation` (saltire added for Scotland). The shared `toIso2` already covers the
full feed names — incl. Côte d'Ivoire with **either apostrophe** (U+0027 `'` and U+2019 `’`), Czechia,
Türkiye, South Korea — so no kit-local alias table was needed. Kits are multi-layer backgrounds — never
`background-size: cover` (test-guarded, incl. CRO).

**Mechanism unchanged:** `liveController.ts` / `snapshotClient.ts` / `realtime.ts` / `page.tsx` /
`layout.tsx` are byte-identical (the live mechanism). `VsFieldClient.tsx` changed ONLY in imports, the
selection state, and layout JSX — the Realtime block (`startVsFieldLive` + `onAuthStateChange`
INITIAL_SESSION/TOKEN_REFRESHED resubscribe + `fetchVsField`) has zero hunks. (As of the ScorePill change
— `feat/vsfield-scorepill` — `loadVsField.ts` + `packages/vsfield` additionally carry per-player `points`
in the server-composed snapshot; the live mechanism above is unaffected.)

**Client state:** `effSel: string | null` replaces `selected` — `'field'` sentinel (aggregate view) |
opponent managerId (UUID, collision-free) | null. Desktop resolves null → `'field'` and renders the
split cockpit (`.da-body`); the mobile tree (`.ma-scroll`) keeps null as the leaderboard-first home and
is swapped purely by a 760px media query (both trees render; no JS matchMedia, no hydration fork).
`MaH2H` holds a local You/Opp `useState` for its single-pitch toggle.

## §19 — Tabbed player card: Points | Stats (Prompts 54 + 55)

The shared `PlayerScoreSheet` (`apps/web/components/`) now carries a segmented **Points | Stats**
tab strip (`.pc-seg*`) from the 2026-06-13 `ds.css` design batch. The tab strip and Stats body are
the only additions; the Points breakdown and the component's interface (`{ periodId, playerId, onClose,
forfeitProps? }`) are unchanged.

### Tournament-stats data path (Prompt 54)

A new **player-scoped** aggregate endpoint collects per-match stats across the tournament:

```
loader: loadPlayerTournamentStats(playerId)
  → pure builder: buildPlayerTournamentStats(rows)   // IO-free; testable
    → adapter: toTournamentRows()                     // maps DB rows → typed tiles/lines
endpoint: GET /api/player-tournament-stats?playerId=
```

**Why player-scoped (no `periodId`):** the Stats tab aggregates the whole tournament, so the endpoint
has no period dimension. This also makes it reusable on period-less surfaces (Free Agents / Waivers)
without a separate endpoint.

**Eager + parallel fetch on sheet open.** The Stats data is fetched concurrently with the existing
`GET /api/player-box` Points fetch the moment the sheet opens — the client fires both in parallel
and renders whichever tab the user selects from already-resolved data (no lazy tab-trigger fetch).

**Position-aware tile/line set.** The Stats body renders `PC_TILEKEYS` / `PC_LINEKEYS` per the
2026-06-13 design (tile = large hero stat, line = compact row); the set is position-specific (e.g.
a GK card shows saves/clean sheets; a FWD card shows goals/shots). The design is authoritative;
the tile selection is fixed by the design constants, not run-time logic.

**Country/flags:** resolved from `fifa_team.name` through `player.team` (the P34 / P46 pattern),
never `player.country` (which is never written by ingestion — see §4 `player.country` note).

### INVARIANT (Prompt 55) — participation gate on tournament-stats aggregation

Any consumer of `stat_player_match` that aggregates a player's matches across the tournament **MUST**
gate on team participation:

```sql
WHERE match.status = 'completed'
  AND (match.homeTeamId = player.teamId OR match.awayTeamId = player.teamId)
```

**Why:** `stat_player_match` can carry non-participant stub rows (see the 2026-06-13 phantom-row
incident in DECISIONS). Without the gate, a foreign-match stub row inflates the tournament aggregate.
The tournament-stats loader applies this gate at the query level. The regression guard asserts the
gate is present in the query call args — a mocked `findMany` cannot filter rows, so asserting only
on the result would never catch a silently dropped gate.

**Seam — Free Agents / Waivers card:** REALIZED in Prompt 56 (see below) — the standalone
`FaPlayerCardSheet` consumes `GET /api/player-tournament-stats` via the extracted shared body, and the
open-vs-add interaction is resolved as a dedicated trailing control separate from the add path.

## Period-less Stats body — one source for two player cards (Prompt 56)

`apps/web/components/PlayerStatsTab.tsx` now holds the single, period-less tournament Stats body,
extracted out of `PlayerScoreSheet`:

- `usePlayerTournamentStats(playerId)` — the eager `GET /api/player-tournament-stats` fetch (keyed by
  player only, period-independent), returning `{ stats, loading, error }`. Fires on mount; a failure
  degrades to `error` (never throws).
- `<PlayerStatsTab/>` — position-aware tiles + game log (`.pc-*` markup), purely presentational over
  those three values (`GameRow` moved with it).

Both were lifted verbatim; `PlayerScoreSheet` now CONSUMES them, and its Points half (`periodId`, the
`/api/player-box` `useEffect`, `BreakdownBody`, `ForfeitSection`, the `.sl-scoremodal` chrome) is
byte-identical in behaviour (its existing tests pass unedited). The new standalone `FaPlayerCardSheet`
(waivers) consumes the SAME hook + body, so the period-less `/api/player-tournament-stats` reuse the
builder was designed for is now realized across BOTH cards. The period-BOUND Points read
(`/api/player-box`) stays exclusive to `PlayerScoreSheet` (vsfield + lineup have a live period); the
waivers card's Points tab is a real-`WvPlayer`-data overview instead. `FaPickRow` (in waivers
`components.tsx`) is the shared free-agent picker row consumed by `BidComposer` + `FreeAgentPanel`.

## §20 — Group→playoff transition + playoff lineup mode

**Shipped:** `feat/playoff-transition` (87a7e1a→b7dc9d3, 7 commits) + `feat/playoff-lineup-mode` (706351d + 3952e62), ff-merged to `main`. 2115 tests ✓. See also **DECISIONS.md → Group→playoff transition + playoff lineup mode**.

### Transactional transition + idempotency

`commish:transition --apply` runs ONE `$transaction` (six steps, in order):

0. Conditional `league.status` `group→playoff` claim — 0 rows aborts idempotently (belt-and-suspenders with the orchestrator skip).
1. Write `cut_count` onto the 5 knockout periods (upsert by `(league_id, label)` — they pre-exist from provisioning; `KNOCKOUT_ROUNDS` is the label contract, validated by `validateConfig` at provision time so a drift fails loud, not silently at the irreversible step).
2. Write one `alive` `playoff_entry` per top-N seeded manager.
3. Release non-advancers' active roster players to the FAAB pool (`droppedAt = now`).
4. Reset every advancer's FAAB budget to a fresh $100.
5. Two-phase waiver carry-forward: NULL all `waiver_order_position` values first, then write survivors `1..K` preserving their live relative order (the non-deferrable `@@unique([league_id, waiver_order_position])` is satisfied at every checkpoint via the temp-range disjoint write; eliminated managers end NULL).

**D6 pre-condition guard:** `--apply` refuses while any `group_md` period has `frozen_at IS NULL` (results not final). Override: `--allow-incomplete-standings` (irreversible-op escape hatch, not a default). Dry-run (default) prints field + seeds, cut schedule, release/trim plan, and the `standings: FINAL ✓ / ⚠ NOT FINAL` line without touching state.

Pure derivation in `packages/recompute/src/transition.ts`: `cutScheduleFor(fieldSize)` (front-loaded ⌊÷5⌋ + remainder distribution; field ≥ 6), `selectPlayoffField(standings, fieldSize)`, `carryForwardWaiverOrder(current, survivingManagerIds)`.

### `league.status`-vs-`period.kind` cap split

| Axis | Value | Resolver | Enforced at |
|---|---|---|---|
| Ownership (squad) cap | 15 group / 9 playoff | `rosterCapForLeagueStatus(league.status)` in `@app/shared` | FAAB submission validator + FAAB batch resolver |
| Lineup mode (starting shape) | group vs knockout | `period.kind === "knockout_round"` in `@app/lineup` | `validateLineup` only |

Both axes coincide in practice (playoff phase ⟺ knockout periods) but are distinct code paths by design — the validators stay phase-agnostic; the IO layer threads the correct scalar in. **The batch-resolver enforcement is a correctness necessity** (submission can't catch cumulative awards across two concurrent no-drop bids from a manager already at 8).

### `PLAYOFF_ROSTER` + `FORMATIONS_PO`

`PLAYOFF_ROSTER` in `@app/shared/src/constants.ts`: `{ cap: 9, starters: 7, bench: 2, startingOutfield: 6, bounds: { GK: {min:1, max:1}, DEF: {min:2}, MID: {min:2}, FWD: {min:1} } }`. `rosterCapForLeagueStatus` is the single consumer in both FAAB validators.

`FORMATIONS_PO` (2-2-2 / 2-3-1 / 3-2-1) is **not a stored constant** — it *emerges* from `playoffBounds()` which derives each pos-max as `startingOutfield − (other two mins)`. A drift-guard test in `packages/lineup` pins that "the set of complete shapes satisfying the derived bounds == FORMATIONS_PO."

### Cut-timing invariant (D5)

The 9-cap is a **gate, not a driver** — it blocks; it does not trim. A 15-man advancer who never drops is blocked from setting their R32 lineup and forfeits (by design — trimming is the roster decision). Requires: (a) a clear `playoff-roster-cap` error at lineup-attempt time, (b) runway before R32, (c) a commish force-trim backstop — all in place: the manager release-to-9 flow + `commish:trim` below. See DECISIONS.md → ⚠️ CUT-TIMING INVARIANT.

### The release-to-9 net-shed (trim-down phase, BUILT)

The drop-only path that pulls a survivor 15 → ≤9 inside R32's pre-lock window (no new `period`; see DECISIONS.md → ✅ Trim-down phase). All four seams below are closed.

- **`releaseRoster` primitive (`@app/faab`).** Pure `validateRelease(input)` (`packages/faab/src/release.ts`): nothing-to-drop / not-owned / locked (unless `allowLocked`) / **hard-block below the 7-starter floor** / **unfillable-7..cap confirm gate** (`release-unfillable`, mirrors the lineup-forfeit confirm). The store primitive `releaseRoster(managerId, dropIds, {now, periodId, allowLocked})` (`prismaStore`/`memoryStore`) runs ONE `$transaction`: `roster_player.dropped_at = now` + slot release via `@app/lineup/prisma`'s `releaseDroppedPlayerSlots` (faab never touches `lineup_slot`). The MANAGER path releases only UNLOCKED slots and **FAILS LOUD** (`ReleaseStaleLockError` → rollback) if a dropped player is left with a still-locked slot (stale-lock TOCTOU). The COMMISSIONER `allowLocked` path additionally releases a currently-locked slot under the **`app.commish_override` GUC** (the lock-on-play DELETE trigger exempts it). Fillability is single-sourced: `canFieldPlayoffXI(counts)` in `@app/lineup` (alongside `playoffBounds()`), consumed by both the release validator and `apps/web`'s `formationFillable` via the shared `squadCoversFormation` primitive.
- **D4 non-advancer gate (defense-in-depth).** `isPlayoffParticipant` (`status==='alive'` playoff_entry, or always true outside playoff — INERT in group) on the bid/FA validation contexts + a `notParticipant` rule; the resolver voids non-participant bids via `participantManagerIds`; `WaiversView.isParticipant` hides the affordances. IO single-sources the flag in `@app/faab/prisma`'s `loadIsPlayoffParticipant`.
- **Web surface.** `POST /api/faab/release` → the unit-tested `handleRelease` (identity gate → D4 + playoff-phase gates → `validateRelease` → `releaseRoster`; `release-unfillable` returns `needsConfirm` for a confirm-and-resubmit). `loadWaivers` threads the VIEW-DRIVEN `rosterCap` (was hardcoded 15), `isParticipant`, and the static `playoffForfeitDeadlineIso`. `ReleasePanel` mounts only for an over-cap playoff participant.
- **`commish:trim` backstop (`apps/worker`).** `runTrimOverride` reuses the SAME `releaseRoster(..., {allowLocked})` (no new store port, no release logic in the CLI): commissioner gate + reason + playoff-phase gate; `--drop`/`--keep` (keep ⇒ complement); the unfillable warning surfaces in the dry-run plan and is auto-confirmed on `--apply`; `--allow-locked-slot` → the GUC. `--report` lists survivors over cap (never auto-cuts). `AuditRecord.command` widened to `"trim"` (+ a `released` field).

## §21 — Playoff per-round cut application (`commish:advance`) + the `loadPlayoffs` read contract

**Shipped (merge HELD):** `feat/playoff-round-application` (commits A→B→C→brain). The WRITE step of the guillotine ladder — applying each knockout round's cut. Runs AFTER §20's transition; reuses the untouched pure `selectGuillotineCuts`. **No DB migration** (the only schema-adjacent change is widening the `AuditRecord.command` TS union with `"advance"`). See also **DECISIONS.md → Playoff per-round cut application**.

### Layering (where it sits)

```
@app/recompute (pure)            apps/worker/src/commish (IO at the edges)
  guillotine.selectGuillotineCuts ─┐
  playoffRound.resolveRoundCut  ───┼──→ advance.runRoundAdvance ──→ advanceStore.PlayoffAdvanceStore
    (glue; never reimplements      │      (orchestrator: guards,       ├─ createPrismaPlayoffAdvanceStore
     the selector)                 │       dry-run, audit)             └─ MemoryPlayoffAdvanceStore (tests)
  standing.ManagerPeriodPoints  ───┘                                  cli.ts `advance` subcommand (parse + render)
```

- **`resolveRoundCut` (`packages/recompute/src/playoffRound.ts`, pure).** Glue above `selectGuillotineCuts`: `{ determined | needsCommissioner | invalid-tiebreak }`. `championAfterCut(aliveIds, eliminated)` = the lone-survivor predicate. `--break-tie` adjudication re-invokes the selector with the named managers' cumulative totals sunk below all (and spared tied managers' raised above) ⇒ recovers `(determined cuts) ∪ (named)` without duplicating the boundary math.
- **`PlayoffAdvanceStore` (`advanceStore.ts`).** `loadRoundContext(leagueId, roundLabel)` assembles the knockout `period` (`cut_count`/`frozen_at`), the `alive` field with each manager's round score (`score_manager_period` for that period, 0 where absent) + **cumulative tournament total** (Σ `score_manager_period.points` over ALL the league's periods via the period relation — on the fly, no stored column), plus `alreadyCut` (≥1 entry stamped `eliminated_round == roundLabel`) and `uncutPriorRounds` (the ordering guard). `applyRoundCut` flips `alive → eliminated` (+ `eliminated_round`/`eliminated_at`) and the lone survivor `alive → champion` in ONE `$transaction`, idempotent via a conditional `alive → eliminated` claim (0 rows ⇒ already cut). Pinned end-to-end by a gated real-Postgres suite (`advanceStore.integration.test.ts`, `PLAYOFF_PG_TEST_URL`).
- **`runRoundAdvance` (`advance.ts`, orchestrator).** Dry-run default; guards = commissioner gate, required reason, real round label, frozen precondition (`--allow-incomplete` override), ordering guard, champion/schedule sanity checks. A residual tie is surfaced in the dry-run and refused on `--apply` unless a valid `--break-tie`. One audit line per applied cut + the champion flip.
- **`cli.ts` `advance` subcommand.** Parse + name-resolution (`--break-tie` takes team labels, resolved like `--team`) + Prisma store wiring + plan rendering. No resolution/application logic.

### `loadPlayoffs` READ CONTRACT — ✅ IMPLEMENTED (`feat/playoff-loader`; merge HELD). SCREENS still next.

The view-model the playoff UI loader assembles, drawn from `design/design_reference/playoffs/data.jsx` `buildGuillotine`. **The contract below is now IMPLEMENTED by the loader (this thread); only the SCREENS remain (the next thread).** Shape:

```
PlayoffsView {
  totalRounds: number                 // KNOCKOUT_ROUNDS.length (5)
  currentRoundIdx: number             // the live (or next) round's index
  seeds: { managerId, seed, gW, gL, gPts }[]   // the seeded field (from final group standings)
  seedOf: Record<managerId, seed>
  rounds: PlayoffRoundView[]          // one per knockout round, R32→Final
  aliveNow: number                    // alive count entering the current round
  survivesNow: number                 // survivors after the current round's cut
  me: { managerId, rank, points, safe|zone } | null   // the viewer's standing in the live round
  reducedLineup: <viewer's 7-man playoff XI reference, from @app/lineup>
  reinforcement: <FAAB reset-$100 + carried-waiver state, from @app/faab>
}

PlayoffRoundView {
  idx: number
  round: KnockoutRound                // "R32" | … | "Final"
  status: "past" | "live" | "future"
  fieldCount: number                  // alive entering this round
  cutCount: number                    // period.cut_count
  survives: number                    // fieldCount − cutCount
  ranked: RankedRow[] | null          // null for "future"
  survivors: managerId[] | null
  eliminatedIds: managerId[] | null
}

RankedRow { managerId, seed, points, rank, state: "safe" | "zone" | "eliminated" }
  // past  → state ∈ {safe, eliminated} read from playoff_entry (status / eliminated_round)
  // live  → state ∈ {safe, zone};  "zone" = provisional cut, computed by running the SAME pure
  //         selectGuillotineCuts on the in-progress round scores (so the displayed blade == the
  //         eventual cut). A live boundary tie surfaces as "zone" for the whole tied set.
  // future→ ranked is null (skeleton: only cutCount/survives known)
```

**Sources by round status:** `past` rounds read straight from `playoff_entry` (`status`, `eliminated_round`) + the frozen `score_manager_period`; the `live` round is DERIVED (provisional) from in-progress scores via `selectGuillotineCuts`; `future` rounds are skeletons (cut counts from `period.cut_count`, no ranking). The provisional cut line for the `live` round is the same selector this thread applies at freeze, so the UI's "facing the blade" set is consistent with the eventual write. The viewer's reduced-lineup reference and the FAAB reinforcement state reuse the existing `@app/lineup` / `@app/faab` reads.

### Loader implementation (`feat/playoff-loader`) — pure core + thin edge (mirrors `resolveRoundCut`)

- **Pure assembly — `buildPlayoffsView` (`packages/recompute/src/playoffsView.ts`).** The READ-side mirror of the write-side `resolveRoundCut`: houses ALL classification/derivation (the `past|live|future` split, the `RankedRow` states, seeds via `computeStandings`, `currentRoundIdx`/`aliveNow`/`survivesNow`, `me`). Pure (sibling imports only). The `live` provisional cut reuses **`resolveRoundCut`** — the SAME pure decision the apply orchestrator (`advance.runRoundAdvance`) calls, which reuses `selectGuillotineCuts` verbatim — so the live "zone" IS the eventual write by construction. An unbroken boundary tie (`needsCommissioner`) surfaces the WHOLE provisional cut (strictly-below ∪ the tied set) as "zone", recovered via `resolveRoundCut`'s own adjudication probe (no boundary math reimplemented).
- **Thin IO edge — `loadPlayoffs` (`apps/web/app/playoffs/loadPlayoffs.ts`).** READ-ONLY. Fetches the knockout ladder + `playoff_entry` + per-round and all-period `score_manager_period` (cumulative tiebreak replicates `advanceStore.loadRoundContext`'s Σ-over-all-periods derivation) + the group periods; orders the ladder by `KNOCKOUT_ROUNDS`; threads the existing `loadLineup` / `loadWaivers` reads for `reducedLineup` / `reinforcement`; calls the pure builder. No migration; no writes.
- **Flagged contract refinements** (additive — discovery showed §21 under-specified these): `totalRounds` = the COUNT of present knockout periods (the "(5)" above is the max — the field size fixes the ladder length, so fewer rounds for a smaller field); `me` is a `RankedRow` (superset of the `{managerId,rank,points,safe|zone}` shape — its `state` can also be `eliminated` in the complete phase, e.g. a runner-up); the view ADDS `champion: managerId|null` + `complete: boolean` (§21 listed neither, but the loader must DERIVE "tournament over" = every round cut + a `champion` entry — read-only, never touching `league.status`); `reducedLineup`/`reinforcement` ("from @app/lineup"/"from @app/faab") are realized as the existing `loadLineup`/`loadWaivers` web-loader outputs (no package-level single-purpose read exists → threading the loaders is the no-reimplementation path).
- **Still the SCREENS thread's** (unchanged): the playoff/complete theater + dashboard, the design visuals, and the **`league.status → complete` routing decision** (DECISIONS → Playoff per-round cut application → Scope — still OPEN; the loader derives "complete" from the data and writes nothing).
