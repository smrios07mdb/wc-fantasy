# AUDIT — Pass 1: P0 live-state integrity (READ-ONLY)

- **Date:** 2026-06-16
- **Scope:** code paths whose failure corrupts the live tournament — scoring (`packages/scoring`), recompute (`packages/recompute`), locking/ingest (`packages/ingest`, `packages/shared`), lineup (`packages/lineup`), FAAB (`packages/faab`), DB invariants (`packages/db`), and the web read sites (`apps/web`). Worker apply paths (`apps/worker/src/commish`, `apps/worker/src/faab`) audited where they own a P0 invariant.
- **Method:** static read of source only (no app/build/server/DB/network). 8 scope auditors traced each path end-to-end against the locked contracts in `SCORING.md` / `DECISIONS.md` / `ARCHITECTURE.md` / `PROJECT.md`; every finding was then re-read by an independent adversarial verifier. Three P0/P1 candidates (FAAB D4 gate, kickoff parse, duel-NULL) were additionally hand-traced.
- **Constraint compliance:** report-only; no source/test/config/migration/brain file was modified; no git action taken. On completion the only new working-tree file is this report (`git status` shows it plus the three pre-existing `prompts/CODE_PROMPT_5*.md` files the user created).

---

## 1. Summary

### 1a. Findings by severity

| Severity | Count | IDs |
|---|---|---|
| **P0** | 1 | F-P0-01 |
| **P1** | 4 | F-P1-01, F-P1-02, F-P1-03, F-P1-04 |
| **P2** | 6 | F-P2-01, F-P2-02, F-P2-03, F-P2-04, F-P2-05, F-P2-06 |
| **P3** | 4 | F-P3-01, F-P3-02, F-P3-03, F-P3-04 |
| **Refuted** (raised then overturned by verification) | 1 | R-01 |

Of the 15 standing findings: **11 verified** (read end-to-end), **4 carry a `suspected` element** that needs a live-data check (F-P1-02 trigger likelihood, F-P1-04 live premise, F-P2-05 feed vocabulary; F-P1-03's transience). No P0/P1 asserts an unread root cause.

### 1b. Invariant roll-up

| Domain | PASS | FAIL | INVESTIGATE |
|---|---|---|---|
| Scoring engine math (§4 rates, §8 cards, §6 conceded, aerials-unscored, floor) | 9 | 0 | 0 |
| Scoring on **live data** (buckets actually fed) | 0 | 1 (duels) | 0 |
| Participant / conceded / dirty-sweep (recompute) | 7 | 1 (sub on-pitch window) | 1 (standing baseline) |
| Lock predicate + write boundary + reconcile/sweep | 7 | 1 (kickoff Invalid-Date validation) | 0 |
| Lineup forfeit / one-way door | 6 | 0 | 0 |
| FAAB ledger | 9 | 1 (D4 batch gate) | 0 |
| Guillotine / standings / apply | 8 | 0 | 0 |
| DB constraints / triggers | 6 | 0 | 0 |
| `league.status` consumers (web-never-reads) | 0 | 1 (loadWaivers) | 0 |

**Headline:** the single **P0 (F-P0-01)** is a severed wire — the FAAB **D4 non-advancer gate** is loaded into the batch context and supported by the resolver, but the cron controller never threads it through, so during the **playoff phase** an eliminated manager's still-pending bid resolves normally and can out-bid a surviving manager. It is dormant during the current group stage and becomes live-reachable the instant the playoff phase begins. Fix is one line plus a regression test (Effort S).

The scoring **engine** is correct on every rate and the card/conceded ladders (all PASS). The lock **write boundary** (`isLockWriteAuthorized` + single `lockSlot`) and the **DB trigger** correctly close the three documented 2026-06 incident classes (premature, cross-match, under-stamping). The live exposure now sits at the **edges**: feed→engine mapping (duels), the dirty-sweep's standing baseline, the sub on-pitch window, and the kickoff Invalid-Date fail-open.

---

## 2. Findings

### F-P0-01 · FAAB D4 participant gate is loaded but never threaded into the batch resolver — an eliminated playoff manager's pending bid can WIN

- **Severity:** **P0** (corrupts live FAAB/roster state; playoff-phase-scoped, currently dormant)
- **Location:**
  - `packages/faab/src/controller.ts:46-52` (the severed call site)
  - `packages/faab/src/prismaStore.ts:188-206` (`participantManagerIds` computed + returned in `BatchContext`)
  - `packages/faab/src/resolve.ts:137,149-151` (gate present; `!= null` defaults off)
  - `packages/faab/src/store.ts:36` (field is optional on `BatchContext`)
  - `apps/worker/src/commish/advance.ts:17` (documents reliance on the gate)
  - `apps/worker/src/faab/dispatch.ts:45` (sole cron caller → `runFaabBatch`)
- **Observed:** `loadBatchContext` correctly computes `participantManagerIds = league.status === "playoff" ? new Set(playoffEntry WHERE status='alive') : null` and returns it on the context. `resolveFaabBatch` reads it and, in the pre-loop split, voids+refunds any bid whose manager is not in the set (`const nonParticipant = participantManagerIds != null && !participantManagerIds.has(b.managerId)`). **But the controller's call site builds the resolver input as `{ now, managers: ctx.managers, bids: ctx.bids, ownedByLeague: ctx.ownedByLeague, rosterCap: ctx.rosterCap }` — it never reads `ctx.participantManagerIds`.** The field is optional, so the resolver receives `undefined`; `undefined != null` is `false`, so `nonParticipant` is `false` for every bid and the D4 void is dead on the only production batch path. `advance.ts:17` explicitly assumes this gate fires ("no FAAB write — the D4 gate auto-excludes `eliminated` holders"), so `applyRoundCut` deliberately leaves a cut manager's pending `faab_bid` rows in place, trusting the next batch to skip them. Git archaeology: commit `5ba2abb` ("D4 non-advancer participant gate") added the resolver branch, the store load, and the resolver unit test, but `controller.ts` was last touched by the earlier `cbfe8b4` and was never updated; every controller/dispatch test omits the field (`controller.test.ts:139-145`), so nothing caught it.
- **Impact / invariant threatened:** Violates the locked D4 invariant ("a non-participant (playoff & not alive) has bids voided"). In the playoff phase, a manager eliminated by a guillotine cut keeps any bid that was pending at cut time; at the next per-period batch (R16/QF/SF/Final window) it competes and can WIN — debiting the eliminated manager's budget, adding a player into the active `roster_player` pool, and (the real harm) **out-bidding a still-alive survivor** for a contested player by amount-then-waiver order. Fires automatically on the normal cron path with no operator action.
- **Confidence:** **verified** (hand-traced `loadBatchContext` → `controller` → `resolve`, including the `!= null` loose-equality default; corroborated by the independent auditor + verifier and git history).
- **Fix theme:** thread `ctx.participantManagerIds` into the `resolveFaabBatch(...)` call in `runFaabBatch`; add a controller/dispatch test that loads a playoff context with an eliminated manager and asserts the batch voids+refunds their bid.
- **Effort:** **S**

---

### F-P1-01 · Kickoff parse is unvalidated; the pure lock guards fail OPEN on Invalid Date (NaN) — shielded in prod only by Prisma's incidental write-time throw

- **Severity:** **P1** (latent premature-lock + active silent match-level data loss; not P0 only because Prisma currently throws on the bad write)
- **Location:** `packages/ingest/src/map.ts:325-326` · `packages/feed/src/types.ts:69-70` · `packages/ingest/src/prismaStore.ts:70` · `packages/ingest/src/lock.ts:41,62,83,134` · `packages/shared/src/lock.ts:11` · `packages/db/prisma/schema.prisma:356` · `apps/worker/src/scheduler.ts:105-110` · `packages/ingest/src/map.test.ts:363`
- **Observed:** `mapMatchRow` assigns `kickoffAtIso: f.datetime` verbatim with no `requireString` guard (`map.test.ts:363` passes `datetime:"x"` and the mapper accepts it). `upsertMatch` then does `new Date(row.kickoffAtIso)` → `Invalid Date` for garbage input. Every temporal guard fails **open** on a `NaN` time: `lock.ts:41/62/83` gate on `now.getTime() < kickoffAt.getTime()` and `n < NaN` is `false`, so none returns early; `isLockWriteAuthorized`'s now-gate `lockedAtMs > nowMs` is `NaN > n` = `false`, so `before-instant` does not fire; `isLockedNow` reads `NaN <= now` = `false`, so a non-NULL NaN `locked_at` would read **unlocked yet un-relockable** (the monotonic `WHERE locked_at IS NULL` never matches it again). The only thing preventing live corruption is that `kickoffAt` is `NOT NULL @db.Timestamptz(6)` and Prisma 6 serializes via `.toISOString()`, which throws `RangeError` on Invalid Date, so `upsertMatch` throws.
- **Impact / invariant threatened:** Two effects. (1) **Latent premature-lock** — the invariant "never stamp before the instant" does NOT actually hold for NaN in the pure layer; it is one store change away from live corruption (the in-memory store at `memoryStore.ts:159` accepts any kickoff; any future store that coerces rather than throws would stamp a not-yet-kicked-off match). (2) **Active operational/scoring** — a fixture with an empty/garbage feed `datetime` is dropped entirely from `fifa_match` behind an opaque `ingest.schedule.error`, so its players never score, invisible to the test suite (the memory store never parses kickoff). *Verifier corrections (do not overturn the finding):* the parenthetical "unlike id/match_id which use requireNumber" is wrong for `mapMatchRow` (`f.id` at `map.ts:325` is equally unguarded); and the blast radius is wider than one match — `ingestSchedule` has no per-row try/catch, so a throw aborts the **entire schedule sync for that tick** (every fixture after the bad row in `res.data`), though the worker tick itself survives.
- **Confidence:** **verified** (NaN fail-open confirmed at every cited guard; Prisma-throw shield confirmed via schema NOT-NULL + Prisma 6.2.1).
- **Fix theme:** validate kickoff at the map boundary (`requireString` + reject/skip non-finite `Date`) and make the temporal guards NaN-safe (treat a NaN kickoff/lockedAt as "not yet" = deny) so the invariant holds in the pure layer instead of relying on Prisma's incidental throw.
- **Effort:** **S**

---

### F-P1-02 · A substitute with no matching sub-in event is charged goals-conceded from minute 0

- **Severity:** **P1** (per-player score corruption → asymmetric standings impact; trigger conditional on feed shape)
- **Location:** `packages/recompute/src/adapter.ts:153,157,204,249` · `packages/scoring/src/index.ts:206-217`
- **Observed:** `onPitchWindow` seeds `entry = 0` ("starters are on from kickoff — no sub-in event") and only advances `entry` when an event has `e.playerInId === playerId` (`adapter.ts:157`) — there is no minutes-based fallback. The participant gate `playerAppearedInMatch` returns true on a real (non-stub) stat line alone (`statHasData`), with no requirement that a substitute also carry a sub-in event. `goalsConcededWhileOn` then counts every conceded goal with `effMinute ∈ [entry=0, exit=∞]`, and the engine charges GK/DEF `-floorPer(goalsConcededWhileOn, 1)` (= −1 per goal) regardless of minutes. So a genuine substitute who produced a stat line but whose substitution event is **missing/unparseable** in the feed is treated as on-pitch from kickoff and over-charged for goals conceded **before** he entered.
- **Impact / invariant threatened:** A GK/DEF substitute over-charged conceded goals corrupts his player-match score and the manager's period total, and thereby the all-play-all record / seed (an **asymmetric** error — affects only the team that fielded such a sub). Mechanically real in the code; whether it fires depends on the live feed ever emitting a sub stat line without a matching sub-in event (MEMORY `feed-shape-nested` flags the non-event mappers as UNVERIFIED, so the precondition is plausible but unconfirmed).
- **Confidence:** **verified** (mechanism, end-to-end) / **suspected** (live trigger likelihood — see Investigation I-3).
- **Fix theme:** infer a substitute's entry minute from minutes-played (or require a sub-in signal) when no substitution event is present, rather than defaulting on-pitch from minute 0.
- **Effort:** **M**

---

### F-P1-03 · Dirty-driven standings can silently exclude a manager from a period's all-play-all (no baseline 0-row guarantee)

- **Severity:** **P1** (transient seeding/guillotine corruption between ticks; self-heals on forced restate)
- **Location:** `packages/recompute/src/recompute.ts:81-83,121-126` · `packages/recompute/src/prismaStore.ts:311-318` · `packages/recompute/src/standing.ts:108-111` · `apps/worker/src/jobs/recompute.ts` (`forcedRestate.ts:74-98`)
- **Observed:** On the live every-tick path, a `(manager, period)` marker is created **only** by `recomputePlayerMatch → getAffectedManagerPeriods → enqueueManagerPeriodDirty` — i.e. only for managers who rostered a player that actually produced a `score_player_match` row. `recomputeStanding` reads `getManagerPeriodScores(periodId)` = a plain `scoreManagerPeriod.findMany({ where: { periodId } })` with **no left-join over managers**, returning only existing rows. `computeStandings`/`comparePeriodPairwise` then compare exactly the managers present. A manager who set no lineup (or whose entire XI failed to appear) never gets a `score_manager_period` row in the dirty path, so he is **absent** from the period rather than present as a 0 — neither charged losses nor handing free wins to those who outscored him. Only `forcedRestate` (`job:recompute`) writes a 0 row for every manager×period (`forcedRestate.ts:95-98`). `standing.ts:110-111`'s own comment and `standing.test.ts:63-69` both assume the 0-row baseline exists, which the dirty path does not guarantee.
- **Impact / invariant threatened:** Threatens the all-play-all completeness invariant. Between ticks, active managers' cumulative W is under-counted relative to an absent manager, so seeding — and the guillotine cut that reads it — can be wrong until the commissioner runs the forced restate. Standings are documented as "current-state provisional," so this is a transient correctness/under-counting bug, not permanent data loss; P1 is appropriate because seeding/guillotine can read wrong values between ticks.
- **Confidence:** **verified** (read end-to-end) — the only residual question is the operational cadence of `job:recompute` in prod (Investigation I-4).
- **Fix theme:** guarantee a per-period baseline `score_manager_period = 0` row for every league manager (bulk-enqueue all managers at lock/kickoff, or left-join managers→0 in the standing read) so the dirty sweep matches `forcedRestate`.
- **Effort:** **M**

---

### F-P1-04 · Duels are a dead scored bucket on live data — `duels_won` is NULL on the completed fixtures, so the "+1 per 3" rule scores nothing

- **Severity:** **P1** (active deviation from SCORING.md §4, but **league-symmetric** — every manager loses the same line, so it does not skew relative standings)
- **Location:** `packages/scoring/src/index.ts:138` · `packages/recompute/src/adapter.ts:102,337` · `packages/ingest/src/map.ts:17,180` · `packages/feed/src/types.ts:173-176` · `SCORING.md:161-166`
- **Observed:** End-to-end on the duel-NULL case: the BALLDONTLIE feed carries `aerial_duels_won/_lost` but (per the audit premise for the completed June 11–13 fixtures) not `duels_won/_lost`. The ingest mapper does `duelsWon: n(f.duels_won)` where `n = v ?? null` → the column is stored NULL. The recompute adapter does `duelsWon: n(s?.duelsWon)` where `n = v ?? 0` → NULL is coalesced to 0. The engine does `add(C.duels, floorPer(input.duelsWon, 3), …)` = `floor(0/3) = 0`, and `add` omits any 0-point line. Net: the duels bucket emits nothing for any player in any completed match. The engine has **no guard** distinguishing "feed sent 0 duels" from "feed sent nothing," and `SCORING.md:161-166` claims `duels_won` was verified-populated (ground+aerial total) against a 51-row live sample — directly contradicting the live-NULL state the prompt reports. Root cause is a **feed-mapping gap** (`duels_won` not populated / not reconstructed from the aerial split), not engine math; aerials are correctly routed to `stat_player_match.extra` and stay unscored (AERIALS-not-double-counted invariant PASS).
- **Impact / invariant threatened:** The locked "Duels won +1/3 (all positions)" rule is currently inert on completed fixtures — midfielders/defenders/forwards are uniformly under-scored on a real category. Because the loss is symmetric across all managers it is not a relative-standings corruption, but it is a real, active deviation from the §4 contract and masks missing feed data as legitimate zeros.
- **Confidence:** **verified** (the null→0→0 mechanism, read end-to-end) / **suspected** (the live premise that `duels_won` is truly NULL — taken from the prompt; not independently observable without DB/feed access, see Investigation I-1).
- **Fix theme:** reconcile the duels feed-mapping gap (confirm which live field carries total duels; likely needs a `ground+aerial` reconstruction or a `duels_won` source fix in `map.ts`), then re-dirty + restate; consider making feed-absent (null) distinguishable from true-0 so dead buckets are observable.
- **Effort:** **M**

---

### F-P2-01 · No batch-path test exercises the D4 participant void — the gate is covered only at the pure-resolver level

- **Severity:** **P2** (test-coverage gap; this is *why* F-P0-01 shipped undetected)
- **Location:** `packages/faab/src/controller.test.ts:72-167` · `apps/worker/src/faab/dispatch.test.ts` · `packages/faab/src/resolve.test.ts:450-473`
- **Observed:** The only D4 coverage (`resolve.test.ts:455-463`) calls `resolveFaabBatch` directly **with** `participantManagerIds` and asserts the void. `controller.test.ts` never constructs a participant set (its store double seeds no `playoffEntry` concept and its manual `resolveFaabBatch` call omits the field), and `dispatch.test.ts` covers only due-period selection + once-per-tick clearing. The test boundary is drawn one layer below the severed wire, so the suite stays green.
- **Impact / invariant threatened:** Latent — the missing assertion is why the P0 shipped and why a future controller refactor could silently re-drop the field. The in-memory double *does* return `participantManagerIds` (`memoryStore.ts:106`), so it can reproduce the bug.
- **Confidence:** **verified**
- **Fix theme:** add a controller (and ideally dispatch) test that loads a playoff context with an eliminated manager and asserts the batch voids+refunds their bid.
- **Effort:** **S**

---

### F-P2-02 · `loadWaivers` reads `league.status` to gate FAAB affordances / roster-cap — the one web `league.status` read (contract says the web must never)

- **Severity:** **P2** (contract drift + a fail-open display default; not a corruption path, not the route gate). *Independently surfaced by two auditors (web-readsites and recompute-guillotine).*
- **Location:** `apps/web/app/waivers/loadWaivers.ts:79-82,269-275,295` · `packages/faab/src/prismaStore.ts:680-694` (`loadIsPlayoffParticipant`) · `packages/shared/src/constants.ts:70-72` (`rosterCapForLeagueStatus`)
- **Observed:** `loadWaivers` selects `league.status`, then `const leagueStatus = league?.status ?? "draft"` drives `isPlayoffPhase`, `rosterCap` (15 group / 9 playoff), and the D4 participant affordance via `loadIsPlayoffParticipant`. This is the **only** literal `league.status` read anywhere in `apps/web` (every other hit is a comment or the `loadPlayoffs.contract.test.ts:77` assertion of its absence). `DECISIONS.md:2519` states verbatim that the web never reads `league.status` (a worker concern; route gate = data-existence). This read is an **affordance/display** read, not a route gate — `/waivers` routing is `getSessionManager` + null-view, and the authoritative correctness gates (submit-time budget cap, D4 `participantManagerIds` void, total roster cap) live on the write path in `@app/faab` (`resolveFaabBatch` / `handleSubmitBid`), which re-derive against live `league.status` independently.
- **Impact / invariant threatened:** No live-correctness corruption — a stale/wrong read-model status only mis-renders the cap label or shows/hides an affordance; a rejected bid still fails server-side. The `?? "draft"` fallback is a fail-open display default (a missing league row silently shows the 15-man group cap and treats everyone as a participant). The real issue is the invariant "web never reads `league.status`" is **FALSE as written** for the live code, and future readers may cite this precedent for an actual route gate. (Note: the FAAB release store at `prismaStore.ts:716,720` and `constants.ts:63` also treat `league.status` as the intended cap driver — the lock was applied to the `/playoffs` surface but never propagated to the FAAB/waivers/release surface.)
- **Confidence:** **verified**
- **Fix theme:** reconcile contract vs. code — either narrow the invariant to "web never *routes/gates* on `league.status`" (a display-cap read is allowed) or move the cap/participant derivation onto the same data-existence signal (`alive playoff_entry` presence) the `/playoffs` loader uses.
- **Effort:** **M**

---

### F-P2-03 · `saveLineup` trusts caller-supplied `voidPlayerIds` without re-deriving `hasPlayed` — a non-controller caller could void an unplayed slot

- **Severity:** **P2** (defense-in-depth gap; no live corruption — both in-tree callers build the set correctly)
- **Location:** `packages/lineup/src/prismaStore.ts:147-156` · `packages/lineup/src/store.ts:50-53` · `packages/lineup/src/controller.ts:69-74` · `apps/worker/src/commish/lineup.ts:134`
- **Observed:** `validateLineup` proves the forfeit legal and the controller computes `voidPlayerIds` as the intersection `s.hasPlayed && s.isStarter && !starters.has(id) && forfeitConfirmed.has(id)`. But `saveLineup` consumes `commit.voidPlayerIds` verbatim — the void branch's only WHERE predicate is `voidedAt: null` (idempotency); it never re-checks `hasPlayed` or that the slot was a starter. The DB trigger enforces only *destination* invariants (voided immutable, voided cannot start, the single forfeit transition) — it does not require the slot to have played before being voided. The two in-tree callers (`controller.ts`, and `commish/lineup.ts` which passes `[]`) are the only writers and both build the set correctly.
- **Impact / invariant threatened:** No live corruption today. Latent: a future caller or a refactor of the controller filter could stamp `voided_at` on a player who never played — a permanent, irreversible forfeit (one-way door, no un-void) of a slot that earned/could earn points.
- **Confidence:** **verified**
- **Fix theme:** re-assert the forfeit precondition (played + currently-starter) inside `saveLineup`, not only in the caller.
- **Effort:** **S**

---

### F-P2-04 · Stale-orphan starter scoring is a documented-but-open seam — `saveLineup` never deletes orphan slots; recompute scores by `(manager,period)` with no roster-active join

- **Severity:** **P2** (benign today; correctness landmine for the playoff add/drop window)
- **Location:** `packages/lineup/src/prismaStore.ts:117-125` · `packages/lineup/src/memoryStore.ts:163-165` · `packages/recompute/src/prismaStore.ts:234-256`
- **Observed:** `commit.desired` is the current active squad (`loadLineupContext` reads `roster_player WHERE dropped_at IS NULL`), and the apply loop iterates only `commit.desired`, so a slot for a later-dropped player is left as an orphan (TODO at `prismaStore.ts:117-125`). `recompute.getManagerPeriodSlots` reads `lineupSlot WHERE {managerId, periodId}` selecting `isStarter` with **no `roster_player` join**, so a stale starter row would still score. Benign now: through the group stage the squad is fixed at 15 (`dropped_at` always NULL) and there is no add/drop write path through `saveLineup`; the actual FAAB drop path (`faab/src/prismaStore.ts` → `releaseDroppedPlayerSlots`) DELETEs the *unlocked* slot in its own tx (locked dropped slots are intentionally retained for historical scoring).
- **Impact / invariant threatened:** No live corruption today. If a mid-period add/drop write path is added that does NOT route through `releaseDroppedPlayerSlots`, a dropped starter's stale `lineup_slot` would keep contributing to `score_manager_period` because recompute has no roster-active gate.
- **Confidence:** **verified**
- **Fix theme:** reconcile orphan slots in `saveLineup` (delete unlocked rows absent from `desired`) before the playoff add/drop path ships, or add a `roster_player WHERE dropped_at IS NULL` gate in recompute.
- **Effort:** **M**

---

### F-P2-05 · `classifyCard` maps a bare "red" event to a straight red — a second-yellow dismissal whose feed event lacks an explicit second-marker would be mis-banded

- **Severity:** **P2** (mis-attributed discipline points on live scoring **if** the feed shape allows it)
- **Location:** `packages/recompute/src/adapter.ts:123-134,301` · `packages/ingest/src/map.ts:235`
- **Observed:** `classifyCard` classifies `second_yellow` only when the label contains `second`/`yellow2`/`2ndyellow` OR carries BOTH yellow and red; otherwise a label containing `red` classifies as a straight red (`−4/−3/−2`). The function header carries a verbatim `TODO(confirm): verify match_events.incident_class labels against first live data`. If the feed emits a second-caution dismissal as a plain "red card" incident with no yellow/second token, it would be scored as a straight red — missing the stacked first-yellow `−1` and applying the wrong minute ladder (`−4/−3/−2` instead of `−3/−2/−1`). The engine's *handling* of a correctly-classified second yellow is PASS (it stacks the `−1` and bands on effective minute); the risk is purely in the classifier's input mapping.
- **Impact / invariant threatened:** Per-incident discipline-point error (small magnitude, but a directly-wrong live score) for any second-yellow dismissal the feed labels as a bare red. Threatens §8 card fidelity at the feed boundary.
- **Confidence:** **suspected** — the only card vocabulary visible in source is the test fixtures `yellowRed`/`redCard`/`secondYellow` (Sofascore `incidentClass`), and a Sofascore second yellow arrives as `yellowRed`, which the `yellow && red` branch catches correctly. No source evidence shows a real feed emitting a bare "red" token for a second caution; available evidence (`yellowRed`) actually contradicts the trigger. Needs live-vocabulary confirmation (Investigation I-5).
- **Fix theme:** confirm the live `incident_class`/`incident_type` token vocabulary and tighten the second-yellow-vs-straight-red classifier against real feed labels.
- **Effort:** **S**

---

### F-P2-06 · Self-heal unlock keys on ANY scheduled team-match in the period, not the specific lock-source fixture — a multi-match period could unlock a played slot

- **Severity:** **P2** (latent; cannot trigger in the single-match-per-period WC structure)
- **Location:** `packages/db/prisma/migrations/20260612220000_lineup_lock_scheduled_unlock/migration.sql:67-83`
- **Observed:** The `(S)` self-heal branch permits clearing `locked_at` (set→NULL) when `EXISTS` a `fifa_match m` with `m.period_id = NEW.period_id AND (m.home_team_id = p.team_id OR m.away_team_id = p.team_id) AND m.status = 'scheduled'`. It binds on team-in-period + `scheduled`; it does **not** verify the scheduled match is the same fixture that stamped this slot's lock, nor that no *non-scheduled* team-match exists in the period. The comment assumes exactly one such match. Per the schema (`periodId` = one structural matchday; a team plays one match per matchday) this holds in normal WC data, so only a genuine future-fixture (premature) lock matches.
- **Impact / invariant threatened:** No live corruption in the single-match-per-period structure. Latent: if a period ever held both a completed and a scheduled match for the same team (a postponed-then-replayed fixture sharing a period, or a mapping error), the self-heal would clear a legitimately-played lock, re-opening the hindsight-edit hole the latch exists to close. The embedded migration self-test only exercises the one-match-per-team case, so it would not catch this.
- **Confidence:** **verified**
- **Fix theme:** tighten the self-heal `EXISTS` to bind the unlock to the slot's actual lock-source fixture (or require that NO non-scheduled team-match exists in the period), not merely the existence of any scheduled team-match.
- **Effort:** **S**

---

### F-P3-01 · `duelsLost` (and `dribblesAttempted`/`passesTotal`/`longBallsTotal`) are mapped + persisted but never read by the engine (dead fields)

- **Severity:** **P3** (maintainability/drift; no scoring impact)
- **Location:** `packages/scoring/src/types.ts:34` · `packages/recompute/src/adapter.ts:338` · `packages/scoring/src/index.ts:138`
- **Observed:** `ScoreInput.duelsLost` is declared and mapped by the adapter (and persisted), but `rg duelsLost packages/scoring/src/index.ts` returns zero hits — the engine scores only `duelsWon`. The same holds for `dribblesAttempted`/`passesTotal`/`longBallsTotal` (only the `*Completed`/`*Accurate` variants are bucketed). Per `SCORING.md` this is *correct* (only "duels won" is a scored stat; the `_lost`/aerial/total variants are reference-only) — so it is not a spec gap, just unused surface.
- **Impact / invariant threatened:** None functionally. A future editor could mistake `duelsLost` for a scored input, and its presence slightly masks F-P1-04 (it suggests duels data flows through when neither half is scored on live data).
- **Confidence:** **verified**
- **Fix theme:** drop the unused `*Lost`/`*Total`/`*Attempted` fields from `ScoreInput`, or annotate them explicitly as context-only non-scored inputs.
- **Effort:** **S**

---

### F-P3-02 · `lockSlot` choke point is correct (no defect) — but the "at most one period-scoped slot" justification is wrong; slots are per-manager

- **Severity:** **P3** (documentation correctness; the security property is sound)
- **Location:** `packages/ingest/src/prismaStore.ts:250-313` · `packages/ingest/src/lock.ts:132-145` · `packages/ingest/src/lockBoundary.test.ts:16-46` · `packages/db/prisma/schema.prisma:474`
- **Observed:** `lockSlot` resolves the source match + player, calls `isLockWriteAuthorized` (deny on no-period / before-instant / status-not-in-play / player-not-in-match), and writes period-scoped + monotonic (`updateMany WHERE periodId AND playerId AND lockedAt IS NULL`). `lockBoundary.test.ts` asserts `setLockedAt` is gone and `lineupSlot.updateMany` appears exactly once. The choke point is sound — the wrong-match / non-participant leak class is categorically blocked independent of any upstream feed/mapping bug. **Correction:** the writeup's premise that `{periodId, playerId}` uniquely targets one slot is false — `LineupSlot`'s unique key is `@@unique([managerId, periodId, playerId])` and a Period is league-wide, so within one period the same player can hold multiple slots (one per co-owning manager). The `updateMany` deliberately omits `managerId` and **intentionally fans out** to every co-owner's slot — correct behavior, but not a consequence of slot uniqueness.
- **Impact / invariant threatened:** None — recorded as a verified PASS choke point per the task's "PASS-with-evidence" instruction, with the justification corrected so future readers don't rely on a false uniqueness premise.
- **Confidence:** **verified**
- **Fix theme:** correct the code comment to describe the intentional per-co-owner fan-out (no behavioral change).
- **Effort:** **S**

---

### F-P3-03 · Active-ownership uniqueness is intentionally absent from the Prisma model (raw partial index only)

- **Severity:** **P3** (forward-looking regression guard; no defect today)
- **Location:** `packages/db/prisma/schema.prisma:424-442` · `packages/db/prisma/migrations/20260603223500_invariants/migration.sql:6-8`
- **Observed:** `RosterPlayer` carries only `@@index` entries; the league-level one-player-one-active-roster guard is solely the partial unique `roster_player_active_ownership_uq ON roster_player (league_id, player_id) WHERE dropped_at IS NULL`. This is correct — a full `@@unique` cannot express the `WHERE dropped_at IS NULL` semantics and would wrongly block legitimate drop-then-reacquire. (The prompt's referenced `@@unique([managerId, playerId])` at `schema.prisma:579` is on `DraftQueue`, unrelated to ownership.) Exhaustive migration grep confirms the partial index is the only unique on `roster_player`.
- **Impact / invariant threatened:** None today. Risk only if a future schema edit adds a full `@@unique([leagueId, playerId])` on `RosterPlayer`, which would block re-acquisition after a drop.
- **Confidence:** **verified**
- **Fix theme:** keep the invariant in the raw partial index only; add a guard comment / CI check so no future full `@@unique` on `RosterPlayer` is introduced.
- **Effort:** **S**

---

### F-P3-04 · The lineup-lock row trigger does not fire on TRUNCATE — latches are bypassable via `TRUNCATE lineup_slot`

- **Severity:** **P3** (negligible; requires table-owner/service-role privilege, not manager-reachable)
- **Location:** `packages/db/prisma/migrations/20260603223500_invariants/migration.sql:66-68`
- **Observed:** `trg_lineup_slot_lock` is `BEFORE INSERT OR UPDATE OR DELETE … FOR EACH ROW`; Postgres row-level triggers do not fire on TRUNCATE and there is no `BEFORE TRUNCATE` statement trigger, so `TRUNCATE lineup_slot` removes locked/voided rows without raising. The codebase's own `release.integration.test.ts:46-50` documents and relies on exactly this (it TRUNCATEs to remove a deliberately-locked slot). `GRANT TRUNCATE` to the JWT-scoped anon/authenticated roles does not exist, so only the trusted Prisma-owner/service-role can issue it.
- **Impact / invariant threatened:** Negligible — not an access hole for managers (RLS roles cannot TRUNCATE). A documented property of row triggers, not a live exposure.
- **Confidence:** **verified**
- **Fix theme:** optional defense-in-depth — add a `BEFORE TRUNCATE` statement trigger if accidental operator TRUNCATE of locked rows is a concern.
- **Effort:** **S**

---

### R-01 (REFUTED) · "Dead `frozenRole='bench'` branch in `lockedPlayerMoved`"

- **Raised as:** P3 (suspected) maintainability nit — claim that the `frozenRole='bench'` conflict branch (`controller.ts:84-92`, `errors.ts:156-168`) is unreachable because `validateLineup`'s (4b) hindsight rule pre-empts it.
- **Verdict:** **REFUTED — `isReal=false` (verified).** (4b) gates on `hasPlayed` (a `score_player_match` row exists), while the write-time latch gates on `locked_at`; `loadLineupContext` never exposes `locked_at` to the validator (its select lacks `lockedAt`; `SlotState` has no `locked` field). Because `lockSlot` stamps per `(period, player)` with **no `is_starter` filter** (`ingest/prismaStore.ts:292-300`) and the pre-match official-XI lock fires at kickoff *before* any `score_player_match` row exists (`ingest/lock.ts:42-44`), a benched official-XI player at/just-after kickoff has `locked=true, isStarter=false, hasPlayed=false`. Promoting him passes `validateLineup` (4b skipped via `hasPlayed=false`) and then trips the latch with `conflict.isStarter=false`, correctly producing `frozenRole='bench'`. The branch is **live code** that surfaces a genuine read-vs-write lock race for benched official starters — not dead code, and the handling is correct.
- **Net:** no finding; this is evidence of a *correctly-handled* race. Retained here for transparency on what the audit examined.

---

## 3. Investigation tasks (suspected — confirm with the exact check, do not assert)

> Several of these are **feed-shape** questions that the ingestion pass (`CODE_PROMPT_55`) is better positioned to resolve with captured payloads / DB reads; they are flagged here because they gate the live-impact of P1 findings.

- **I-1 (gates F-P1-04):** Confirm `duels_won` is genuinely NULL on the completed fixtures (vs. mis-keyed). *Check:* on the live DB (read-only), `SELECT count(*), count(duels_won) FROM stat_player_match` for the June 11–13 matches, and inspect a saved raw BALLDONTLIE `player_match_stats` payload for `duels_won` / `ground_duels_won` / only-`aerial_duels_won`.
- **I-2 (sibling dead-bucket risk):** Confirm no *other* promoted §4 stat (`shots_on_target`, `ball_recoveries`, `big_chances_created`, `crosses_accurate`, `touches`, `possession_lost`) is uniformly NULL on live data — the `?? 0` coalesce (`adapter.ts:102`) is uniform across all 24 reads, so each could be a silent dead bucket. *Check:* count non-null per promoted column on stored June 11–13 rows.
- **I-3 (gates F-P1-02):** Confirm whether the live feed ever produces a substitute stat line WITHOUT a matching substitution event. *Check:* inspect the event mapper against a real GOAT `/matches` payload; cross-check players with `minutes_played>0` who have no `player_in` event reference.
- **I-4 (gates F-P1-03):** Confirm the operational cadence of `job:recompute` (forced restate) in prod and whether the live dirty sweep ever bulk-enqueues all managers at lock/kickoff. *Check:* `apps/worker` scheduler/cron wiring for `forcedRestate`; confirm there is no lock/kickoff bulk-enqueue establishing the 0-row baseline on the every-tick path.
- **I-5 (gates F-P2-05):** Confirm the live `incident_class`/`incident_type` token vocabulary for second-yellow vs straight-red. *Check:* pull distinct `match_event` incident values from the first completed live fixtures; confirm second yellows arrive as `yellowRed`/`second*` (handled) and not bare `red`/`redCard` (mis-classified).
- **I-6 (gates F-P1-01 severity):** Confirm Prisma 6 actually throws (vs silently coerces) on an Invalid Date written to a NOT-NULL `timestamptz`. *Check:* on a throwaway Postgres + this Prisma client, call `upsertMatch` with `kickoffAtIso:''` and observe throw vs reject vs coerced write; read the row back.
- **I-7 (gates F-P1-01 live trigger):** Determine whether the live WC feed ever emits an empty/absent `datetime` for a real fixture (e.g. TBD knockout slots before the bracket resolves) — which would silently drop that match from `fifa_match`. *Check:* grep a captured `/matches` sample for empty/null `datetime`; query for feed `balldontlieIds` present but missing in `fifa_match`.
- **I-8 (finite-data sibling of F-P1-01):** Verify `status→in_progress` can never precede true first-whistle while `kickoffMs` is finite-but-early — combined with a slightly-early stored kickoff this could stamp before the real lock instant. *Check:* observe when the GOAT feed flips a match to `in_progress` relative to `datetime` (warm-up vs kickoff).
- **I-9 (gates F-P0-01 trigger window):** Confirm nothing voids an eliminated manager's pending `faab_bid` rows between `applyRoundCut` and the next playoff batch. *Check:* `rg` across `apps/worker` + `packages` for any `faab_bid.status → voided_refunded` keyed on `playoff_entry.status='eliminated'` / `eliminatedAt`; confirm none exists outside the (severed) resolver path.
- **I-10 (gates F-P0-01 reachability):** Confirm a playoff per-period FAAB batch actually fires after a cut (knockout periods have a resolvable `effectiveBatchAt`). *Check:* `packages/faab/batchTime.ts` `effectiveBatchAt` + `transition.ts` cadence derivation for knockout periods with synced fixtures.
- **I-11 (analogous to F-P0-01 on the grant path):** Verify the FA $0-grant path (`claimFreeAgent` / `handleGrant`) rejects `isPlayoffParticipant===false` before granting, mirroring the bid path. *Check:* read `apps/web/src/faab/handleGrant.ts` (or equivalent) for the 409 gate.
- **I-12 (gates F-P2-06):** Confirm a period can never hold two matches for the same team (validates the self-heal `EXISTS` assumption). *Check:* `@app/ingest` `mapMatchRow` / schedule-sync period assignment + any postponement handling for `fifa_match.period_id` 1:1-ness.
- **I-13 (TOTAL-15 cap):** Confirm the TOTAL-15 roster cap is enforced inside the atomic draft-pick and FAAB-claim transactions (the partial unique index guards ownership uniqueness, not count). *Check:* `@app/draft` `commitPick` tx and `@app/faab` award loop for an active-row COUNT gate within the same `$transaction`.

> **Resolved during synthesis (no longer open):** the scoring auditor's task "verify recompute actually calls `playerAppearedInMatch` + deletes bogus rows" was confirmed PASS by the recompute auditor — `recompute.ts:70-76` runs the gate before `scorePlayerMatch`, calls `deleteScorePlayerMatch` on non-participants, and re-enqueues `(manager,period)` (covered by `recompute.test.ts:129`).

---

## 4. Invariants checked

Legend: ✅ PASS · ❌ FAIL · 🔎 INVESTIGATE.

### Scoring (`packages/scoring` + `recompute/adapter`)
- ✅ §4 bucket rates (key passes /2, dribbles /2, **duels won /3**, accurate passes /15, long balls /2, was-fouled /3; shots-on-target /3, big-chances /1, crosses /4, touches /25 — all positions; ball-recoveries /5 outfield-only). — `index.ts:128-184`.
- ✅ `possession_lost` −1/10 all positions. — `index.ts:244-248`.
- ✅ AERIALS not reintroduced / not folded into duels (aerial_* fall through to `extra`, unscored). — `index.ts:138`, `map.ts` extra catch-all, `SCORING.md:161-166`.
- ✅ §8 cards additive (yellow −1 stacks with second-yellow band), ≥60 catch-all, bucketed on effective minute. — `index.ts:54-65,230-240`; `adapter.ts:109,305-307`.
- ✅ §6 goals conceded −1/1, role-gated GK/DEF AND team-in-match required. — `index.ts:206-217`; `adapter.ts:183-213`.
- ✅ `floorPer` rounds down; correct for 0 and the negated `possession_lost`/`conceded` paths; zero-point lines omitted without hiding real deductions. — `index.ts:28,82-84`.
- ❌ **Duels actually score on live data** — inert because `duels_won` is NULL on the completed feed and is coalesced to 0 (**F-P1-04**, feed-mapping root cause).

### Participant / conceded / dirty-sweep (`packages/recompute`)
- ✅ Participant invariant: a `score_player_match` row exists only for an appeared player (`playerAppearedInMatch` = team-in-match AND non-stub stat / named event / shot). — `adapter.ts:218-254`.
- ✅ Non-participant remediation: `deleteScorePlayerMatch` + re-enqueue `(manager,period)`; dirty already cleared in Phase-1 claim (no permanently-dirty row). — `recompute.ts:70-76`; `prismaStore.ts:175-178`; `recompute.test.ts:129`.
- ✅ Conceded math team-in-match-gated on every path (`teamGoalsAgainst`, `concededByPlayerTeam`, `goalsConcededWhileOn`). — `adapter.ts:183-213`.
- ✅ Dirty→sweep claim flips `dirty=false` before work; downstream markers enqueued before clearing own; crash mid-unit retried next tick; poison key isolated. — `recompute.ts:121-196`; `prismaStore.ts:355,403-413`.
- ✅ Rollup excludes bench; frozen gate honored unless `allowFrozen`; `breakdown_json` round-trips; `markStatPlayerDirty` no-clobber. — `index.ts:262-271`; `recompute.ts:99-101`; `prismaStore.ts:170`; `db/dirty.ts:12-22`.
- ❌ **Sub on-pitch window** — a substitute lacking a sub-in event is charged conceded from minute 0 (**F-P1-02**).
- 🔎 **All-play-all per-period completeness** — dirty path does not guarantee a 0-row baseline for every manager (**F-P1-03**); self-heals on `forcedRestate` (cadence = **I-4**).

### Lock predicate + write boundary (`packages/shared`, `packages/ingest`)
- ✅ `isLockedNow` = `lockedAt != null && lockedAt <= now` (null/future = movable). — `shared/lock.ts:10-12`.
- ✅ Single write choke point `lockSlot`; `setLockedAt` gone; `updateMany` exactly once. — `ingest/prismaStore.ts:297-300`; `lockBoundary.test.ts`.
- ✅ `isLockWriteAuthorized` = period present + `lockedAt<=now` + status in_progress/completed + team-in-match. — `lock.ts:132-145`.
- ✅ Period-scoped + monotonic (`WHERE locked_at IS NULL`); never stamp before the instant (starter=kickoff, sub=entry). — `lock.ts:41,62,83`; `ingest/prismaStore.ts:292-300`.
- ✅ Kickoff parse does NOT coalesce missing/unparseable kickoff to ~now (no `?? now` anywhere). — grep across `ingest`+`worker`.
- ✅ `reconcileAppearanceLocks` invoked in BOTH `ingestLive` and `ingestSettle`; `sweepCompletedMatchLocks` 48h net routes through `lockSlot`. — `ingest.ts:210,250`; `lockSweep.ts:37-62`; `scheduler.ts:119-133`.
- ✅ Foreign-event guard drops cross-match rows (live + settle). — `ingest.ts:160-204,229-245`.
- ❌ **Kickoff Invalid-Date validation** — the parse is unvalidated and the pure guards fail open on NaN; only Prisma's incidental throw shields prod (**F-P1-01**).

### Lineup / forfeit one-way door (`packages/lineup`)
- ✅ `hasPlayed` from `score_player_match` existence (not `locked_at`); `voided` from `voided_at != null`; formation bounds from single source. — `prismaStore.ts:57-74`; `validate.ts:237-243`.
- ✅ 4a voided slot can never re-start; 4b played bench can't be promoted; 4c benching a played starter requires explicit confirm; no path sets `is_starter=false` on a played starter outside the void/confirm gate. — `validate.ts:223-231`; `prismaStore.ts:131-166`.
- ✅ Void write one-shot/idempotent (`WHERE voided_at: null`), no un-void path; lineup pkg never writes `locked_at`; `saveLineup` is the choke point and runs `validateLineup` first; edit-window gate precedes play-state rules; forfeit→scoring consistency. — `prismaStore.ts:146-153`; `controller.ts:49-76`; `commish/lineup.ts:96-130`.
- (Defense-in-depth gaps logged as **F-P2-03**, **F-P2-04**.)

### FAAB ledger (`packages/faab` + worker)
- ✅ No double-spend (per-award working-budget debit + re-check); $0 legal; highest-bid-first + rolling-waiver tiebreak; move-to-bottom only when tiebreak used + contiguous 1..N; total roster cap per award; kickoff void+refund; `validateRelease` 5 rules + `ReleaseStaleLockError`; cadence gate `status IN (group,playoff)`; $100 reset at transition (no carryover, waiver order carried-not-reseeded); submission-time budget cap (409); submission-path D4 gate present. — `resolve.ts:136-352`; `release.ts:62-98`; `worker/faab/prismaStore.ts:20-36`; `transition.ts:140-141`; `validate.ts:88-92`.
- ✅ `applyRoundCut` atomic + idempotent (conditional `alive→eliminated` first; 0 rows = no-op) + does not flip `league.status`. — `advanceStore.ts:139-143`; `advance.ts:17`.
- ❌ **D4 batch gate** — `participantManagerIds` computed and resolver-supported but not threaded by the controller, so the batch never voids non-participant bids (**F-P0-01**).

### Guillotine / standings (`packages/recompute` + worker apply)
- ✅ `selectGuillotineCuts` boundary math (cutCount-th lowest is on the boundary; no off-by-one); whole tied set surfaced on unbreakable tie; lowest-cumulative-total cut; `resolveRoundCut` reuses the selector verbatim and `--break-tie` nudges totals without altering the math; `championAfterCut` lone-survivor. — `guillotine.ts:38-85`; `playoffRound.ts:45-127`.
- ✅ Guillotine consistency: live provisional zone == eventual write by construction (same `resolveRoundCut` + single `loadCumulativeTournamentTotals` helper used by both web read and worker apply). — `playoffsView.ts:200`; `advance.ts:162`; `loadPlayoffs.ts:114`.
- ✅ Worker front guards (commissioner, reason, real round label, frozen precondition, ordering, alive>0, no auto-cut on needs-commissioner). — `advance.ts:84-206`.
- ✅ `computeStandings` all-play-all: W = strictly outscored per period, tie neither W nor L, L not derived as N-1-W; cut-schedule base/r matches locked examples 6/8/10/12. — `standing.ts:64-149`; `transition.ts:88-105`.

### DB constraints / triggers (`packages/db`)
- ✅ `enforce_lineup_lock`: INSERT born unlocked+un-voided; locked DELETE blocked; `voided_at` one-way immutable + voided cannot start; locked row frozen except the single forfeit transition; scheduled-unlock cannot unlock a played slot; directional latch blocks promoting a played bench player; no ordinary-UPDATE bypass; `search_path` hardened; `commish_override` is tx-local `SET LOCAL` and unset ⇒ enforce. — `20260612220000:21-104`; `20260611120000:24`; `20260606180000:48`.
- ✅ Unique ACTIVE ownership = partial index `roster_player_active_ownership_uq` (not the Prisma model). — `20260603223500:6-8`.
- (Latent/edge items logged as **F-P2-06**, **F-P3-03**, **F-P3-04**.)

### `league.status` consumers + web read sites (`apps/web`)
- ✅ `loadLineup` / `loadVsField` use `isLockedNow` (not presence); period/manager/score reads correctly scoped (no cross-period leak); `loadVsField` shows only the current period; `loadPlayoffs` inherits lock semantics via `loadLineup`, scopes knockout reads to participants, derives `complete` from the champion entry, and never reads/writes `league.status`. — `loadLineup.ts:10,53-156`; `loadVsField.ts:14,97-189`; `loadPlayoffs.ts:23,98-142`.
- ✅ Readers honor the participant invariant (a missing score row reads as 0/not-played; no reader fabricates participation); all loaders use the RLS-bypassing Prisma owner with explicit query-layer scoping + `getSessionManager` page gating.
- ❌ **Web never reads `league.status`** — violated by `loadWaivers` (affordance/cap read, not a route gate) (**F-P2-02**). The same `league.status`-as-cap-driver coupling exists in the FAAB release store.
- **`league.status` consumer enumeration (listed, not resolved per the derive-vs-write seam):** worker — FAAB roster-cap split (`rosterCapForLeagueStatus`), D4 gate (`loadIsPlayoffParticipant`), the group→playoff transition claim, the cadence gate (`worker/faab/prismaStore.ts:23`), and the FAAB release store (`faab/prismaStore.ts:716,720`). Web — **only** `loadWaivers.ts:79-82,269-275` (the F-P2-02 deviation). The deferred `playoff→complete` flip remains UI-derived from the champion `playoff_entry` row; `applyRoundCut` writes nothing to `league.status`.

---

## 5. Out of scope for this pass

This pass covered **P0 live-state integrity** (scoring/locking/rosters/FAAB/guillotine) by static read. The following are explicitly deferred:

- **Ingestion / feed pass (`CODE_PROMPT_55`):** the live-data confirmations that gate several P1 findings here — whether `duels_won` (and the other promoted §4 stats) are genuinely absent/mis-keyed on the feed (**I-1, I-2**, F-P1-04), whether the feed emits sub stat lines without sub-in events (**I-3**, F-P1-02) and second-yellow dismissals as bare "red" tokens (**I-5**, F-P2-05), the empty/`Invalid Date` `datetime` behavior (**I-6, I-7**, F-P1-01), and the `in_progress`-before-first-whistle timing (**I-8**). The full feed-mapper reconciliation (the `feed-shape-nested` UNVERIFIED stat/event/shot/team mappers) belongs there.
- **Surface / platform pass (`CODE_PROMPT_56`):** UI/affordance rendering, the `league.status`-read contract reconciliation across the FAAB/waivers/release web surface (F-P2-02 framing), RLS policy completeness for browser-direct reads, auth/route-gate hardening, and the FA-grant 409 gate (**I-11**).
- **Not audited here:** draft controller, notifications, pool/pick'em, vsfield box-score, and other non-P0-integrity subsystems; worker scheduler cadence correctness beyond the lock/recompute/FAAB hooks; and any runtime/operational verification (no app/DB/network was touched).
