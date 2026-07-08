-- ============================================================================
-- QF FAAB batch: commissioner override of waiver_batch_at (2026-07-08)
-- ============================================================================
-- Context: Theme-D per-period FAAB cadence (migration 20260610150000_period_faab_cadence).
-- effectiveBatchAt = period.waiver_batch_at ?? (first_kickoff - FAAB_BATCH_LEAD_MIN[=360min/6h])
-- (packages/faab/src/batchTime.ts). Default would clear the QF batch at
-- 2026-07-09 14:00:00+00 (first QF kickoff 20:00 UTC minus 6h). Commissioner decision:
-- clear instead Wed 2026-07-08 18:00 ET (22:00 UTC) — a ~22h FA window ahead of first
-- QF kickoff, wider than the 6h default. See ARCHITECTURE.md §3 "FAAB cadence".
--
-- Schema-verified packages/db/prisma/schema.prisma:
--   playoff_entry(id, league_id, manager_id, status, eliminated_round, eliminated_at)
--   roster_player(id, league_id, manager_id, player_id, dropped_at)
--   period(id, league_id, kind, label, waiver_batch_at, batch_cleared_at)
--   fifa_match(id, period_id, kickoff_at)
-- Labels: knockout period.label values are "R32"/"R16"/"QF"/"SF"/"Final"
-- (packages/shared/src/constants.ts KNOCKOUT_ROUNDS; packages/ingest/src/map.ts).
-- ASSUMPTION (ARCHITECTURE.md §4, permanent): ONE private league per tournament — no
-- league_id filter needed below.
--
-- DO NOT auto-run. Sergio executes live in the Supabase SQL editor, step by step.
-- If PRE-FLIGHT A or B fails its expectation, STOP — do not run the UPDATE.
-- ============================================================================

-- ── 1. PRE-FLIGHT A: R16 cut applied ─────────────────────────────────────────
-- Expect: alive_count = 6, r16_eliminated_count = 2, eliminated_total = 4,
-- roster_players_released ≈ 18 (dropped_at stamped by the R16 cut).
-- If this fails: STOP. Run the knockout-transition pre-flight in
-- docs/RUNBOOK.md ("Knockout transitions — pre-flight (recurring: R16 / QF / SF / Final)")
-- before setting the batch time — the batch must not clear before the freed
-- players are back in the free-agent pool.
SELECT
  (SELECT COUNT(*) FROM playoff_entry WHERE status = 'alive')                              AS alive_count,
  (SELECT COUNT(*) FROM playoff_entry WHERE status = 'eliminated' AND eliminated_round = 'R16') AS r16_eliminated_count,
  (SELECT COUNT(*) FROM playoff_entry WHERE status = 'eliminated')                          AS eliminated_total,
  (SELECT COUNT(*) FROM roster_player WHERE dropped_at IS NOT NULL)                         AS roster_players_released;

-- ── 2. PRE-FLIGHT B: QF period row ───────────────────────────────────────────
-- Identify the knockout period whose fixtures' earliest kickoff is the first QF
-- kickoff (2026-07-09 20:00:00+00). Expect exactly 1 row, waiver_batch_at IS NULL,
-- batch_cleared_at IS NULL. STOP if batch_cleared_at is already stamped — the
-- batch has already cleared for this period and the override would be moot/unsafe.
SELECT
  p.id,
  p.label,
  p.kind,
  p.waiver_batch_at,
  p.batch_cleared_at,
  MIN(m.kickoff_at) AS first_kickoff
FROM period p
JOIN fifa_match m ON m.period_id = p.id
WHERE p.kind = 'knockout_round'
GROUP BY p.id, p.label, p.kind, p.waiver_batch_at, p.batch_cleared_at
HAVING MIN(m.kickoff_at) = '2026-07-09 20:00:00+00';

-- ── 3. UPDATE: set the QF batch deadline ─────────────────────────────────────
-- 2026-07-08 18:00:00-04:00 renders as 2026-07-08 22:00:00+00 UTC.
-- Guard: only the knockout period identified in step 2, only if not yet cleared.
-- Must affect EXACTLY 1 row — if 0 or >1, ROLLBACK and re-check step 2.
UPDATE period
SET waiver_batch_at = TIMESTAMPTZ '2026-07-08 18:00:00-04:00'
WHERE kind = 'knockout_round'
  AND batch_cleared_at IS NULL
  AND id = (
    SELECT p.id
    FROM period p
    JOIN fifa_match m ON m.period_id = p.id
    WHERE p.kind = 'knockout_round'
    GROUP BY p.id
    HAVING MIN(m.kickoff_at) = '2026-07-09 20:00:00+00'
  )
RETURNING id, label, waiver_batch_at, batch_cleared_at;
-- Expected waiver_batch_at above: 2026-07-08 22:00:00+00

-- ── 4. POST-RUN VERIFY (run immediately after step 3) ────────────────────────
-- /waivers "next batch" should now read the same effectiveBatchAt source of
-- truth (packages/faab/src/batchTime.ts) — Wed Jul 8, 6:00 PM ET, sealed-bid
-- phase active. No deploy needed; this is a data-only change.
SELECT id, label, waiver_batch_at, batch_cleared_at
FROM period
WHERE kind = 'knockout_round'
  AND waiver_batch_at = TIMESTAMPTZ '2026-07-08 18:00:00-04:00';

-- ── 5. FIRE-CHECK (Wed 2026-07-08 ~6:05pm ET / ~22:05 UTC, manual) ───────────
-- Expect batch_cleared_at stamped ≈ 22:00-22:02 UTC, and a faab_batch row for
-- this run with status = 'complete'.
-- HARD-1 worker heartbeat is not yet merged (see hard1-observability-fix), so
-- this manual check is the only worker-liveness verification available. If
-- batch_cleared_at is not stamped by 6:10pm ET / 22:10 UTC, check the Render
-- worker service directly.
SELECT id, label, waiver_batch_at, batch_cleared_at
FROM period
WHERE kind = 'knockout_round'
  AND waiver_batch_at = TIMESTAMPTZ '2026-07-08 18:00:00-04:00';

SELECT id, league_id, run_at, status
FROM faab_batch
WHERE run_at >= TIMESTAMPTZ '2026-07-08 21:00:00+00'
  AND run_at <  TIMESTAMPTZ '2026-07-08 23:00:00+00'
ORDER BY run_at DESC;
-- Expect: 1 row, status = 'complete'.
