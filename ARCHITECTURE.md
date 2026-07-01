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
| Compute host | **Render** (Web Service + Cron Jobs + Background Worker) | One platform that hosts a Next.js app *and* real long-running workers + cron. (Railway equivalent; Vercel for the app if you want its DX, accepting a 3rd vendor.) |
| Ingestion | **Polling** the BALLDONTLIE WC API (no webhooks exist at our tier) | Tighter cadence during live windows; idempotent upserts; recompute on settle. |
| Data feed tier | **BALLDONTLIE GOAT — $39.99/mo, single FIFA product** | Unlocks every endpoint we use; 600 req/min; 48h trial for dev. |
| Match rating | **BALLDONTLIE native `rating` — CANONICAL** (Sofascore scraper removed) | The Sofascore scraper was removed (CODE_PROMPT_57 — structurally inert, AUDIT F-P2-03); BALLDONTLIE's `rating` is the canonical rating source of record. Resolver `[manual, balldontlie]`. |
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
  The authenticated screens (hub `/` + `/draft` + `/lineup` + `/vsfield` + `/waivers` + `/pool` +
  `/scoring` + `/settings`) are wrapped by the **App Shell** (`app/shell/AppShell.tsx`, which absorbed the
  interim CrossNav). The shell has a **responsive nav** (Prompt 40):
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
  long-running work (pollers, FAAB batch, period close) runs in a **separate worker
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
                 +---------------+------------------------------------------------+
                                 | SQL + Realtime
                                 v
                 +------------------------- Supabase ------------------------------+
                 |  Postgres (all state)  -  Auth (magic-link)  -  Realtime (WS)   |
                 +----------------------------------------------------------------+
                                 ^
                                 | pull (REST, cursor-paginated, polling)
                 +--------------------------------------------------+
                 | BALLDONTLIE FIFA WC API (GOAT)                    |
                 |   stats / events + native per-match rating       |
                 |   (rating is now the CANONICAL source of record) |
                 +--------------------------------------------------+
```

- **App on Render Web Service.** Render hosts a Next.js app *and* gives first-class **Cron Jobs**
  and **Background Workers**, so the schedulers live on the same platform with the same
  build. (Railway is an equivalent one-platform swap. If the team wants Vercel's Next.js DX, put
  the app on Vercel and keep the workers on Render/Railway — a 3rd vendor, documented but not the
  default.)
- **Supabase = the stateful backend**: managed Postgres (the source of truth), Auth, and
  Realtime — three needs, one vendor. The data is plain Postgres, so migrating off later (RDS,
  Neon) is a connection-string change, not a rewrite. Low lock-in.

### Can it get *even* simpler later?
In principle the architecture is shaped to collapse: **if ~1/min live polling via external cron
sufficed**, the whole thing could drop to **Vercel + Supabase only** (Vercel Cron hits a fast
`/api/poll` route; no always-on worker). **Update (CODE_PROMPT_57):** the rating scrape was removed and
BALLDONTLIE's native `rating` is now canonical, so the Playwright scraper Worker is **gone** — but the
always-on worker is still required for live polling + lock-on-play + the recompute sweeper, so we keep
the two-vendor + worker setup as the default; the full collapse is a documented option only if live
polling is ever revisited — "boring now, with a clear
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
- **Acquisition window — bid submission gates on BOTH boundaries (latch-driven).** `validateBidSubmission`
  (`@app/faab`) now routes through the shared `acquisitionWindowState`: a sealed bid is accepted ONLY in
  the **sealed-bid** phase. It is rejected once the add target's period reaches **free-agency** — keyed on
  the actual **`period.batch_cleared_at` LATCH**, not the scheduled batch time (`bid-window-closed`, 409) —
  and once it reaches **locked** at the league-wide first kickoff (`add-kicked-off`, the unchanged outer
  bound; `acquisitionCutoffAt`, not the per-player kickoff). The IO layer (`getPlayerFacts`) resolves the
  period's first kickoff AND `batch_cleared_at` from the SAME `resolveAddPeriodWindow` the $0 FA grant uses,
  so the bid route and the FA route can never disagree on which period gates the add. **The MD1 strand bug
  this closes:** sealed bids were previously gated ONLY on first kickoff, so a (sealed) $0 bid placed in the
  free-agency gap (post-clear, pre-kickoff) was accepted, then stranded — the batch latch blocks any re-run,
  so it could never resolve. The batch keeps the per-player kickoff only for the defensive void-refund;
  Theme-B sub-IN eligibility is unchanged (per-incoming-player kickoff, in the lineup path).
- **Acquisition window** = sealed-bid (before the batch) → $0 free-agency (after clear, before kickoff)
  → hard league-wide lock (at first kickoff). The pure `acquisitionWindowState` predicate (`@app/faab`)
  models the three phases — shared by the worker cadence, the web FA route, AND (now) the bid validator.
- **$0 free-agency grant (Prompt 48).** Between batch-clear and the period's first kickoff, any manager
  grabs an unclaimed player for **$0, applied immediately** (no bidding, no waiver order). Gated route
  **`POST /api/faab/free-agent`** on the bid-route template: `requireManager` → `assertCanActAsManager
  ({scope:"self"})` → **401/403 before any write** (the shared `faabGate`), then the **free-agency
  window** gate, **live-unowned eligibility**, the **same drop + roster rules** as a bid (the shared
  `validateFaGrant` / `checkDropAndRoster`), then an **atomic first-come claim** (`claimFreeAgent`):
  drop the named player + INSERT the add, gated on the `roster_player_active_ownership_uq` partial
  unique so **exactly one** of two concurrent grabs wins and the loser gets a clean `fa-conflict` (the
  tx rolls back). **$0 — budget unchanged, waiver order untouched.**
- **FA eligibility = LIVE-UNOWNED (commissioner decision Jun 18 2026; supersedes the Prompt-48 batch-clear
  snapshot).** A player is a free agent the **moment he holds no active roster spot** — including a player
  dropped by a winning waiver bid AND a player dropped mid-window. **The anti-snipe hold is removed.** The
  single predicate is `EXISTS roster_player WHERE league=L AND player=X AND dropped_at IS NULL` (currently
  rostered ⇒ ineligible) — i.e. `dropped_at IS NULL` only; the retired snapshot added `OR dropped_at >=
  period.batch_cleared_at`. Factored into the pure IO-free `liveOwnedWhere`
  (`packages/faab/src/faEligibility.ts`) and shared by all three eligibility sites — the pool
  (`listFaIneligiblePlayerIds`, `snapshotAt` param dropped), the per-player re-check
  (`getFaTargetFacts.faEligible`), and the grant tx re-check (`claimFreeAgent`) — so they cannot drift. No
  snapshot table, no new schema (history-derived) + the existing active-ownership unique. **NOT touched:**
  the sealed→free-agency WINDOW phase (`acquisitionWindowState` / `batch_cleared_at` latch / kickoff
  cutoff / the commish `--period` pin) is a SEPARATE gate. The 1-cycle waiver hold was removed earlier.
- **Eliminated-team add gate (`feat/faab-exclude-eliminated`, Jun 28 2026; reverses the Theme-D "natural
  filtering" note).** A SECOND, ORTHOGONAL eligibility dimension to live-unowned: a player whose WC team is
  **eliminated** (the commissioner-set, raw-SQL-only additive `fifa_team.eliminated`) **cannot be ADDED**.
  One pure predicate `isAddTeamEliminated(teamEliminated)` (co-located in `faEligibility.ts`, kept SEPARATE
  from `liveOwnedWhere` so neither absorbs the other; a no-team player ⇒ eligible) is applied by the IO
  adapter at all five add sites — the pool (`listFaIneligiblePlayerIds` unions in eliminated ids), the
  per-player re-check (`getFaTargetFacts` folds `!teamEliminated` into `faEligible` ⇒ existing
  `fa-not-eligible`), the **grant tx race belt** (`claimFreeAgent` → `FaConflict`), the sealed bid
  (`validateBidSubmission` ⇒ new `add-team-eliminated`; edit re-validates, cancel doesn't), and the **batch
  resolver** — **`resolve.ts` is now INTENTIONALLY touched**: `resolveFaabBatch` **voids+refunds** an
  eliminated-team winner in its pre-loop split with the SAME terminal semantics as a kicked-off add (no
  debit / no roster change / no waiver-order move), so a bid placed while the team was alive can never grant
  after elimination. **ADD-SIDE ONLY:** the drop path (`release.ts`) + `@app/lineup` are byte-untouched.
  **D2:** `claimFreeAgent` takes `allowEliminated` (default false); `commish:roster` passes `true` to repair
  a deliberate manual add. Purity intact (the predicate is pure; the `fifa_team` read is in the adapter).
- **Schema.** `period.waiver_batch_at` + `period.batch_cleared_at` (migration
  `20260610150000_period_faab_cadence`; additive columns, `period` carries no RLS). The FA grant needs
  **no new schema** (history-derived eligibility + the existing active-ownership unique).
- **Waivers-tab FA surface — the route's UI consumer.** `/waivers` renders an in-page free-agent list
  (`FreeAgentPanel`) that consumes **`POST /api/faab/free-agent`** for instant $0 add/drop pickups. The
  SAME `acquisitionWindowState` phase the `BatchBar` shows drives the acquisition surface: sealed-bid →
  the sealed claim form; free-agency → the FA list (instant Add, reusing the composer's `droppableRoster`
  drop picker); locked → Add disabled. The offered pool is the **live-unowned** set the loader resolves via
  `listFaIneligiblePlayerIds` (`@app/faab/prisma`) — the SAME `liveOwnedWhere` predicate `getFaTargetFacts`
  / `claimFreeAgent` re-check at grant time, so the list and the route can't drift (a stale list only falls
  through to the `fa-conflict` 409, surfaced inline). Since the Jun 18 2026 live-unowned amendment the pool
  is the same in EVERY phase (the earlier snapshot-pool branch is retired). **Prompt 48 shipped + tested the
  route but never surfaced it**, so the window's only UI action was a sealed bid that wouldn't clear
  until the next batch — this wiring closes that gap.
- **Playoff rounds** light up via the SAME generic period path once their period rows exist (Theme C);
  no playoff-specific scheduling is hard-forked here.
- **Post-tournament (status stays `'playoff'`, never `'complete'`).** Once the Final has kicked off and
  cleared, this cadence is inert by construction — FA grant shut, bids accepted-but-never-cleared, release
  drop-only-and-benign. See **DECISIONS.md → "Tournament end leaves `league.status='playoff'` — never
  `complete`"** for the full safety map and the accepted residual.

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
**BALLDONTLIE's native per-match `rating` is the canonical rating source of record** (CODE_PROMPT_57).
The Sofascore scraper — originally the primary/calibration source — was **removed** (it was structurally
inert; AUDIT F-P2-03). The scoring engine reads the rating through **one resolver** with a configurable
source priority per `(match, player)`:

```
rating := first non-null of [ manual_override, balldontlie ]   // config-driven
```

A `manual` override (commissioner correction) beats the BALLDONTLIE `rating`; otherwise the native
`rating` is used directly. The 0–10 ladder (SCORING.md §1) is applied to it. The rest of the model is
provider-agnostic given sufficient stat granularity.

> **History (scraper removed — CODE_PROMPT_57).** The original design scraped the proprietary Sofascore
> rating as PRIMARY, with BALLDONTLIE as the automatic fallback (resolver `[manual, scrape, balldontlie]`,
> its own isolated Playwright worker writing `rating_player_match(source='scrape')`). The scrape arm
> never went live — empty Sofascore index, placeholder selector, unwired launcher (AUDIT
> **F-P2-03/04/05/06**) — so every player-match already resolved to BALLDONTLIE. CODE_PROMPT_57 ratifies
> that reality: the scraper code (`apps/scraper` + `packages/scrape`) is deleted, the resolver collapses
> to `[manual, balldontlie]`, and BALLDONTLIE is canonical. The `'scrape'` `RatingSource` enum value and
> the `sofascore_*` id columns remain as dead-but-harmless schema (drop deferred to a post-tournament
> migration; see DECISIONS.md → Data source Amendment 3).

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
  draft_slot, **faab_budget** (one-time $100 tournament allowance — NOT reset at the playoff transition;
  group-stage spend carries into the playoffs), **waiver_order_position**
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
    unambiguous date+codes / team+normalized-name matches; flags the rest for manual entry).
    **⚠️ DEAD COLUMNS (CODE_PROMPT_57):** the Sofascore scraper was removed and BALLDONTLIE's `rating` is
    now canonical, so these `sofascore_*` ids are no longer written or read by any code — they remain only
    as dead-but-harmless schema (drop deferred post-tournament; see DECISIONS.md → Data source Amendment 3).
  - **Note (Prompt 05a):** the player-match dirty invariant (`STAT_DIRTY_UPDATE` /
    `markStatPlayerDirty`) lives in `@app/db`, imported by ingestion (05a).

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
- `stat_team_match` — `(match_id, team_id)`; team aggregates. The mapper promotes three typed columns
  (`possession` ← `possession_pct` / `offsides` / `shots_blocked`) **and, since T17, RETAINS the full
  remaining BALLDONTLIE team payload verbatim in `extra` (JSONB)** — xG, big chances, shots, corners,
  fouls, cards, passes/long-balls/crosses (total + accurate), tackles, interceptions, clearances,
  saves, duels (ground + aerial), dribbles, etc. — via `mapTeamStat`'s catch-all `buildTeamStatExtra`
  (omit-set = the three typed feed keys + `match_id`/`team_id`/`is_home`), mirroring the player-stat
  `extra` path. **Display-only — ZERO engine reads (grep-confirmed):** `stat_team_match` is
  feed→ingest→DB; the only Prisma accessor is the ingest `upsert`, and the recompute/resolver read
  surface provably excludes it. The **`/games/[matchId]` loader is its first consumer** (T17 — a
  read-only `statTeamMatch.findMany` mapped to home/away in the pure `buildGameDetail`, powering the
  Statistics tab). Backfill note: completed matches ingested **before** the T17 mapper landed carry an
  empty `extra` (the rich rows render "–" until re-ingested) — and **`ingestSettle` does NOT pull team
  stats by design** (only `ingestLive` does), so the settle path won't self-heal them. The on-demand
  **`job:ingest-team-stats` worker CLI** repopulates them: it lists `fifa_match WHERE status='completed'`
  and runs `@app/ingest`'s `ingestTeamStats` per match — the SAME `mapTeamStat` + `upsertTeamStat` path
  (+ the foreign-event guard), writing `stat_team_match` ONLY (no player dirty-mark, no recompute),
  idempotent via the `(match_id, team_id)` upsert. Run from the worker Shell:
  `pnpm --filter @app/worker job:ingest-team-stats`. See BACKLOG → T17.
- `group_standing` — `(team_id)` PK; the **real-football WC group table** (T18, game-detail Standings
  tab). One row per team: `bdl_group_id` + `group_name` (group identity DENORMALIZED here — D1
  self-contained: **NO** FK to `fifa_group`, **NO** column added to `fifa_team`/`fifa_match`), `season`
  (default 2026), `position` (the feed's authoritative rank), `played`/`won`/`drawn`/`lost`,
  `goals_for`/`goals_against`/`goal_difference`, `points`. Fed by `@app/feed` `groupStandings()` (GET
  `/group_standings`, season-scoped, **non-paginated**; ALL-STAR-or-higher tier — the GOAT key covers it)
  → `mapGroupStanding` (nested `team.id`/`group.id`/`group.name`/`season.year`) → `ingestGroupStandings`
  (single call, `eachItem` isolation) → `upsertGroupStanding` (foreign-guarded: a team not in `fifa_team`
  is skipped). **NOTE — `fifa_group`/`fifa_stage` + `fifa_team.group_id`/`fifa_match.group_id` exist in
  the schema but are NEVER populated** (the match mapper only reads `group.name` transiently for the
  period label), so a match's group is derived via THIS table's `team_id` rows, never `fifa_match.group_id`
  (NULL). **Display-only — ZERO engine reads (grep-confirmed):** the only writer is the ingest upsert; the
  `/games/[matchId]` loader is its only reader (a group-scoped `groupStanding.findMany` → pure
  `buildGroupStandings`). NO dirty-mark, NO recompute. **RLS:** `ENABLE` + `group_standing_select_all`
  (`FOR SELECT TO authenticated USING (true)`, non-sensitive reference data like `match_lineup_entry`); NO
  anon, NO Realtime publication; server reads owner-bypass (defense-in-depth). Populated by the
  **`job:ingest-group-standings`** worker CLI (one-time backfill post-deploy) + a daily
  `wc-fantasy-group-standings` render.yaml cron (refresh during the group stage). See BACKLOG → T18.
- `rating_player_match` — `(match_id, player_id, source)`; rating, source
  (`balldontlie`/`scrape`/`manual`), updated_at. Resolver reads this.
- `manual_stat_player_match` — `(match_id, player_id)`; the feed-gap fields (penalty_won,
  penalty_committed, plus any other operator-entered values) + reason. Read by the scoring fn.

**Derived layer (recomputable)**
- `score_player_match` — `(match_id, player_id)`; points, breakdown_json, computed_at. **Pure fn**
  of the raw + manual + rating + role.
- `score_manager_period` — `(manager_id, period_id)`; points, computed_at. Aggregation over the
  manager's **locked** lineup_slots for the period.
- `standing` — league_id, manager_id, scope; all_play_all_W / _L / _D, total_points, seed. Derived
  across managers (all-play-all). `all_play_all_d` (added 2026-06-19, migration
  `20260619120000_standing_all_play_all_d`, `INTEGER NOT NULL DEFAULT 0`) records tied matchups as
  informational Draws: per period `W + L + D` = opponents compared. **Seeding is UNCHANGED** (`W`
  desc → `total_points` desc); draws never enter the comparator (DECISIONS.md → Theme C amendment).

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
- **The `/draft` client carries a self-heal layer (Prompts 32 + hotfix):** `visibilitychange`/`online`/`pageshow` resume + a ~20s polling backstop, both feeding the SAME authoritative `GET /api/draft/state` read via `applyDraftRowChange`; render stays a pure fn of row state. `setAuth` re-authorizes the socket on every resubscribe (both the auth-state path and the resume path call the same `resubscribe(token)` → `subscribeDraft` → `client.realtime.setAuth(token)` before `.subscribe()`). See DECISIONS → "Draft Realtime resilience" for the operator gate.
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
    tabs — **Picks** (per-match Home/Draw/Away picks; the playoff phase — gated on `playoff_entry`
    EXISTENCE, NOT `selectTournamentPhase`; see §3 bracket-visibility gate — renders the knockout bracket
    as a **vertical, round-sequential stack** of `.pl-round` sections R32 → R16 → QF → SF → Final
    (mobile-first; reuses the matchday section styling; replaced the old horizontal `.pl-bcol` scroller —
    2026-06-28). When `playoffActive` (now on `PoolView`) the Picks tab **hides the group phase** at the
    RENDER layer — PoolClient gates the group matchday lists / Completed archive / unscheduled on
    `view.playoffActive`, while the pure `selectPoolPicksView` keeps the FULL buckets so the leaderboard
    drill-in modal (`selectManagerPicks`) retains every manager's settled history (a selector-side strip
    would silently empty that modal — caught in adversarial review). A knockout match is
    **pickable only when BOTH sides are resolved real teams**; undecided slots — feed placeholders named
    `Team {balldontlie_team_id}`, detected by `/^Team \d+$/` since `fifa_team.country`/`.abbreviation` are
    NULL for ALL teams — render as **TBD with NO pick buttons** (`poolView.ts`: `isTeamResolved` /
    `isKnockoutFixturePickable`, both now keying on the `isPlaceholderTeamName` predicate **lifted into
    `@app/pool`**). **SEC-P4 (DONE, 2026-06-28): the server enforces the SAME rule at write time** — `POST
    /api/pool/pick` → `validatePickSubmission` rejects a pick on an undecided knockout fixture (placeholder
    name or null team FK) with `pick-on-undecided-match` → HTTP 409, via that one shared predicate (the write
    path's `getMatchFacts` now selects `homeTeam.name`/`awayTeam.name`; the 3rd-place play-off is covered via
    `resolvePoolPeriod`'s `knockout_round` synthesis). The guard is knockout-only — group + unseeded
    (`periodKind` null) fixtures no-op it (see DECISIONS → 2026-06-28 SEC-P4). The unlinked 3rd-place match is
    a separate thread, not rendered) and **Leaderboard** (all league members, ranked by pool
    points). It is
    **form-driven CRUD**: every pick is a `POST /api/pool/pick` round-trip (the Prompt-40 gated route)
    followed by `router.refresh()` — **NO Realtime, NO polling** (the Realtime subscription is **P43**).
    A SELF-scoped surface (the viewer's own picks), so no 403-not-your-manager at the page; the per-pick
    write gate lives in the route. **NAV WIRED** (`feat/pool-nav`, P17 cross-nav pattern): "pool" is now a
    real `NavId` in the shared `crossNav` strip (union + `NAV_ITEMS` + the `AppShell` glyph map), **placed
    after `/waivers`** in the §1 nav list (gameplay cluster, ahead of `/scoring` + `/settings`); the
    layout's deferral cast is dropped, so the Pool tab highlights when `/pool` is active.

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
| Performance rating | BALLDONTLIE `player_match_stats.rating` (CANONICAL — Sofascore scraper removed, CODE_PROMPT_57) *(see rating finding)* |
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
  2026-06-11 MD1 −1 bug — defense in depth behind the participant gate above). **Conceded also
  excludes VAR-overturned goals** — see the incident-vocabulary subsection (Appendix A) below.
- **Penalty missed** = `match_shots` where it's a penalty (`situation`) and `shot_type ≠ goal` ->
  charge the shooter (−3).
- **Penalty saved** = same `match_shots` row with `shot_type = save` -> credit the opposing
  on-pitch keeper (+5). *(One row yields both the taker's −3 and the keeper's +5.)*
- **Own goal** = `match_events` goal incident flagged own-goal -> the OG scorer.

### 🟢 `match_events` incident vocabulary — goal classification & VAR overturn (Appendix A)
**Goal classification keys on `incident_type` EXACTLY, never on a label substring.** A real goal is
always `incident_type=goal`; its `incident_class` is one of `regular` / `penalty` / `ownGoal`. VAR
review outcomes arrive as a SEPARATE `incident_type=varDecision`:

| `incident_type` | `incident_class` | meaning | engine treatment |
|---|---|---|---|
| `goal` | `regular` | open-play goal | goal credit (§3, stat-based) + conceded (§6) |
| `goal` | `penalty` | scored penalty | goal credit + conceded |
| `goal` | `ownGoal` | own goal | OG scorer −4 (§8) + conceded vs the OG team |
| `varDecision` | `goalAwarded` | VAR upheld a goal | **ignored** (the `goal` row already scores it) |
| `varDecision` | `goalNotAwarded` | VAR **disallowed** a goal | overturn signal — voids the paired goal |
| `varDecision` | `vip_for_goal` | VAR-review marker | **ignored** |

The earlier `isGoalEvent` test, `label(e).includes("goal")` (label = `incident_type` +
`incident_class`), wrongly matched all three `varDecision` classes — their class CONTAINS the
substring "goal" — so a single disallowed goal was counted up to **3×** (the `goal` row +
`goalAwarded` + `goalNotAwarded`). `isGoalEvent` now returns `norm(incident_type) === "goal"`, so
only real goals count; VAR rows are read only by `overturnedGoals`.

**VAR overturn (Route A — derive truth from the event list).** The feed leaves a disallowed goal's
`goal/*` row in place (it does **not** set `rescinded`); the only overturn signal is a sibling
`varDecision/goalNotAwarded` for the **same scorer**. `overturnedGoals` pairs each `goalNotAwarded`
to the nearest not-yet-voided same-player goal within **≤3 effective minutes** (one void cancels one
goal); `goalsConcededWhileOn` then skips rescinded **or** overturned goals. Route A was chosen over
trusting a per-row flag precisely because the feed does not set one.

**Reconciliation invariant (the Route-A safety net).** For each team, the whole-match count of
non-overturned conceded `goal` events MUST equal `teamGoalsAgainst` (the authoritative, VAR-correct
match score). Tests assert equality; at runtime `buildScoreInput` `console.warn`s the `matchId` +
both counts on divergence and **never throws** — live scoring proceeds on the windowed non-overturned
count, with the mismatch flagged so a human can inspect any VAR shape the model did not anticipate.
The warn fires only when the comparison is COMPUTABLE — `reconciliationApplies` requires the final
score to be known (NULL home/away early-live) and every standing goal's scorer team resolvable
(`player.team_id` is patchy) — so the per-player guard does not flood on ordinary live data; only a
genuine VAR-shape mismatch on a settled, fully-attributed match warns. (`reconcileConceded` is the
pure helper; the store populates the optional `MatchTeamContext.matchId` that labels the warn.)

**Card classification keys on `incident_type` EXACTLY too (the sibling per-row gate).** `classifyCard`
gates on `incident_type === 'card'`, then matches `incident_class` by **exact equality** — `red` → red,
`yellow` → yellow, else null (no substring matching of the combined label). A VAR **card upgrade** is a
SEPARATE `incident_type=varDecision` / `incident_class=cardUpgrade` ANNOTATION; the upgrade itself
materialises as a real `card/{yellow,red}` row that scores on its own, so the `cardUpgrade` row is
ignored (live data, Q4 2026-06-19 — 3 cardUpgrade rows across 2 matches, each beside a materialised
`card/red`). The exact gate also immunises against a hypothetical colour-bearing non-card label
(`varDecision/red`) minting a phantom red. **Second-yellow-vs-red representation remains
confirm-in-code:** the feed carries NO second-yellow class token (classes are only `red` / `yellow` as
of Q4), so a two-yellow dismissal arrives as two `card/yellow` rows — detecting it (the first-yellow −1
plus the second-yellow minute band) is **cross-row pairing in the discipline aggregation, not per-row
classification**, an unbuilt seam (see the SEAM comment in `classifyCard` and DECISIONS.md).
**`classifyCard` is single-sourced (T-CARD1).** It is `export`ed from `@app/recompute`
(`packages/recompute/src/adapter.ts`) and imported by BOTH the scoring adapter and the read-only web
Game-Detail box score (`apps/web/src/games/buildGameDetail.ts`) — so the two can never drift. The param
was widened off `EventRow` to the structural `CardEvent` (just the two incident discriminators, which
`EventRow` and the web event row both satisfy); that is a **type-only** change — the body is
byte-identical and `second_yellow` is still never minted, so scoring is unaffected. The main
`@app/recompute` entry stays IO-free (Prisma lives behind the `@app/recompute/prisma` subpath), so the
web bundle takes on no server-only dependency by importing the classifier.

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
- **`match_events.incident_class` — goal, VAR & card classes CONFIRMED** (live GOAT data, incl. the
  Argentina–Algeria reference): goals are `goal/{regular,penalty,ownGoal}`; VAR outcomes are
  `varDecision/{goalAwarded,goalNotAwarded,vip_for_goal,cardUpgrade}`; cards are `card/{yellow,red}`
  (see the incident-vocabulary subsection / Appendix A above). **No second-yellow class token exists
  (Q4 2026-06-19)** — `classifyCard` therefore matches `card/{red,yellow}` exactly and never mints
  `second_yellow`; two-yellow banding is deferred to a cross-row discipline aggregation (a known seam,
  DECISIONS.md). Still verify `match_shots.situation` (penalty detection) against live data.
- **Rating fallback quality** — the one-time BALLDONTLIE-vs-Sofascore comparison (§3), to gauge the
  fallback only; Sofascore stays primary regardless.

### 💡 Rating finding (BALLDONTLIE rating is canonical — scraper removed)
BALLDONTLIE's FIFA feed exposes its **own** `rating` (and the full Sofascore-style vocabulary —
xG/xGoT, big chances, touches, ball recoveries, attack momentum, best-players/MOTM, average
positions). Originally its provenance was unknown so it was treated only as a fallback behind the
Sofascore scrape — but the scrape arm never went live (AUDIT F-P2-03), so **CODE_PROMPT_57 removed the
scraper and adopted BALLDONTLIE's `rating` as the canonical rating source of record** (resolver order
`[manual, balldontlie]`). The locked 0–10 ladder (SCORING.md §1) is applied to it directly.

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
  CLI + the 5-step `$transaction` (status claim → `cut_count` writes → `playoff_entry` rows → roster
  release → waiver carry-forward; FAAB budgets carry forward — not reset); pure `cutScheduleFor` + `selectPlayoffField` +
  `carryForwardWaiverOrder` in `packages/recompute/src/transition.ts`. See **§20** for the full wiring.

---

## 10. Amendments this thread forces elsewhere
- **SCORING.md** — six verification-forced line changes (3 drops, 2 keep-via-manual, 1 remap).
  Documented as a marked amendment block; model balance untouched.
- **Data source** — (a) rating sourced via a resolver `[manual, balldontlie]` with **BALLDONTLIE's
  native `rating` CANONICAL** and `manual` overriding it (the Sofascore scraper was removed in
  CODE_PROMPT_57 — it was structurally inert, AUDIT F-P2-03; the schema drop of the `'scrape'` enum
  value + `sofascore_*` columns is deferred post-tournament); (b) ingestion is **polling** (no
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
dashboard.css module carries `.db-br-row` and `.db-pod-row` `.is-me` styles (ported from the
design_reference bracket/podium sections) — at P38 no playoff/complete component rendered them
(`modulesFor` returned `[]`); they are now consumed by the playoff/complete arms (next subsection,
which retired the STOP(P38) interims).

**`PrimaryBanner.tsx` signature change:** added `vsField: VsFieldView | null` and
`earliestGroupKickoff: string | null` props (both null-safe; pre-draft and draft branches
ignore them).

### Dashboard playoff + complete phases (`feat/dashboard-playoff-phases`)

Fills the two `// STOP(P38)` interim arms (`modulesFor` returned `[]` for `playoff`/`complete`) with
real modules sourced **READ-ONLY** from `PlayoffsView` — the exact pattern P38 used for the group
phase's `loadVsField` attach. **Read/presentation only**: the engine + read-model
(`buildPlayoffsView` / `loadPlayoffs` / `PlayoffsView` / `resolveRoundCut`) are **byte-untouched**;
no `league.status` write; no new Realtime/RLS/publication; no new live controller (the live
experience stays in the dedicated `/playoffs` theater this links into).

**Data path** (`loadDashboard.ts`) — mirrors the group `vsField` attach. `DashboardData` gains
`playoffs: PlayoffsView | null` (same shape posture as `vsField`). When the raw `selectTournamentPhase`
result (named `tournamentPhase` in the loader) is in the **knockout window** (`playoff` | `complete`),
the loader calls `loadPlayoffs(sessionManagerId)` READ-ONLY and resolves the final render phase via the
pure `resolveKnockoutPhase(tournamentPhase, playoffs?.complete ?? null)`. `vsField` stays group-only.

**The playoff↔complete discriminator** = **`PlayoffsView.complete`** (every round cut + a `champion`
`playoff_entry` exists), NOT `selectTournamentPhase`'s own Final-FT `complete`. The two can briefly
disagree around the Final whistle (the match flips to `completed` before/after the worker writes the
champion row), so `resolveKnockoutPhase` makes `PlayoffsView.complete` authoritative — we never render
the complete arm before its champion data exists: `(complete, false) → playoff`, `(playoff, true) →
complete`. Pure, 7 unit tests (`resolveKnockoutPhase.test.ts`). The `league.status → complete` routing
stays an **OPEN** decision owned by the worker/state-machine thread; the dashboard, like the theater,
reads the derivation only.

**Pure derivations** (`src/dashboard/playoffModules.ts`, IO-free, 16 unit tests) consume `PlayoffsView`
and invent nothing:
- `selectSurvivalView` — the current round's rank-ordered field with per-row safe/zone state, the
  viewer marked, and the **signed cut margin** (`me.points −` first-cut / last-safe boundary, read from
  per-row `state` so a live boundary tie doesn't skew it).
- `selectChampionPodium` — champion + runner-up (Final `eliminatedIds[0]`), names via the loader's
  `managerNames` map (Theme F — the browser never reads `manager`).
- `selectViewerFinish` — the viewer's knockout finish (champion / runner-up / out in round X + that
  round's rank/points), scanned from `rounds[].eliminatedIds`.

**Modules** (`Dashboard.tsx`, masonry `db-grid`; the group `db-spotlight` stays group-only):
- Playoff arm = **`SurvivalModule`** (the guillotine bracket — survival + current-round summary
  combined, as the design's `BracketModule`; CTA → `/playoffs`) + **`ReinforceModule`** (FAAB
  reinforcement reminder from `playoffs.reinforcement`; CTA → `/waivers`). The design's `lock`/`fixtures`/`activity`
  are **dropped** — not PlayoffsView-derivable (same subset discipline P38 applied to the group arm).
- Complete arm = **`ChampionModule`** (podium) + **`MyFinishModule`** (the viewer's run). The design's
  `standings`/`activity` are dropped.

**CSS** — reuses the pre-stubbed `.db-bracket`/`.db-br-*` + `.db-podium`/`.db-pod-*`; adds only the
survival status line + footer (`.db-br-me`/`.db-br-foot`), `.db-reinforce`/`.db-rf-*`, and
`.db-myrecap`/`.db-myrec-*`. Still zero hex, gold-free, `--phc`/functional tokens only.

**Complete-arm season stats — read-model gap CLOSED (`feat/playoffs-season-stats`).** The design's
complete-arm season stats are now first-class on `PlayoffsView.seasonStats` (`Record<managerId,
{totalTitlePoints, powerW, powerL, bestWeek}>`), derived **purely** in `buildPlayoffsView` from inputs it
already receives — **no new write, no new IO, no loader change, no scoring-rule change**:
`totalTitlePoints` = the `cumulativeTotals` input (Σ all-period `score_manager_period.points`, already used
for the live boundary tiebreak); `powerW`/`powerL` = the group all-play-all W-L (`= seeds[].gW/gL =
computeStandings(groupPeriods)` — the regular-season "power record", NOT extended over the guillotine
rounds, so it reads identically to the group dashboard's "season W-L"); `bestWeek` = max single-period
total over ALL periods (the pure `bestWeekByManager` over `groupPeriods` ∪ `roundScores`, which together
cover every `period.kind`). The recap now consumes them: `ChampionModule` shows each finisher's total
title points (`.db-pod-pts`, role pill dropped — the medal + is-champ tint carry the role); `MyFinishModule`
renders the design's 4-cell `.db-myrecap` (finish · power record · total pts · best week); the complete-arm
`PrimaryBanner` surfaces total pts + power record + best week. The `TODO(confirm)`s are removed. The WRITE
engine (`selectGuillotineCuts`/`resolveRoundCut`/`advanceStore`/transition) and the cut/classification logic
are **byte-untouched** — only the view's *output* grew; the theater (`/playoffs`) consumes the additive field
unchanged (JSON → `snapshotClient` cast → `theaterView` slices).

**`PrimaryBanner.tsx`** — the playoff/complete arms now render real `PlayoffsView` data (via the same
three pure derivations); added a `playoffs: PlayoffsView | null` prop. Banner phase colour unchanged
(`--phc`: `var(--live)` playoff, `var(--success)` complete).

## 12. Pick'em pool (Prompt 40)

A per-match **pick'em pool** layered on the existing schedule — a SEPARATE scoring system from the
player engine (SCORING.md addendum; DECISIONS → Pool). Prompt 40 = data model + pure engine + server
write/read path only; the pick UI, knockout-bracket layout, leaderboard screen, nav entry, and the
Realtime **client** are **Prompt 41**.

**`pool_pick` table** (`prediction PoolPrediction {HOME DRAW AWAY}`; `UNIQUE(manager_id, match_id)`;
indexes `(league_id, match_id)` + `match_id`; FKs → league / manager / fifa_match, all cascade). RLS
mirrors `faab_bid` (auth.uid() → manager → league): a **league-scoped `authenticated` SELECT**,
**own-`manager_id` INSERT/UPDATE**, no DELETE. `pool_pick` is added to the `supabase_realtime`
publication now so Prompt 41's subscription isn't silently empty — the **Realtime-RLS trap**: a table
outside the publication delivers zero `postgres_changes`, and a browser-read table needs its own SELECT
policy or the client sees zero rows (P41 also: `realtime.setAuth(token)` before subscribe, gate on
`INITIAL_SESSION`, re-subscribe on `TOKEN_REFRESHED`). The migration (`20260610130000_pool_pick`)
carries the Theme-F embedded self-test (cross-league isolation + own-row write), verified against a
uuid-returning `auth.uid()`.

**⚠️ SELECT policy clock-gated (P1, `4cb29e5` / migration `20260621120000_fix_pool_pick_realtime_rls`,
deployed + live-verified 2026-06-21) — supersedes the original "member reads the whole field's picks"
SELECT above.** The original league-member-only SELECT, combined with `pool_pick` being in the
`supabase_realtime` publication, leaked a rival's **pre-kickoff** picks cross-member through the Data API /
Realtime — bypassing the `readVisiblePicks` loader gate (anon = 0, but cross-member = leak). The reveal
rule is now enforced **at the DB layer**, matching `readVisiblePicks` exactly: USING = `league-member AND
(own-pick OR pool_pick_match_kicked_off(match_id))` — own picks always, others' only after their fixture
kicks off. The kickoff check is a **`SECURITY DEFINER` helper** (`pool_pick_match_kicked_off`, `prosecdef=t`)
**not** an in-policy join to `fifa_match`: `fifa_match` is RLS default-deny, so an in-policy subquery would
evaluate under the caller's RLS, find zero rows for everyone, and silently hide every not-own pick forever
(the `score_manager_period` nested-RLS trap). The helper returns only a boolean — no `fifa_match` rows leak.
Regression coverage: `poolPickRls.integration.test.ts` (DB-gated, role-switched).

**`watchlist` table (T2 — private per-manager "star", 2026-06-30; migration HELD for Sergio).** A
personal player bookmark surfaced on `/waivers` (`id`, `league_id`, `manager_id`, `player_id`,
`created_at @db.Timestamptz(6)`; FKs → league / manager / player, all `onDelete: Cascade`;
`UNIQUE(manager_id, player_id)` = `watchlist_manager_player_uq` = the upsert/idempotency key; indexes on
each of `manager_id` / `league_id` / `player_id`). RLS = `ENABLE` (not FORCE) + **four owner-only
`TO authenticated` policies** (`watchlist_select_own` USING / `_insert_own` WITH CHECK / `_update_own`
USING+WITH CHECK / `_delete_own` USING), each gating on `EXISTS (SELECT 1 FROM manager m WHERE m.id =
watchlist.manager_id AND m.user_id = (auth.uid())::text)`. Exactly **ONE SELECT policy, owner-only** —
this mirrors `faab_bid`'s strictly-private family (minus its `status` gate) and deliberately **diverges**
from both `pool_pick` (whose SELECT is league-scoped + clock-gated for the anti-copying reveal) and
`faab_bid_select_settled` (its league-visible settled reveal): a star is private forever, never shown to
rivals. The migration `20260630120000_watchlist` is **DDL-only** (the `prisma migrate diff` output
verbatim) — mirroring `group_standing` / `fix_faab_settled_rls`: **NO** in-migration self-test, **NO**
`SECURITY DEFINER` helper (the predicate touches only `manager`, resolvable via `manager_select_own`),
**NOT** added to the `supabase_realtime` publication (private, server-refresh — like `faab_bid`,
**unlike** `pool_pick`). Both portability shims (`authenticated` role + `auth.uid()`) ARE carried because
the policies read the JWT. **Write path** = `POST /api/manager/watchlist` (`{ playerId, watched }`;
`handleToggleWatch`/`parseWatchlistBody` behind `getSessionManager()` — 401/403 before any DB; `managerId`
resolved server-side, never trusted from the client; `watched:true` → idempotent upsert, `watched:false` →
delete (missing row 200)), written via the Prisma owner (RLS = defence-in-depth). The toggle is
**scope-agnostic** (any valid `playerId`; FA-only is a UX choice) and **fully decoupled** — touches no
bid/batch/roster/lineup/budget row and no engine/recompute/dirty-mark/Realtime. **Read path** = `loadWaivers`
adds one self-scoped `watchlist.findMany({ where: { managerId } })` → `WaiversView.watchedPlayerIds:
readonly string[]` (an id-set, not a per-`WvPlayer` boolean) + pure `watchedFreeAgents(...)`; UI surfaces it
as a star on `FaPickRow` + the `FaPlayerCardSheet` header + a "Watched" filter beside `<NationFilter>`.
Regression coverage: gated `watchlistRls.integration.test.ts` (own `WATCHLIST_RLS_PG_TEST_URL` + SAFE
guard, uuid-casting `auth.uid()`, 11 tests). See DECISIONS → 2026-06-30 (T2) + PROJECT.md → 2026-06-30 (T2).

**`@app/pool` (pure engine)** mirrors `recompute/standing.ts` purity — no IO/clock/DB, grep-proven by
`purity.test.ts`: `derivePoolResult` (group → H/D/A; knockout → advancer via FT→ET→pens; pending or
`periodKind == null` → null), `scorePick`, `weightForPeriod` (flat 1, escalating-weight seam),
`buildPoolLeaderboard` (`{ played, correct, points }`, deterministic sort), `isPickLocked`,
`validatePickSubmission`.

**Phase discriminator = `period.kind`.** Group-vs-knockout is read from the linked
`fifa_match.periodId → period.kind` (the same signal §3 locking + recompute use), **never** from
`fifa_match.round` (raw feed text — non-null for group games; see the schema comment + DECISIONS). The
IO loader performs this join and hands the pure engine a resolved `periodKind`.

**3rd-place play-off = IO-loader period synthesis, `period_id` stays NULL (T-3RD, 2026-06-28).** The "Match
for 3rd place" is the lone `period_id IS NULL` fixture and **must stay period-less** to remain invisible to
lineups, player scoring, the guillotine ladder, and `/playoffs` (`loadPlayoffs` keys rounds on `period.kind`,
so a real 6th `knockout_round` period would peg `playoffsView`'s `liveIdx` forever — the tournament would
never report `complete`; see DECISIONS → 2026-06-28 T-3RD). To still surface it as a scored 2-way pick, the
loader special-cases it at one seam: a pure `resolvePoolPeriod(match)` (`apps/web/src/pool/`) maps the
additive `fifa_match.is_third_place` flag → a synthetic `{ "knockout_round", "3P" }`, and every other fixture
passes through with its real period. `loadPool` routes BOTH the fixtures projection AND the separate
`leaderboardMatches` projection through it (distinct raw reads — the leaderboard would otherwise derive a null
result and never score the +1); the `selectTournamentPhase` input is left raw on purpose. The write path
(`prismaStore.getMatchFacts`) routes through the same helper so `validatePickSubmission` rejects a DRAW on the
2-way. The pure `@app/pool` engine and `poolView.ts` are byte-untouched — `derivePoolResult` scores "3P" as a
knockout advancer and `selectPoolPicksView`'s defensive non-canonical-label branch renders it as its own
bracket round after the Final (non-pickable until both teams resolve). The flag is set by `@app/ingest
mapMatchRow` (`/3rd place|third place/i`), with `derivePeriodLabel` guarded to return null for it before the
`/final/` branch and `ingestSchedule` defensively forcing `period_id = null`. `"3P"` is pool-local — NOT in
`@app/shared KNOCKOUT_ROUNDS` (the guillotine ladder stays the five rounds).

**Bracket-VISIBILITY gate = `playoff_entry` existence (distinct from the per-fixture `period.kind`
discriminator above; 2026-06-28).** _When_ the whole R32→Final bracket skeleton appears on the Picks tab
is a separate question from _which_ bucket each fixture lands in. The bracket renders once `playoffActive`
— `loadPlayoffPhaseActive(prisma, leagueId)` = `playoffEntry.count > 0`, reused from `@app/faab/prisma` —
is true, **NOT** when `selectTournamentPhase` flips to `playoff`. The kickoff-based phase returns `group`
through the entire **R32 pre-kickoff window** (every knockout match still `scheduled`), so a phase-gated
bracket stayed hidden exactly when managers needed to pick the first knockout games (the live 2026-06-28
bug). `loadPool` threads `playoffActive` as the 4th arg of `selectPoolPicksView`; the gate is
`playoffActive || phase === "complete"` (the `complete` arm a defensive carry-over — entries persist, so
`playoffActive` already covers a finished tournament). This is the SAME data-existence-phase signal the
FAAB/waiver read + enforcement paths use (CONTRACT-P2/P3); `selectTournamentPhase` still frames the page
but no longer gates the bracket. See DECISIONS → "Quiniela knockout bracket gates on `playoff_entry`
existence" (2026-06-28).

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

**Never surfaces a team UUID (T8, 2026-06-21).** `resolveOpponentByPlayer` is shared by the lineup
`<OpponentTag>` and the waivers `<OpponentLine>` (the waivers picker imports the same pure resolver —
single derivation, no second resolver to drift). When the opponent's `fifa_team.name` is null it now
falls back to a fixed **`UNNAMED_OPPONENT`** sentinel — never the raw `away/homeTeamId` UUID — and the
flag is suppressed. Fixed once in the shared resolver (`0003f50`), so both surfaces are corrected at
once; in practice `fifa_team.name` is populated by roster ingestion, so this is a defensive edge, not an
observed defect.

---

## 15. Period-select fix — `selectCurrentPeriod` + per-screen isCurrent latch (Prompt 54)

**Root cause.** `period.opensAt` is never populated by the provisioning CLI. The period queries in
`loadWaivers` and `loadVsField` used `ORDER BY opens_at ASC, label ASC`; with `opensAt = NULL` for
every row, the DB fell back to label-alphabetical — "Final" (F) before "Group MD1" (G). Both screens
resolved to the Final period on WC opening day.

**Shared selector: `selectCurrentPeriod<T>(periods, isCurrent)`.** Lives in
`packages/shared/src/periodOrder.ts` (same module as P51's `sortByPeriodOrder`). Re-sorts the input
array in JS by `matches[0].kickoffAt` (populated by schedule sync, not by provisioning), then applies
a per-screen `isCurrent` predicate. `status === "open"` is the fast-path for the wave the period-close
cron has promoted live; the pending arm uses the injected `isCurrent`. **Correction (2026-06-28):** an
earlier version of this paragraph said `period.status` "never actually transitions … the open arm is
currently dead." That was STALE (it predated `feat/period-status-lifecycle`, 2026-06-17). The hourly
`wc-fantasy-period-close` cron is the SOLE writer of `status='open'`/`'closed'` and opens each wave —
group matchdays AND each knockout round (R16→QF→SF→Final) — when the prior wave's fixtures all reach
`completed` (see §22). The `open` arm is LIVE, not dead; do not re-derive the "never transitions" premise.

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

`commish:transition --apply` runs ONE `$transaction` (five steps, in order):

0. Conditional `league.status` `group→playoff` claim — 0 rows aborts idempotently (belt-and-suspenders with the orchestrator skip).
1. Write `cut_count` onto the 5 knockout periods (upsert by `(league_id, label)` — they pre-exist from provisioning; `KNOCKOUT_ROUNDS` is the label contract, validated by `validateConfig` at provision time so a drift fails loud, not silently at the irreversible step).
2. Write one `alive` `playoff_entry` per top-N seeded manager.
3. Release non-advancers' active roster players to the FAAB pool (`droppedAt = now`).
4. Two-phase waiver carry-forward: NULL all `waiver_order_position` values first, then write survivors `1..K` preserving their live relative order (the non-deferrable `@@unique([league_id, waiver_order_position])` is satisfied at every checkpoint via the temp-range disjoint write; eliminated managers end NULL).

**FAAB budgets are NOT touched by the transition** — the $100 is a one-time tournament allowance and group-stage spend carries into the playoffs (the prior "reset to a fresh $100" step was removed on 2026-06-28; see DECISIONS.md → FAAB Budget + PROJECT.md → 2026-06-28 session log).

**D6 pre-condition guard:** `--apply` refuses while any `group_md` period has `frozen_at IS NULL` (results not final). Override: `--allow-incomplete-standings` (irreversible-op escape hatch, not a default). Dry-run (default) prints field + seeds, cut schedule, release/trim plan, and the `standings: FINAL ✓ / ⚠ NOT FINAL` line without touching state.

Pure derivation in `packages/recompute/src/transition.ts`: `cutScheduleFor(fieldSize)` (front-loaded ⌊÷5⌋ + remainder distribution; field ≥ 6), `selectPlayoffField(standings, fieldSize)`, `carryForwardWaiverOrder(current, survivingManagerIds)`.

### Cap split — `playoff_entry` existence (P3) vs `period.kind`

| Axis | Value | Resolver | Enforced at |
|---|---|---|---|
| Ownership (squad) cap | 15 group / 9 playoff | `rosterCapForPlayoffPhase(loadPlayoffPhaseActive(leagueId))` (`playoff_entry` existence — CONTRACT-P3; was `rosterCapForLeagueStatus(league.status)`, now deleted) in `@app/shared` + `@app/faab/prisma` | FAAB submission validator + $0 FA grant + FAAB batch resolver |
| Lineup mode (starting shape) | group vs knockout | `period.kind === "knockout_round"` in `@app/lineup` | `validateLineup` only |

Both axes coincide in practice (playoff phase ⟺ knockout periods) but are distinct code paths by design — the validators stay phase-agnostic; the IO layer threads the correct scalar in. **The batch-resolver enforcement is a correctness necessity** (submission can't catch cumulative awards across two concurrent no-drop bids from a manager already at 8).

### `PLAYOFF_ROSTER` + the derived playoff shapes (`playoffXIShapes`)

`PLAYOFF_ROSTER` in `@app/shared/src/constants.ts`: `{ cap: 9, starters: 7, bench: 2, startingOutfield: 6, bounds: { GK: {min:1, max:1}, DEF: {min:1}, MID: {min:1}, FWD: {min:1} } }` (the outfield mins loosened 2/2/1 → 1/1/1 on `feat/playoff-formation-loosen`; maxes are not stored). `rosterCapForPlayoffPhase` is the single cap consumer across both FAAB validators + the $0 FA grant + the release/trim path (CONTRACT-P3; `rosterCapForLeagueStatus` was deleted — the cap derives from `playoff_entry` existence, not `league.status`).

The playoff shape set is **not a stored constant** (there is no `FORMATIONS_PO`) — it is enumerated at module load by the **exported** `playoffXIShapes()` (`packages/lineup/src/validate.ts`) from `playoffBounds()`, which derives each pos-max as `startingOutfield − (other two mins)` = 4. Under the loosened **1/1/1** mins the set is the **10 shapes** with ≥1 per line (1-1-4 / 1-2-3 / 1-3-2 / 1-4-1 / 2-1-3 / 2-2-2 / 2-3-1 / 3-1-2 / 3-2-1 / 4-1-1); the old {2-2-2, 2-3-1, 3-2-1} is a strict subset (no saved lineup invalidated, no migration). `playoffXIShapes()` is the SINGLE source for BOTH the validator (`canFieldPlayoffXI` + the bound check) AND the UI offer-set — `apps/web`'s `PLAYOFF_FORMATIONS` is now **derived** from it (was a hardcoded literal, correct only at 2/2/1). **Drift-guard reality:** a true set-equality test did not previously exist (the set was pinned only by hardcoded `it.each` literals over a private enumerator); it is now REAL — `packages/lineup/src/playoffShapes.test.ts` asserts `Set(playoffXIShapes keys) == the 10` (normalized, order-independent) and `apps/web`'s `formation.test.ts` asserts the offer-set mirrors it. **D5 unchanged:** looser bounds can only reduce release-/trim-unfillability, never increase it.

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
- **`PlayoffAdvanceStore` (`advanceStore.ts`).** `loadRoundContext(leagueId, roundLabel)` assembles the knockout `period` (`cut_count`/`frozen_at`), the `alive` field with each manager's round score (`score_manager_period` for that period, 0 where absent) + **cumulative tournament total** (Σ `score_manager_period.points` over ALL the league's periods via the period relation — on the fly, no stored column; derived via the shared **`loadCumulativeTournamentTotals`**, see the single-source note below), plus `alreadyCut` (≥1 entry stamped `eliminated_round == roundLabel`) and `uncutPriorRounds` (the ordering guard). `applyRoundCut` flips `alive → eliminated` (+ `eliminated_round`/`eliminated_at`) and the lone survivor `alive → champion` in ONE `$transaction`, idempotent via a conditional `alive → eliminated` claim (0 rows ⇒ already cut). Pinned end-to-end by a gated real-Postgres suite (`advanceStore.integration.test.ts`, `PLAYOFF_PG_TEST_URL`).
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
  reinforcement: <FAAB budget (carried forward, not reset) + carried-waiver state, from @app/faab>
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
- **Thin IO edge — `loadPlayoffs` (`apps/web/app/playoffs/loadPlayoffs.ts`).** READ-ONLY. Fetches the knockout ladder + `playoff_entry` + the per-round `score_manager_period` + the **cumulative tiebreak via the shared `loadCumulativeTournamentTotals`** (the SAME helper `advanceStore.loadRoundContext` calls — see the single-source note below) + the group periods; orders the ladder by `KNOCKOUT_ROUNDS`; threads the existing `loadLineup` / `loadWaivers` reads for `reducedLineup` / `reinforcement`; calls the pure builder. No migration; no writes.
- **Single-sourced cumulative total — the data-side guarantor (`refactor/cumulative-totals`).** The cumulative tournament total (Σ `score_manager_period.points` over ALL a league's periods — the live boundary tiebreak) is derived in ONE place: **`loadCumulativeTournamentTotals(prisma, leagueId, managerIds)`** in `packages/recompute/src/cumulativeTotals.ts`, surfaced on the **`@app/recompute/prisma`** subpath (re-exported from `prismaStore.ts`, so the package index stays IO-free; the pure `sumByManager` reduce keeps a type-only `@app/db` import). BOTH the WRITE path (`advanceStore.loadRoundContext`) and the READ path (`loadPlayoffs`) call it with their own `managerIds` (the round's alive field vs all participants) — the drift-prone *period scoping* lives exactly once. Where `selectGuillotineCuts` / `resolveRoundCut` is the **algorithm-side** guarantor of "the live facing-the-blade zone == the eventual `commish:advance` cut" at a boundary tie, this helper is the **data-side** one: both paths feed the selector an identical cumulative total *by construction*, not because two queries happen to match. Pure `sumByManager` is unit-tested; the IO query is covered by both callers' gated PG suites. No migration, no stored column.
- **Flagged contract refinements** (additive — discovery showed §21 under-specified these): `totalRounds` = the COUNT of present knockout periods (the "(5)" above is the max — the field size fixes the ladder length, so fewer rounds for a smaller field); `me` is a `RankedRow` (superset of the `{managerId,rank,points,safe|zone}` shape — its `state` can also be `eliminated` in the complete phase, e.g. a runner-up); the view ADDS `champion: managerId|null` + `complete: boolean` (§21 listed neither, but the loader must DERIVE "tournament over" = every round cut + a `champion` entry — read-only, never touching `league.status`); `reducedLineup`/`reinforcement` ("from @app/lineup"/"from @app/faab") are realized as the existing `loadLineup`/`loadWaivers` web-loader outputs (no package-level single-purpose read exists → threading the loaders is the no-reimplementation path).
- **`seasonStats` output (`feat/playoffs-season-stats`) — the sanctioned read-model pass for the complete-arm recap.** `buildPlayoffsView` now ALSO emits `seasonStats: Record<managerId, {totalTitlePoints, powerW, powerL, bestWeek}>`, derived PURELY from inputs it already receives (NO new input, NO loader change, NO IO in the derivation): `totalTitlePoints` = the `cumulativeTotals` input; `powerW/powerL` = the group all-play-all W-L the builder already computes for `seeds[].gW/gL` (`computeStandings(groupPeriods)` — the regular-season "power record"; NOT extended over the guillotine rounds); `bestWeek` = `max` over `groupPeriods` ∪ `roundScores` (the exported pure `bestWeekByManager`; the two inputs cover every `period.kind`). This is additive — the cut/classification logic is byte-unchanged and the theater consumes the new field through the snapshot untouched. The dashboard complete arm + `PrimaryBanner` consume it (closing the gap above); `loadPlayoffs` stays byte-untouched (it spreads `...core`).
- **Still the SCREENS thread's** (the theater is now SHIPPED — see below): the **dashboard** playoff/complete phases (a SEPARATE next thread), and the **`league.status → complete` routing decision** (DECISIONS → Playoff per-round cut application → Scope — RESOLVED (Phase B, 2026-06-16): status stays `'playoff'`, `'complete'` derived read-only from the champion `playoff_entry` row, nothing writes `'complete'` — see DECISIONS → 'Tournament end leaves `league.status='playoff'`').

### Theater SCREEN — ✅ SHIPPED (`feat/playoff-theater`; merge HELD). The live `/playoffs` route.

The READ/PRESENTATION layer over `loadPlayoffs` — renders the design (`design/design_reference/playoffs/`, COMPONENT_MAP §2 row 10) to the merged `PlayoffsView`, live-updating during knockout rounds via the vsfield Realtime pattern (§5). Consumes the read-model; touches no engine. **No DB migration.** See also **DECISIONS.md → Playoff theater SCREEN**.

- **Route + gate (`apps/web/app/playoffs/{page,layout}.tsx`).** `page.tsx` (server, `force-dynamic`): `getSessionManager` → no-session `/sign-in`, `!ok` `/auth/denied`, then `loadPlayoffs(manager.id)` → null renders the pre-playoff state, else `<PlayoffsClient>`. The phase gate is **DATA-EXISTENCE, not `league.status`** (never read in the web — a worker concern): `loadPlayoffs` returns null until the knockout ladder + seeded field exist, which is exactly post-transition. **KNOWN-EXCEPTION / debt (P2, 2026-06-19):** `apps/web/app/waivers/loadWaivers.ts:71-73,253-254` and `packages/faab/src/prismaStore.ts:678` currently read `league.status` to gate FAAB affordances (`rosterCapForLeagueStatus`) — architectural drift from this contract. No RLS leak (owner client); tracked as P2 for a clearance-required, test-first fix (extend `loadPlayoffs.contract.test.ts:77` assertion to the waivers loader, red→green, Opus+max). `layout.tsx` wraps `<AppShell active="playoffs">` (the new `NavId` — `crossNav` union + NAV_ITEMS + MORE_SHEET_ITEMS, + the AppShell glyph; IA §3 keeps it in the More overflow, not a primary tab).
- **Authed snapshot read — `GET /api/playoffs` (`route.ts` + `src/playoffs/handlePlayoffs.ts`).** Mirrors `/api/vsfield`: framework-agnostic gate (401 no-session / 403 not-allowlisted|no-manager / 404 no-playoffs / 200), LEAGUE-SCOPED (NO own-manager 403 — a member sees the whole field; the session manager is resolved ONLY to populate `me`). Recomputed every call (`force-dynamic`, no cache) — the reduced-pitch live lock+pts and the names map recompose per refetch.
- **Live path (`src/playoffs/{realtime,liveController,snapshotClient}.ts` + `PlayoffsClient.tsx`).** The vsfield pattern reused verbatim: `realtime.setAuth(<JWT>)` BEFORE subscribe, first subscribe gated on INITIAL_SESSION via `onAuthStateChange`, TOKEN_REFRESHED tears down + re-subscribes; a Realtime change-nudge → ONE seq-guarded refetch of `GET /api/playoffs` → re-render; a **visibility-gated** 20s poll fallback (the pool `poolLive` precedent — a hidden tab skips the tick). Subscribed tables = `score_manager_period` + `playoff_entry` ONLY (NOT `standing`), BOTH **unfiltered** (`score_manager_period` has no league_id; `playoff_entry`'s league_id filter would need a `leagueId` on the snapshot, deliberately NOT added to keep the names map the sole read-model change — §4's single permanent league + the two RLS SELECT policies scope delivery in effect). `playoff_entry`'s SELECT policy + `supabase_realtime` membership confirmed present (migration `20260614130000`). **The Realtime BROWSER delivery is the post-deploy gate — Node/jsdom green does NOT prove it.**
- **The screen (`PlayoffsClient.tsx` + `components.tsx` + `playoffs.css`).** Thin client over the SSR snapshot; holds only layout state (board↔ladder; a null/pinned round so an un-browsed board FOLLOWS the live round on a refetch). Ported `.po-*`/`.mpo-*` from the design (the `.vf-stage`/`.st-*` prototype scaffold dropped — AppShell owns chrome). COMPONENT_MAP §2 row 10: GuillotineCutLine/Icon, SurvivorRow/SurvivorBoard, RoundColumn (ladder), MyReducedPitch/PoNode, ReinforceModule, ShapeChip (+ mobile MPoRow/MPoBoard), responsive desktop↔mobile switch. Accent held (cobalt = you + CTAs, `--elim` = cut, `--live` = live; gold-free). The **cut margin is DERIVED** presentationally from the ranked rows (`src/playoffs/theaterView.ts`: `cutBoundaryIndex` + `myMargin`, boundary-tie-safe → "at the line"). The **reduced pitch** maps the loader-threaded `reducedLineup` (`buildReducedPitch`): lock = `locks` ∪ `slotMeta.hasPlayed`, points = `slotMeta.pointsAtStake` — server-composed, NO browser-direct read. The design's per-node live(playing) split is dropped (`SlotMeta` has no "playing now" flag — that's the vs-the-field surface; fact-wins-over-flourish). `champion`/`complete` → **originally a top-level `ChampionBanner`; SUPERSEDED by the Chocoyo re-skin bullet below (the hero now owns the endgame).**
- **The names attachment (the sole LOADER-side read-model change; `seasonStats` is the pure-core one above).** `loadPlayoffs` attaches `managerNames: Record<managerId,string>` (a `manager.findMany` in the owner-bypass edge); the cut/classification core stays name-free and byte-untouched. The screen needs field-wide names (survivor rows + guillotined avatars). See DECISIONS → the scoped read-model exception.
- **Chocoyo hero re-skin (`feat/playoffs-chocoyo-reskin`; merge HELD) — PRESENTATION-ONLY.** The live-round hero is re-skinned to the CHOCOYO "theater" treatment (`design/design_reference/screens_2026-06-14/theater/{parrot,screen,app}.jsx`): the parrot mascot — peeking out of the pixel-art trophy mark (the vendored `/brand/trophy.png`, the same personality-moment `<img>` pattern as the old `.po-parrot` / the landing `.lp-cta-parrot`, **not** `next/image`) — hoists a MACHETE that is a **pure inline SVG** (its belly is the functional `--elim` cutting edge, `.po-machete-edge`; no raster, so the blade paints with zero asset dependency). All copy binds to the view-model: headline `LOWEST {round.cutCount} GET THE CHOP` → `CHOP!` on the drop; static "The Chocoyo doesn't miss." + "Chocoyo · your executioner"; substats `{fieldCount} still standing · {cutCount} get chopped · {survives} advance`; the "on the block" doomed = **`round.eliminatedIds`** (past = the actual cut, live = the provisional zone the view-model already surfaces), struck with the **cross-surface row-elim treatment** (`--text-tertiary` + `line-through` in `--elim` — waivers/vsfield/landing parity, now also on `.po-row`/`.po-lr`/`.mpo-row`). The **blade CHOREOGRAPHY is a purely CLIENT-side state machine** (`PlayoffsClient.tsx`): the loader is CLOCKLESS (no "just happened" signal — a STOP seam held), so a transition latch over per-round-idx `status` fires the ONE-TIME wind → drop → settle **only** when a round the client watches flips `live→past` between refetches (`focusIdx` centres the CHOP on the just-cut round mid-swing, then settles onto the new live round); it never loops, never fires on mount for an already-past round, and is fully gated behind `prefers-reduced-motion` (JS skips the choreography; CSS gates every sway/swing behind `no-preference`). The **complete/champion endgame is now OWNED BY THE HERO** (celebratory trophy in-place, replacing the CHOP framing) — the standalone `ChampionBanner` is retired. Board/ladder toggle, reduced-lineup + reinforce panels are visually aligned only; `buildPlayoffsView`/`guillotine`/`playoffRound`/`loadPlayoffs` stay **byte-untouched** (git-verified), no migration/RLS/Realtime, `/playoffs` stays `ƒ`. **RENDER PROOF** (a source smoke cannot prove a screen — the old `.po-parrot` glyph shipped invisible): `apps/web/scripts/verify-playoffs-hero.mjs` (Playwright + inlined real ds.css/playoffs.css + served `/brand/*.png`) asserts by true paint geometry that the trophy image LOADED (not a broken box), the machete PAINTED, the blade rotates raised→down on the drop, and the swing/sway animations are wired (desktop + mobile, live + dropped); `chocoyoHero.test.ts` pins the real component to the harness replica. **Live-verify on the Render deploy (hero paints + blade animates on a real cut) is Sergio's final gate.**

## §22 — Period status lifecycle (the period-close cron advances `period.status`) (`feat/period-status-lifecycle`)

The hourly **`wc-fantasy-period-close`** cron (`apps/worker/src/jobs/periodClose.ts`) now does TWO independent jobs per tick. It already stamped `frozen_at` (the scoring-freeze gate, §3 settle / DECISIONS INVARIANT 5); it now ALSO advances the `period.status` lifecycle (`pending → open → closed`). Previously status was never written — a matchday opened at seed and never closed — so `findLockedSlotPlayerIds` (@app/lineup, gates on `status !== "closed"`) kept played players locked forever and froze every waiver drop the moment a matchday ended (the MD1 incident; see DECISIONS → Theme C amendment).

- **Pure decision fn — `selectPeriodStatusTransitions` (`packages/recompute/src/periodStatus.ts`).** IO-free sibling of `selectPeriodsToFreeze`; takes a snapshot of all periods + their fixtures and returns `{ toClose, toOpen }`. **Close** = `status !== "closed"` ∧ ≥1 fixture ∧ every fixture `completed` ∧ not an anomaly (reuses the freeze module's `selectAnomalyPeriods` — a `postponed`/`abandoned` fixture is left for the commissioner). **Open** = the EARLIEST period in canonical tournament order (@app/shared `comparePeriodLabels`) not in `existing-closed ∪ to-close`, and only if still `pending`. Imports only `@app/shared` + the `./freeze` sibling (purity preserved — the package index stays IO-free).
- **One-open-period invariant.** Promoting only the earliest-not-closed-and-still-`pending` period gives **exactly one open period** at a time: it hands off cleanly (close MD1 ⟹ open MD2), is a no-op in steady state (the current wave is already `open`), **self-heals** a bootstrap with no open period (promotes the earliest pending), and opens nothing once every period is closed (tournament end).
- **Decoupled from freeze — two clocks.** Status-`closed` keys purely on "all fixtures completed", NEVER on `frozen_at`/`result_freeze_hours`. Dropping a played player after close is safe: his **locked** lineup slot stays (scoring reads it); only **unlocked** slots release.
- **Cron wiring (after the untouched freeze block).** A SECOND, unfiltered `period.findMany` (the freeze query is scoped to `frozenAt: null`, which would hide already-closed waves the earliest-current pick needs) feeds the pure fn; the result is applied as ONE `$transaction` of `updateMany`s, each **guarded by the expected prior status** (`{ id, status: { not: "closed" } }` to close; `{ id, status: "pending" }` to open) so the hourly re-run is idempotent. New structured logs: `job.periodClose.statusAdvanced` (`{ periodId, to }`), and the `job.periodClose.done` summary gains `closed` / `opened` counts. No schema migration (the `status` column + `PERIOD_STATUSES` enum already exist); no web change.

- **Dual-writer redundancy (P1a — `feat/tick-status-advance`).** Status-advance is no longer cron-only: the resident 60s worker tick (`apps/worker/src/scheduler.ts`) now ALSO runs it, as the LAST step of the tick, via `dispatchPeriodStatusAdvance` (`apps/worker/src/period/dispatch.ts`) over a worker-local `PeriodStatusStore` (`period/{store,prismaStore,memoryStore}.ts`). It calls the **same UNCHANGED** pure `selectPeriodStatusTransitions` and applies the **same guarded** `updateMany` (close `status != "closed"`, open `status = "pending"`) — so cron and tick are EQUIVALENT idempotent claims: whichever runs first wins, the other is a no-op (the `dispatchFaabBatches` `batch_cleared_at`-latch pattern). This removes the SILENT status-open SPOF — a stalled cron no longer skips a knockout round's `pending → open` (FA-window) mount, because the 60s tick re-emits the transition. Placed LAST in the tick so every prior step sees the same `period.status` it would under the cron-only world. **Additive — `periodClose.ts` and `selectPeriodStatusTransitions` are byte-UNCHANGED.** Freeze is NOT dual-written (its plain `update` relies on the `frozenAt: null` query filter, not a WHERE-guard → cron-only). The anomaly hold is unchanged (it lives in the pure selector, caller-independent). New tick log `period.status.advanced` (`{ closed, opened }`) on apply; failures isolated as `period.status.advance.error`. No schema/migration/RLS change. See DECISIONS → "P1a: dual-writer status-advance" + BACKLOG → P1a.

- **Cron-resilience DETECTION — external observational signals (A-lite — `feat/period-close-heartbeat`).** The dual-writer above is PREVENTION (status-open self-heals); it does not make a failure *visible*, and freeze stays cron-only. `job:period-close` now emits two env-gated, fire-and-forget HTTP pings (`apps/worker/src/jobs/heartbeat.ts`): a **liveness** dead-man's-switch (`PERIOD_CLOSE_HEARTBEAT_URL` after `job.periodClose.done`, `…/fail` on the crash path — the monitor alerts on the ping's ABSENCE → a stalled/crashed cron) and an **attention** signal (`PERIOD_CLOSE_ATTENTION_URL`, fired only when a run reports `anomalies > 0` → a postponed/abandoned fixture may be blocking the next round's open; the monitor alerts on PRESENCE). They are **purely observational**: `ping` swallows every failure (throw / ~5 s `AbortController` timeout / DNS / non-2xx) and never rethrows (a second layer, `safePing`, isolates each call); an unset URL is a silent no-op; and they sit AFTER the `done` / `error` logs so `job.periodClose.done` / `.error` + the 0/1 exit codes are byte-UNCHANGED. The monitor is **operator-configured and out-of-repo** (Healthchecks.io-style liveness + an attention webhook; `render.yaml` carries only two `sync:false` declarations on the cron block). The **worker tick is intentionally NOT instrumented** — its liveness is self-evident from its visible 60 s activity; only the silent hourly cron needs the switch. A DB-heartbeat column stays rejected as migration-class (BACKLOG → P2). See DECISIONS → "A-lite: cron-resilience DETECTION" + BACKLOG → A-lite + RUNBOOK → "Knockout transitions — pre-flight".

## §23 — Standings read surface: the dedicated `/standings` page (`feat/standings-tabs`; + Season tab `feat/season-tab`, T12)

**Shipped (merge HELD):** the dedicated all-play-all standings screen — three tabs (Matchday + Cumulative + **Season**, the last added by T12) over the regular-season power record. **READ-ONLY:** no engine/scoring/schema/migration/RLS/publication change; the `standing` writes stay the recompute sweeper's job (§4). The whole surface mirrors the §5/§21 live-read pattern (loader → pure view-model → route/api/client).

**The single-source guarantee.** Both tabs are computed from ONE input — the `group_md` periods' `score_manager_period` point-maps — by the pure `buildStandingsView` (`packages/recompute/src/standingsView.ts`), so they **cannot disagree**. It adds **no new W/L/D or seeding rule**: it imports the locked `periodRecords` (the Prompt-04 pairwise record helper, tie = Draw, `w+l+d = N−1`) and `computeStandings` (the cumulative seed). Because `computeStandings` internally sums `periodRecords` over those same period scores, the cumulative totals are **exactly** the sum of the matchday records.

- **Cumulative tab** = `computeStandings(periodScores)` ordered into the directory by the SAME comparator `buildVsField`'s season view uses (seed asc → W desc → points desc → managerId asc), enriched with the per-period form strip, `move` (rank delta vs COMPLETED periods only — the live period is excluded from the prior snapshot), the `tiedWins` PF-tiebreak flag, and the provisional playoff cut. **No drift vs the persisted `standing`:** the loader threads the RAW (UNPADDED) `score_manager_period` rows per period, byte-identical to what `recomputeStanding` feeds `computeStandings` (§4) — so the cumulative tab equals the persisted `standing` (and thus the vsfield season view). Directory-only managers (absent from every period) get a trailing 0–0–0 row, `seed` null, in the DISPLAY layer only (never re-entering `computeStandings`).
- **Matchday tab** = each period's within-period ranking (that-period W desc → points desc → managerId asc). The default-selected period is the live one (if any), else the latest scored, else the latest.
- **Season tab (T12)** = a managers × matchdays score MATRIX (rows = managers in the cumulative season-seed order, columns = matchdays in canonical order, each cell = that manager's points for that matchday), built by the pure `buildSeasonGrid(view)` (`standingsView.ts`). It is a **re-projection of the SAME `StandingsView`** — NOT a new query and NOT new arithmetic: each cell reads the cumulative row's `perPeriod` points (re-keyed by `periodId` so cells stay column-aligned), and the trailing **Total** column echoes the cumulative PF, so the grid can never disagree with the Cumulative tab. A column is `started` iff it is live OR has ≥1 scored row (`view.matchday[id].length > 0`) — the same started-set convention the Matchday tab uses; **unstarted (future) matchdays render an empty cell**, while a live-but-unscored matchday is `started` (a real 0). Read-only (no per-row expansion); `SeasonGridPanel` renders a horizontally-scrollable `<table>` with a sticky Manager column (`.st-season-*`), so it follows the same Realtime nudge → refetch → re-render path as the other tabs for free.

**Joint rank (display) vs deterministic seed.** Both tabs use standard competition ranking ("1224"): rows sharing the full `(W, points)` sort key share a joint `rank` and the next distinct row's rank skips. The underlying deterministic `seed` (the `computeStandings` managerId fallback) is UNCHANGED — only the displayed rank joins true ties. A genuine matchday points-tie shows both managers a **Draw** in that period's record and the same matchday rank (identical points in a period ⇒ identical `(w,l,d)` vs the same field, so the `(W,points)` key tie is sound — this is the T9-correct behaviour). The provisional cut admits exactly `fieldSize` managers by deterministic seed POSITION (not by display rank), so a boundary joint-rank tie cannot over-admit; `DEFAULT_PLAYOFF_FIELD_SIZE = 10` (Theme C — LOCKED at 10 on 2026-06-20; the same provisional cut line and the real transition cut both use `cutScheduleFor(10)` = {2,2,2,2,1}, collapsing 10→8→6→4→2→champion, applied at the group→playoff transition via `--field 10`).

**Loader + route + live path.**
- **`loadStandings` (`apps/web/app/standings/loadStandings.ts`).** Owner-bypass Prisma edge, league-scoped: reads group_md periods + their `score_manager_period` (RAW/unpadded) + the manager directory; orders periods via `sortByPeriodOrder` (label-based — `opens_at` is null in prod); `live` is time-based (`first kickoff ≤ now < last kickoff + 120min` — `period.status` stays `pending` from provision to freeze, so a status-based "live" would be wrong). The schema has only `period.label` (no long name), so `name` doubles as the label (`TODO(confirm)` if a long name is ever sourced). No `fieldSize` column exists yet → the default applies.
- **`GET /api/standings` (`route.ts` + `src/standings/handleStandings.ts`).** Mirrors `/api/vsfield`: framework-agnostic gate (401 no-session / 403 not-allowlisted|no-manager / 404 / 200), LEAGUE-SCOPED (NO own-manager 403 — a member sees the whole field; the session manager is resolved ONLY to mark `meId`). Recomputed every call (`force-dynamic`, no cache).
- **Live path (`src/standings/{realtime,liveController,snapshotClient}.ts` + `StandingsClient.tsx`).** The vsfield/playoffs pattern reused verbatim: `realtime.setAuth(<JWT>)` BEFORE subscribe, INITIAL_SESSION-gated first subscribe via `onAuthStateChange`, TOKEN_REFRESHED tears down + re-subscribes; a Realtime change-nudge → ONE seq-guarded refetch of `GET /api/standings` → re-render; a visibility-gated 20s poll fallback. Subscribed tables = **`score_manager_period` + `standing`**, BOTH **unfiltered** (single-league §4 + the two RLS SELECT policies scope delivery in effect; `standing` is RLS-readable + in `supabase_realtime` per migration `20260606170000`). **The Realtime BROWSER delivery is the post-deploy gate — Node/jsdom green does NOT prove it.**

**Screen + nav.** `page.tsx` (gate, `force-dynamic`; a null load → `/auth/denied`, since a valid member always has a snapshot, even an empty pre-season one) + `layout.tsx` (`AppShell active="standings"`). The `standings` `NavId` is wired into `crossNav.ts` (union + NAV_ITEMS + MORE_SHEET_ITEMS — the playoffs precedent, More overflow not a primary bottom tab) + the exhaustive AppShell glyph `Record<NavId, …>`. `StandingsClient` holds only presentational state (active tab — Matchday default; selected matchday period — survives a refetch while it still exists; expanded row). `components.tsx` ports the `.st-*` design (context band, power-record table with form strip / expandable per-period detail / cut-line divider, matchday panel, and the **season grid** `SeasonGridPanel` — a sticky-Manager-column scrollable matrix, T12); `standings.css` layers on global ds.css tokens (cobalt = you, `--elim` = cut, `--live` = live; gold-free), one responsive layout that drops Win%/Form on narrow viewports. The vsfield season view + the dashboard standings module are deliberately NOT retired/linked to this page (a later nav pass). See PROJECT.md → 2026-06-19 standings entry + DECISIONS.md → Theme C (matchday-ranking + joint-rank display).

## §24 — Vs-the-field benches: the `loadVsField` return-type widening (`feat/vsfield-benches`)

**Shipped (`7929512`, merged):** the live "vs the field" H2H renders each manager's **bench** (the 4 non-starters) at the bottom — a **display-only sibling** of the scored snapshot. The `@app/vsfield` engine (`buildVsField`) is **byte-untouched**: benches never enter its input or output.

**The widening.** `loadVsField` previously returned `VsFieldView | null`. It now returns **`VsFieldViewWithBenches | null`**, where `VsFieldViewWithBenches = VsFieldView & { benches: ManagerBench[] }` (`apps/web/src/vsfield/benches.ts`). This is a **width-compatible superset** — adding a field, not changing one — so it satisfies the existing `VsFieldView` contract everywhere it already flowed. The two consumers prove it:
- **`/vsfield`** (the screen + `GET /api/vsfield` + the refetch clients `liveController`/`snapshotClient`) reads the new `benches` field and renders it.
- **`loadDashboard`** (`apps/web/app/_dashboard/loadDashboard.ts`) calls `loadVsField` for the group/playoff phase modules and **ignores `benches`** — its `VsFieldView`-typed usage stays valid because the extra field is structurally assignable. The `pnpm -w typecheck` is the proof of width-compatibility (no consumer change required, none made).

**Where benches are composed (loader, not engine).** The current-period `lineup_slot` read drops its old `where: { isStarter: true }` filter so ONE query returns the FULL lineup, and selects `isStarter`. The rows are then partitioned in JS: starters (`is_starter = true`) feed `buildVsField` exactly as before (an `if (!s.isStarter) continue` guards the lineups-by-manager group), while bench rows feed the pure, exported `groupBenchesByManager` (same extraction convention as `playerPointsLookup`) → `benches`, grouped per manager and ordered GK→DEF→MID→FWD. A bench entry is **identity-only** (name + `fifa_team.name` nation kit — NEVER `player.country`, P34 — + role); it carries NO points / lock-on-play, since bench players never score. See PROJECT.md → 2026-06-20 vsfield-benches entry + DECISIONS.md → 2026-06-20 (display-only sibling, engine byte-untouched).

## §25 — Game detail read surface: `/games/[matchId]` (real-match box score + fantasy overlay) (`feat/game-detail`)

**What it is.** A drill-in over a single real `fifa_match`: both teams' squads (starting XI + subs who came on + named bench, with sub on/off minutes and cards) with each player's **real stat line, fantasy points, and a fantasy-owner tag**. Reached from the dashboard matchday rows and the Quiniela (`/pool`) fixtures. The per-player breakdown reuses `PlayerScoreSheet` verbatim (§17/§19) — no fork.

**Layering (pure core + thin edge, mirrors §17 player-box and §21 playoffs).**
- **Pure view-model `apps/web/src/games/{types,buildGameDetail}.ts` (`buildGameDetail.test.ts`).** Injected rows in, `GameDetailView` out — no DB/clock/IO. Groups each side into `starters` / `subs` (came on) / `bench` (named, did not feature) by position order; folds stat chips (G/A/SV), cards, and sub on/off minutes; echoes the loader-built owner overlay. **Card classification REUSES recompute's exported `classifyCard`** — the single source of truth (`@app/recompute`, T-CARD1; no longer a private mirror) (`incident_type "card"`, class red/yellow; rescinded ignored; non-card ignored) — and deliberately does NOT attempt the two-yellow→red banding (that needs cross-row pairing at the aggregation layer; OUT OF SCOPE, rows shown as classified). **Squad classification — the official `match_lineup_entry` sheet is AUTHORITATIVE for a side when present** (decided per side; one side may be posted before the other). With a sheet: Starting XI = the **reconciled kickoff XI** (the over-marked `is_starter` sheet is the starting point, not the answer — see **Kickoff-XI reconciliation** below); a named sub (`is_starter=false`) ⇒ `sub` if a `player_in` event marks him on, else `bench`; and any appeared player NOT on the sheet (a come-on whose `player_in` event lacked an id) ⇒ `sub`, **NEVER** inferred into the Starting XI. Appearance-inference (an appearance ⇒ `starter`) survives ONLY as the fallback for a side with **no sheet at all** (graceful: show a squad rather than nothing). **So on a has-sheet side `side.starters === side.pitch`** — the Starting XI list and the formation pitch carry the identical player set, with no inferred 12th starter; a no-sheet side keeps an inferred list while its pitch stays empty. The formation PITCH (`SquadSide.pitch`) is the **reconciled KICKOFF XI** — NOT the raw `match_lineup_entry` `is_starter` set, which the feed over-marks: it is computed from the sheet ∪ `player_out` − come-ons − no-minute phantoms (see **Kickoff-XI reconciliation** below). Subbed-off / sent-off starters keep their lane (the formation is fixed at kickoff), a withdrawn off-sheet starter is re-added, an off-sheet come-on never gets a token, and an absent sheet ⇒ an empty pitch. `GameDetailClient`'s `PitchHalf` reads `side.pitch`; the lists read `side.starters`. A deterministic UTC `kickoffLabel` is emitted so the client never re-formats a Date (no hydration mismatch).
- **Thin loader `apps/web/app/games/[matchId]/loadGameDetail.ts` (`loadGameDetail.contract.test.ts`).** `import "server-only"`, Prisma owner-bypass, **read-only** — reads `fifa_match` (header + home/away `fifa_team` join for names) + `match_lineup_entry` (full squad, `is_starter`) + `stat_player_match` + `score_player_match` + `event_match` (incl. `assist_player_id` + `period` since **T16b** — additive selects, both columns pre-exist), then the union of referenced players (`displayName/position/teamId` + `team.name` → nation; the assist scorer is added to that union). Since **T18** it also reads `group_standing` for the **Standings tab** — group-scoped (resolve the two in-match teams' `group(s)` from their standing rows, then fetch a superset for those group(s); the match's group is derived via `team_id`, NEVER the unpopulated `fifa_match.group_id`) → pure `buildGroupStandings` (null → tab hidden for a TBD side / cross-group knockout fixture / un-ingested group). **NO engine re-run, NO recompute, NO dirty-marking, NO writes.**
- **Route `page.tsx` (auth gate, `force-dynamic`, `notFound()` on unknown matchId) + `layout.tsx` (`AppShell active="pool"` — the drill-in has no own NavId; the dedicated per-match surface is Quiniela — and imports `PlayerScoreSheet.css`, the vsfield precedent) + `GameDetailClient.tsx` + `apps/web/src/games/games.css` (route-scoped `.gd-*`, ds tokens only; booking-card glyphs are content imagery like flags).**

**Box-score coverage (why a full 22+ box score is data-backed).** `score_player_match` and `stat_player_match` exist for **every match participant**, not just rostered players: recompute's candidate set is every dirty raw stat row (`claimDirtyPlayerMatches` — no roster join) and the sole filter is `playerAppearedInMatch` (team-in-match AND an appearance signal). So fantasy points are available for all participants without any ownership-driven scoring. (See DECISIONS.md → 2026-06-21 game detail.)

**Ownership overlay (the only loader-side join beyond the box score).** Keyed on **this match's `period_id`**: `lineup_slot.findMany({ periodId, playerId: { in } })` → `started`/`benched` (by `is_starter`), with `roster_player` (active, `dropped_at IS NULL`, league-scoped) as the `owned`-not-fielded fallback; manager names attached server-side (the scoped read-model exception, mirroring §21 `loadPlayoffs.managerNames`) so the browser never reads `manager` rows. `fifa_match.period_id` is nullable — a null period ⇒ **no owner overlay** (the box score + points still render); the per-player tap-to-breakdown (period-keyed `/api/player-box`) is likewise gated on a present period.

**Invariants (held, same as the other read surfaces).** Nation via `fifa_team.name` (never `player.country`); team names via the join with `UNNAMED_OPPONENT` fallback (never a raw UUID); **no new RLS, no migration, no Realtime publication change** — the server-only owner-bypass read already covers per-player live points (`score_player_match` is not browser-readable and not in any publication; freshness, if wanted later, can ride the existing vsfield-style nudge/poll without widening anything). Click wirings: dashboard `MatchRow` → `<a href="/games/<matchId>">` (anchor-neutralised in `dashboard.css`); Quiniela `FixtureCard` gains a separate `.pl-fx-view` link on the teams-score area (pick buttons untouched). See PROJECT.md → 2026-06-21 game-detail entry + DECISIONS.md → 2026-06-21 (game detail = read-only snapshot).

**Kickoff-XI reconciliation (`feat/lineup-kickoff-reconciliation`, 2026-06-22, merge HELD — purity-class).** The BALLDONTLIE feed OVER-MARKS `match_lineup_entry.is_starter` on some completed matches (a side can carry 12+ flagged starters, or omit a real starter who was later subbed off), so the raw `is_starter` set is NOT a reliable kickoff XI — a side could render 12 on the pitch. `buildGameDetail` reconciles it at READ time into the actual kickoff XI via a deterministic cascade over the injected sheet + `event_match` substitutions + `stat_player_match.minutes_played`. **The root cause is feed over-marking; ingest and the stored `is_starter` data are left UNTOUCHED** (presentation/derivation only — no engine/recompute/resolver/scoring/RLS/migration/Realtime change). Per side (players grouped by `player.team_id`):

- **Candidates** = (`is_starter`=true rows) ∪ (anyone who is a substitution `player_out` — he was on at kickoff even if the feed left him off the sheet). The union RE-ADDS a withdrawn off-sheet starter — the **Croatia shape**: Kovačić came on for an off-sheet Modrić, so Modrić is restored and the side is 11, not 10.
- **Kept on the pitch** iff (a) he is NOT a substitution `player_in` (a come-on is a Sub — *came-on wins*, even if he later went off, so (a) is the first gate), AND (b) there is evidence he was on at kickoff: he was a `player_out`, OR `minutes_played > 0`, OR he is named in an on-field (non-substitution) event (a card/goal proves presence → a null-minute red-carded starter is kept). A flagged starter with NO minutes AND no events is a feed phantom — the **Czechia shape**: Jurásek → **dropped to the bench** (listed as "named, did not feature", never silently vanished). The **England shape** (Saka flagged `is_starter` but actually a `player_in` for Madueke) drops Saka via gate (a) and keeps Madueke (the `player_out`) → 11.
- The phantom drop fires **only when the match is TERMINAL (`completed`/`abandoned`) AND has minute data** (`phantomDropEnabled`). This is the **live-safety gate**: a LIVE match ingests `minutes_played` per-player incrementally, so a genuine starter can momentarily have null minutes — before the match ends (pre-kickoff OR in-progress) the sheet is kept as-is so the live XI never collapses on the first posted minute; a terminal match with no ingested minutes at all is likewise left untouched. The came-on removal and player_out add-back are event-driven and apply regardless, so a live pitch still tracks substitutions.
- **`pitch` = the kept set = `starters`** on a sheet side (the invariant `side.starters === side.pitch` holds by construction — `buildSide` sets `pitch = hasSheet ? starters : []`); `subs` = come-ons; `bench` = the rest incl. dropped phantoms. A no-sheet side keeps the appearance-inference fallback with an EMPTY pitch (NOT an anomaly).
- **Safety net (≠11 logs-not-drops).** If a side's reconciled XI ≠ 11 (a contradiction the cascade can't resolve — e.g. the feed flags 12 starters who all logged minutes), the builder renders the kept set **as-is** (never padded or trimmed) and returns a `LineupAnomaly {side, teamId, count, keptPlayerIds, removedPlayerIds}`; the loader `console.warn`s each one (matchId/teamId/count/kept/removed) so it is observable, never swallowed. The builder stays pure — the anomaly is RETURNED, not logged inside it.
- **Sub-pairing badges.** Each substitution's `player_in ↔ player_out` pair drives the lineup-row badges: a withdrawn starter shows "↓ min′ for [the come-on who replaced him]" (`PlayerLine.subbedOffForName`) and a come-on sub shows "↑ min′ for [the man he replaced]" (`subbedOnForName`); names resolve from the player union (`lastName ?? displayName`). A red-card exit has no paired `player_in` → no ↓ badge.

The loader's reads were already sufficient (`event_match` already selected `player_in_id`/`player_out_id`; `stat_player_match` already selected `minutes_played`) — the only loader addition is the anomaly `console.warn` (still read-only). Adversarially reviewed by a 5-lens workflow: the cascade-logic lens caught a **P1** (a GLOBAL `matchHasMinutes` that collapsed a live XI the instant the first minute posted), fixed by the terminal-status gate above + a live/partial-minutes regression fixture; the other four lenses (invariant, scope-fence, badges/types, safety-net) passed. See PROJECT.md → 2026-06-22 (kickoff-XI reconciliation) + BACKLOG.md → T-RECON.

**Events timeline + scoreboard scorers row (`feat/game-detail-events`, 2026-06-26, merge HELD — review-class, pure-builder contract change · T16b).** The builder now emits an ordered **`GameDetailView.events[]`** (it previously folded `event_match` into per-player facts and emitted no ordered array — the T16 deferral). `buildEvents` (pure) produces a chronological **KO→FT** timeline of goals (scorer + assist + a replayed running score), substitutions (on/off), cards (yellow + red — a 2nd-yellow renders red), and **synthesized KO/HT/FT markers**: KO at 0–0; **HT at the `event.period` 1H→2H boundary** carrying the 1H score; FT **only on a terminal match** (live-safe), carrying the final running score. The Events tab (between Statistics and Ratings per the handoff `MD_TABS`) and the scoreboard scorers row (`⚽ Surname 11'`, grouped by side, own goals tagged `(OG)`) both consume it.

- **Single-source classification (no drift).** Goals/cards/VAR key on the SHARED `@app/recompute` predicates: `classifyCard` (already shared, T-CARD1) plus the **newly-exported** `isGoalEvent` / `isOwnGoalEvent` / `overturnedGoals` (**export keyword only — scoring byte-identical**; `adapter.ts` re-exports via the package `export *`). So the timeline matches scoring exactly: an **own goal credits the OPPOSING side** (the running score increments the opponent, the scorers row attributes to the beneficiary), a **VAR-disallowed goal** — whose `goal/*` row is **not rescinded**, only voided by a paired `varDecision/goalNotAwarded` ≤3 min — is **excluded** via `overturnedGoals`, and **every `varDecision` row is dropped** (the VAR theme is closed — no VAR display). To enable this reuse, `GdEventInput` is a structural SUPERSET of the engine's `EventRow` (carries raw `time_minute`/`added_time` for the `45+2'` form + the engine's effective-minute math; the per-player `eventFactsFor` now collapses them via a local `effMin`).
- **No silent desync (safety net, mirrors `LineupAnomaly`).** The running score replays by accumulating goals in order. A goal whose scorer can't be placed on a side is **counted, never silently credited**; on a TERMINAL match a computed-vs-stored mismatch (or any unresolved-scorer goal) is surfaced as `GameDetailView.eventScoreAnomaly` (`EventScoreAnomaly`) — the loader `console.warn`s it alongside the kickoff-XI anomaly, and the timeline still renders the accumulated score. Same-minute ordering is deterministic on `(period rank, effective minute, kind, content-tiebreak)`, independent of input order.
- **The data change is TWO additive selects on the EXISTING `event_match` read** — `assist_player_id` (the assist scorer; joined into the player-id union so names resolve via the same `player.findMany`) and `period` (the HT/FT boundary + sort rank). **Both columns pre-exist → NO migration; NO RLS, NO Realtime, NO validator, NO engine logic change.**
- **Fantasy-safety — the NARROW truth (do NOT write "event_match is display-only").** Unlike T17's `stat_team_match` (genuinely display-only, ZERO engine reads), **`event_match` IS a scoring input** — the engine reads it independently via its own `recompute/prismaStore.ts` path (cards, goals-conceded, and `assist_player_id` in the `namedInAnyEvent` participant gate). T16b changes only the **display** loader (the two additive selects) + the pure display builder + the export-only predicate sharing; the engine's read, logic, and stored data are **untouched**. The `@app/web` build is the engine-import IO-free reconfirm (no `server-only`/Prisma leak through the shared predicates into the client bundle) and stays green. Tests: a 7-case events suite in `buildGameDetail.test.ts`, the `assistPlayerId: true` + `period: true` + id-union pins in `loadGameDetail.contract.test.ts`, and the jsdom `GameDetailEvents.test.tsx` render proof. See PROJECT.md → 2026-06-26 (T16b) + BACKLOG.md → T16b.

**Mobile pitch = formation grid (`feat/pitch-formation-grid`, 2026-06-22, merge HELD — presentation/layout only; SUPERSEDES the lane-wrapping layout below).** The lane-wrapping pass stopped the clip but the mobile pitch was still unreadable: one tall single-file column per side — oversized tokens, bands stacked DOWN the screen instead of spread ACROSS it, the pitch grown to `min-height:600px` so the page scrolled (screenshot-confirmed broken on a real iPhone). This rebuild makes the mobile pitch a **true formation grid**: bands stack down the short axis and each band's players spread horizontally across the width, with every token auto-sized so the FULL XI of both sides fits one phone screen with NO vertical scroll. **Still purely how `PitchHalf`/CSS lay out `side.pitch` — no loader/builder/data-contract/engine/RLS change; `buildGameDetail.ts`/`types.ts`/`loadGameDetail.ts` are byte-untouched, and `side.starters === side.pitch` holds.**

- **Pure helper `apps/web/src/games/pitchRows.ts` (`pitchRows.test.ts`) — now BAND-aware, not axis-aware.** `pitchRows<T>(players, band: "GK"|"DEF"|"MID"|"FWD")` splits by football convention with the DEEPER line (toward own goal) first: **≤4 → one line** (a flat back-4 AND a flat mid-4 stay a SINGLE line and shrink to fit — the locked real-app rule, never a 2+2); **DEF 5 → `[3,2]`** (a back three + a wing-back pair); **MID/FWD 5 → `[2,3]`** (two holding deep + three ahead — the 4-2-3-1 / 4-5-1 case); **≥6 → balanced ≤4-wide lines fuller toward the front** (an 11-man XI can't field 6 in a band; this is the kickoff-XI-reconciliation safety net). The old `narrow` axis param is GONE — a flat-4 reads identically on phone and desktop, only the token SIZE differs — which is what let the wide/narrow dual-render be deleted. Generic + pure, presentation only (not in the builder).
- **Render (`GameDetailClient.PitchHalf` → one `LaneColumn` per band) + sizing inputs.** Each band is one `.gd-pcol` holding one `.gd-pline` per convention line; a multi-line band gets `.gd-pcol.is-wide`. No more `wide-only`/`narrow-only` dual-render (a single split per band). `Pitch` computes `pitchMetrics(side)` for both sides and sets **`--pitch-rows`** (the busier side's total formation-line count: GK line + each band's sub-lines) and **`--pitch-cols`** (the widest single line) as inline CSS vars on `.gd-pitch`, floored at 1, so the two halves size tokens identically and the whole XI fits.
- **Mobile CSS (`@media max-width:720px`) — flex-fill height + `cqh` token unit (NO chrome constant).** The pitch turns vertical (away top / home bottom, halfway split) and FLEX-FILLS the real leftover height — there is no `dvh − <guessed chrome>` constant. Scoped to the lineups tab via `.gd-app:has(.gd-lineups)`, the frame (`.gd-app`) is bounded to the shell content area (`height:100%; overflow:hidden`), the back / scoreboard / stake / tab bar are fixed rows (`flex:0 0 auto`), and the tab body `.gd-tabwrap` takes whatever is left (`flex:1 1 0; min-height:0; overflow-y:auto`) and is a **size container** (`container-type:size`). The pitch fills it with **`height:100cqh`** and the team lists scroll BELOW the pitch inside the tab. (A literal `flex:1` on the pitch can't be used — `.gd-tl-grid`, the team lists, is the pitch's flex SIBLING in `.gd-lineups` and would collapse it — so the bounded flex region is `.gd-tabwrap` and the pitch fills it via cqh; the Statistics / Ratings tabs are untouched because the rules are `:has(.gd-lineups)`-scoped.) `overflow:hidden` on the pitch means it can never scroll or grow (the lane-wrapping `min-height:600px` floor is the bug this removed). Each `.gd-phalf` takes an equal slice (`flex:1; justify-content:space-evenly`); each `.gd-pline` is a horizontal row spread ACROSS the full width (`justify-content:space-evenly`, **`flex-wrap:nowrap`** — a flat 4 shrinks, never wraps). Tokens size off the pitch's TRUE rendered height: `.gd-pitch { container-type:size }`, `--gd-line-h = 50cqh / --pitch-rows`, `--shirt = clamp(11px, min(--gd-line-h × 0.42, width-budget), 42px)`. The whole token (jersey + name + pts) is budgeted into one line and the name/pts strip scales proportionally off `--shirt` (no fixed reserve), so even at the legibility floor a full 5-line side can't be pushed past the half-pitch budget — **the strip shrinks instead of clipping; the fit always wins.**
- **The flex-fill needs a DEFINITE-HEIGHT chain from the viewport down — and production didn't have one (`fix/pitch-formation-grid` height correction, 2026-06-22).** The `cqh`/flex model above only resolves if a definite height actually reaches `.gd-tabwrap`. The App Shell's `.sh-app{height:100%}` is the design's propagation hook, but its containing block is the route layout's `<div data-theme>` wrapper, which has **no** definite height — so `.sh-app{height:100%}` computes to `auto`. `.sh-app{min-height:100dvh}` then gives it a 100dvh *used* height, **but a used-size-via-`min-height` is NOT "definite" for percentage/flex resolution** — so `.gd-app{height:100%}` also computes to `auto`, and `.gd-tabwrap{container-type:size}` (size containment zeroes its own intrinsic block-size) collapses to **0px**, leaving the pitch (`height:100cqh`) at ~0 → an **empty pitch on a real iPhone** (`.sh-app`/`.sh-content` still measure 100dvh via the min-height floor + flex stretch, which is exactly why the collapse was non-obvious). **The fix re-establishes the definite chain `html → body → wrapper` for the games route only:** `GameDetailLayout`'s wrapper gets a `gd-host` class (the single structural touch), and games.css (inside `@media max-width:720px`) sets `:root:has(.gd-host), body:has(.gd-host){height:100%}` + `.gd-host{height:100%}`. `<html>` resolves `height:100%` against the viewport (always definite), so the whole chain becomes definite and `.sh-app{height:100%}` finally resolves. **Still no chrome constant, no `dvh` math — just an unbroken `height:100%` chain.** `:has(.gd-host)` scopes it to this route, so every other screen's natural-scroll model is byte-unchanged (every route wraps `AppShell` in an unclassed `<div data-theme>`, so `.sh-app{height:100%}`→`auto` everywhere — `/draft` supplies its own `.dr-app{height:100dvh}`, the rest scroll naturally; only the games mobile-lineups `cqh` chain ever needed the height to *propagate through* `.sh-app`).
- **Token corners (uniform desktop + mobile): rating LEFT shoulder, subbed-off/red RIGHT shoulder, ownership bottom-left.** `.gd-tok-rate` (left) and `.gd-tok-status` (right, the `▾{minute}′` / red marker reusing `.gd-rev is-off`/`is-red`) sit on OPPOSITE shoulders so they never overlap — on a small jersey each overhangs its own side horizontally but sits AT the shoulder with no vertical overhang, so neither reaches into the adjacent formation line. `.gd-tok-own` ("YOU" / rival dot) tucks into the bottom-left, clear of both. Gotcha: `.gd-rev.is-off` carries a fixed-9px `font:` shorthand that overrides its parent's font-size — the mobile block re-overrides just its `font-size` so the minute shrinks with the jersey. (Every field was already on `PlayerLine` from the 8385c93 reconciliation; the red-card MINUTE still isn't carried, so a red badge shows the marker only. A come-on sub never gets a pitch token, so only the ↓ badge is meaningful on the pitch.)
- **Desktop unchanged structurally** (horizontal pitch, vertical lanes, fixed 516px, fixed-size tokens). The only desktop change from the new helper is **DEF 5 → `[3,2]`** (was `[2,3]`) — a back three with the wing-back pair ahead, which reads more correctly.
- **Full-token-height sizing + centerline containment (`fix/pitch-centerline-bleed`, 2026-06-22, merge HELD — presentation/CSS only).** With real MD2 density (every player rated, ~half carrying a `▾{min}′` sub-off badge, **two-digit** fantasy-point pills) the bands overflowed their 50% half and bled across the halfway line — the two teams' attacking lines collided in the centre (screenshot-confirmed on Sergio's iPhone, NED–SWE / ARG–AUT). **Root cause, two compounding parts:** (1) the points NUMBER was pinned at a fixed **13px** on mobile — `.gd-fpts-sm b{font-size:13px}` outranks the mobile `.gd-tok-foot .gd-fpts{font-size:clamp(...)}` (which sizes only the SPAN, not its `<b>`), so the pill stayed ~20px (13px number + 1px border) regardless of `--shirt`, far over the `0.42×line` jersey budget; (2) `--gd-line-h = 50cqh/--pitch-rows` never subtracted the `.gd-phalf` vertical padding nor the inter-band `.gd-pcol` sub-line gaps, so `rows×line-h` overshot the half's true content height — and `.gd-phalf` had no containment, so the overshoot bled across centre instead of clipping. **Fix (mobile `@media max-width:720px` block only):** (a) **unpin the number** — `.gd-tok-foot .gd-fpts b{font-size:inherit}` (+ `small`) so the whole pill scales with the jersey; (b) **budget the FULL token** — reserve the name + foot strip EXPLICITLY (`--gd-name-h`, `--gd-foot-h`, applied as the actual pinned heights of `.gd-tok-name`/`.gd-tok-foot`) and subtract `2×--gd-half-pad + --gd-grid-slack` from the line budget, so `--gd-shirt-h = line − strip − gaps` and **token height ≡ line height by construction** (`--shirt` floor 11→7: legibility yields to the fit); (c) **`.gd-phalf{overflow:hidden}`** as a hard centerline barrier (the sizing means it never actually clips — the guard measures unclipped layout boxes — but it guarantees the halfway line is never crossed). The jersey shrinks before anything clips; the fit still wins. `buildGameDetail.ts`/`types.ts`/`pitchRows.ts`/`GameDetailClient.tsx` are byte-untouched, and desktop (fixed 516px) is unaffected (every change is inside the mobile block). See PROJECT.md → 2026-06-22 (pitch centerline bleed).
- **Layout guard `apps/web/scripts/verify-pitch-layout.mjs` (`pnpm test:layout`).** OPT-IN (NOT in `pnpm test` — that stays browser-free for CI); SKIPS with exit 0 if no Chromium binary. jsdom has no layout engine, so a unit test can be green while the rendered pitch overflows/overlaps/**collapses** — this renders the screen in headless Chromium with the REAL `ds.css` + `shell.css` + `games.css` and asserts true `getBoundingClientRect()` bounds. **It mounts the REAL production ancestry, top to bottom** — `<html>` (no height) → `<body class="min-h-screen">` (Tailwind `min-height:100vh`, emulated; NO forced `height`) → the route layout's `<div.gd-host data-theme>` wrapper → `.sh-app` → `.sh-topbar`/`.sh-content`/`.sh-btmnav` → `.gd-app` → fixed scoreboard/stake/tabs → flex `.gd-tabwrap` → `.gd-lineups` (tall list stand-in so the tab scrolls). **It does NOT fabricate a definite-height root.** The earlier guard forced `html,body{height:100%}` and skipped the wrapper, which made the chain definite no matter what — so the real-phone collapse (pitch at ~0 height) sailed through green. It now mounts the same chain the browser does, so a height-chain regression collapses the replica too. For 6 formations (4-3-3, 4-2-3-1, 3-5-2, 4-4-2, 4-5-1, 3-4-3) at 360 AND 390 across a ROOMY (844) and a TIGHT (667, iPhone-SE class) viewport height plus 1280 (desktop), it asserts: **(a0) NON-COLLAPSE FLOOR — on the phone viewports `.gd-tabwrap ≥ 40% of clientH`, the pitch fills it (`≥ 90% of .gd-tabwrap`), and clears an absolute floor `≈ 0.36·clientH` (≈240px @ 667); every token has non-zero width AND height. An empty/collapsed pitch is RED** (this is the assertion the old guard lacked — proven red-on-broken-CSS / green-on-fixed); (a) the full pitch fits — content within the pitch box, box ≤ viewport, no scroll — at both heights; (b) ZERO token overlap, including the rating-vs-sub-badge on the SAME token; (c) ZERO horizontal clip; (d) the right line structure per band; **(e) NO CROSS-CENTERLINE — no away-half token's layout box reaches below the pitch vertical midpoint and none of home's above it (the bands never collide in the centre); it uses `getBoundingClientRect` (NOT the visual clip), so the fix must genuinely RESIZE tokens to fit — clipping them with `overflow:hidden` alone is still RED.** Each formation is now seeded with a REAL worst-case dense XI (`squad()`: every player rated, ~half subbed off, two-digit points, real-length names — the NED–SWE / ARG–AUT density) and the fpts replica renders the real `gd-fpts gd-fpts-sm` classes, so the guard measures the SAME 13px-pinned points number the app renders — the earlier bare-`gd-fpts` replica measured a fake shrunk pill and never saw the bleed (hardened on `fix/pitch-centerline-bleed`, 2026-06-22: proven red-on-shipped-CSS — 12 phone-667 checks, all crossing centre — → green-on-fixed, 30/30). It saves `/tmp/pitch_<formation>_<w>x<h>.png` for 4-2-3-1, 4-4-2, 3-4-3 at 360 × {667, 844} (the mockup-review artifacts — rendered screenshots are part of the pre-merge pause, since the last rounds shipped green-but-broken).

See PROJECT.md → 2026-06-22 (pitch formation grid).

---

## §26 — Prior-matchday stat-sheet selector across Lineup / Vs-the-Field / Waivers (`feat/prior-matchday-selector`, T11; corrected by `fix/t11-corrections`)

> **Corrections (`fix/t11-corrections`, 2026-06-21, merge HELD).** Two live-verification fixes, both display-only: (A) a prior **Lineup** matchday now renders from that period's `lineup_slot` snapshot (so a fielded-then-dropped player still appears), not the live roster; (B) **Waivers** drops the over-applied selector entirely — the period concept is confined to matchday-labelled **Batch results**. Details inline in the Lineup / Waivers bullets below.

**What it is.** A matchday selector on Lineup + Vs-the-Field (and matchday-labelled Batch results on Waivers) so a user can pull up the FULL stat sheet for any **prior** (completed) matchday — not just the current one. The box-score read path was already period-aware (§17/§19 `PlayerScoreSheet` → `/api/player-box` → `loadPlayerBox`, scoped by `match.periodId`, no clock gate); the only gap was period SELECTION. Every period read — current AND prior — goes through the EXISTING period-aware read model with a `periodId` param; **no parallel/ungated read path is added** (that single read path is what preserves each surface's existing posture).

**The shared started-set helper (the SINGLE source).** `apps/web/src/period/selectablePeriods.ts` (`selectablePeriods.test.ts`), pure, IO-free, consumed by all three loaders:
- `periodHasStarted(p, now)` = `isPickLocked` (`@app/pool`) on the period's FIRST fixture — the canonical per-match started predicate (`now >= kickoffAt || status !== "scheduled"`). **No new clock predicate.**
- `periodIsDone(p, now)` = `now >= lastKickoff + MATCH_DURATION_MS` (120 min; mirrors `loadVsField`/`loadStandings`) → the period is over ⇒ strictly read-only / historical.
- `selectableStartedPeriods(periods, now, alwaysIncludeId?)` = started periods only (completed priors + the live one), canonically ordered via `sortByPeriodOrder`. **Future/unstarted periods are excluded** — a not-yet-locked matchday can never be selected, so the selector can never reveal a future XI. `alwaysIncludeId` force-keeps the surface's current/live default (the inter-matchday-gap case) without admitting a genuinely future period.
- `resolveDisplayedPeriodId(periods, requestedId, defaultId, now)` = the server-side enforcement: honours a requested STARTED period, otherwise (future/unknown) falls back to the default — so the no-request path is byte-identical to pre-T11 and a crafted `?period=<future>` is rejected at the loader.

**Per surface.**
- **Lineup** (`loadLineup` + `SetLineupClient` + `PeriodTabs`). The period query drops the `status IN (open,pending)` filter and reads ALL league periods + their fixtures; the shown set = the editable windows (not done) ∪ the prior periods the manager actually played (`playedPeriodIds`, ≥1 saved slot) — a never-set prior is never surfaced (and never a back-dateable target). Each `PeriodLineup` carries `readOnly = periodIsDone` (anchored on the fixtures' clock, **NOT `period.status`** which stays `"pending"` in prod until the close cron). The default active period is the live wave (`selectCurrentPeriod` over all periods), not `periods[0]`. The client gates EVERY mutation off `readOnly` — `editable = !readOnly && …`, the formation picker `disabled`, **and the tap-to-swap `onSelect` short-circuits** (a never-appeared bench player has no `locked_at`, so without that gate it would be visibly swappable). The played-starter tap still opens the box score; the in-modal "Bench & forfeit" affordance is suppressed on a prior period. **Read-only is a UI/UX layer; the data-integrity backstop is the server write path (`@app/lineup` controller + `validateLineup` + the lock-on-play latch), which is UNCHANGED and rejects any edit touching a PLAYED slot** (proven by `controller.test.ts` + a real jsdom render test `ReadOnlyPeriod.test.tsx`). **Correction (`fix/t11-corrections`):** a prior period is rendered from its OWN `lineup_slot` snapshot, not the live roster. The loader attaches `snapshotPlayers` (the period's full slot set, resolved — INCLUDING since-dropped fielded players, whose locked slot survives the drop because `releaseDroppedPlayerSlots` deletes only UNLOCKED slots and `lineup_slot` has no `roster_player` FK) to each read-only period; the client renders read-only periods from `snapshotPlayers` (else the live `squad`). The score/kickoff/opponent/availability maps widen to that display universe so a dropped starter's points + fixture resolve. Editable periods are byte-unchanged (`PriorMatchdaySnapshot.test.tsx`).
- **Vs the Field** (`loadVsField(viewerManagerId, requestedPeriodId?)` + `page.tsx ?period=` + `VsFieldClient`). The displayed period = `resolveDisplayedPeriodId`; every downstream read (lineup_slot / score_manager_period / fifa_match / score_player_match) already keys off the resolved `currentPeriod.id`, so they follow for free. The view gains `selectablePeriods` + `isLivePeriod` (sibling fields on `VsFieldViewWithBenches`; `buildVsField` untouched). The client renders the selector, **suppresses the Realtime subscription when `!isLivePeriod`** (a prior is static — `conn` reads "Final"), keeps the box-score modal on the displayed period, and `key`s on the period in `page.tsx` so a switch remounts cleanly. **No reveal-gate change: vsfield shows all XIs by design (§5); prior periods reveal fully because they are over, the current period is unchanged, and the selector cannot reach a future one.**
- **Waivers** (`loadWaivers` + `WaiversClient`) — **corrected by `fix/t11-corrections` (see below).** T11 originally added a top "Stat sheet" selector that swapped the per-player drill-down to `PlayerScoreSheet` for a prior selection. That over-applied the period concept: the FA pool / claims / player cards are live/global and period-less by design. The selector is **removed** (the drill-down is always the period-less `FaPlayerCardSheet`); the period concept is confined to the **Batch results** tab, where each settled batch is labelled with its matchday (the period whose `batch_cleared_at == run_at`). Waivers does NOT consume `selectablePeriods`.

**Invariants (held).** `PlayerScoreSheet` reused verbatim on all three; **no new table, no RLS, no migration, no Realtime publication change**; no new write path (POST `/api/lineup` untouched). The one new latent finding — vsfield reveals the next wave's XIs during the inter-matchday gap — is **pre-existing** (the default selection is byte-identical pre/post-T11) and recorded as **BACKLOG SEC-P3** for a commish decision, not fixed here. See PROJECT.md → 2026-06-21 prior-matchday-selector entry + DECISIONS.md → 2026-06-21 (vsfield has no reveal gate; T11 read-only anchors on the fixtures' clock, not `period.status`).

**Round 2 — prior-lineup SCORES + batch player-grouping (`fix/t11-corrections-2`, merge HELD, stacks; display-only).**

- **The Lineup pitch shows points on every locked-on-play tile + the matchday total (Fix A-2).** The pitch token's points pill now keys on the **SAME slot-level `!movable` (locked-on-play) condition the bench uses** — decoupled from the period-level `readOnly` flag and from `slotKind`. Root cause of the original miss: the bench rendered its pill on `!movable`, but the pitch token gated on `readOnly`/`slotKind`/`pointsAtStake>0`, and `classifySlot` only returns `"played-starter"` when `meta.movable` (=`!periodFrozen`) holds — so a kicked-off/frozen starter fell to `"locked"` and drew a bare padlock while the bench showed numbers in the same view. Now a locked-on-play tile shows its `pointsAtStake` as the clickable `ScorePill` (tap → period-aware `PlayerScoreSheet`) on the current matchday AND prior ones; a not-yet-kicked-off (movable) starter keeps its plain editable token. **Movability is unchanged** — `handleClick = movable ? onSelect : onScore` (the bench split): locked stays non-movable/non-selectable, movable stays selectable, no write path. `loadLineup` also reads the manager's **`score_manager_period`** row(s) (the SAME column `loadStandings` reads — owner-bypass server read, no RLS surface) → `PeriodLineup.matchdayTotal` via pure `selectManagerPeriodTotal` (**picks the stored total, never re-sums**); `SetLineupClient` renders a `MatchdayTotalBanner` whenever `matchdayTotal != null` (a completed prior matchday OR the current one once scoring starts; absent pre-kickoff).
- **Batch results group by player (Fix B-2).** Pure `groupResultsByPlayer(WvResult[]) → WvResultGroup[]` (in `waiversLogic.ts`) collapses each contested player to one entry — identity + flag rendered ONCE on a `ResultGroup` header, every bid (winner + losers + voids) beneath as `BidLine`s, amount-desc (winner on top); the dropped-player detail rides the winning bid, the matchday label stays on the batch header. `ResultsBatch` consumes the grouping; **no new query** (the loader already returns all winning + losing bids), no schema/RLS/engine change. See PROJECT.md → 2026-06-21 T11 corrections round 2.

---

## §27 — Vs-the-Field match-card link + live-field elimination hide (`feat/vsfield-match-click-hide-eliminated`)

**What.** Two contained, display-only changes to `/vsfield`. (1) Each fixture card in the match strip is now a tap target to `/games/<matchId>` (mirrors the dashboard `MatchRow` → §25 `/games/[matchId]` precedent). (2) On the **live** field only, a manager with a `playoff_entry.status = "eliminated"` row is hidden from the H2H leaderboard. **`@app/vsfield`'s `buildVsField` is byte-untouched** (input and output shape) in both cases — same posture as §24 benches.

**(1) Match-card link.** `MatchStrip` (`apps/web/app/vsfield/components.tsx`) wraps each card in `<a className="v2-match" key={m.matchId} href={`/games/${m.matchId}`}>` (was a non-interactive `<div>`); `vsfield.css`'s existing `.v2-match` rule gains `text-decoration: none` (neutralising default anchor styling, the §25 `dashboard.css` `.db-match-row` convention) plus a `.v2-match:hover { background: var(--surface-3) }` affordance. `MatchView.matchId` already existed on the engine's view (no loader change needed — the STOP-seam check resolved with nothing to do).

**(2) Live-field elimination hide — CONTRACT-P3 data-existence, not `league.status`.** `loadVsField` adds a 4th read alongside its existing manager/period/standing queries: `prisma.playoffEntry.findMany({ where: { leagueId, status: "eliminated" }, select: { managerId: true } })`. This is the same `playoff_entry`-existence contract used elsewhere (§20 cap split, FAAB playoff-cap parity) — **never** a `league.status` check — and it self-scopes to the playoff phase by data existence alone: a group-phase league has zero `playoff_entry` rows, so the query and the filter below are no-ops with no separate phase flag.

The hide is composed **loader-side, after** `buildVsField` runs — `const view = buildVsField(input); const field = filterEliminatedFromField(view.field, eliminatedManagerIds, isLivePeriod); return { ...view, field, ... }` — exactly like `benches` (§24): the engine is called once with the FULL manager list, and only its OUTPUT `field` is filtered. This was the deliberate design choice over pre-filtering `input.managers`, since that single input also drives `view.season` (the all-season cumulative record), which must keep every manager regardless of elimination — "historical records keep everyone active" per spec. `filterEliminatedFromField` (pure, exported — same extraction convention as `playerPointsLookup`/`groupBenchesByManager`) is a no-op unless `isLivePeriod` is true AND the eliminated set is non-empty; when it does filter, it re-ranks the remainder `1..N` (no gaps) since `rank` is a displayed field. **`isLivePeriod` (existing T11 flag, §26) is reused as-is to gate the hide to the live view** — a prior/historical period selection via the matchday selector always shows the full field, matching the "fully revealed because the matchday is over" convention already established for that flag. The Season tab is unaffected in all cases.

**Invariants held.** No migration (the `PlayoffEntry` model + `eliminated` status already existed, §20); no RLS change (existing read-only Prisma owner-bypass query, same as the other 3 `loadVsField` reads); no Realtime change; no reveal-gate change (vsfield still shows all XIs by design, §5 — this only removes eliminated rows from the live leaderboard, it doesn't gate visibility of anyone's XI). Tests: extended source-contract smoke (`vsFieldSkin.test.ts` — pins the anchor JSX + the `playoffEntry.findMany` where-clause + the `filterEliminatedFromField` composition), a dedicated pure-function unit suite (`loadVsField.eliminated.test.ts` — re-rank, historical no-op, empty-set no-op, viewer-self-eliminated), and a real jsdom render proof (`MatchStrip.test.tsx` — asserts the rendered anchor's `href`). Full DoD gate green. See PROJECT.md → 2026-06-30 (vsfield match-click + hide-eliminated) + BACKLOG.md.

**Sibling on `/waivers` (same day): keep instead of hide.** The Team budgets rail (`loadWaivers.ts`) reads the identical `playoffEntry.findMany({ where: { leagueId, status: "eliminated" } })` contract but composes it the opposite way: it stamps `eliminated: boolean` onto each `WvTeamBudget` row rather than filtering the array, because the rail's job is to make elimination visible (struck through, budget-desc order untouched), not to remove the manager. It deliberately does not call `filterEliminatedFromField` — that helper's contract is "remove from the field," which is the wrong shape here. See PROJECT.md → 2026-06-30 (strike-eliminated entry).

**Follow-up fix — the eliminated predicate is DATA-EXISTENCE, not `status = "eliminated"` (`fix/eliminated-predicate-data-existence`, Jun 30 2026; supersedes the `status:"eliminated"` read described in both paragraphs above).** The original read on BOTH surfaces keyed the eliminated set on `playoff_entry.status = "eliminated"`. That is wrong for the **group-phase non-advancers**: a manager who fails to reach the playoffs has **NO `playoff_entry` row at all** (his `status` is NULL, never the string `"eliminated"` — only guillotined-during-playoffs managers get `status = "eliminated"`; see §20/§21, the transition writes `alive` rows for advancers and leaves non-advancers rowless). So the 2 non-advancers were never struck/hidden. The correct "out of contention" signal is **data existence**: a manager is eliminated iff the playoff phase is active AND he does **not** hold an `alive` `playoff_entry` — which catches BOTH the no-row non-advancers AND the `status = "eliminated"` guillotines, leaving only `status = "alive"` survivors. This is exactly the set-form of `loadIsPlayoffParticipant` (negated), so both are single-sourced. Both surfaces now call ONE shared helper — **`loadEliminatedManagerIds(db, leagueId)` in `@app/faab/prisma`** (alongside `loadPlayoffPhaseActive`/`loadIsPlayoffParticipant`) — which returns `managers − aliveSet`, PHASE-GATED to an **empty set** when `loadPlayoffPhaseActive` is false (no `playoff_entry` rows yet). The phase gate is the field-blanking guard: during the group phase there are zero `alive` rows, so a naive "not alive" derivation would mark EVERYONE eliminated and blank the whole live field — the gate returns empty until the group→playoff transition fires. `filterEliminatedFromField` (vsfield) and the `eliminated: eliminatedManagerIds.has(m.id)` stamp (waivers) are byte-unchanged — only the SET derivation moved into the helper, replacing the local `new Set(...)` in each loader. **Champion = alive-equivalent for DISPLAY (follow-up commit on this branch).** The survivor set is `status IN ('alive','champion')`, not `alive` alone: `champion` is the terminal form of "survived," so the tournament winner is **not struck** on `/waivers` and **not hidden** on `/vsfield`. This is a DISPLAY concern ONLY — it deliberately DIVERGES from `loadIsPlayoffParticipant` and the FAAB **enforcement**/roster-cap predicates, which stay strictly `status === "alive"` (a SEPARATE axis, left untouched — enforcement is moot post-tournament). Folding champion in also **closes** what was a sub-60s transient: after the manual `commish:advance --round Final --apply` crowns the champion (`alive → champion`) but BEFORE the ~60s worker tick closes the Final period, `isLivePeriod` is still true — with a strict `alive`-only set that window had ZERO survivors, so `filterEliminatedFromField` would have removed EVERY row and blanked the whole leaderboard. With champion counted as a survivor the winner remains and the field is never emptied. Pinned by a Final-advance-before-tick composition test (`loadVsField.eliminated.test.ts`) + the flipped champion-not-struck helper test (`eliminatedManagerIds.test.ts`); `filterEliminatedFromField` itself stays byte-identical (the fix is entirely in the shared set-derivation). No migration / RLS / Realtime / engine change. Tests: new `packages/faab/src/eliminatedManagerIds.test.ts` (a–d + champion + union, fake-db), extended `loadVsField.eliminated.test.ts` (helper→filter composition), and the two source-contract smokes (`vsFieldSkin.test.ts`, `teamBudgetsWiring.test.ts`) repointed off the literal `status:"eliminated"` string onto the shared-helper delegation. See PROJECT.md → 2026-06-30 (eliminated-predicate fix) + DECISIONS.md → "FAAB/waiver phase derives from `playoff_entry` existence".
