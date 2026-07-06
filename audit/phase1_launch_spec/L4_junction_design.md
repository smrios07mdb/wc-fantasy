# LANE L4 — F-C01/F-C12 Junction Design: `(match_id, league_id, period_id)` + consumer rewire order

_Phase-1 launch-spec pass, 2026-07-06. Lane model: Fable (auditor tools, read-only design lane). Built on L1's 47-row consumer inventory. Adversarial design-review verdict appended at bottom._

_Spec-only. DEC-0 calls (one-DB-vs-per-league, competition model) are surfaced as inputs, never picked here. All paths repo-relative._

**Suspected-item resolutions (folded in below):**
- **(a) Recompute in-memory double — RESOLVED, L1's premise corrected:** `packages/recompute/src/memoryStore.ts` EXISTS (L1 said it found none). It models the link as `playerPeriodMatch: Map<(playerId,periodId) → matchId>` (memoryStore.ts:40-41, `seedPlaysIn` :69-71) and its `getAffectedManagerPeriods` (:140-152) iterates slots and checks the per-period map — meaning the double **already supports a match bound to N periods** (seed the same matchId under two periodIds and both fan out). Only `packages/recompute/src/prismaStore.ts:205-213` (single `findUnique → periodId`) needs rewiring; the `RecomputeStore` port and the double are junction-shaped as-is. This removes a feared port break from the plan.
- **(b) commish cli.ts second period-pinned read — RESOLVED, NOT a consumer:** the second read is `lineupCmd` at `apps/worker/src/commish/cli.ts:306-309` + `:325` — a `period.findFirst({ leagueId, label })` (already league-scoped) feeding `lineup_slot.periodId`, which L1's method explicitly excludes. Ditto `rosterCmd`'s pin at cli.ts:222-229. The only `fifa_match.period_id` consumer in cli.ts is `makeGetAddMatch` at cli.ts:174-175 (L1 row 44). Inventory stays 47 rows.

## 1. Junction shape

**Name:** model `MatchPeriod` → `@@map("match_period")`, following the schema's descriptive-join convention (`RosterPlayer`→`roster_player` schema.prisma:453-471, `PoolPick`, `MatchLineupEntry`, `PlayoffEntry`). No `fifa_` prefix: the `fifa_*` namespace is global reference data (schema.prisma:370-440); this table is the fantasy-side per-league binding. (Alternative `league_match_period` if a second qualifier is wanted.)

**Keys/uniqueness:** uuid `id` PK (every model here has one), plus `@@unique([leagueId, matchId])` — exactly **one period per (match, league)**, the direct N-league generalization of today's single FK. `@@unique` doubles as the league-scoped fixtures index (F-C10).

**`period.leagueId = row.league_id` enforcement:** composite FK — relation `fields: [periodId, leagueId] references: [id, leagueId]`, backed by a new `@@unique([id, leagueId])` on `Period` (additive index; Period currently has `@@unique([leagueId,label])` + `@@index([leagueId])`, schema.prisma:542-543). DB-level guarantee, no trigger needed.

**FKs + onDelete:** `match → FifaMatch onDelete: Cascade` (binding is meaningless without the fixture); `period → Period onDelete: Cascade` — preserves today's semantic where deleting a period detaches but keeps the global match (today `SetNull` on FifaMatch.period, schema.prisma:422; under a junction "detach" = row deletion); `league → League onDelete: Cascade`.

**Indexes for the hot reads:** dirty-walk + lock-sweep by match → `@@index([matchId])`; period-fixtures reverse read (replaces `Period.matches`, used by periodClose.ts:71-73,:125 and loaders) → `@@index([periodId])`; league-scoped fixture list → covered by the `[leagueId, matchId]` unique prefix.

**Nullable semantics:** `period_id` is **NOT NULL**; today's `periodId = NULL` ("not a fantasy fixture", e.g. 3rd place, schema doc :398-405) becomes **absent row for that league**. `is_third_place` stays on `fifa_match` (it is deliberately a separate axis; the /pool synthesized "3P" period never had a real period row and is untouched). "Period not yet seeded" = row appears on a later schedule-sync (idempotent upsert), mirroring today's "NULL until seeded" (:390).

**RLS posture:** default-deny, zero policies — same as `fifa_match` today. Verified: `fifa_match` is browser-unreadable; the only browser-path touch is the `pool_pick` SELECT policy going through SECURITY DEFINER `pool_pick_match_kicked_off` (migration `20260621120000_fix_pool_pick_realtime_rls/migration.sql:58-78,:87-103`), which reads only `kickoff_at` — **no periodId dependency, unaffected**. Do not add `match_period` to any Realtime publication (no `postgres_changes` binding targets `fifa_match` anywhere — verified, §5).

**Prisma sketch (14 lines):**
```prisma
model MatchPeriod {
  id        String   @id @default(uuid())
  matchId   String   @map("match_id")
  leagueId  String   @map("league_id")
  periodId  String   @map("period_id")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  match  FifaMatch @relation(fields: [matchId], references: [id], onDelete: Cascade)
  league League    @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  period Period    @relation(fields: [periodId, leagueId], references: [id, leagueId], onDelete: Cascade)
  @@unique([leagueId, matchId])
  @@index([matchId])
  @@index([periodId])
  @@map("match_period")
}
```
(Plus: `Period` gains `@@unique([id, leagueId])` and `links MatchPeriod[]`; `FifaMatch` gains `periodLinks MatchPeriod[]`.)

## 2. ⛔ DEC-0 fork: one-shared-DB vs DB-per-league

INV-10 (AUDIT_LAUNCH_readiness.md:1000) explicitly lists "one shared DB vs DB-per-league (changes whether F-C01 needs a migration at all)". **Not picked here.**

**(a) Shared DB →** junction exactly as §1. F-C01/F-C12/F-C10/F-A26 all resolve through it; MT-2's worker loops (F-C11) iterate leagues in one DB.

**(b) DB-per-league →** `fifa_match.periodId` stays a single FK per DB; **no junction, F-C01 needs no migration**. What else it changes across the L1 inventory:
- *Evaporates:* rows 5 (unscoped `resolvePeriodId` — one league per DB makes `findFirst{kind,label}` correct), all league-in-scope?=N concerns (rows 8-10, 16-17, 35, 46), F-C10/F-C11 singleton loops, F-C09 draft findFirst, F-A06 Realtime scoping.
- *Breaks/costs:* global fixture ingest runs ×N (feed quota, scrape passes, `stat_player_match` duplication per DB — the whole `fifa_*` universe copied per league); cross-league surfaces (any global pool/leaderboard, shared /players stats) become impossible without a separate aggregation store; migrations ×N with the already-flagged no-ordering deploy problem (F-A15/F-A17) multiplied; Supabase auth realm vs N DBs routing (which DB does a session hit? — a NEW edge-layer problem replacing F-C02, not removing it); N Render services or a worker multiplexing N `DATABASE_URL`s. Ops cost scales linearly with leagues; the code stays almost byte-identical to today.
- *Note:* rows 1-47 then need **zero rewires** — the entire §3/§4 plan below is the price of branch (a), and is the honest cost input to DEC-0.

**Middle options (credible, surfaced not picked):**
1. *Shared DB + junction only for multi-league competitions:* keep `fifa_match.periodId` as the fast path when a competition has exactly one league, junction otherwise. Credible but poisonous long-term: every one of the 47 sites carries a permanent two-branch read. Only worth it if DEC-0 lands "multi-league is rare/experimental".
2. *Competition-scoped shared periods* (the other half of F-C12's own fix theme, :310): `Period` stops being per-league; per-league policy (cutCount, waiverBatchAt, status, frozen semantics) moves to a `league_period` overlay. `fifa_match.periodId` single FK stays **valid** (periods are shared), and the junction moves one level up (league↔period instead of league↔match — ~104× smaller). This is a genuine competitor design; it trades the 47-row match-link rewire for a rewire of every `Period.leagueId` consumer (lineup, score_manager_period, freeze/cut, waivers). Gated on DEC-0 *competition model*; §1/§3/§4 spec the match junction per this lane's charter.

## 3. Expand/contract migration plan (shared-DB branch)

Additive-first per F-A15 (:424-429 — no down migrations; everything since 20260609 is additive; that discipline IS the rollback story).

- **E1 (expand, migration):** create `match_period` + `Period @@unique([id, leagueId])`. Pure additive — old code ignores the new table (F-A15's class (a)). Rollback: trivially safe.
- **E2 (backfill, same migration file — idempotent, 6 lines):**
```sql
INSERT INTO "match_period" ("id","match_id","league_id","period_id")
SELECT gen_random_uuid(), m."id", p."league_id", m."period_id"
FROM "fifa_match" m JOIN "period" p ON p."id" = m."period_id"
WHERE m."period_id" IS NOT NULL
ON CONFLICT ("league_id","match_id") DO NOTHING;
```
  ~104 rows × 1 league today — instant; safe inside the migration transaction (fresh table, no contention). Deploy-skew note (F-A17: migrations run only on web preDeploy; worker deploys unordered): matches upserted by the worker between E1 and E3 get column-only stamps — closed automatically because E3's dual-write runs on every schedule-sync, so the junction converges within one sync; re-running E2's INSERT (idempotent) is the belt-and-braces option.
- **E3 (dual-write window):** `packages/ingest/src/prismaStore.ts` — `resolvePeriodId` (:97-105, the F-C12 root) becomes `resolvePeriodBindings({kind,label}) → [{leagueId, periodId}]` via `period.findMany` (no league filter needed — returning ALL leagues' matches is the fix); `upsertMatch` (:64-95) keeps stamping `periodId` (single-league value, unchanged behavior) AND upserts junction rows per binding. Port (`store.ts:49-56`) + `packages/ingest/src/memoryStore.ts` double change together. Rollback: safe — column is still authoritative for all readers.
- **E4 (consumer cutover):** §4 waves. During cutover junction ⊇ column (backfill + dual-write), so rewired readers see a superset that is exactly-equal at N=1. Rollback per wave: safe — column still written.
- **E5 (raw-SQL trigger rewrite, migration):** `20260612220000_lineup_lock_scheduled_unlock/migration.sql:71-79` — the self-heal EXISTS joins `fifa_match m ON m."period_id" = NEW."period_id"`. New migration `CREATE OR REPLACE` of the trigger function routing through the junction (`JOIN "match_period" mp ON mp."period_id" = NEW."period_id" JOIN "fifa_match" m ON m."id" = mp."match_id"`); semantics preserved (NEW.period_id is `lineup_slot.period_id`, already league-scoped via Period). **Tested via a gated-Postgres integration suite** — precedent: `apps/web/src/pool/poolPickRls.integration.test.ts` (nested-RLS trap proof) and the BACKFILL_PII_PG_TEST_URL gated suite; assert (i) sanctioned self-heal still unlocks, (ii) played-lock still raises, (iii) junction-miss fails CLOSED (no unlock — the safe direction; a rollback of E3 merely re-freezes self-heal for brand-new fixtures, it never wrongly unlocks). Decision input: F-D11 wants the same lines rewritten to scope self-heal to the lock-source match — couple here or sequence immediately after (§5).
- **E6 (contract, migration — LAST):** drop `fifa_match.period_id` + its index + the `period`/`matches` relations. **Gates:** (1) a CI fence (precedent: timeTruthFence, the uuid-bind fence at main@355e050) proving zero repo references to `fifaMatch.periodId` / `match: { periodId` / `"period_id"` on fifa_match outside historical migrations; (2) all four Render services deployed past E4/E5 (F-A17: no deploy ordering guarantee — an old worker image reading the column would break); (3) one full live matchday observed green on junction reads.
- **Point of no return: E6.** Everything through E5 rolls back to column-authoritative reads with zero data loss. After E6, re-adding the column requires junction→column re-derivation which is **lossy at N≥2 leagues** (which league's period wins?) — F-A15's forward-only reality makes this the one irreversible step.

## 4. Rewire ORDER over the L1 inventory (all 47 rows)

**Read pattern (shared):** Prisma relation traversal `match: { periodLinks: { some: { periodId } } }` for filters/joins, plus two tiny helpers in a shared module: `periodFor(leagueId, matchId)` (point lookup on the `[leagueId,matchId]` unique) and `bindingsFor(matchId)` (fan-out list). Reverse read: `matchPeriod.findMany({ where: { periodId } , select: { match }})` replaces `Period.matches` includes.

- **W0 — schema + ports + doubles (no behavior change).** Rows **1** (schema DDL — E1), **2** (historical migration `20260604120000` — history, never touched), **7** (IngestStore port), **47** (ingest memoryStore double). Recompute's double needs nothing (resolution (a) above). Test surface: `packages/ingest/src/store.test.ts`.
- **W1 — write path / ingest (dual-write, E3).** Rows **4, 5, 6**. This kills the F-C12 root first: L1 risk-site #2 (`resolvePeriodId` findFirst) dies before any reader moves. **No MT-1 prerequisite** — the "league loop" is an unfiltered `period.findMany({kind,label})`; no session context exists or is needed at ingest. Tests: `ingest.test.ts`, `store.test.ts`.
- **W2 — engine reads (worker correctness core).** Rows **8, 9, 10** (locking: `lockSlot` at ingest/prismaStore.ts:282-333 fans out — for each junction binding of the source match, run the pure gate then the period-scoped `updateMany`; `lock.ts:132-144` gate stays per-period, caller loops — its `periodId:null → "no-period"` deny maps to "zero junction rows"); rows **11, 12** (recompute: `getAffectedManagerPeriods` prismaStore.ts:205-213 → junction findMany then `periodId: { in }`; `getManagerPeriodSlots` :253-256 → `match: { periodLinks: { some: { periodId } } }`); rows **16, 17** (notify: `listFantasyStartersForMatch` notify/prismaStore.ts:27-41 fans per binding — this IS the F-A26 fix); rows **13, 14, 15** (period-close: `Period.matches` includes at periodClose.ts:71-73,:125 → junction reverse reads). **No MT-1 prerequisite for correctness** — these are fan-outs keyed by match or period, not sessions; the `league.findFirst` singletons (periodClose.ts:55, F-C11) are a SEPARATE MT-2 loop-over-leagues change that can land before or after. Tests: `lock.test.ts`, `lockSweep.test.ts`, `sweepClaimClear.integration.test.ts`, `recomputeMirror.contract.test.ts`, `notify/selectors.test.ts` + `triggers.test.ts`, `period/dispatch.test.ts`.
- **W3 — web loaders + FAAB + commish + autofire.** Rows **18-21** pool (row **22**, pure engine, consumes a `periodKind` value — NO rewire), **23-27** lineup, **28-30** vsfield, **31-33** games/player-box, **34** dashboard, **36** standings, **37** waivers, **38-39** faab, **40-44** commish (row 44 = cli.ts:174-175 confirmed sole cli consumer), **45** autofire. All are league-in-scope?=Y per L1 **except row 35** (`loadNavPhase` — global memoized): the Y rows can thread their existing `leagueId` into junction reads with no prerequisite; row **35** needs MT-1 session-league context (F-C02) to become per-league, OR stays competition-global by declared design (phase is identical across leagues of one competition) — DEC-0-competition-model input, flag in the PR. Tests: `loadGameDetail.contract.test.ts`, `loadPlayoffs.integration.test.ts`, `commishStatWrite.integration.test.ts`, `dashboard.test.ts`, `thirdPlace.test.ts`, `eliminatedTeam.integration.test.ts`.
- **W4 — the raw-SQL trigger (E5).** Row **3**. After W1 is deployed and observed; gated-PG suite per §3.
- **W5 — contract (E6).** Row 1's column dropped; fence + deploy gates per §3.

**Rows that should NOT rewire (or only mechanically):** row **2** (immutable history); row **22** (pure value consumer); row **10** (pure gate — signature untouched, caller loops); row **46** (elimination, elimination/prismaStore.ts:16-25) — **correctly global**: `fifa_team.eliminated` is competition truth, and its current `period: { is: { kind, frozenAt } }` filter is only a proxy for "frozen KO result". It must be *mechanically* re-pointed (`periodLinks: { some: { period: {...} } }`) before E6, but must NOT gain league scoping; note the N≥2 nuance that `some` fires when ANY league has frozen — acceptable (freeze is result-driven and near-simultaneous), record it in the PR.

**Compat-shim decision: keep dual-WRITING the old column until E6; rewired readers go junction-ONLY (no read-fallback to the column).** Rationale: backfill + dual-write make junction ⊇ column, so a junction miss is a true "no binding", and a column fallback would silently mask dual-write bugs while re-importing the exact single-league semantics being removed. The column's job during cutover is protecting *un-rewired* sites and rollback images — a write-side shim, not a read-side one.

## 5. Interactions & residual risks

- **F-A26 (notify):** solved structurally by the W2 fan-out; residual — the `notification_sent` ledger's idempotency key must disambiguate per-league sends for one match (**suspected — needs read of the ledger unique key in `packages/db/prisma/schema.prisma` notification tables** before W2's notify slice).
- **F-C10 (loader scoping) — junction wins over leagueId-on-fixtures:** `fifa_match` is genuinely global (F-C10's verifier correction :295 — same-tournament leagues CORRECTLY share fixtures); a `league_id` column would either duplicate fixture rows (breaking `balldontlieId @unique` and every stat table) or be single-valued (the periodId bug again). The junction gives every loader a league-scoped fixtures read via the `[leagueId,matchId]` unique. Junction loses only under DEC-0 branch (b) or middle-option 2 (§2), where it's unnecessary.
- **F-D11 (self-heal scoping):** the junction does NOT fix it — the predicate stays "any scheduled team-match in the period" (:356-361). But W4 rewrites the exact lines (migration.sql:71-79); coupling the lock-source-match scoping there saves a second trigger migration and a second gated-PG round. Decision input: couple vs sequence — surfaced, not picked.
- **PgBouncer/transaction:** backfill is one small INSERT..SELECT inside the migration transaction on the migrate-deploy path all 30 prior migrations used (web preDeploy, render.yaml per F-A15/F-A17 — direct, not pooled). No long transaction, no lock risk. The dual-write adds one upsert per match per league per sync — negligible.
- **Realtime — verified none:** repo `postgres_changes` bindings target `score_manager_period` (period_id filter is on that table, not fifa_match), `standing`, `playoff_entry` (apps/web/src/vsfield/realtime.ts:75-127, standings/realtime.ts:46-73) and draft tables; /pool deliberately has none (poolContracts.test.ts:123-127). No binding on `fifa_match` → the junction requires zero publication/RLS-policy work; keep it default-deny.
- **L1's 3 highest-risk sites, de-risked:** (1) *raw-SQL trigger* — dedicated E5 migration, gated-PG suite, and a fail-CLOSED failure direction (junction miss ⇒ no unlock, never a wrong unlock); it is also sequenced before E6 so the "breaks silently at write time once the column is dropped" scenario is structurally impossible. (2) *resolvePeriodId* — rewired FIRST (W1) so no arbitrary-league stamp ever reaches a junction-reading consumer; findMany-all-leagues removes the findFirst nondeterminism at the root. (3) *recompute dirty-walk + slot scoring* — fan-out via `periodId IN (bindings)` with the existing memoryStore double already modeling per-period links (resolution (a)), so RED tests for two-league fan-out are a seed away; `sweepClaimClear.integration.test.ts` covers the claim/re-dirty TOCTOU unchanged.

## 6. Build order + decision gates

| # | Step | Migration-class? | Gated on | Build-ready NOW? |
|---|---|---|---|---|
| 1 | DEC-0: one-DB vs per-league + competition model (shared periods vs match junction) | no | Sergio/Chat | decision, not build |
| 2 | E1+E2 migration (`match_period` + `Period @@unique([id,leagueId])` + backfill) | **yes (additive)** | DEC-0(one-DB=shared) + DEC-0(competition model=match-junction) | YES once #1 lands — spec above is implementation-complete |
| 3 | W0+W1 ingest dual-write (rows 4-7, 47) | no | #2 deployed | YES after #2 (no MT-1 dependency) |
| 4 | W2 engine reads (rows 8-17, 13-15) | no | #3 deployed | YES after #3 (no MT-1 dependency) |
| 5 | W3 loaders (rows 18-45 per §4; row 35 flagged) | no | #2; row 35 optionally MT-1 (F-C02 session league) | YES for the Y-flagged rows; row 35 needs MT-1 or an explicit competition-global decision |
| 6 | W4 trigger rewrite (row 3; optional F-D11 coupling) | **yes (CREATE OR REPLACE fn)** | #3 deployed + gated-PG suite green | YES after #3 |
| 7 | Per-league worker loops (F-C11) — parallel MT-2 track, not junction-blocked | no | MT-1 (per-league commissioner/membership for actor paths) | independent |
| 8 | E6 contract: drop `fifa_match.period_id` | **yes (destructive — point of no return)** | fence CI green + all 4 services past #4/#5/#6 + one green live matchday | NO — last, deliberately |

**DEC-0 dependency map feed:** the ONLY steps gated on DEC-0 are #2 (and transitively everything after); nothing in this lane blocks MT-1. If DEC-0 lands per-league-DB, this entire lane collapses to "no migration" (§2b) and the L1 inventory becomes a no-op list. If DEC-0 lands shared-periods (middle option 2), swap #2's table for the `league_period` overlay and re-run this design one level up.

---

# V45 — Adversarial design-review verdict for L4 (Fable, independent)

**4/6 attacks came back clean (composite-FK validity, backfill SQL/fence, lockSlot fan-out shape, no-fifa_match-Realtime); 3 corrections stuck; suspected item resolved (ledger key OK).**

### Corrections (stuck)
1. **P2 — E2's "re-run as belt-and-braces repair" claim is wrong for diverged bindings.** `ON CONFLICT ("league_id","match_id") DO NOTHING` only repairs *missing* rows; it silently keeps a **stale** junction row when a match's period was re-stamped (column moved, junction didn't). Re-stamping is routine: `upsertMatch` writes `periodId` on every sync `update` (packages/ingest/src/prismaStore.ts:84,91). Fix: `DO UPDATE SET period_id = EXCLUDED.period_id` (still idempotent), or drop the repair claim.
2. **P2 — E3 dual-write has no binding-removal path, and the rollback story is one-directional.** §1 declares "periodId = NULL becomes absent row", but E3 only "upserts junction rows per binding" — a match re-stamped to `periodId = NULL` (derivePeriodLabel returns null, map.ts:484) leaves a stale junction row that junction-only readers keep treating as a fantasy fixture. Period *deletion* is covered (Cascade) but column NULL-ing is not — E3 must also delete (or tombstone) bindings absent from the resolve result. Related: E4's "Rollback per wave: safe — column still written" covers *reader* rollback only; an **E3/W1 writer revert while W2/W3 junction-only readers are live** breaks the `junction ⊇ column` invariant for fixtures created/re-stamped in the revert window — miss direction is no lock stamp (the 2026-06-12 leak class, prismaStore.ts:282-345) and no recompute fan-out, NOT fail-closed. Only the E5 trigger's revert direction was analyzed. Constraint to add: once W2 readers are live, an ingest revert must roll back past E3 readers too, or re-run the E2 repair (with fix #1) immediately after revert.
3. **P3 — §6 step 5 (W3 loaders) is gated on "#2" but must gate on "#3 deployed".** The E4 premise "junction ⊇ column" requires dual-write live; W3 readers are junction-only by the §4 compat-shim decision. Deploying W3 after the migration but before W1 makes any match upserted in the E1→E3 window invisible to rewired web loaders. W2's gate (#3 deployed) is correct; step 5 was inconsistent with it.
4. **P3 — wave coverage was 46/47: row 46 (elimination) assigned to no wave.** It appears only in the "should NOT rewire (or only mechanically)" paragraph; pin its mechanical re-point explicitly to W2 or W3 (its test was already listed under W3). All other rows check out (W0: 1,2,7,47; W1: 4-6; W2: 8-17; W3: 18-45; W4: 3; W5: 1).

### Attacks that did not stick (verified)
- Composite FK `fields:[periodId,leagueId] references:[id,leagueId]` against `Period @@unique([id,leagueId])` is valid on this repo's Prisma 6.2.1 (packages/db/package.json:27,33) — but **zero precedent in schema.prisma** (no multi-field `references:` anywhere): recommend a 5-minute `prisma validate`+`migrate diff` spike as W0's first task.
- `gen_random_uuid()` has no migration precedent (prior migration INSERTs use literal ids) but is core PG13+; uuid→TEXT `id` needs no cast; the uuid-bind fence (apps/web/src/fences/uuidBindFence.test.ts:49,75) scans only non-test `.ts/.tsx` and bans `::uuid` — E2 is `.sql` with no `::uuid`, zero bearing.
- lockSlot fan-out description matches code shape (prismaStore.ts:282-345: source-match `periodId` read :287/:297, pure gate :298-306, period-scoped updateMany :329-333).
- No `postgres_changes` binding targets `fifa_match` — bindings are playoff_entry/score_manager_period/standing + draft/draft_pick only.

### Suspected item resolved — notification_sent ledger needs NO key change
The key is `@@unique([managerId, kind, subjectId])` (schema.prisma:1101); `subjectId` for `match_starting` is the matchId (apps/worker/src/notify/selectors.ts:122) and `Manager` is league-scoped (one manager row per league even for the same user). Under the junction, one match fanning to N leagues yields distinct `managerId`s per league, so each league's send gets its own ledger row while re-fires within a league stay idempotent. Behavioral note: a user managing in two leagues receives two pushes for one match — correct per-league behavior, not a bug.
