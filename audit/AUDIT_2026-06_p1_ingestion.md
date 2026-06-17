# AUDIT — Pass 2: P1 ingestion & feed robustness (READ-ONLY)

- **Date:** 2026-06-16
- **Branch:** `chore/audit-2026-06-p1`
- **Scope:** the path from external feed → persisted stats/locks/ratings — poller/scheduler (`apps/worker`), feed adapter (`packages/feed` + `packages/ingest/src/map.ts`), ingestion writes (`packages/ingest`), player-card derivation (`packages/player-box` + `apps/web` loaders), and the scraper (`apps/scraper` + `packages/scrape`). Failures here feed wrong/missing data to the (separately-audited) scoring engine.
- **Method:** static read of source only — no app/build/server/DB/network/feed/scraper executed. Six scope auditors traced each path end-to-end against the locked contracts in `SCORING.md` / `ARCHITECTURE.md §3,§7` / `DECISIONS.md → Data source` / `PROJECT.md`; **every** finding was then re-read by an independent adversarial verifier that re-opened the cited code and tried to refute it; a completeness critic swept the full set for missed paths. The orchestrator hand-traced the highest-leverage crux paths (`map.ts` field map, the `n() … ?? null` vs `?? 0` coalesce asymmetry, the kickoff parse, `lockInstantFromSub`, the per-tick `now` threading, the rating resolver order, the scrape write/target path, and the `ingestRosters`/`populate.ts` gaps the critic surfaced) directly.
- **Constraint compliance:** report-only; no source/test/config/migration/brain file was modified; no git action taken. On completion the only new working-tree file is this report.
- **Cross-reference:** this pass resolves the **code side** of the feed/ingestion investigation tasks Pass 1 (`AUDIT_2026-06_p0_integrity.md`) deferred here (I-1, I-2, I-3, I-5, I-6, I-7, I-8). Where the answer requires a live DB or captured-feed payload — which this read-only pass cannot touch — the exact operator check is stated in §3 as a residual, not asserted as a finding.

---

## 1. Summary

### 1a. Findings by severity

| Severity | Count | IDs |
|---|---|---|
| **P0** | 0 | — |
| **P1** | 3 | F-P1-01, F-P1-02, F-P1-03 |
| **P2** | 6 | F-P2-01, F-P2-02, F-P2-03, F-P2-04, F-P2-05, F-P2-06 |
| **P3** | 4 | F-P3-01, F-P3-02, F-P3-03, F-P3-04 |

13 findings. **9 fully verified** (read end-to-end). **F-P1-02 and F-P1-03 carry a `suspected` element** — the code mechanism is verified, but the live-trigger half (is `duels_won` / a promoted column actually NULL on the live feed? does the feed ever emit a bad `datetime`? does Prisma store-or-throw on an Invalid Date?) requires a live DB / captured payload this pass cannot observe; the exact checks are in §3.

### 1b. Headline

The single most live-impacting new finding is **F-P1-01**: every schedule-sync `upsertMatch` rewrites `kickoff_lock_fallback` to `false` on its UPDATE branch, and the sole caller always passes `{}`. The flag is the **operator's documented escape hatch** for a silent live poller (revert that match to kickoff-locking) — and schedule-sync re-fires *during* the live window, so an operator who flips it on watches it silently reset on the next tick. The escape hatch never sticks.

The two other P1s are the feed-robustness edges Pass 1 pointed here:

- **F-P1-02** — a feed-absent scored stat is **silently indistinguishable from a true zero**. Every scored column is mapped `v ?? null` (preserves "feed sent nothing") but the recompute adapter coalesces `v ?? 0` uniformly, then floor-divides → 0 points, no warning. `duels_won` is the named instance (Pass-1 F-P1-04), but the **five promoted §4 columns ride the identical path**, so each is an independent silent dead-bucket candidate. The mapping side is correct; the mask is the adapter coalesce with no feed-absent guard.
- **F-P1-03** — an unparseable/empty feed `datetime` is accepted **verbatim** at the map boundary (no validation, unlike every id-mapper). The resulting `Invalid Date`/`NaN` fails **closed-and-silent** in the scheduler (the fixture never pre-match-locks, never gets a T-75 availability peek, never tightens schedule-sync — with no alert) **and** fails **open** at the pure lock now-gates (`< NaN` / `> NaN` are always false). This extends Pass-1 F-P1-01 with the feed-side root and a new operational silent-drop.

The **field map is faithful** (3 drops not scored, 2 manual lines sourced from the manual layer not the feed, dispossessed→`possession_lost` remap, all 5 promoted columns on typed columns + in `STAT_EXTRA_OMIT`, aerials retained-unscored in `extra`), the **upserts are idempotent** (every raw write is `create:{…data}, update:data` on a natural key — replay-safe, no double-insert), the **per-tick `now` is a single value** threaded everywhere, and the **player.country invariant holds** at every card loader (country derives from `fifa_team.name`; the two dead-scalar reads are P3 drift). The remaining exposure is at the **edges**: the operator escape-hatch clobber, the feed-absent→0 mask, the kickoff-parse dual failure, per-row isolation on the schedule/rosters loops, and the **scraper PRIMARY rating arm, which is structurally inert today** (no Sofascore index, placeholder selector, unwired launcher) so all ratings currently run on the BALLDONTLIE fallback — contrary to the locked "Sofascore is PRIMARY/calibration target" contract.

---

## 2. Findings

### F-P1-01 · Schedule-sync re-poll clobbers the operator-set `kickoff_lock_fallback` flag back to `false` — the documented poller-outage escape hatch never sticks

- **Severity:** **P1** (latent correctness/operability: a one-way operator mitigation is silently reverted during the exact window it is needed)
- **Location:** `packages/ingest/src/prismaStore.ts:85,89-90` (`upsertMatch` writes `kickoffLockFallback` in BOTH create + update) · `packages/ingest/src/ingest.ts:64` (sole caller passes `{}`) · `apps/worker/src/scheduler.ts:104-111` (schedule-sync fires on slow cadence OR any-match-in-live-window) · `packages/ingest/src/ingest.ts:175` (the flag gates sub-locking) · `packages/db/prisma/migrations/20260604120000_match_period_and_lock_fallback/migration.sql:1-6`
- **Observed:** `upsertMatch` builds `data.kickoffLockFallback = opts.kickoffLockFallback ?? false` (`prismaStore.ts:85`) and spreads `data` into BOTH the `create` AND `update: data` branches (`:89-90`), so the column is overwritten on every upsert. The **only** caller is `ingestSchedule` (`ingest.ts:64`), which always passes `opts = {}` → `opts.kickoffLockFallback` is `undefined` → writes `false`. A repo-wide grep finds **no code path that ever passes `kickoffLockFallback: true`** (the only `true` literal, `prismaStore.ts:335`, is a `select` projection that *reads* the column; `scheduler.ts:148` only reads it into the live `ctx`). The flag is the operator's escape hatch — `migration.sql:3`: "reverts a match to kickoff-locking when live appearance data is missing" — set out-of-band (DB write). It gates event-driven sub-locking at `ingest.ts:175` (`if (!ctx.kickoffLockFallback && isSubstitution(...))`). `ingestSchedule` runs whenever any match is in its live window (`scheduler.ts:104`, `anyMatchInLiveWindow`), i.e. **during** the live match — exactly when an operator would have flipped fallback on after a `poller.silent` alert.
- **Impact / invariant threatened:** An operator who sets `kickoff_lock_fallback = true` (the documented mitigation for a silent live poller) has it silently reset to `false` on the next schedule-sync — which fires inside the live window — re-enabling event-driven sub-locking off a feed known to be unreliable for that match. The lock-on-play fallback the operator invoked never takes effect; played subs can be missed (under-stamping) or the match mis-locks, with no signal that the flag was reverted. Steady-state is `false`, so nothing corrupts automatically — the bug manifests only once the mitigation is applied, which is why it is P1, not P0.
- **Confidence:** **verified** (hand-traced the `?? false` default, both upsert branches, the sole `{}` caller, the grep for any `true` writer, and the live-window re-fire condition).
- **Fix theme:** treat `kickoff_lock_fallback` as operator-owned, not feed-owned — omit it from the schedule-sync UPDATE branch (or only write it when explicitly provided), so a re-poll never overwrites out-of-band operator state.
- **Effort:** **S**

---

### F-P1-02 · A feed-absent scored stat is silently indistinguishable from a true zero — `duels_won` and the five promoted §4 columns share one unguarded `null → 0` mask

- **Severity:** **P1** (latent §4 deviation; **league-symmetric** — every manager loses the same line, so it does not skew relative standings, but it is a real active under-score on a real category). Extends Pass-1 **F-P1-04** and resolves the code side of Pass-1 **I-1 / I-2**.
- **Location:** `packages/ingest/src/map.ts:17` (`n = v ?? null`) · `packages/ingest/src/map.ts:180` (`duelsWon: n(f.duels_won)`) · `packages/ingest/src/map.ts:196-200` (the 5 promoted columns) · `packages/recompute/src/adapter.ts:102` (`n = v ?? 0`) · `packages/recompute/src/adapter.ts:337,348-353` · `packages/recompute/src/prismaStore.ts:89-159` (SQL NULL passes through verbatim) · `packages/scoring/src/index.ts:28,138,151-166` · `packages/feed/src/types.ts:173-176,222-223` · `SCORING.md:65-87,161-166`
- **Observed:** At the **map** layer every scored stat is wrapped in `n = (v) => v ?? null` (`map.ts:17`), so `stat_player_match` correctly stores SQL `NULL` when the feed omits a field — `map.ts:4` itself documents this ("the adapter coalesces null→0 downstream"). The **adapter** then applies the inverse `n = (v) => v ?? 0` (`adapter.ts:102`) uniformly to every engine input (`adapter.ts:337,348-353`); `prismaStore.ts:89-159` reads the columns straight through with no coalesce, so the NULL survives DB→adapter untouched and the mask is solely the adapter helper. The engine floor-divides (`floorPer`, `index.ts:28`), and `add` omits a 0-point line — so a NULL collapses to "no credit" with **no way to distinguish "feed reported 0" from "feed reported nothing."** Duels are the named instance: `duelsWon: n(f.duels_won)` (`map.ts:180`), and there is **no ground+aerial reconstruction** anywhere — the player feed type (`types.ts:173-176`) declares only `duels_won`/`duels_lost`/`aerial_duels_won`/`aerial_duels_lost`; `ground_duels_won` exists only on the **team** type (`types.ts:222-223`) and `mapTeamStat` never reads it. Critically, the **five newly-promoted columns** (`shots_on_target`, `ball_recoveries`, `big_chances_created`, `crosses_accurate`, `touches`) take the **byte-identical** `n(f.<key>)` path (`map.ts:196-200`) and are all declared optional on the feed type — so each is an independent dead-bucket candidate if its live key is absent or mis-keyed. They are in `STAT_EXTRA_OMIT`, so the absent-vs-zero distinction that `extra`'s `if (value === undefined) continue` (`map.ts:163`) preserves is specifically erased for exactly these typed columns.
- **Impact / invariant threatened:** The locked §4 "for every N" buckets silently score 0 for every player whenever the live feed under-reports/omits the source field — a hidden per-category undercount with no error and no observable signal (looks identical to a player who genuinely won 0 duels / had 0 shots on target). Symmetric across managers, so not a relative-standings corruption, but a real deviation from the §4 contract that masks missing feed data as legitimate zeros. Pass-1 reported `duels_won` is NULL on the completed June 11–13 fixtures (the trigger); the same mechanism applies to every promoted column.
- **Confidence:** **verified** (the `null → 0 → floor 0` mechanism and the no-reconstruction gap, read end-to-end) / **suspected** on the live trigger — whether `duels_won` (or any promoted column) is actually NULL/mis-keyed on the live feed is not statically observable. `SCORING.md:161-166` documents a 51-row live sample where `duels_won` was populated as the ground+aerial total, which *contradicts* the live-NULL premise — so the live firing is unproven (Investigation I-1/I-2).
- **Fix theme:** make feed-absent (`null`) distinguishable from a true 0 for scored columns (e.g. skip — not zero-coalesce — a bucket whose source is NULL, or assert non-null after settle), and confirm/repair the `duels_won` source key (reconstruct from ground+aerial only if a live sample shows the total can be absent while components are present); then re-dirty + restate.
- **Effort:** **M**

---

### F-P1-03 · An unparseable/empty feed `datetime` is accepted verbatim — it fails CLOSED-and-silent in the scheduler (fixture never pre-match-locks/peeks) and OPEN at the lock now-gates

- **Severity:** **P1** (latent: a malformed feed kickoff silently drops a fixture from pre-match handling with no alert, and voids the temporal lock invariant on a NaN instant). Resolves the **code side** of Pass-1 **I-6 / I-7 / I-8** and extends Pass-1 **F-P1-01**.
- **Location:** `packages/ingest/src/map.ts:325-326` (`bdlId: f.id` and `kickoffAtIso: f.datetime`, both unvalidated) · `packages/ingest/src/map.test.ts:363` (a `datetime:"x"` fixture passes the mapper) · `packages/ingest/src/prismaStore.ts:70,345` (`new Date(row.kickoffAtIso)` → Invalid Date; `.getTime()` → NaN) · `packages/ingest/src/mode.ts:42-48,66-74,105-118` (NaN comparisons all false) · `packages/ingest/src/lock.ts:41,60-63,134` (now-gates fail open on NaN) · `apps/worker/src/scheduler.ts:104-111,147`
- **Observed:** `mapMatchRow` sets `kickoffAtIso: f.datetime` (`map.ts:326`) with **no validation** — unlike `mapStatLine`/`mapEvent`/`mapShot`/`mapTeamStat`, which all run `requireNumber` on their structural ids; `map.test.ts:363` literally feeds `datetime:"x"` and the mapper accepts it. `upsertMatch` then does `new Date(row.kickoffAtIso)` (`prismaStore.ts:70`) → `Invalid Date` (`getTime()` = NaN) for garbage; a repo-wide grep found **zero** `isNaN`/`Number.isNaN`/`isFinite` guards on the kickoff path, and **no `?? now` coalesce** (the contract's dangerous-coalesce ban *is* honored — it becomes NaN, not `now`). Two failure modes follow:
  1. **Fails closed-and-silent (operational):** `listSchedulableMatches` reads `r.kickoffAt.getTime()` = NaN (`prismaStore.ts:345`); in `mode.ts`, `decideMatchModes:44` (`t >= NaN && t <= NaN+grace`), `anyMatchInLiveWindow:73`, and `matchesNeedingLineupPeek:115` are all `false` for a NaN kickoff — so a scheduled fixture with a bad kickoff **never fires pre-match XI lock, never gets the T-75 availability peek, and never tightens schedule-sync inside its window**, with no warning log. It only ingests once the feed flips its `status` (live/settle key on status, not kickoff).
  2. **Fails open (lock invariant):** if an Invalid-Date kickoff reaches the lock path (`new Date(r.kickoffMs)` at `scheduler.ts:147`), `lockInstantsFromLineup`'s `now < NaN` (`lock.ts:41`) is false → no early return; `lockInstantFromSub` returns a lock carrying an Invalid-Date `lockedAt` (`lock.ts:60-63`); `isLockWriteAuthorized`'s `NaN > nowMs` (`lock.ts:134`) is false → the before-instant guard passes. The "never stamp before the instant" invariant is silently void for a NaN instant.
  Blast radius is widened by F-P2-01: `ingestSchedule` (`ingest.ts:59-66`) has no per-row try/catch, so if Prisma rejects the Invalid Date at `upsertMatch`, the throw aborts the **entire** schedule-sync tick (logged once as `ingest.schedule.error`), staling every other fixture's kickoff/status that tick.
- **Impact / invariant threatened:** A single fixture whose feed `datetime` is empty/garbage (e.g. a TBD knockout slot before the bracket resolves, or a postponed match) is either (a) silently dropped from pre-match handling — no XI lock, no peek, no operator signal — until the feed flips its status, or (b) aborts the whole schedule sync that tick, or (c) persists an Invalid-Date kickoff that voids the temporal lock guards (premature/incorrect `locked_at`, which governs swap-editability only, never scoring). Whether (b) vs (c) occurs hinges on Prisma's store-vs-throw behavior on an Invalid Date for the non-nullable `@db.Timestamptz(6)` column (Investigation I-6).
- **Confidence:** **verified** on the code side (the unvalidated map boundary, the NaN fail-open gates, the silent mode-scheduler drop, the missing per-row guard — all read end-to-end) / **suspected** on (i) whether the live feed ever emits an empty/non-ISO `datetime` (Investigation I-7) and (ii) the Prisma store-vs-throw outcome (Investigation I-6).
- **Fix theme:** validate `datetime` at the map boundary (`requireString` + reject/skip a non-finite `Date`, log per-row) so an unparseable kickoff is dropped-and-alerted rather than passed through; defensively guard the lock now-gates with `Number.isFinite` on both operands so a NaN instant denies rather than fails open.
- **Effort:** **S**

---

### F-P2-01 · `ingestSchedule` and `ingestRosters` inner loops have no per-row isolation — one bad row (or store/DB error) aborts the whole sync for that tick

- **Severity:** **P2** (transient, self-correcting; `ingestRosters` is the **sole player-creating path**, so its abort is the more consequential)
- **Location:** `packages/ingest/src/ingest.ts:59-66` (`ingestSchedule`, bare loop) · `packages/ingest/src/ingest.ts:75-86` (`ingestRosters`, bare loop) · `packages/ingest/src/ingest.ts:40-52` (the `eachItem` helper the live/settle paths use) · `apps/worker/src/scheduler.ts:104-111`
- **Observed:** `ingestSchedule` (`ingest.ts:61-65`) and `ingestRosters` (`ingest.ts:77-85`) are bare `for (const … of res.data)` loops with **no** per-item guard — unlike `ingestLive`/`ingestSettle`, which wrap every feed item in `eachItem()` (`ingest.ts:40-52`, which catches `FeedShapeMismatchError` and continues, rethrowing real store errors). A throw from any single row's `store.resolvePeriodId`/`store.upsertMatch` (schedule) or `store.upsertTeamByBdlId`/`store.upsertPlayerByBdlId` (rosters) propagates out of the loop; the only catch is the whole-call guard at `scheduler.ts:105-110` (logs `ingest.schedule.error`), so every later row in `res.data` is skipped that tick. The mappers themselves are mostly non-throwing on this path (rosters' `mapPosition` defaults to `MID`; the bare ids are unvalidated — see F-P3-01), so the realistic trigger is a store/DB error or, for schedule, a `normalizeStatus(null)` `TypeError` (`map.ts:295` does `raw.toLowerCase()`).
- **Impact / invariant threatened:** A single bad fixture row stalls the global fixture pull for one tick (kickoff/status updates for all later fixtures missed until the next sync — self-correcting via idempotent upserts, but during a live window the missed status flip delays a match's transition to `in_progress` and thus live polling / sub-locking). For `ingestRosters` — the only path that creates `player`/`fifa_team` rows — a single bad roster row aborts the **entire squad bootstrap** for that tick, leaving the pool partially populated until the next slow (≈daily) cadence.
- **Confidence:** **verified** (the asymmetry vs `eachItem` and the sole-player-creating-path role, read end-to-end).
- **Fix theme:** wrap each row in `ingestSchedule` and `ingestRosters` in the same `eachItem`/per-row try-catch the live path uses, so one malformed row is logged-and-skipped rather than aborting the batch.
- **Effort:** **S**

---

### F-P2-02 · Completed-match lock sweep has no per-match try/catch — one match's failure aborts the whole 48h sweep for that tick

- **Severity:** **P2** (self-healing; delayed coverage of the very gap the sweep exists to close)
- **Location:** `packages/ingest/src/lockSweep.ts:46-61` · `apps/worker/src/scheduler.ts:119-133`
- **Observed:** `sweepCompletedMatchLocks` loops the schedulable matches and calls `store.listAppearedPlayerBdlIds(match.bdlId)` (`lockSweep.ts:50`) then `store.lockSlot(...)` (`:56`) with **no inner try/catch**; a throw from either propagates out of the whole function, so completed matches after the throwing one in iteration order are not swept this tick. The only guard is the outer call wrapper (`scheduler.ts:130-132`, logs `lock.sweep.error`). This contrasts the per-match `decideMatchModes` loop, which isolates each action in its own try/catch (`scheduler.ts:159-194`). The sweep runs only on the slow (~hourly) cadence (`scheduler.ts:119`) and is monotonic/idempotent (routes through the `lockSlot` `WHERE locked_at IS NULL` latch).
- **Impact / invariant threatened:** A transient DB fault on one completed fixture skips the appearance-lock reconciliation for every other completed fixture in the 48h window that tick; played-but-unlocked slots stay `locked_at = NULL` up to ~1h longer than necessary, self-healing on the next slow tick. No corruption (the lock-write boundary stays gated independent of the sweep), just delayed coverage.
- **Confidence:** **verified** (read end-to-end; cadence and monotonic self-heal confirmed).
- **Fix theme:** isolate each match iteration in `sweepCompletedMatchLocks` in its own try/catch, like the per-action ingestion loop.
- **Effort:** **S**

---

### F-P2-03 · The Sofascore PRIMARY rating arm is structurally inert today — no stored ids, a placeholder selector, and an unwired launcher mean all ratings silently run on the BALLDONTLIE fallback

- **Severity:** **P2** (go-live readiness: the locked PRIMARY/calibration rating source is not feeding scoring; not a live-corruption bug because the fallback is by design and graceful)
- **Location:** `apps/scraper/src/populate.ts:20-22` (`loadSofaIndex()` returns `{matches:[],players:[]}`, `TODO`) · `packages/scrape/src/extract.ts:6-13` (placeholder `__SOFA_DATA__` marker, `TODO(confirm)`) · `apps/scraper/src/playwrightBrowser.ts:22-23` (placeholder `/event/<id>` URL, `TODO(confirm)`) · `apps/scraper/src/wiring.ts` (`notWiredLauncher` throws — Playwright not yet wired) · `packages/scrape/src/prismaStore.ts:20-49` (candidate query filters `sofascorePlayerId != null`)
- **Observed:** The one-time population CLI's `loadSofaIndex()` returns empty arrays with a `TODO` (`populate.ts:21`), so `proposeMatchMappings`/`proposePlayerMappings` produce **no proposals** → **no `sofascore_match_id`/`sofascore_player_id` is ever written**. `listScrapeCandidates` skips any player whose `sofascorePlayerId` is null (`prismaStore.ts:39`), so with no stored ids it emits **no candidates** → `runScrapeTick` writes **no `rating_player_match(source='scrape')` row**. Independently, `extractRating`'s marker is an admitted placeholder (`extract.ts:6-7`), the match URL is a placeholder (`playwrightBrowser.ts:22`), and the production launcher `notWiredLauncher` throws (caught by the tick's per-match isolation). The rating resolver order `[manual, scrape, balldontlie]` (`resolver.ts`, `shared/constants.ts:11-15`) is correct and **not inverted** — but with the scrape source empty, every player-match resolves to the BALLDONTLIE rating (or null), which `SCORING.md`/`DECISIONS.md` explicitly designate the *fallback*, not the calibration target.
- **Impact / invariant threatened:** The locked "Sofascore scrape = PRIMARY (the ladder's calibration target)" contract is not met at runtime: the entire rating ladder — the position-neutral scoring lever — currently runs on the BALLDONTLIE `rating` of *unknown provenance*. This is acceptable *pre-go-live* (graceful degradation, isolated, no crash), but it must be wired (real `loadSofaIndex`, real extract marker/URL/JSON path, real Playwright launcher) before the tournament relies on calibrated ratings, or the league knowingly accepts the uncalibrated fallback.
- **Confidence:** **verified** (the empty index, placeholder selector/URL, and throwing launcher are all read in source) — the operational confirmation (count of stored ids / scrape rows in prod) is the §3 residual.
- **Fix theme:** before go-live, wire `loadSofaIndex` to a real Sofascore index, confirm the real rating marker/JSON path + `/event/` URL against a live page, and wire the Playwright launcher — or record an explicit decision to run the ladder on the BALLDONTLIE fallback.
- **Effort:** **L**

---

### F-P2-04 · The Sofascore rating extractor uses a single hardcoded placeholder selector with no fallback path

- **Severity:** **P2** (fragility / go-live readiness; degrades gracefully but loses the PRIMARY source on any layout change)
- **Location:** `packages/scrape/src/extract.ts:6-13,20-35` · `apps/scraper/src/playwrightBrowser.ts:22-23`
- **Observed:** `extractRating` locates the rating JSON by one hardcoded marker `RATING_DATA.open = '<script id="__SOFA_DATA__" type="application/json">'` (`extract.ts:11`) via `html.indexOf` (`:21`); the block comment (`:6-7`) flags it a placeholder ("likely a `__NEXT_DATA__` blob or a separate JSON API"). There is exactly **one** selector and **one** expected shape (`{players:[{id,rating}]}`) — no alternate marker, no `__NEXT_DATA__` attempt, no regex/JSON-path fallback; any `indexOf` miss returns null (`:22,25`), as does a `JSON.parse` failure (`:28-30`). The match URL is likewise a placeholder (`playwrightBrowser.ts:22`).
- **Impact / invariant threatened:** On the first real or changed Sofascore layout, the marker will not match → `extractRating` returns null for every player → no scrape row → every player-match silently degrades to the BALLDONTLIE fallback. Degradation is graceful (no crash, isolation holds), but the PRIMARY/calibration source is lost until the marker + JSON path are re-confirmed against a live page.
- **Confidence:** **verified** (single-selector, no-fallback structure and the TODO placeholders, read end-to-end).
- **Fix theme:** confirm the real Sofascore rating marker/JSON path (and `/event/` URL) against a live page and add at least one alternate extraction path before go-live.
- **Effort:** **M**

---

### F-P2-05 · An extracted rating is not validated to a plausible 0–10 band before it is written and scored

- **Severity:** **P2** (a malformed-but-finite rating becomes the PRIMARY and mis-scores; bounded magnitude, recurring)
- **Location:** `packages/scrape/src/extract.ts:33-34` · `apps/scraper/src/scraper.ts:30` · `packages/scrape/src/prismaStore.ts:54-61` · `packages/scoring/src/index.ts:38-47`
- **Observed:** `extractRating` returns the value whenever `typeof rating === "number"` (`extract.ts:34`) with **no range/`isFinite` check** — any finite number (negative, >10, a percentage, a jersey number, a mis-mapped numeric field if the JSON shape drifts) passes. `runScrapeTick` skips only on null (`scraper.ts:30`); `writeScrapeRating` writes it straight to `rating_player_match` (`prismaStore.ts:54-61`). Because the resolver prefers `scrape` over `balldontlie` (`resolver.ts`, priority `[manual,scrape,balldontlie]`), a non-null scrape value becomes the PRIMARY rating. The scoring band fn `ratingPoints` (`index.ts:38-47`) has no domain guard: `< 6.0 → −2`, ascending bands, final `return 5` catches everything `≥ 9.0` — so an out-of-range numeric clamps to `[−2,+5]` but still mis-scores. (NaN cannot arrive via `JSON.parse`; a stringified `"7.4"` is rejected by the `typeof` gate — so only a genuinely-numeric wrong value drifts through.)
- **Impact / invariant threatened:** If the markup drifts so `rating` carries a different numeric, a bogus value becomes a wrong, non-null rating-ladder line (`−2..+5`) on live scoring, silently displacing the BALLDONTLIE fallback. Low likelihood while the selector is the placeholder (F-P2-04); rises the moment a real selector is wired without a range guard.
- **Confidence:** **verified** (the missing range check → resolver displacement → unguarded band fn, read end-to-end).
- **Fix theme:** reject extracted ratings outside a plausible finite `[0,10]` band in `extractRating` (return null) so an implausible value falls back instead of scoring.
- **Effort:** **S**

---

### F-P2-06 · A wrong scrape rating, once written, is permanent — `selectScrapeTargets` never re-scrapes an already-rated player and `writeScrapeRating` never deletes, so a corrected Sofascore id does not heal it

- **Severity:** **P2** (latent; doubly-dormant while the scraper is inert per F-P2-03, but an irreversible wrong-PRIMARY landmine the moment it is wired with any imperfect id mapping)
- **Location:** `packages/scrape/src/target.ts:30-33` (`hasScrapeRating` skip + 24h stale-drop) · `packages/scrape/src/prismaStore.ts:54-61` (upsert-only `writeScrapeRating`) · `packages/scrape/src/resolveTarget.ts:2-5` (header documents the wrong-row displacement risk) · `apps/scraper/src/scraper.ts:30`
- **Observed:** `selectScrapeTargets` skips any candidate where `c.hasScrapeRating` is true (`target.ts:32`) and drops any match more than `STALE_AFTER_MS = 24h` past kickoff (`:33`). `writeScrapeRating` only upserts on `(matchId, playerId, source='scrape')` (`prismaStore.ts:55-58`) — there is **no delete/invalidation path** anywhere. So once a scrape row exists for a player-match, that player is never re-targeted (the `hasScrapeRating` guard), and after 24h the match is dropped regardless. If a wrong `sofascore_player_id` (a mis-entered manual mapping, or an ambiguous-but-confident auto-match) produced a scrape row — writing *another real player's* rating under our correct `playerId` — then **correcting the `sofascore_player_id` later does not re-scrape it**: the existing row makes `hasScrapeRating` true, so the player is skipped. `resolveTarget`'s own header (`resolveTarget.ts:3-4`) names exactly this hazard: "a wrong scrape row DISPLACES the safe fallback with a wrong PRIMARY rating (silent, recurring, ~5-pt swings on the wrong manager)."
- **Impact / invariant threatened:** A wrong scrape rating is irreversible through the normal pipeline — it permanently displaces the BALLDONTLIE fallback for that player-match (the resolver prefers `scrape`), feeding a wrong PRIMARY rating (~5-pt swing) into the score, with the only remediation being a manual `rating_player_match` DELETE + re-dirty by the operator. Currently dormant because the scrape arm is inert (F-P2-03), so no ids/rows exist yet.
- **Confidence:** **verified** (the `hasScrapeRating`/stale skip, the upsert-only write with no delete, and the resolver-prefers-scrape displacement, read end-to-end).
- **Fix theme:** add a scrape-row invalidation path keyed on a `sofascore_player_id` change (or allow a forced re-scrape that overwrites despite `hasScrapeRating`), so a corrected mapping heals the wrong PRIMARY rating instead of leaving it permanent.
- **Effort:** **M**

---

### F-P3-01 · `mapMatchRow` does not validate the match id (`bdlId: f.id`) the way every other mapper validates its structural id

- **Severity:** **P3** (consistency / fail-loud convention drift; low live likelihood)
- **Location:** `packages/ingest/src/map.ts:325` · vs `map.ts:172-173,232-233,264-265,284-285` (the `requireNumber` id-guards) · `packages/feed/src/types.ts:67`
- **Observed:** `mapMatchRow` assigns `bdlId: f.id` bare (`map.ts:325`). Every other mapper guards its structural id with `requireNumber` (which throws `FeedShapeMismatchError`, caught per-item by `eachItem`): `mapStatLine`, `mapEvent`, `mapShot`, `mapTeamStat`. `FIFAMatch.id` is typed `number` so TS assumes presence, but a malformed runtime payload (null/missing id) flows as `bdlId: null` into `upsertMatch`'s `where: { balldontlieId: row.bdlId }`. Combined with `ingestSchedule` lacking `eachItem` (F-P2-01), this is a second unvalidated structural field on the one ingest path with no per-row isolation. (`mapMatchRow` is thus broadly unguarded — both its id and its `datetime`, F-P1-03 — not just one field.)
- **Impact / invariant threatened:** A malformed fixture row with a null/absent id is not failed-loud like every other entity; it flows into the upsert key. Low likelihood (id is structurally always present in practice) — flagged for consistency.
- **Confidence:** **verified** (read `map.ts:325` and the four `requireNumber` id-guards directly; the only finding whose workflow verify-slot hit a transient rate-limit, re-confirmed by the orchestrator).
- **Fix theme:** apply `requireNumber` to `f.id` in `mapMatchRow` to match the fail-loud convention of the other mappers.
- **Effort:** **S**

---

### F-P3-02 · Cross-process manager-period / standing dirty enqueue is a check-then-insert with no unique constraint — relies on single-caller serialization

- **Severity:** **P3** (no live corruption; latent regression guard for any future second writer)
- **Location:** `packages/recompute/src/prismaStore.ts:217-232` (`enqueueManagerPeriodDirty`) · `packages/recompute/src/prismaStore.ts:282-290` (`enqueueStandingDirty`) · `packages/db/prisma/schema.prisma:886-900` (`RecomputeDirty` — only `@@index([scope, processedAt])`) · `apps/worker/src/scheduler.ts:65-69,216`
- **Observed:** Both enqueues do `findFirst({ processedAt: null })` then conditional `create` — a check-then-act with **no DB unique constraint** on `(scope, managerId, periodId, processedAt IS NULL)`. In the worker this is SAFE because the only sweep caller is the single re-entrancy-guarded tick (`scheduler.ts:65-69,216`) and the enqueues run sequentially inside one sweep — no concurrency exists today (grep finds no second caller). Contrast Phase 1's genuinely-atomic `claimDirtyPlayerMatches` (`updateManyAndReturn`). A duplicate marker would only cause one redundant (idempotent) recompute, and `markManagerPeriodProcessed` (`updateMany`) clears all matching rows.
- **Impact / invariant threatened:** None today. Latent: if a second process (a future concurrent sweep or a manually-launched `job:recompute` overlapping the tick) ever enqueues concurrently, the non-atomic check-then-insert could double-insert markers — harmless beyond a redundant recompute, but a missing-constraint smell.
- **Confidence:** **verified** (read both enqueues, the schema indexes, and the single-caller guard end-to-end).
- **Fix theme:** back the `(scope, managerId, periodId, unprocessed)` dedup with a partial unique index or a claim-style update so correctness does not depend on single-caller serialization.
- **Effort:** **M**

---

### F-P3-03 · `loadWaivers` selects the dead `player.country` scalar and uses it as a `?? p.country` fallback

- **Severity:** **P3** (maintainability / drift; no user-visible bug — `team.name` is the working primary)
- **Location:** `apps/web/app/waivers/loadWaivers.ts:44,55,181`
- **Observed:** `PLAYER_SELECT` includes `country: true` (`:44`), `PlayerRow` carries `country: string | null` (`:55`), and `toPlayer` maps `nation: p.team?.name ?? p.country` (`:181`). Per the locked invariant, ingestion never writes `player.country` (verified: `packages/ingest/src/prismaStore.ts:44-62` `upsertPlayerByBdlId` writes only `balldontlieId`/`displayName`/`position`/`teamId`; repo-wide grep finds no `player.country` write), so `p.country` is always null and the `?? p.country` fallback can only ever yield null (it fires only when `p.team` is unlinked, in which case the scalar is also null). The sibling loaders deliberately omit this select — `playerAvatarWiring.test.ts:149` asserts `loadLineup` does NOT contain `country: true`; `loadLineup.ts:68` / `loadDraftRoom.ts:30` use `r.player.team?.name ?? null`.
- **Impact / invariant threatened:** No live bug. Drift: a dead select column + a fallback that can never usefully fire, contradicting the test-pinned `loadLineup`/`loadDraftRoom` convention; future readers may believe the scalar is a real source.
- **Confidence:** **verified**.
- **Fix theme:** drop `country: true` from the waivers `PLAYER_SELECT` and the `?? p.country` fallback so nation derives solely from `team.name`.
- **Effort:** **S**

---

### F-P3-04 · `loadPool` selects and reads the parallel dead `fifa_team.country` scalar via `t.country ?? t.name`

- **Severity:** **P3** (maintainability / drift; no user-visible bug — `team.name` is the working primary)
- **Location:** `apps/web/src/pool/loadPool.ts:38-39,45`
- **Observed:** The match select pulls `homeTeam/awayTeam: { select: { name: true, country: true } }` (`:38-39`) and `team()` returns `code: t.country ?? t.name` (`:45`). This is `fifa_team.country` (a team scalar, sibling of the `player.country` invariant; `schema.prisma:284`), not `player.country`. The ingest team writer never populates it — `packages/ingest/src/prismaStore.ts:29-37` `upsertTeam` writes only `balldontlieId` + `name` (= feed `country_name`) on both branches — so `fifa_team.country` is always null and `t.country ?? t.name` always falls through to `t.name` (the inline comment acknowledges this is the intended path).
- **Impact / invariant threatened:** None (name is the working flag-resolver code). Drift: reads/selects an unpopulated team scalar that mirrors the `player.country` dead-scalar trap; a reader could assume `fifa_team.country` is a real flag source.
- **Confidence:** **verified**.
- **Fix theme:** drop `country: true` from the pool team selects and set `code` straight from `t.name` (the only populated value).
- **Effort:** **S**

---

## 3. Investigation tasks (suspected — confirm with the exact check; do not assert)

> These are the **live-DB / captured-feed / runtime residuals** that gate the live-impact of the P1 findings; they cannot be resolved by static read. Each names the exact operator check. The first six resolve the Pass-1 cross-reference (I-1, I-2, I-3, I-5, I-6/I-7, I-8).

- **I-1 (gates F-P1-02 / Pass-1 F-P1-04):** Is `duels_won` genuinely NULL/absent on the live player feed for the completed June 11–13 fixtures (vs mis-keyed or populated as `SCORING.md:161` claims)? *Check (read-only DB):* `SELECT count(*) AS rows, count(duels_won) AS duels_nonnull, count(aerial_duels_won) AS aerial_nonnull FROM stat_player_match s JOIN fifa_match m ON s.match_id=m.id WHERE m.status='completed' AND m.kickoff_at BETWEEN '2026-06-11' AND '2026-06-14';` — and inspect one stored raw `player_match_stats` payload for `duels_won` vs only `aerial_duels_won`. `duels_nonnull=0` while `aerial_nonnull>0` confirms the bucket fires dead on live data.
- **I-2 (gates F-P1-02 sibling risk):** Is any OTHER promoted §4 column uniformly NULL on live data (a silent dead bucket via the same `?? 0` coalesce)? *Check (read-only DB):* per-column non-null counts on the same completed rows: `SELECT count(shots_on_target), count(ball_recoveries), count(big_chances_created), count(crosses_accurate), count(touches), count(possession_lost) FROM stat_player_match s JOIN fifa_match m ON s.match_id=m.id WHERE m.status='completed' AND m.kickoff_at BETWEEN '2026-06-11' AND '2026-06-14';` Any column reading 0 non-null is a dead scored bucket.
- **I-2b (the duels feed key):** Does the live `player_match_stats` payload deliver the total under the key `duels_won` (what `map.ts:180` reads), or a different key (e.g. `duels_total`)? Does it expose a `ground_duels_won` to enable a `ground+aerial` reconstruction? *Check:* dump one real `FIFAPlayerMatchStats` payload and diff its key set against `mapStatLine` (`map.ts:170-201`) + `STAT_EXTRA_OMIT`; any promoted stat whose feed key is absent is written NULL and recoverable only from `extra`.
- **I-3 (gates Pass-1 F-P1-02; the event-minute null tail):** Does the live feed ever produce a substitute stat line WITHOUT a parseable sub-in `time_minute`? The adapter's `effMinute null→0` (`adapter.ts:109-110`) and `lockInstantFromSub`'s `timeMinute ?? 0` (`lock.ts:60`) both default a null sub minute to minute 0 (conceded charged from kickoff for the sub; lock stamped at kickoff). *Check:* inspect a real `/matches` event payload for substitution incidents with null `time_minute`; cross-check players with `minutes_played>0` who have no parseable `player_in` event minute.
- **I-5 (gates Pass-1 F-P2-05; second-yellow vocabulary):** The code carries `incident_class` verbatim (`map.ts:235`); the classifier is the Pass-1 adapter. Confirm the live `incident_class`/`incident_type` token vocabulary for second-yellow vs straight-red. *Check:* pull distinct `event_match` incident values from the first completed fixtures; confirm second yellows arrive as `yellowRed`/`second*` (handled) and not bare `red`/`redCard` (mis-classified).
- **I-6 (gates F-P1-03 outcome):** Does Prisma 6.2.1 STORE `new Date(NaN)` into the non-nullable `kickoffAt @db.Timestamptz(6)` column, or THROW at write time? This decides whether F-P1-03 manifests as a schedule-tick abort (Prisma throws) or a persisted Invalid-Date that reaches the NaN-fail-open lock gates (Prisma coerces). *Check (throwaway Postgres + this Prisma client):* `prisma.fifaMatch.upsert({ where:{balldontlieId:1}, create:{…mandatory, kickoffAt:new Date('x'), status:'scheduled'}, update:{} })` and observe throw vs stored value; read the row back.
- **I-7 (gates F-P1-03 trigger):** Does the live BALLDONTLIE `/matches` feed ever emit an empty/non-ISO `datetime` (e.g. a TBD knockout slot before the bracket resolves, or a postponed match)? *Check:* grep a captured `/matches` sample for empty/null/non-ISO `datetime`; query for feed `balldontlieId`s present but missing from `fifa_match`.
- **I-8 (gates F-P1-03 status timing):** Does the live feed reliably flip a fixture's `status` to `in_progress` at/near kickoff, or can it lag past `PRE_MATCH_GRACE_MS` (30m, `mode.ts:30`) — leaving a window where neither `pre_match` (grace expired) nor `live` (still `scheduled`) fires? There is **no** kickoff-based force-to-`in_progress` fallback in `decideMatchModes` (it keys purely on `status`). *Check (live):* during a real kickoff, sample `fifa_match.status` vs `kickoff_at` over the first ~30 min; if it lags, a `now>=kickoff ⇒ assume in_progress` fallback is needed (a code change, currently absent).
- **I-9 (gates F-P2-03 reachability):** Is the scrape arm actually inert in prod (vs partially populated)? *Check (read-only DB):* `SELECT count(*) FROM player WHERE sofascore_player_id IS NOT NULL;` and `SELECT count(*) FROM rating_player_match WHERE source='scrape';` — both 0 confirms BALLDONTLIE is the de-facto sole rating source today.
- **I-10 (gates F-P2-04):** What is the REAL Sofascore markup/JSON path + match URL carrying per-player ratings (the current `__SOFA_DATA__` marker and `/event/<id>` URL are explicit placeholders)? *Check:* load one real completed Sofascore match page, locate the per-player rating JSON (likely `__NEXT_DATA__` or an `/api/v1/event/<id>/lineups` endpoint), and confirm/replace `RATING_DATA.open` + the `{players:[{id,rating}]}` shape and `MATCH_URL`.
- **I-11 (gates F-P3-02):** Could two recompute writers ever run concurrently in prod (worker sweep + a manually-launched `job:recompute`, or a second worker instance), exercising the non-atomic check-then-insert? *Check (Render):* confirm only ONE worker instance runs (no horizontal scaling) and `job:recompute` runs only in maintenance windows; `SELECT scope, manager_id, period_id, count(*) FROM recompute_dirty WHERE processed_at IS NULL GROUP BY 1,2,3 HAVING count(*) > 1` to detect any duplicate live markers.

---

## 4. Checks performed (scope target → status + evidence)

Legend: ✅ clean · ⚠️ finding (ID) · 🔎 investigate.

### Poller / scheduler (`apps/worker`)
- ✅ **Cadence selection** (squad/schedule/pre-match/live/settle via pure `decideMatchModes`): rosters on boot + `rostersSyncEveryTicks=1440`; schedule-sync on `scheduleSyncEveryTicks=60` OR any-match-in-live-window; live keyed on `status==='in_progress'`; settle until `hasRating` or `SETTLE_MAX_MS`. Tightens correctly inside `[kickoff-15m, kickoff+3h]`. — `scheduler.ts:74-111`, `mode.ts:34-59`, `config.ts`.
- ✅ **`MatchCtx.now` single per-tick value:** `now=new Date()` set ONCE (`scheduler.ts:92`) and threaded into `anyMatchInLiveWindow`, `pollerSilentMatches`, `sweepCompletedMatchLocks`, every `ctxByBdl` entry, `decideMatchModes`, `matchesNeedingLineupPeek`, FAAB + notify dispatch; `lockSlot` uses the passed-in `now`/`lockedAt`; the only other `new Date()` are bookkeeping, never the lock instant. — `scheduler.ts:92,142-154`.
- ✅ **Idempotent re-poll:** all raw writes upsert on natural keys (no double-write/double-count); scoring sums the single stored row. — `prismaStore.ts:144-219`.
- ✅ **`runRecomputeSweep` overlap safety:** single caller inside the re-entrancy guard; Phase-1 claim is atomic (`updateManyAndReturn` flips `dirty` AND returns keys); `forcedRestate` is a separate, idempotent, convergent process. — `recompute.ts:19-31`, `scheduler.ts:65-69,216`, `prismaStore.ts:363-379`.
- ✅ **Sweep failure handling:** Phase-1 per-key try/catch re-dirties (`markPlayerMatchDirty`) + surfaces to `onPlayerMatchError` + continues (poison row re-fires, never cleared-and-stale); Phases 2/3 clear-on-success. — `recompute.ts:165-199`.
- ✅ **`forcedRestate` cadence:** operator-run only (no Render cron); establishes the full manager×period 0-row baseline the every-tick sweep does not (the Pass-1 F-P1-03 self-heal). — `forcedRestate.ts:88-101`, `render.yaml`.
- ⚠️ **`sweepCompletedMatchLocks` per-match isolation** → **F-P2-02** (window/monotonicity clean; missing per-match try/catch).
- ⚠️ **Kickoff parse not coalesced to `now`** → no `?? now` anywhere (good), but a bad kickoff yields NaN and silently idles the fixture → **F-P1-03**.
- ✅ **Schedule-sync vs live-ingest overlap:** sequential within one re-entrancy-guarded tick; both write `fifa_match` via idempotent upsert — no concurrent corruption. (Per-row guard gap = F-P2-01.) — `scheduler.ts:104-156`.
- ✅ **Draft ticker isolation / interval registration:** separate `setInterval`, own re-entrancy guard, touches only draft tables; clean shutdown. — `index.ts:22-59`, `draft.ts:84-136`.
- 🔎 **I-4 resolved (code side):** no every-tick bulk 0-row baseline enqueue exists (only `forcedRestate`); confirms Pass-1 F-P1-03. **I-8** status-timing = investigate (no kickoff-based force-to-`in_progress`).

### Feed adapter — field map (`packages/feed` + `packages/ingest/src/map.ts`)
- ✅ **3 DROPS not scored** (clearance-off-the-line, run-out, player-level offsides): never read; `offsides` mapped only at TEAM level (unscored). — `map.ts:281-290`, `scorePlayerMatch.test.ts:720-722`.
- ✅ **2 manual lines sourced from the manual layer**, not invented from the feed: `penaltyWon`/`penaltyCommitted` read from `manual_stat_player_match`. — `adapter.ts:363-364`.
- ✅ **dispossessed → `possession_lost` remap** (−1/10): no `dispossessed` read anywhere; `possession_lost` in `STAT_EXTRA_OMIT` (not double-written). — `map.ts:195,137`, `index.ts:241-247`.
- ✅ **5 promoted §4 columns** on typed columns AND in `STAT_EXTRA_OMIT` (not double-written into `extra`), written in both upsert branches. — `map.ts:138-142,196-200`, `map.test.ts:64-132`.
- ✅ **Catch-all `extra`** retains the ~8 un-promoted fields verbatim (nulls kept, future keys preserved); **aerials stay in `extra`, unscored**. — `map.ts:158-167`, `map.test.ts:103-113`.
- ✅ **No §4 line sourced from the wrong key:** player `blocked_shots` (scored) vs team `shots_blocked` (unscored) are distinct keys on distinct types; `crosses_accurate` not `crosses_total`. — `map.ts:190,287,199`.
- ✅ **Nested-vs-flat trap handled per mapper:** `mapStatLine` flat (`f.player_id`), `mapEvent` nested via `refId` (fails loud on old flat ints), `mapMatchRow` nested team/stage/referee, `mapShot` `time_minute`, `mapTeamStat` `possession_pct`. — `map.ts:172-243,270,288`.
- ⚠️ **duels source** → single `duels_won` key, no reconstruction → **F-P1-02**. **I-1/I-2** = live-DB residual.

### Feed adapter — NULL handling + parse robustness
- ⚠️ **NULL handling per scored column:** map preserves null (`?? null`), adapter erases (`?? 0`) uniformly → silent dead bucket → **F-P1-02** (root asymmetry folded in).
- ✅ **Scoring never reads `stat_player_match.extra`** (contract holds; `buildScoreInput` reads only typed columns). — `adapter.ts:320-373`.
- ⚠️ **Kickoff parse** unvalidated at the map boundary; NaN fails closed-silent (mode drop) + open (lock gates) → **F-P1-03**.
- ✅ **Sub-entry time null handling** is conservative: `timeMinute ?? 0 → lock at kickoff` (earlier than reality, never later — no dangerous mis-lock). The conceded-from-0 attribution on a null sub minute is an adapter-lane concern (Pass-1 F-P1-02; Investigation I-3). — `lock.ts:60`, `map.ts:237-238`.
- ✅ **Upsert shapes idempotent / dedup on re-poll:** every raw table upserts on its real natural key — replay-safe, overwrite-not-append. — `prismaStore.ts:144-219`, `schema.prisma`.
- ⚠️ **`mapMatchRow` match id unvalidated** → **F-P3-01**.

### Ingestion writes (`packages/ingest`)
- ✅ **`upsertStatLine` replay-safe:** single `data` object (incl. all 5 promoted cols + `extra` + `dirty:true`) spread into both create + update — create/update can never diverge; `extra` symmetric (`DbNull`). — `prismaStore.ts:110-148`.
- ✅ **`upsertEvent`/`upsertShot`/`upsertTeamStat`/`upsertRatingBalldontlie`/`upsertLineupEntries`** all natural-key upserts, single `data` both branches — no double-insert on a re-sent id. — `prismaStore.ts:151-269`.
- ✅ **`markStatPlayerDirty` no-dup / no-clobber:** `STAT_DIRTY_UPDATE = {dirty:true}` only; upsert on the PK — a flag FLIP, not an append; re-marking stays true and never resets a stat column; `dirty.test.ts` asserts the update keys are exactly `['dirty']`. — `packages/db/src/dirty.ts:10-22`, `prismaStore.ts:222-231`.
- ✅ **Write order + foreign-event guard:** the `row.matchBdlId !== ctx.bdlId` guard runs BEFORE any write; dirty enqueued AFTER all writes via `markPlayersDirty([...touched])` (the per-tick Set dedups; double-marking the same player is idempotent). — `ingest.ts:158-251`.
- ⚠️ **`upsertMatch` `kickoff_lock_fallback` reset** → **F-P1-01** (the rest of the match column set is a clean feed-refresh).
- ⚠️ **`ingestSchedule` / `ingestRosters` per-row isolation** → **F-P2-01**.

### Player-card derivation (`packages/player-box` + `apps/web` loaders)
- ✅ **`buildPlayerBox` + `loadPlayerBox`:** nation from `player.nation` / `player.team?.name`; no raw scalar selected. — `player-box/types.ts:10-21`, `buildPlayerBox.ts:202`, `api/player-box/loadPlayerBox.ts:30-126`.
- ✅ **`loadDraftRoom` / `loadLineup` / `loadVsField`:** all select `team:{name:true}` only and map `country/nation: …team?.name ?? null`; test-guarded (`playerAvatarWiring.test.ts:149`). — `loadDraftRoom.ts:30`, `loadLineup.ts:68`, `loadVsField.ts:130,184`.
- ✅ **Downstream `.country` reads** (`Dashboard.tsx:250`, `theaterView.ts:130`, `playoffs/components.tsx`, `board.ts:117-119`, `playerTournamentStats`) all read the *mapped* view-model `country` (= `team.name`), not a Prisma row scalar.
- ✅ **No ingest/provision write to `player.country`:** `upsertPlayerByBdlId` sets only `balldontlieId`/`displayName`/`position`/`teamId`; feed `country_name` routes into `fifa_team.name`; provision CLI writes only `defaultRank`. — `prismaStore.ts:44-62`, `ingest.ts:79`, `provision/cli.ts:255,434`.
- ⚠️ **`loadWaivers` dead `player.country` read** → **F-P3-03**.
- ⚠️ **`loadPool` dead `fifa_team.country` read** → **F-P3-04**.

### Scraper (`apps/scraper` + `packages/scrape`)
- ⚠️ **Selector fragility:** single hardcoded placeholder marker, no fallback → **F-P2-04**.
- ✅ **Fallback precedence NOT inverted:** `DEFAULT_RATING_SOURCE_PRIORITY = [manual, scrape, balldontlie]`; `pickRating` returns the first non-null; `writeScrapeRating` hardcodes `source:'scrape'`; `compare.ts` is QUALITY math only (does not touch the resolver); the adapter feeds `rating_player_match` rows into `pickRating`. — `shared/constants.ts:11-15`, `resolver.ts:28-38`, `recompute/prismaStore.ts:63-66,85-87`, `resolver.contract.test.ts`.
- ✅ **Identity by stored id only:** `resolveTarget` returns null unless BOTH stored Sofascore ids are present; `listScrapeCandidates` filters on `sofascorePlayerId != null`; name-matching lives only in the one-time `populate` CLI, never in the scrape tick. — `resolveTarget.ts:16-19`, `prismaStore.ts:20-49`.
- ✅ **Rating write idempotency + re-dirty:** upsert on `(matchId, playerId, source)` — overwrite not append; calls the shared `markStatPlayerDirty` no-clobber seam. — `prismaStore.ts:54-61`.
- ✅ **Partial/malformed-scrape:** marker/parse miss → null → no row written → BALLDONTLIE fallback intact; per-match try/catch isolation; NaN cannot arrive via `JSON.parse`. — `extract.ts:22-34`, `scraper.ts:25-41`.
- ✅ **Isolation:** `@app/scraper` imports `@app/scrape` + `@app/db` only (never `@app/ingest`); per-match + tick-level guards; outage degrades to fallback. — `wiring.ts:10-19`, `index.ts:18-33`.
- ⚠️ **Range validation** absent on the extracted rating → **F-P2-05**.
- ⚠️ **PRIMARY arm structurally inert** (empty index + placeholder selector + unwired launcher) → **F-P2-03**; **wrong-row permanence** → **F-P2-06**. **I-9/I-10** = operator residuals.

---

## 5. Out of scope for this pass

Covered by Pass 1 (P0 integrity, `AUDIT_2026-06_p0_integrity.md`) and the planned surface/platform pass (`CODE_PROMPT_56`):

- **Lock predicate / write-boundary correctness** (the `lockSlot` choke point, `isLockWriteAuthorized`, the DB trigger, the three 2026-06 incident classes) — Pass 1 (PASS). This pass audited the **data-write** angle of ingestion, not lock-correctness, except where a feed-parse defect (F-P1-03) feeds the lock now-gates.
- **The FAAB D4 participant gate** (Pass-1 **F-P0-01**), the **scoring engine math** (all §4 rates / §8 cards / §6 conceded — Pass 1 PASS), the **sub on-pitch / conceded-from-0** attribution bug (Pass-1 **F-P1-02**; this pass notes only the feed-side null-sub-minute tail, Investigation I-3), and the **all-play-all 0-row baseline** (Pass-1 **F-P1-03**; confirmed no every-tick bulk enqueue here, I-4).
- **The `league.status` web-read contract** (Pass-1 **F-P2-02**), **RLS / browser-direct-read policy completeness**, **auth / route-gate hardening**, the **FA-grant 409 gate**, and UI/affordance rendering — the surface/platform pass (`CODE_PROMPT_56`).
- **Not audited here:** draft controller internals, notifications, pool/pick'em scoring, vsfield box-score, the recompute guillotine/standings math beyond the dirty-enqueue write path, and any runtime/operational verification (no app/DB/network/feed/scraper was executed). The live-data confirmations that gate F-P1-02 / F-P1-03 (and Pass-1 I-1…I-8) are enumerated as operator residuals in §3.
