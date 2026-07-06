# LANE L1 — F-C01 Consumer Inventory — `fifa_match.periodId` (rewire-site map)

_Phase-1 launch-spec pass, 2026-07-06. Lane model: Opus (auditor, read-only). Seeds: F-C01/F-C12/F-A26 bodies in audit/AUDIT_LAUNCH_readiness.md. Verifier verdict appended at bottom after the independent re-check._

## Preamble
Method: read-only trace. Greps run (repo root, excluding node_modules/.next/dist): `periodId` (143 files) and `period_id` (35 files) across apps/ + packages/; then targeted `match:\s*\{\s*periodId`, `where:\s*\{\s*periodId`, `periodId:\s*\{\s*in`, `fifaMatch\.(findMany|findFirst|findUnique|upsert)`, plus `period:\s*\{` / `matches:` / `.period` for relation traversals; `$queryRaw`/`$executeRaw` and migration `period_id` for raw SQL/triggers. Disambiguation: I read each hit's surrounding query and kept ONLY (a) `fifa_match.period_id` column reads/writes, (b) the `FifaMatch.period` relation (`match.period` / `match: { periodId }`), and (c) the `Period.matches` reverse relation — all of which resolve through `fifa_match.period_id`. Excluded: `LineupSlot.periodId`, `ScoreManagerPeriod.periodId`/`RecomputeDirty.periodId`, `Period.id` scalar reads, and Realtime `score_manager_period` `period_id=eq` filters (schema:513 Period; not fifa_match). Row counts by subsystem: ingest 5, locking 4 (incl. 1 DB trigger), recompute 2, period-close 3, notify 2, pool 5, lineup 5, vsfield 3, games/player-box 4, dashboard/shell 2, standings 1, waivers/faab 3, commish 5, autofire 1, elimination 1, schema/DDL 2, ports/doubles 2.

## Inventory
| # | path:line | access | subsystem | what it does | league-in-scope? | known/NEW |
|---|---|---|---|---|---|---|
| 1 | packages/db/prisma/schema.prisma:394,422,438 | DDL/relation | schema | the column + `period` relation + `@@index` | n/a | known |
| 2 | packages/db/prisma/migrations/20260604120000_match_period_and_lock_fallback/migration.sql:5-12 | DDL | schema | ADD COLUMN period_id + FK + index | n/a | known |
| 3 | packages/db/prisma/migrations/20260612220000_lineup_lock_scheduled_unlock/migration.sql:74-78 | join (raw SQL trigger) | locking | self-heal unlock joins fifa_match on `m.period_id=NEW.period_id` | Y (NEW.period_id) | NEW |
| 4 | packages/ingest/src/prismaStore.ts:84 | write/stamp | ingest | stamps periodId onto fifa_match upsert | N | known |
| 5 | packages/ingest/src/prismaStore.ts:97-104 | read/resolve | ingest | findFirst period by {kind,label}, NO league filter | N | known |
| 6 | packages/ingest/src/ingest.ts:67 | write/stamp | ingest | schedule-sync resolves+stamps periodId | N | known |
| 7 | packages/ingest/src/store.ts:49-56 | port | ingest | IngestStore.upsertMatch(periodId)/resolvePeriodId contract | N | NEW |
| 8 | packages/ingest/src/prismaStore.ts:287,297 | read | locking | reads source-match.periodId to scope lock-on-play | N | known |
| 9 | packages/ingest/src/prismaStore.ts:325,330 | filter | locking | filters/updates lineup_slot by that periodId | N | known |
| 10 | packages/ingest/src/lock.ts:100,133 | read (value) | locking | pure gate consumes source-match periodId (deny if null) | N | NEW |
| 11 | packages/recompute/src/prismaStore.ts:205-209 | read | recompute | dirty-walk: match.periodId → affected manager-periods | N (matchId) | known |
| 12 | packages/recompute/src/prismaStore.ts:253-254 | join | recompute | scorePlayerMatch where `match:{periodId}` (slot scoring) | Y (managerId) | NEW |
| 13 | apps/worker/src/jobs/periodClose.ts:71-73 | join (Period.matches) | period-close | freeze read: period's fixtures | Y | NEW |
| 14 | apps/worker/src/jobs/periodClose.ts:125 | join (Period.matches) | period-close | status-lifecycle read: period's fixtures | Y | NEW |
| 15 | apps/worker/src/period/prismaStore.ts:23-30 | join (Period.matches) | period-close | dual-writer tick status-advance read | Y | NEW |
| 16 | apps/worker/src/notify/prismaStore.ts:27-31 | read | notify | match.periodId (F-A26 not-starting scoping) | N (bdl) | known |
| 17 | apps/worker/src/notify/prismaStore.ts:34 | filter | notify | lineup_slot where periodId=match.periodId | N | known |
| 18 | apps/web/src/pool/loadPool.ts:42,71 | read (relation) | pool | fixtures' period.kind/label for pick'em | Y | known |
| 19 | apps/web/src/pool/loadPool.ts:149-150 | read | pool | m.period.kind for selectTournamentPhase | Y | known |
| 20 | apps/web/src/pool/resolvePoolPeriod.ts:28,39 | read (value) | pool | maps match.period.kind/label (or synth 3P) | Y | known |
| 21 | apps/web/src/pool/prismaStore.ts:38-41,54 | read | pool | getMatchFacts: pick-write validation phase discriminator | Y | NEW |
| 22 | packages/pool/src/pool.ts:104,216 | read (value) | pool | pure engine consumes periodKind (derive result / validate) | Y | known |
| 23 | apps/web/app/lineup/loadLineup.ts:59-69 | join (Period.matches) | lineup | periods' fixtures for done/live derivation | Y | NEW |
| 24 | apps/web/app/lineup/loadLineup.ts:126-127 | filter | lineup | fifaMatch where periodId in periodIds | Y | known |
| 25 | apps/web/app/lineup/loadLineup.ts:146 | join | lineup | scorePlayerMatch where `match:{periodId in}` | Y | NEW |
| 26 | apps/web/app/lineup/loadLineup.ts:155 | join | lineup | matchLineupEntry where `match:{periodId in}` | Y | NEW |
| 27 | packages/lineup/src/prismaStore.ts:60-61 | join | lineup | loadLineupContext played-check: scorePlayerMatch `match:{periodId}` | Y | NEW |
| 28 | apps/web/app/vsfield/loadVsField.ts:174-186 | join (Period.matches) | vsfield | periods' fixtures for live-wave selection | Y | NEW |
| 29 | apps/web/app/vsfield/loadVsField.ts:315-316 | filter | vsfield | fifaMatch where periodId=currentPeriod | Y | NEW |
| 30 | apps/web/app/vsfield/loadVsField.ts:337-338 | join | vsfield | scorePlayerMatch where `match:{periodId}` (per-player pts) | Y | NEW |
| 31 | apps/web/app/games/[matchId]/loadGameDetail.ts:45,54,140-146 | read+filter | games | match.periodId + period.kind/label + owner-slot scope | Y | NEW |
| 32 | apps/web/app/api/player-box/loadPlayerBox.ts:49,67 | join | games | score/statPlayerMatch where `match:{periodId}` | Y | NEW |
| 33 | apps/web/app/api/player-box/loadPlayerBox.ts:94-97 | filter | games | fifaMatch where periodId + player's team | Y | NEW |
| 34 | apps/web/app/_dashboard/loadDashboard.ts:119-120 | read | dashboard | period.kind/label for tournament-phase | Y | NEW |
| 35 | apps/web/src/shell/loadNavPhase.ts:15-16 | read | other (shell) | period id/kind/label for nav phase (global, memoized) | N | NEW |
| 36 | apps/web/app/standings/loadStandings.ts:44-49 | join (Period.matches) | other (standings) | periods' fixtures → isLive | Y | NEW |
| 37 | apps/web/app/waivers/loadWaivers.ts:134-145 | join (Period.matches) | waivers | periods' first kickoff for batch window | Y | NEW |
| 38 | packages/faab/src/prismaStore.ts:459-461 | filter | faab | resolvePeriodWindow: fifaMatch where periodId → first kickoff | Y | NEW |
| 39 | packages/faab/src/prismaStore.ts:486-496 | read | faab | resolveAddPeriodWindow: add's fixture.periodId → batch window | Y | NEW |
| 40 | apps/web/app/commish/loadCommish.ts:405-411 | read | commish | stat-correction picker: matches' period.label/frozenAt | Y | NEW |
| 41 | apps/web/app/commish/loadCommish.ts:427-429 | read | commish | selected match.period.frozenAt gate | Y | NEW |
| 42 | apps/web/src/commish/commishStatStore.ts:45-51 | read | commish | rescore: match.periodId + period.frozenAt | Y | NEW |
| 43 | apps/web/src/commish/commishRepairStore.ts:79-80 | filter | commish | getAddMatch: fifaMatch where periodId=pinned (kickoff guard) | Y | NEW |
| 44 | apps/worker/src/commish/cli.ts:174-175 | filter | commish | makeGetAddMatch: fifaMatch where periodId=pinned | Y | NEW |
| 45 | apps/worker/src/autofire/prismaStore.ts:140-141 | filter | commish (autofire) | loadRoundCompleteness: fifaMatch where periodId=roundPeriodId | Y | NEW |
| 46 | apps/worker/src/elimination/prismaStore.ts:21-24 | join (period relation) | other (elimination) | fifaMatch where `period.kind=ko & frozenAt` (team elim) | N (global) | NEW |
| 47 | packages/ingest/src/memoryStore.ts | double | ingest | in-memory model of resolvePeriodId/upsertMatch periodId/lockSlot scope | N | NEW |

## Test-files that would rewire (≈14)
Count: ~14 fifa_match.periodId-touching suites. `packages/ingest/src/lock.test.ts`, `packages/ingest/src/lockSweep.test.ts`, `packages/ingest/src/store.test.ts`, `packages/ingest/src/ingest.test.ts`, `packages/recompute/src/sweepClaimClear.integration.test.ts`, `packages/lineup/src/recomputeMirror.contract.test.ts`, `apps/worker/src/period/dispatch.test.ts`, `apps/worker/src/notify/selectors.test.ts` + `triggers.test.ts`, `apps/worker/src/elimination/dispatch.integration.test.ts` (+ `dispatch.test.ts`), `packages/faab/src/eliminatedTeam.integration.test.ts`, `apps/web/app/games/[matchId]/loadGameDetail.contract.test.ts`, `apps/web/app/playoffs/loadPlayoffs.integration.test.ts`, `apps/web/src/commish/commishStatWrite.integration.test.ts` (writes `fifaMatch.periodId`), `apps/web/src/dashboard/dashboard.test.ts` (pins `fifaMatch.findMany` shape), `apps/web/src/pool/thirdPlace.test.ts`.

## Closing
Suspected but unconfirmed: (a) a recompute in-memory double modelling the `(player,period)→match` link is referenced by prismaStore.ts:252's comment but I found no `recompute/src/memoryStore.ts` file — suspected the double lives inline in a recompute test — needs `grep -r "player,period" packages/recompute/src/*.test.ts`. (b) `apps/worker/src/commish/cli.ts` likely has a second period-pinned read for `commish:lineup` beyond makeGetAddMatch — suspected — needs reading cli.ts:150-260. Highest-risk rewire sites: (1) the raw-SQL lock trigger migration 20260612220000:74-78 — `JOIN fifa_match ON m.period_id=NEW.period_id` breaks silently at write time once the column is dropped, and it is the hardest to unit-test; (2) packages/ingest/src/prismaStore.ts:97-104 `resolvePeriodId` — findFirst by {kind,label} with NO league filter is the literal F-C01 root; under N leagues it stamps an arbitrary league's period onto the shared global fixture; (3) packages/recompute/src/prismaStore.ts:205 + :254 — the dirty-walk + slot scoring key scoring correctness on the single periodId, so a shared fixture would fan out to only ONE league's manager-periods, silently zeroing the others.

---

# V1 — Independent verifier verdict (Opus, adversarial re-check)

**46 CONFIRMED / 1 CORRECTED / 9 MISSED (+2 borderline).** Every cited path:line exists and touches `fifa_match.period_id` / `FifaMatch.period` / `Period.matches` as labelled; access-modes and league-in-scope flags check out except row 6. Raw-SQL angle fully closed: the only runtime `fifa_match.period_id` raw reference is the row-3 trigger in `20260612220000` (the predecessor `20260611120000` trigger has no `fifa_match` join; all other migration `period_id` hits are `lineup_slot`/`score_manager_period`, correctly excluded; no app-level `$queryRaw` touches it — the only runtime `$executeRawUnsafe` in faab/lineup stores sets the `app.commish_override` GUC).

### Corrections
- Row 6 (`packages/ingest/src/ingest.ts:67`): access "write/stamp" mislabels the cited line — line 67 is the `resolvePeriodId(...)` **resolve (read)**; the stamp is line 68 (`store.upsertMatch(row, periodId, …)`). Cite 67-68.

### Missed consumers (inventory extends to 56 rows)
| # | path:line | access | subsystem | what it does | league-in-scope? | MISSED |
|---|---|---|---|---|---|---|
| M1 | apps/worker/src/faab/prismaStore.ts:30-42 | join (Period.matches) | faab (worker) | loadDueBatches: period.findMany → matches[0].kickoffAt first-kickoff for waiver batch window | Y | MISSED |
| M2 | apps/worker/src/autofire/prismaStore.ts:87-93 | join (Period.matches) | commish (autofire) | loadKnockoutRounds: period.findMany → matches.kickoffAt per KO round | Y | MISSED |
| M3 | apps/worker/src/commish/transitionStore.ts:47-53 | join (Period.matches) | period-close/transition | R32 period.findFirst → matches[0].kickoffAt trim deadline | Y | MISSED |
| M4 | apps/web/src/commish/commishFreezeStore.ts:30-37 | join (Period.matches) | commish | getPeriod: period.findUnique → matches[].status (freeze gate) | Y | MISSED |
| M5 | apps/web/app/commish/loadCommish.ts:248-256 | join (Period.matches) | commish | period-lifecycle panel: period.findMany → matches[].status | Y | MISSED |
| M6 | apps/web/app/players/loadPlayers.ts:154-161 | join (Period.matches) | waivers/faab (players) | period.findMany → matches[0].kickoffAt acquisition-window phase | Y | MISSED |
| M7 | apps/web/app/api/player-box/loadPlayerBox.ts:110 | join (match.period) | games | scorePlayerMatch.aggregate where `match:{period:{leagueId}}` (season total) | Y | MISSED |
| M8 | apps/web/app/api/player-tournament-stats/loadPlayerTournamentStats.ts:64-74 | read (match.period) | games/player-stats | statPlayerMatch.findMany select `match:{period:{label}}` for per-row MD labels | N (player-scoped) | MISSED |
| M9 | packages/recompute/src/memoryStore.ts:40-41,69-71,145,166 | double | recompute | in-memory `(player,period)→match` model (`playerPeriodMatch`/`seedPlaysIn`) of the fifa_match.period_id link | N | MISSED |

Borderline (real consumers of the `Period.matches` projection but pure/type-level, ~zero rewire footprint): (i) `apps/web/src/period/selectablePeriods.ts:26-30` — `PeriodForSelect.matches` type + `selectSelectablePeriods` deriving isLive/isDone from `matches[].{kickoffAt,status}` (consumed by lineup/vsfield/standings); (ii) `packages/recompute/src/store.ts:69` — the `RecomputeStore.getManagerPeriodSlots(managerId, periodId)` port that rows 11/12 implement. Note M8's pure downstream adapter `apps/web/src/playerTournamentStats/toTournamentRows.ts:23,56` (`m.period?.label`) rides on M8's read.

### Suspected items resolved
(a) CONFIRMED — the recompute-side in-memory double exists and is uncounted (M9). `packages/recompute/src/memoryStore.ts` defines `class MemoryStore implements RecomputeStore` holding `private playerPeriodMatch = new Map<string,string>()` documented "(player, period) → match player played in period" (lines 40-41), seeded by `seedPlaysIn(playerId, periodId, matchId)` (69-71). `getAffectedManagerPeriods` (line 145) skips any slot whose `playerPeriodMatch(player, period) !== matchId`, and `getManagerPeriodSlots` (line 166) looks the match up to fetch its score — exactly modelling the link the Prisma store resolves through `fifa_match.period_id` at prismaStore.ts:205-209 and 253-254. Distinct file from the ingest `memoryStore` (row 47); genuine miss. **Consistent with L4's independent resolution (a): the double already supports a match bound to N periods — no port break.**

(b) RESOLVED, negative — there is NO second period-pinned `fifa_match` read in `apps/worker/src/commish/cli.ts:150-260`. `makeGetAddMatch` issues exactly one period-pinned read at 174-175 (row 44). The other two `fifaMatch.findFirst` calls in range (182-186; 189) filter on team+kickoff only. The `period.findFirst({leagueId,label})` at 223-228 never touches `fifa_match`. Row 44 is the sole period-pinned fixture read in cli.ts. **Consistent with L4's resolution (b).**

### Orchestrator note — M-rows mapped into L4's rewire waves
M1–M6 are `Period.matches` reverse-relation reads → same pattern as L4 W2/W3 junction reverse reads (M1/M3 worker-side → W2; M2/M4/M5/M6 → W3). M7/M8 are `match.period` traversals → W3 loader pattern (M8 is league-in-scope?=N — player-scoped stats read; under N leagues it needs a declared league context or a competition-global label source — same class as L4's row-35 flag). M9 → W0 (no change needed; already junction-shaped per L4 resolution (a)). No new wave, no ordering change; L4's E6 contract-gate fence must also cover the `Period.matches`/`match:{period:` traversal patterns these rows use — already within its stated grep set.
