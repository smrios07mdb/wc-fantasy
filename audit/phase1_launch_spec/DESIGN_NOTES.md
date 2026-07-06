# PHASE-1 LAUNCH SPEC — Design Notes

**Date:** 2026-07-06 · **Class:** read-only, docs-only (zero source changes) · **Method:** 5 fixed, output-capped lanes (L1–L3 enumeration on Opus, L4–L5 design on Fable) + 4 independent verifier passes (V1–V3 inventory re-checks on Opus, V45 adversarial design review on Fable), gap-filling the T-LAUNCH audit (`audit/AUDIT_LAUNCH_readiness.md`, 98 findings) — never re-running its discovery.

**File index (all in `audit/phase1_launch_spec/`):**
- `L1_fc01_consumer_inventory.md` — 47-row `fifa_match.periodId` consumer inventory + V1 verdict (**56 rows** after 9 verifier-found misses).
- `L2_rls_wc_literal_catalog.md` — 27-policy live RLS catalog + WC-literal catalog + V2 verdict (6 more literal sites).
- `L3_hard1_classification.md` — HARD-1 live-vs-public classification + V3 verdict.
- `L4_junction_design.md` — F-C01/F-C12 `(match_id, league_id, period_id)` junction design + rewire order + V45 verdict.
- `L5_ucl2_format_machine_design.md` — UCL-2 format-machine design (tie shapes A/B/C, Swiss table, label seam, F-D15 rename, eliminated semantics) + V45 verdict.
- `DEC0_DEPENDENCY_MAP.md` — the per-thread decision-dependency map (companion to this doc).

Verification discipline: every lane row/claim was independently re-checked. Verdict totals: V1 46/47 CONFIRMED + 9 MISSED rows folded in; V2 all recounts exact (27 policies, 94 rename files, 20 TournamentPhase files, 1 derivePeriodLabel caller) with 1 table-count correction; V3 6/7 CONFIRMED, 1 mechanism correction; V45 L4 3 corrections stuck / L5 0.

---

## 1. Executive summary

1. **F-C01 is bigger than the audit sized it, but fully mappable:** the single `fifa_match.periodId` FK has **56 verified consumer sites** across 17 subsystems (audit cited ~4 seed sites). The junction design (L4) covers all of them in 6 ordered waves with an expand/contract migration whose only point of no return is the final column drop. The three riskiest sites (raw-SQL lock trigger, `resolvePeriodId`, recompute dirty-walk) each have an explicit de-risking step.
2. **The whole junction question forks on one DEC-0 call** — one-shared-DB vs DB-per-league (plus the competition-model sub-choice, match-junction vs shared-periods). Under DB-per-league, F-C01 needs **no migration at all** and all 56 rewires evaporate — at the cost of ×N ingest, ×N migrations, no cross-league surfaces, and a new session→DB routing problem. This is the single highest-leverage schema decision in DEC-0.
3. **UCL-2's highest-leverage decision is DEC-round (guillotine "round" = leg or tie):** it decides which tie-period shape is even admissible (tie-as-one-period only works under round=tie), and blocks 6 of the lane's 11 build steps. The three candidate shapes (tie-as-period / leg-as-period / round-entity-over-legs) are fully specced with per-shape failure modes; all three are compatible with the L4 junction (V45-verified).
4. **Four UCL-2 steps are build-ready today with zero DEC-0 exposure:** the F-D15 enum rename (idle-window timing), the lock self-heal re-scope (which also closes a live WC edge-case bug), the label-derivation seam (fail-loud, vocabulary-injected — kills F-D17's duplicate table), and the eliminated/FAAB copy pass.
5. **HARD-1 reduces to a three-item, one-redeploy, additive-only worker slice** (F-A02 liveness heartbeat + F-A03 info-bump + F-A04 alert routing) riding the already-live Healthchecks.io + email channel with **no new SDK and no schema change**. F-A01 standalone tracker, F-A09, F-A16 defer to HARD-2. The only gate is Sergio's match-free-window deploy authorization.
6. **RLS is a non-blocker for multi-league:** all 27 live policies are N-league-safe as-is (V2-recounted). MT-2's Realtime work is channel-NAME scoping (standings/playoffs), not policy work.
7. **Audit sizing corrections that change thread estimates:** F-D15 rename touches **~38 non-test source files** (audit said ~20+; ~2× undercount) though only ~15 are hand-edits; TournamentPhase has 10 source consumers (not 23); the F-D05/D10 derivePeriodLabel rewrite is genuinely contained (1–2 files, one caller).

## 2. F-C01/F-C12 — junction design (L4, with V45 corrections folded)

Full design in `L4_junction_design.md`. Shape: `match_period` table, `@@unique([leagueId, matchId])` (one period per match per league), composite FK `(periodId, leagueId) → Period(id, leagueId)` enforcing league-consistency at the DB level. NOT-NULL period_id — "not a fantasy fixture" = absent row. Default-deny RLS, no Realtime publication (verified: nothing binds postgres_changes to fifa_match).

Expand/contract plan E1–E6: create+backfill → ingest dual-write → consumer cutover in waves → raw-SQL trigger rewrite (gated-PG-tested, fail-closed) → column drop LAST behind a CI fence + all-services-deployed + one green live matchday. **V45 corrections now part of the plan:**
- E2 backfill/repair must use `ON CONFLICT … DO UPDATE SET period_id = EXCLUDED.period_id` (DO NOTHING can't repair re-stamped bindings).
- E3 dual-write must also **delete bindings** absent from the resolve result (column NULL-ing must remove the junction row), and a writer revert after W2/W3 readers are live requires re-running the E2 repair — the miss direction there is missed locks/recompute fan-out, not fail-closed.
- W3 loaders gate on **dual-write deployed** (#3), not just the migration; row 46 (elimination) pins to a wave explicitly (mechanical re-point, no league scoping — it is correctly global).
- W0's first task: a `prisma validate`/`migrate diff` spike for the composite-FK pattern (valid on Prisma 6.2.1 but zero in-repo precedent).

V1's 9 missed consumers (M1–M9, mostly `Period.matches` reverse joins) map onto existing waves with no ordering change; M9 (recompute in-memory double) needs **no change** — it already models per-period match links (L4 and V1 confirmed independently). The `notification_sent` ledger needs **no key change** for per-league fan-out (`managerId` is league-scoped — V45-resolved).

## 3. UCL-2 — format machine (L5, V45-clean)

Full design in `L5_ucl2_format_machine_design.md`. The engine break is in `advance.ts` round semantics, not the math — guillotine/playoffRound/standing are verified format-agnostic (transition.ts has no bare `5`). Three tie-period shapes specced: **A** tie-as-one-period (zero schema delta; kills between-leg rotation, deadens FAAB for 2–3 weeks, only admissible under round=tie), **B** leg-as-period (additive `legNumber`/`roundLabel`; FAAB per-leg works unchanged — V45-verified `effectiveBatchAt` auto-derives; advance.ts work forks on DEC-round), **C** explicit `knockout_round` entity over leg-periods (first-class round key; degenerates cleanly to B under round=leg). Swiss table: `competition_standing` keyed `(editionId, teamId)` with config-driven zone cutlines; GroupStanding/FifaGroup/group_id deleted. Label derivation: per-competition `StageVocabulary` injected into `derivePeriodLabel`, single-sourced round vocabulary (kills F-D17), three-way linked/ignored/unmapped result with fail-loud unmapped counter + post-sync reconciliation. Eliminated: boolean survives (+`eliminated_at`), but derivation needs a tie-aware path (per-leg derivation would wrongly flag every leg-1 loser) + a Swiss bulk step at position ≥ 25; copy is competition-neutralized now.

## 4. HARD-1 — live-now slice (review-class brief, from L3 + V3)

**Scope (one worker redeploy, match-free window, Sergio's authorization is the only gate):**
1. **F-A02** — per-tick liveness heartbeat from `scheduler.ts` via the existing `ping` helper (`jobs/heartbeat.ts`); new `WORKER_HEARTBEAT_URL` (sync:false). The single highest-leverage live fix: today the resident worker can die or hang mid-matchday with zero external signal (tick errors are caught at scheduler.ts:334 and never reach the uncaughtException exit).
2. **F-A03 (narrowed per V3)** — bump `scheduler.swept` debug→info (~60 lines/hr, zero risk). The dirty-backlog **depth** gauge is NOT derivable from `SweepResult` (the sweep drains all dirty rows per tick — V3's stuck correction); if wanted, it is one additive `COUNT(*) WHERE dirty` store read — still additive, but widens the edit surface beyond scheduler.ts. **Decision inside the slice: info-bump only (recommended minimum) vs +depth-gauge.**
3. **F-A04** — route the existing detectors (`poller.silent`, `recompute.player_match.failures`, `autofire.cut.error`, ingest foreign/malformed skips) to an attention ping beside their log lines; new `WORKER_ATTENTION_URL`. Reuses the live Healthchecks.io + email channel end-to-end.

**Deliberately deferred within HARD-1:** recompute Phase-2/3 onError surfacing (edits the engine — hold-class), poller-silent persistence (schema change), F-A05 restate queue (optional one-line web-side `console.error` if a web deploy is bundled anyway). **Deferred to HARD-2:** F-A01 standalone error tracker (new SDK = its own decision), F-A09/F-A16 readiness probes (web-availability, and the naive fix adds a mid-tournament restart risk). Boundary check on all 8 HARD-2 items: none is live-urgent; one live **constraint** — do not scale the worker >1 instance while the in-process feed rate limiter stands (F-A20).

**Risk profile:** every code change is added-beside (ping swallows all failures — V3-verified never-throws); the riskiest step is the worker redeploy itself (restarts the resident tick, resets in-process guard state) — hence the match-free window.

## 5. Cross-lane constraints (V45)

1. **Ordering constraint (hard):** the F-D15 enum rename (UCL-2 step 1) must land **before** MT-2's W1 ingest dual-write begins — both rewrite `packages/ingest/src/prismaStore.ts` and `packages/recompute/src/prismaStore.ts`; an in-flight W1 branch would carry stale enum literals through the rename migration.
2. **Junction × tie shapes:** all three L5 shapes are compatible with the junction's one-period-per-(match,league) invariant; no shape needs a match bound to two periods in one league.
3. **`fifa_match.tie_id`** (L5's shape-independent tie linkage) is competition truth and stays a global column — consistent with the junction's premise that fixtures are shared reference data (parallels `is_third_place`).
4. **periodStatus "exactly one open period"** is correctly per-league in both designs; the `league.findFirst` singletons feeding it (F-C11) remain an MT-2 loop-over-leagues item outside both designs — under N leagues today, leagues 2..N would get no status transitions at all.

## 6. Corrections to the launch audit (deltas this pass produced)

| Audit claim | Corrected fact | Source |
|---|---|---|
| F-C01 consumers ≈ locking, dirty-walk, period-close (":384-387") | **56 consumer sites** across 17 subsystems (47 L1 + 9 V1) | L1+V1 |
| F-D15 rename "~20+ consuming files" | **~38 non-test source files** (94 raw; ~15 hand-edits, rest auto-follow) | L2+V2 |
| TournamentPhase "consumed by 23 files" | **20 code files** (10 source + 10 test) | L2+V2 |
| F-D16 eliminated is "manually-sourced… no automation" | **Auto-derived since `feat/auto-team-elimination`** (set-only, freeze-gated worker) — audit premise predates the merge | L5+V45 |
| (implicit) C1b RLS inventory = complete | Complete but compressed: **27 discrete policies on 14 tables**; plus a NEW reproducibility note — `draft`/`draft_pick` Realtime publication was dashboard-added, not migration-recorded (a fresh-Postgres DB won't have them published) | L2+V2 |
| — (not in audit) | 6 additional WC-literal sites (site.webmanifest, layout.tsx metadata, AuthChrome league constants, vsfield `knockoutRoundName` second title table, CommishConsole kind label, dashboard/playoffs/vsfield copy class) | V2 |
| — (not in audit) | `apps/web/src/vsfield/knockout.ts:33-39` duplicates the round-title mapping already in PoolClient ROUND_TITLES — fold into the F-D15/D12 pass | V2 |

## 7. Operator/process notes surfaced by this pass

- **Stale BACKLOG.md labels (start-of-thread derived-status check):** T-ELIM row still says "DONE — HELD for Chat clearance (not merged)" but `567c99b` is an ancestor of origin/main (memory: MERGED); PLAYERS-1's remediation note still says "merge HELD" but `c0bc6f6` is an ancestor. Both labels are stale; a follow-up braindocs pass should flip them.
- **Reproducibility gap (NEW, from L2):** draft/draft_pick Realtime publication membership exists only as a Supabase-dashboard action + a migration comment (20260606170000:92) — worth a one-line runbook entry or an idempotent migration in a future pass.
- **Housekeeping done this thread:** merged ghost worktree `feat/t15-15-pii-guard` torn down (branch deleted, pruned) per the teardown policy.
