# LANE L5 — UCL-2 Format-Machine Design (spec only)

_Phase-1 launch-spec pass, 2026-07-06. Lane model: Fable (auditor tools, read-only design lane). Built on L2's literal catalog. Adversarial design-review verdict appended at bottom._

_Inputs: audit/AUDIT_LAUNCH_readiness.md (F-D03/04/05/10/11/14/15/16/17/23, Lane D inventory rows 897–958, §5 thread 6, INV-10), audit/phase1_launch_spec/L2_rls_wc_literal_catalog.md Part B (built on, not re-derived). All code paths below read this session. Format facts designed against: 36 clubs, one Swiss table, 8 league MDs, top-8 → R16, seeds 9–24 → two-legged play-off round, 25–36 out, R16/QF/SF two-legged (ET/pens leg 2 only), single-match Final, ~10-month span._

_DEC-0 decisions referenced as inputs (never picked here): **DEC-feed** (provider/stage-text/standings endpoint — INV-1), **DEC-pool-tie** (per-leg 1X2 vs per-tie advancer pick — INV-10), **DEC-round** (guillotine "round" = leg or tie — INV-10)._

---

## 1. Two-legged-tie period model

**Ground truth (verified this session):**
- `packages/db/prisma/schema.prisma:513-547` — Period carries `kind/label/cutCount/frozenAt/waiverBatchAt/batchClearedAt/status`, `@@unique([leagueId,label])`. One period today = one knockout round holding all its fixtures.
- `schema.prisma:482-507` — LineupSlot `@@unique([managerId, periodId, playerId])` (:503); `lockedAt` one-way latch per slot. One XI identity per period ⇒ no per-leg rotation inside a period.
- `packages/commish-core/src/advance.ts:29` (`FINAL_ROUND = KNOCKOUT_ROUNDS[len-1]`), `:97-102` (round label must ∈ KNOCKOUT_ROUNDS), `:104` (`loadRoundContext(leagueId, roundLabel)` — ONE round = ONE period context), `:153-159` (ordering guard `uncutPriorRounds`), `:164-170` (frozen precondition), `:232-239` (`applyRoundCut` takes a single `roundPeriodId`). The break for UCL is **here** — round semantics — not in the math: `packages/recompute/src/guillotine.ts:38-86` and `playoffRound.ts:74-129` are pure fantasy-points-per-round and format-agnostic (audit D1-trivial rows 944-946 respected; also `standing.ts` per row 946).
- `packages/recompute/src/periodStatus.ts:15-21, 60-97` — "exactly one open period": close when every fixture `completed` (:76), promote earliest non-closed by `comparePeriodLabels` (:90-94).
- `packages/faab/src/window.ts:30-34` — per-period sealed-bid → free-agency → **locked at the period's first kickoff, for the rest of the period**.
- `packages/db/prisma/migrations/20260612220000_lineup_lock_scheduled_unlock/migration.sql:61-83` — self-heal unlock authorized by "ANY still-`scheduled` match in the slot's period for the player's team" (:71-79), not the lock-source fixture (F-D11).

### Shape A — tie-as-one-period (period = knockout round, both legs inside)
Ingest maps leg 1 and leg 2 of a round to the same period label; everything else is today's shape.
- **Schema:** no period-model delta. **Mandatory rider regardless of shape:** re-scope self-heal (see below), because under A the F-D11 predicate is satisfied *by design* in every knockout round (leg 1 completed + leg 2 scheduled, same team, same period) — a routine structural hazard, not an edge case.
- **Lock model:** `lockedAt` stamps at leg-1 appearance; the slot is then immutable for leg 2 (trigger at migration.sql:85-99). A leg-1 starter who is injured/suspended cannot be rotated out except via the one-way forfeit (`voidedAt`, schema.prisma:493-495) which also voids his leg-1 points — product-hostile.
- **Guillotine/advance:** byte-untouched. `score_manager_period` naturally sums both legs (one row per period); `frozenAt` stamps after the round's last leg-2 FT; `resolveRoundCut` unchanged. **Only valid if DEC-round = tie.** If DEC-round = leg, A cannot express a per-leg cut at all (one period, one score, one cut).
- **FAAB (F-D11 sibling, audit row 939):** `window.ts:31` locks at the round's first kickoff ⇒ acquisitions dead for the round's full ~2–3-week span; single `waiverBatchAt`/`batchClearedAt` latch (schema.prisma:529-532) cannot express a between-legs batch without new columns.
- **periodStatus:** invariant holds trivially; the one open period just spans weeks.
- **UI:** period selectors/tabs unchanged; lineup page must message "XI covers both legs."
- **Byte-untouched:** advance.ts, guillotine/playoffRound/standing/playoffsView, periodStatus.ts, window.ts, provisioning shape (labels only).
- **Migration class:** none for the model; migration only for the self-heal rider.
- **Failure modes:** dead FAAB mid-round; forced stale XI (the exact loss F-D04 names); self-heal predicate permanently armed; forfeit semantics collide with legitimate leg-2 rotation intent; postponed leg-2 keeps the period open and blocks the next round's promotion (periodStatus.ts:76).

### Shape B — leg-as-period (period = one leg, e.g. `PO-L1`, `PO-L2`, `R16-L1`…)
- **Schema:** additive Period columns: `legNumber Int?` and `roundLabel String?` (group key: all leg-periods of one knockout round share `roundLabel`; `@@unique([leagueId,label])` keeps leg labels distinct). `cutCount`/`frozenAt` usage forks on DEC-round (below). Migration = additive, no backfill needed for a fresh UCL league (WC rows get `legNumber NULL` = single-leg).
- **Lock model:** unchanged mechanics; per-leg XI is natural (distinct `periodId` per leg ⇒ distinct LineupSlot rows). F-D11 regresses to today's rare-edge (one match per team per period) — still fix the self-heal rider for correctness.
- **FAAB:** `window.ts` works per leg unchanged — sealed-bid + FA window before each leg, exactly the F-D11-adjacent behavior UCL wants.
- **periodStatus:** invariant holds; legs open/close sequentially via `comparePeriodLabels` — `periodOrder.ts:30-37` must learn the new label grammar (today `MD\d` + `KNOCKOUT_INDEX` from `KNOCKOUT_ROUNDS`, periodOrder.ts:21-23,32-35).
- **Guillotine/advance — the DEC-round fork:**
  - **DEC-round = leg:** each leg-period is a cut round with its own `cutCount`. advance.ts needs only vocabulary generalization (round-label list from config instead of `KNOCKOUT_ROUNDS`, advance.ts:97-102; FINAL_ROUND from config, :29). Cut moments ≈ 9 (PO-L1…SF-L2, Final) ⇒ `cutScheduleFor`/`MIN_PLAYOFF_FIELD` (`packages/recompute/src/transition.ts:23, 88-105`) re-parameterize on round count (min field 10). Cheapest engine path; changes the fantasy product cadence materially.
  - **DEC-round = tie:** advance.ts's store contract changes: `loadRoundContext` must aggregate `score_manager_period` across the round's two leg-periods (sum per manager), freeze precondition = **both** legs frozen, `applyRoundCut` keyed on `roundLabel` not one `roundPeriodId` (:232-239), `cutCount` stored once per round (on leg-2 row or a round entity — pushes toward Shape C). Idempotency latch must move to round scope or a re-run against the other leg-period double-cuts.
- **Byte-untouched:** guillotine.ts, playoffRound.ts, standing.ts, scoring engine, window.ts, periodStatus.ts (logic; label comparator input changes).
- **Failure modes:** label-grammar drift (three grammars — provisioning, ingest, periodOrder — must move in lockstep; F-D17's exact bug class); under DEC-round=tie, any consumer still equating "round = period" (loadPlayoffs ordering per audit row 950, playoffsView round list, pool ROUND_TITLES) shows two half-rounds; freeze/restatement per leg needs a stated rule for cross-leg stat corrections.

### Shape C — explicit KnockoutRound entity over leg-periods (third shape)
Keep Period = leg (locks/FAAB/status/lineups all per leg, as in B) and add a `knockout_round` table: `(id, leagueId, label, legs Int, cutCount Int?, frozenAt DateTime?)` with `Period.knockoutRoundId FK`. The guillotine lifecycle (freeze → cut → audit) moves onto the round entity; the wave lifecycle (open/close/batch/lock) stays on Period.
- **Schema:** new table + FK (additive migration); `Period.cutCount/frozenAt` deprecated for knockout kinds (kept for league-phase freeze).
- **Engine:** advance.ts store loads round context from the round row + SUM over its leg-periods' `score_manager_period`; ordering/idempotency/FINAL_ROUND become round-entity queries — same edits as B/tie but with a first-class key instead of a label convention (no string-grouping fragility). Under DEC-round=leg, C degenerates to B (rounds with one leg) — still coherent.
- **Failure modes:** two lifecycle machines to keep consistent (leg status vs round freeze); more moving parts than A; provisioning must seed both tables atomically.
- _Considered and rejected as primary: leg-scoped LineupSlot identity inside one period (widen :503 unique key with `leg`). It preserves advance.ts but forces leg-awareness into the lineup engine, the lock trigger, validateLineup, and scoring's slot reads, while leaving FAAB/window/self-heal period-scoped — worst of both._

**⛔ DEC-0 FORK MARKERS (surfaced, not picked):**
1. **DEC-round (leg vs tie)** forks Shape B's advance.ts work (vocabulary-only vs aggregate-context rewrite), the cut-schedule math (`transition.ts:23,88-105` — 5 rounds is only *coincidentally* preserved under tie: PO/R16/QF/SF/Final), and whether Shape A is even admissible (tie only).
2. **DEC-pool-tie (per-leg 1X2 vs aggregate advancer)** forks the pool leaf: `packages/pool/src/pool.ts:89-95` (`knockoutAdvancer` FT→ET→pens on ONE row) + `derivePoolResult` :104-112 is per-match. Per-leg: leg 1 becomes a 1X2 (DRAW legal — `POOL_PREDICTIONS`, enums.ts:78) and leg 2 an advancer — mostly config; aggregate: needs a tie-scoped read layer over two matchIds + `PoolPick` re-key (F-D06, out of UCL-2's build scope but its data seam — tie linkage — is decided here). `apps/web/src/pool/resolvePoolPeriod.ts:32-40` stays the loader-boundary synthesis point either way (the T-3RD precedent, `THIRD_PLACE_POOL_LABEL` :22).
   Whatever shape wins, **tie linkage** (leg1↔leg2 pairing: `FifaMatch.tieId` or `(roundLabel, homeTeamId/awayTeamId mirror)` derivation) is a shared prerequisite for pool-aggregate AND elimination (§5) — put it in the schema regardless (nullable `fifa_match.tie_id`, additive).

**Shape-independent rider (build-ready now):** re-scope the self-heal to the lock-source fixture — add `lineup_slot.lock_source_match_id` (stamped by the lock sweep) + rewrite the trigger EXISTS (migration.sql:71-79) to test THAT match's status. Also closes today's open WC edge (p0:F-P2-06 per F-D11 cross-ref).

---

## 2. Swiss-table replacement (F-D14, real-football standings)

**What exists:** `GroupStanding` PK=`team_id`, denormalized `bdlGroupId/groupName`, `season @default(2026)`, explicitly "WC2026-ONLY" (schema.prisma:817-840, comment :813); ingested by `ingestGroupStandings` (`packages/ingest/src/ingest.ts:293-307`, single non-paginated feed call) from the WC-only `group_standings` endpoint (F-D09; feed client not re-read this session — per audit :175-176); rendered by `buildGroupStandings` (`apps/web/src/games/buildGameDetail.ts:922-961`) with same-group guard (:931), `isQualifying = position <= 2` (:951), and "Top 2 advance" copy (:906).

**Replacement schema:** `competition_standing` — `@@id([editionId, teamId])` where `editionId` FKs the UCL-1 competition-edition entity (F-C17; this table must NOT repeat GroupStanding's PK=team_id single-edition trap). Columns: `position, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points, updatedAt`; drop `bdlGroupId/groupName` entirely. Zone cutlines are **config, not code**: a per-edition `zones` JSON (e.g. `[{from:1,to:8,key:'direct'},{from:9,to:24,key:'playoff'},{from:25,to:36,key:'out'}]`) replaces the hardcoded `<=2` — the exact generalization `buildGameDetail.ts:951` lacks.

**Ingest seam — DEC-feed-blocked leaf:** define `ingestCompetitionStandings(feed, store, editionId)` mirroring `ingest.ts:293-307`'s shape (single fetch → pure map → foreign-guarded upsert, per-item isolation). Two sources, decided by DEC-feed: (a) provider standings endpoint (preferred — `position` stays feed-authoritative like today, schema.prisma comment :814 precedent; UEFA tiebreaks need disciplinary/coefficient inputs not derivable from match rows); (b) in-house computation from completed league-phase `fifa_match` rows (points/GD/GF only — approximate ordering; acceptable fallback, flag rows `derived`). Build the store/table + mapper seam now; wire the source after DEC-feed.

**UI surface:** /games Standings tab → one 36-row table with zone bands + `inMatch` highlight. Delete the same-group guard (:931) — in Swiss, both teams are always in the one table; keep the null-guard "standings not ingested → tab hidden" fail-safe (:927-930). Advance/tiebreak footnotes (:906-908) become per-edition copy. A standalone standings surface (nav or /games index) is a product option on the same view-model — out of UCL-2 scope.

**Deleted outright:** `GroupStanding` model + `mapGroupStanding` + `ingestGroupStandings` + the `wc-fantasy-group-standings` cron (F-D22, render.yaml — replaced by the new job); `FifaGroup` + `fifa_team.group_id` + `fifa_match.group_id` (schema.prisma:270-283, :291, :380 — already documented dead/unpopulated, audit row 948, T18 memory: group derived via group_standing, never fifa_match.group_id); `groupStandings` from the feed type surface (lands in UCL-3).

---

## 3. Ingest label-derivation rewrite (F-D05/F-D10/F-D17)

**What exists:** `packages/ingest/src/map.ts:435-441` — independent 5-entry `KNOCKOUT` regex table (the F-D17 duplicate; map.ts imports only `PeriodKind, Position` from @app/shared per L2). `derivePeriodLabel` :459-485: third-place guard first (:463), knockout branch gated on `!stageNorm.includes("group")` (:468), group branch on `.includes("group")` + `round_number` (:477-483), **silent `return null`** (:484). Exactly ONE non-test caller: `ingest.ts:67` (L2-verified). UCL stage text matches neither branch ⇒ every league-phase fixture and the whole play-off round gets `period_id = NULL` silently.

**Design — the seam (build NOW), values blocked on DEC-feed:**
1. **Per-competition stage vocabulary as data.** New shared type `StageVocabulary = { leaguePhase: { stageAliases: string[] /* normalized substrings */, labelFrom: 'round_number' /* → MD{n} */ }, knockout: Array<{ label: string; legs: 1|2; aliases: string[] }>, ignore: Array<{ aliases: string[]; reason: string }> }`. The knockout `label` list IS the round vocabulary — provisioning (`plan.ts`), `periodOrder`, advance.ts, and ingest all consume the **same object** (kills F-D17: map.ts:435-441 deleted, matchers generated from `aliases` at load). Home: `@app/shared` per-competition constants first (WC2026 + UCL entries), with a DB-per-edition escape hatch when multi-competition lands (UCL-1's edition row can carry it).
2. **Signature:** `derivePeriodLabel(f, vocab)` — pure, vocabulary injected; `ingest.ts:67` threads the edition's vocab. Leg detection (from feed round text/leg field — DEC-feed) returns `{kind, label, leg?}` feeding §1's chosen period labeling.
3. **Silent-null → three-way result:** `{ kind:'linked', ... } | { kind:'ignored', reason } /* explicit: 3rd-place, exhibition */ | { kind:'unmapped', stageText, roundText }`. `unmapped` still stores the match with NULL period (never block ingest) but **must** emit a `log.warn` with the raw stage/round text and increment a per-tick `unmappedFixtures` count surfaced in the scheduler summary (and to the HARD-1 alert channel once it exists). Plus a **reconciliation check** after schedule-sync: every fixture is `linked` or `ignored`, else the sync result is flagged — fail-loud at the seam where F-D05's "core mechanics silently do nothing" failure is born. Quarantine of the raw payload is unnecessary (the row is stored; only the link is missing).
4. **Blocked leaf (DEC-feed):** the actual `aliases` strings for UCL ("League phase", "Play-offs", leg markers, localized variants) and whether legs arrive as distinct stage text vs a leg field. Ship the seam with the WC vocabulary as config #1 (regression-proves parity byte-for-byte against today's regexes), leave the UCL entry as a fixture-driven TODO.

---

## 4. Phase-vocabulary rename plan (F-D15)

**L2 sizing (adopted):** grep 94 files ⇒ ~38 non-test source files + `schema.prisma` enum + 1 new migration; only **~15 hand-edit sites** (literal comparisons/keys); the remainder auto-follow once values re-source from `@app/shared`. `TournamentPhase` = 10 source consumers. The one guaranteed non-follower is map.ts:435-441 — deleted by §3, which must land with or before the rename's knockout-label consumers.

**Enum strategy:** values to rename: `PeriodKind.group_md → league_md` (`knockout_round` stays), `LeagueStatus.group → league_phase` (or `regular`), `StandingScope.group_stage → league_phase` (schema.prisma:44-54, :97-101; lockstep arrays enums.ts:14,18,59).
- **Preferred: in-place `ALTER TYPE … RENAME VALUE`** (one transactional migration; historical WC rows re-label semantically-equivalently; no dual-write window code). Risk: deploy-order coupling — old worker code writing the old literal fails after migrate (F-A15 expand/contract discipline). Mitigation: execute in the **between-seasons idle window** (WC league `complete`, no live scoring; today is 2026-07-06 — this window is now/soon), web `preDeployCommand` runs migrate, worker deploys same push; residual gap is minutes of a worker that only reads.
- **Fallback (if rename must ship while WC scoring is live): expand/contract** — add new values, dual-read in `@app/shared` type guards, `UPDATE` backfill, switch writers, retire old values in a later type-rebuild migration. ~3× the steps; only buy it if timing forces it.

**The ~15 hand-edits (categories, per L2 Part B):** commish transition literal `leagueStatus !== "group"` (per audit :599); `selectTournamentPhase` kind-keys + `label==='Final'`; `selectDashboardPhase` UI vocab; recompute store/standing `kind==='group_md'` filters; elimination stores' `kind='knockout_round'` gates (verified `apps/worker/src/elimination/prismaStore.ts:24` — value unchanged, re-source only); autofire store; lineup view knockout branch; `PoolClient` ROUND_TITLES; `resolvePoolPeriod`; faab copy (§5). Everything else consumes `PERIOD_KINDS`/`KNOCKOUT_ROUNDS` and auto-follows.

**Test fallout:** ~48 test files carry literals (L2); mechanical fixture updates + the §3 parity suite. Gate: full DoD + gated Postgres integration (enum migration touches DB).

**Ordering vs §1–3:** rename FIRST. It is DEC-0-independent (names are ours, not the feed's), it is the smallest-diff moment (before §1/§3 rewrite the same files), and §3's vocabulary object should be born with the new names. Do NOT fold it into the period-model migration — separate, revertable-by-forward-fix migration per F-A15 discipline.

---

## 5. Eliminated-flag semantics (F-D16/F-D23)

**What exists:** `fifa_team.eliminated` boolean, default false, add-side FA gate only; **auto-derived** by the merged worker (schema.prisma:292-302 comment — REVERSES the audit's "manual-only" premise, which predates `feat/auto-team-elimination`): `apps/worker/src/elimination/prismaStore.ts:21-37` reads completed fixtures whose period is `kind='knockout_round'` AND `frozen_at NOT NULL`; `:48-62` guarded, set-only, never-revert write; the pure loser derivation is **per single match** FT→ET→pens (`selectEliminatedTeams.ts:50-71`). Gate predicate `isAddTeamEliminated` (`packages/faab/src/faEligibility.ts:66-68`) is already competition-neutral. User copy is not: `packages/faab/src/errors.ts:213` — "eliminated from the World Cup".

**UCL meaning of "eliminated" (against the given format facts):** three distinct event kinds —
1. **Swiss-phase bulk moment:** clubs 25–36 are all out at one instant — final MD8 table settled. Not per-match-loser derivable; it is a **standings-position event**. (F-D23's "Europa drop-down" complication does not apply to the post-2024 format this design targets: 25–36 are simply out.)
2. **Two-legged KO ties:** the loser is the **aggregate** loser after leg 2 (ET/pens leg 2 only). The current per-match derivation is actively WRONG per leg — it would flag every leg-1 loser. Must not run per-match on 2-leg rounds.
3. **Final:** single match — today's derivation is correct as-is.

**Does the boolean survive?** Yes — the gate semantics ("club's campaign is over ⇒ no adds") generalize per F-D16, and `isAddTeamEliminated(boolean|null)` needs zero change. Recommended additive upgrade: `eliminated_at TIMESTAMPTZ NULL` (boolean derivable as `IS NOT NULL`) for audit/UI ("Out since League phase"); keep the column set-only/never-auto-revert exactly as documented (schema.prisma:296-300).

**Worker redesign (preserving set-only + freeze-gating):**
- Store read becomes leg-aware: only ties whose **deciding leg** is completed+frozen enter derivation; pure layer gains `deriveTieLoserTeamId(leg1, leg2)` (sum FT goals; leg-2 ET/pens as decider) beside the existing single-match path (kept for the Final). Depends on §1's tie linkage (`tie_id`) — **gated on DEC-round/§1 landing**, since leg pairing is defined there.
- New Swiss-phase step: on league-phase completion (all `league_md` periods frozen), flag teams at `position >= 25` from the §2 table — set-only, one-shot, idempotent by the same `eliminated=false` guard (prismaStore.ts:59). **Gated on §2 (standings source) ⇒ transitively DEC-feed.** Mathematical-elimination-before-MD8 is explicitly out of scope (marginal value, high tiebreak complexity) — the F-D16 "automation" ask is satisfied by the two event hooks above.
- Note the deliberate duplication contract in `selectEliminatedTeams.ts:8-13`: the aggregate rule must land in BOTH the elimination helper and `@app/pool`'s advancer (or the DEC-pool-tie work), with mirrored tests — same drift-guard pattern as today.

**Copy:** `errors.ts:213` → competition-neutral ("eliminated from the competition") or edition-name-threaded; same pass fixes the FAAB "ENTIRE tournament" budget copy (`constants.ts:95-96` — F-D21-adjacent, copy only). Build-ready NOW.

---

## 6. Build order + decision gates

| # | Step | Migration? | Gated on (DEC-0) | Build-ready NOW? |
|---|------|-----------|------------------|------------------|
| 1 | **F-D15 rename**: enum-value migration (`ALTER TYPE RENAME VALUE`) + enums.ts lockstep + ~15 hand-edits + test sweep (§4) | **Yes** (enum) | none (execute in WC-idle window) | **Yes** |
| 2 | **Self-heal re-scope**: `lineup_slot.lock_source_match_id` + trigger rewrite of migration.sql:71-79 predicate (§1 rider; also closes p0:F-P2-06) | **Yes** (column + trigger) | none — required under every §1 shape | **Yes** |
| 3 | **Label-derivation seam** (§3): vocabulary-injected `derivePeriodLabel`, delete map.ts:435-441 (F-D17), three-way result + unmapped counter + post-sync reconciliation; WC vocab = parity config #1 | No | none for the seam; **DEC-feed** for UCL alias values (blocked leaf) | **Yes** (seam) |
| 4 | **Tie linkage schema**: nullable `fifa_match.tie_id` (+ pairing derivation in ingest) | **Yes** (additive) | **DEC-feed** (how legs are identified in payloads); shape-independent otherwise | Schema yes; ingest wiring after DEC-feed |
| 5 | **Period model** (§1): Shape A = labels only / Shape B = `legNumber`+`roundLabel` / Shape C = `knockout_round` entity; + `periodOrder.ts` grammar | A: No · B/C: **Yes** (additive) | **DEC-round** (admissibility + shape); **DEC-pool-tie** rides on step 4's linkage | No — spec both, hold |
| 6 | **validateConfig generalization**: `plan.ts:134-144` exact-set check → validate against the step-3 vocabulary's round list `{label, legs, cutCount}`; `buildProvisionPlan` :172-179 seeds per step-5 shape; re-parameterize `MIN_PLAYOFF_FIELD`/`cutScheduleFor` (`transition.ts:23,88-105`) on round count | No | **DEC-round** (seeding shape + cut-moment count; the 5-round WC/UCL equality holds only under round=tie) | Validator seam yes; seeding no |
| 7 | **advance.ts round context**: A = untouched · B/tie or C = aggregate `loadRoundContext` over leg-periods, round-scoped freeze/idempotency/FINAL_ROUND · B/leg = vocabulary-only | No (store queries only) | **DEC-round** (follows step 5) | No |
| 8 | **FAAB per-leg windows**: B/C = free (window.ts per leg-period) · A = new sub-window columns + batch latch redesign | A: Yes · B/C: No | **DEC-round** (shape-dependent) | No |
| 9 | **Swiss table** (§2): `competition_standing` (edition-keyed, zone config) + ingest seam + /games tab rewrite; then DELETE GroupStanding/FifaGroup/group_id cols + cron | **Yes** (new table; drops in a later cleanup migration) | schema+UI: UCL-1 edition entity only · ingest source: **DEC-feed** | Schema/UI spec yes; hold for UCL-1 |
| 10 | **Eliminated semantics** (§5): copy rewrite; `eliminated_at`; tie-aware KO derivation; Swiss bulk-elimination step | Copy: No · rest: **Yes** (column) | copy: none · KO derivation: **DEC-round** (via step 4/5) · Swiss step: **DEC-feed** (via step 9) | Copy **Yes**; rest no |
| 11 | **Pool tie leaf** (F-D06 seam only — build belongs to UCL-4): resolvePoolPeriod stays the synthesis boundary; per-leg vs aggregate | Aggregate: Yes (pick re-key) | **DEC-pool-tie** (+ step 4) | No |

**DEC-0 dependency summary:** **DEC-round** blocks steps 5–8, 10(KO), 11 — it is the single highest-leverage decision in this lane; **DEC-feed** blocks the value-leaves of 3, 4, 9, 10(Swiss) but none of their seams; **DEC-pool-tie** blocks only step 11 (+ influences step 4's linkage shape). Steps 1, 2, 3(seam), 10(copy) are build-ready today with zero DEC-0 exposure, and steps 1–2 additionally de-risk the live/legacy WC deployment.

_End of L5 deliverable._

---

# V45 — Adversarial design-review verdict for L5 (Fable, independent)

**All 5 attacks came back clean — 0 corrections stuck; every spot-checked cite accurate; one informational note.**

1. **Enum migration:** the repo precedent (packages/db/prisma/migrations/20260604130000.../migration.sql:6-10) is a **type-rebuild for a value REMOVAL** ("Postgres cannot DROP a value from an enum in place" — its own comment); it does not contradict L5's preferred `ALTER TYPE … RENAME VALUE` (transactional since PG10, fine inside Prisma's per-migration transaction). L5's fallback (later type-rebuild) exactly matches the repo precedent. Informational: rename has no repo precedent; Supabase PG major version isn't confirmable from the repo (certainly ≥10).
2. **Shape B FAAB "works per leg unchanged" — confirmed, no uncounted edits.** `effectiveBatchAt` auto-derives `firstKickoff − lead` when `waiverBatchAt` is null (packages/faab/src/batchTime.ts:38-42); `selectPeriodsToClear` is time-gated only (apps/worker/src/faab/selectors.ts:36-41); provisioning never seeds `waiverBatchAt`. Leg-periods get batch windows for free once seeded (seeding already counted in L5 step 6).
3. **transition.ts is genuinely round-count-parameterized:** no bare `5` — `MIN_PLAYOFF_FIELD = KNOCKOUT_ROUNDS.length + 1` (:23), `cutScheduleFor` uses `KNOCKOUT_ROUNDS.length`/`.map` (:97-104). Only the `KnockoutRound` type couples to the WC list — covered by L5 step 6.
4. **Eliminated §5:** duplication contract at selectEliminatedTeams.ts:9-13; per-single-match FT→ET→pens derivation :50-71 (so per-leg-wrong for 2-leg ties — L5's core claim holds); `eliminated:false` guard at elimination/prismaStore.ts:49,:59; `kind="knockout_round"` gate :24; schema comment :292-302 documents AUTO-DERIVED. All as stated.
5. **Swiss §2:** buildGameDetail.ts null-guards :927-930, same-group guard :931, `isQualifying = position <= 2` :951 — exact. `fifa_match.group_id`/`fifa_team.group_id` never written by ingest (sole `group_id` hit is a log-context read at packages/ingest/src/map.ts:358) — T18 memory confirmed. `errors.ts:213` and `constants.ts:95` copy cites confirmed.

### Cross-consistency findings (L4 × L5)
- **Junction vs L5 shapes — all three compatible.** L4's invariant is one period per (match, league). Shape A: two leg-*matches* → one period = two junction rows at the same period — allowed. Shape B: each leg-match → its own leg-period — trivially fine. Shape C: matches bind only to leg-periods; `knockout_round` is not a Period, so no second binding. No shape requires one match in two periods of one league (DEC-round=tie aggregates `score_manager_period` across leg-periods, not match bindings; pool-aggregate reads two matchIds via `tie_id`, not two periods).
- **F-D15 rename vs L4 waves — real shared-file churn; HARD ordering constraint:** both lanes rewrite `packages/ingest/src/prismaStore.ts` and `packages/recompute/src/prismaStore.ts` (+ overlapping test suites). **Land L5 step 1 (F-D15 enum rename) BEFORE L4 W1 begins**, or serialize the two threads on those files — an in-flight W1 branch would otherwise carry stale enum literals through the rename migration.
- **`fifa_match.tie_id` vs L4's global-fixture stance — consistent.** Tie linkage is competition truth (identical across leagues); parallels `is_third_place`, which L4 explicitly keeps on `fifa_match` as a separate axis.
- **periodStatus "exactly one open period" — both read it per-league; per-league is correct.** The selector is pure over an injected snapshot (periodStatus.ts:60-97) and both callers scope to one league — but via `league.findFirst` singletons, so today leagues 2..N would get NO status transitions (periods stuck pending, FA windows never open). L4 addresses this (F-C11, step 7); L5 doesn't need to (single UCL league); Shape A's "postponed leg-2 blocks next-round promotion" cite is accurate. The per-league loop remains an MT-2 item, correctly flagged only by L4.
