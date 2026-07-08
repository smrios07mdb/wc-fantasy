-- ============================================================================
-- QF post-batch audit — speculative-bids + HARD-1 observability (2026-07-08)
-- ============================================================================
-- Context: the Wed 2026-07-08 18:00 ET (22:00 UTC) QF waiver batch, deadline set by
-- ops/2026-07-08-set-qf-waiver-batch-at.sql (DO NOT modify that file), is the FIRST live
-- batch under two amendments:
--   1. Speculative bidding (merged c6a2b2e): duplicate-target pending bids now allowed;
--      a manager's pending bid TOTAL may exceed budget; per-bid cap = current budget at
--      submit time. Resolver (packages/faab/src/resolve.ts) is BYTE-UNCHANGED — the
--      amendment lives entirely in submission-side validation, not batch-time arbitrate.
--   2. HARD-1 observability (merged f472902, deployed): Sentry (SENTRY_DSN-gated, explicit
--      capture-and-rethrow on faab/bid POST/PATCH/DELETE) + WORKER_TICK_HEARTBEAT_URL, a
--      Healthchecks.io check SEPARATE from PERIOD_CLOSE_HEARTBEAT_URL — it watches the
--      RESIDENT worker's 60s tick loop, which is what actually runs the FAAB batch
--      (apps/worker/src/faab/dispatch.ts calls runFaabBatch once per due period, per tick).
--
-- SELECT-only. No UPDATE/INSERT/DELETE anywhere in this file.
--
-- Schema-verified against packages/db/prisma/schema.prisma @ origin/main 512ce6a:
--   period(id, league_id, kind, label, waiver_batch_at, batch_cleared_at)
--   faab_batch(id, league_id, run_at, status)             -- NOTE: no period_id column.
--   faab_bid(id, league_id, manager_id, player_add_id, player_drop_id, amount,
--            submitted_at, batch_id, status, note, created_at, updated_at)
--   manager(id, league_id, display_name, faab_budget, waiver_order_position)
--   roster_player(id, league_id, manager_id, player_id, acquired_at, dropped_at)
--   playoff_entry(id, league_id, manager_id, seed, status, eliminated_round, eliminated_at)
-- Enums: bid_status = pending|won|lost|voided_refunded.
--        faab_batch_status = pending|processing|complete|failed.
--        playoff_entry_status = alive|eliminated|champion.
-- ASSUMPTION (ARCHITECTURE.md §4, permanent): ONE private league per tournament — no
-- league_id filter needed below.
--
-- DERIVE FINDING — no persisted loss-reason column. `faab_bid` carries only the terminal
-- `status` + `batch_id`; there is no `reason`/`detail`/tiebreak-stamp column. The resolver
-- computes a rich in-memory `LostReason` (outbid | lost-tiebreak | add-unavailable |
-- budget-exhausted | roster-illegal | drop-invalid — resolve.ts:88-96) per lost bid, but
-- `prismaStore.ts:commitBatch` (line ~255-263) writes ONLY `status: 'lost' | 'voided_refunded'`
-- + `batch_id` for non-won resolutions — the reason is discarded, never reaches the DB. The
-- `note` column is a separate, user-authored free-text field (set at bid submission/amend),
-- untouched by the resolver — it is NOT a system-written reason and must not be read as one.
-- Section C below therefore reconstructs causes ANALYTICALLY (budget math, roster state,
-- duplicate-target grouping) rather than selecting a reason column that does not exist.
--
-- CORRELATION NOTE — `faab_batch` has no `period_id` FK. The only way to identify the batch
-- row that cleared the QF period is `faab_batch.run_at = period.batch_cleared_at`: both are
-- stamped from the SAME `now` value within one worker tick (dispatch.ts calls
-- `runFaabBatch(..., now, periodId)` then `cadenceStore.stampBatchCleared(periodId, now)`),
-- so the timestamps are byte-identical for the run that cleared this period — not merely
-- close. If Section A shows `batch_cleared_at` set but `faab_batch_id` NULL, that means the
-- batch ran with ZERO pending bids (controller.ts `EMPTY()` short-circuit returns before
-- `commitBatch`, so no faab_batch row is created) — a legitimate no-op, not a failure.
-- ============================================================================

-- ── A. FIRED — QF period cleared, and its faab_batch row ────────────────────
-- Expect: 1 row. batch_cleared_at NOT NULL, ≈ 2026-07-08 22:00:00–22:02:00 UTC.
-- Either (a) faab_batch_id present + batch_status = 'complete' (bids were processed), or
-- (b) faab_batch_id NULL (zero pending bids at clear time — legitimate empty batch; skip
-- straight to the "no census rows" case in B rather than treating this as a red flag).
-- RED FLAG: batch_cleared_at IS NULL — batch never fired. STOP; check worker liveness
-- (WORKER_TICK_HEARTBEAT_URL) and the render.yaml worker service before anything else.
-- RED FLAG: faab_batch_id present but batch_status != 'complete' — a crashed/partial run.
SELECT
  p.id            AS period_id,
  p.label,
  p.waiver_batch_at,
  p.batch_cleared_at,
  fb.id           AS faab_batch_id,
  fb.run_at       AS faab_batch_run_at,
  fb.status       AS faab_batch_status
FROM period p
LEFT JOIN faab_batch fb
  ON fb.league_id = p.league_id
 AND fb.run_at = p.batch_cleared_at
WHERE p.kind = 'knockout_round'
  AND p.label = 'QF';

-- ── B. CENSUS — bids stamped to the QF batch, by terminal status ────────────
-- Expect: rows for whichever of won/lost/voided_refunded occurred; total_won_amount is the
-- Σ actually debited this batch. A 'pending' row here would be a bug — every bid stamped
-- with a batch_id must have left 'pending' (commitBatch's guarded updateMany only ever sets
-- won/lost/voided_refunded). RED FLAG: any status = 'pending' row.
SELECT
  b.status,
  COUNT(*)                                            AS bid_count,
  COALESCE(SUM(b.amount) FILTER (WHERE b.status = 'won'), 0) AS total_won_amount
FROM faab_bid b
WHERE b.batch_id = (
  SELECT fb.id
  FROM period p
  JOIN faab_batch fb ON fb.league_id = p.league_id AND fb.run_at = p.batch_cleared_at
  WHERE p.kind = 'knockout_round' AND p.label = 'QF'
)
GROUP BY b.status
ORDER BY b.status;

-- ── C. SPECULATIVE-RULES INVARIANTS ──────────────────────────────────────────

-- C1. Per (manager, add-target): at most ONE win. The resolver awards a player once and
-- moves on (resolve.ts step 2/4) — a manager cannot win the same add-target twice in one
-- batch even with multiple duplicate-target pending bids on it.
-- Expect: 0 rows.
SELECT b.manager_id, b.player_add_id, COUNT(*) AS won_count
FROM faab_bid b
WHERE b.batch_id = (
  SELECT fb.id FROM period p JOIN faab_batch fb
    ON fb.league_id = p.league_id AND fb.run_at = p.batch_cleared_at
  WHERE p.kind = 'knockout_round' AND p.label = 'QF'
)
  AND b.status = 'won'
GROUP BY b.manager_id, b.player_add_id
HAVING COUNT(*) > 1;

-- C2. No negative budgets league-wide (CHECK (>= 0) is DB-enforced, but a batch bug could
-- theoretically slip a decrement past it in a way the CHECK still catches — this query is
-- the direct read, not a proxy for the constraint).
-- Expect: 0 rows.
SELECT id, display_name, faab_budget
FROM manager
WHERE faab_budget < 0;

-- C3. Duplicate-target groups this batch (manager, target, n > 1) — the shape the
-- speculative-bids amendment newly permits. Eyeball table, not a pass/fail query.
-- Expected: for every group, exactly one bid 'won' and the rest 'lost' — never two 'won' on
-- the same (manager, target) [C1 already asserts this], and never all-'lost' with no winner
-- unless the target was won by a DIFFERENT manager's higher bid (cross-check against B).
SELECT
  b.manager_id,
  m.display_name,
  b.player_add_id,
  COUNT(*)                                     AS n,
  ARRAY_AGG(b.amount ORDER BY b.amount DESC)    AS amounts,
  ARRAY_AGG(b.status ORDER BY b.amount DESC)    AS statuses
FROM faab_bid b
JOIN manager m ON m.id = b.manager_id
WHERE b.batch_id = (
  SELECT fb.id FROM period p JOIN faab_batch fb
    ON fb.league_id = p.league_id AND fb.run_at = p.batch_cleared_at
  WHERE p.kind = 'knockout_round' AND p.label = 'QF'
)
GROUP BY b.manager_id, m.display_name, b.player_add_id
HAVING COUNT(*) > 1
ORDER BY n DESC, b.manager_id;

-- C4. Per-manager reconciliation — the over-budget-total cohort. Under speculative bidding
-- a manager's Σ pending bid amounts may legitimately EXCEED their pre-batch budget (that is
-- the whole point of the amendment); this is a sanity READ, not a violation list. pre_batch
-- budget is reconstructed as budget_after + Σ won amounts, since debits happen only on wins
-- (resolve.ts step 7 / prismaStore.ts commitBatch — budget is untouched for lost/voided).
-- Highest-over-budget-first. Expect: any row here is normal under the amendment; flag only
-- if won_amount alone (not total_bid_amount) exceeds pre_batch_budget — that WOULD be a bug
-- (per-bid cap is enforced at submission, so a single win should never exceed budget).
WITH pre_batch AS (
  SELECT
    m.id AS manager_id,
    m.display_name,
    m.faab_budget + COALESCE(SUM(b.amount) FILTER (WHERE b.status = 'won'), 0) AS pre_batch_budget
  FROM manager m
  LEFT JOIN faab_bid b
    ON b.manager_id = m.id
   AND b.batch_id = (
        SELECT fb.id FROM period p JOIN faab_batch fb
          ON fb.league_id = p.league_id AND fb.run_at = p.batch_cleared_at
        WHERE p.kind = 'knockout_round' AND p.label = 'QF'
      )
  GROUP BY m.id, m.faab_budget, m.display_name
),
bid_totals AS (
  SELECT
    manager_id,
    SUM(amount)                            AS total_bid_amount,
    SUM(amount) FILTER (WHERE status = 'won')  AS won_amount,
    SUM(amount) FILTER (WHERE status = 'lost') AS lost_amount
  FROM faab_bid
  WHERE batch_id = (
    SELECT fb.id FROM period p JOIN faab_batch fb
      ON fb.league_id = p.league_id AND fb.run_at = p.batch_cleared_at
    WHERE p.kind = 'knockout_round' AND p.label = 'QF'
  )
  GROUP BY manager_id
)
SELECT
  pb.manager_id,
  pb.display_name,
  pb.pre_batch_budget,
  bt.total_bid_amount,
  bt.won_amount,
  bt.lost_amount,
  (bt.total_bid_amount - pb.pre_batch_budget) AS over_by
FROM pre_batch pb
JOIN bid_totals bt ON bt.manager_id = pb.manager_id
WHERE bt.total_bid_amount > pb.pre_batch_budget
ORDER BY over_by DESC;

-- C5. Effects spot-join — every WON bid's add target is actively rostered by the winner,
-- and (when a drop was named) the drop target's roster row has dropped_at set.
-- Expect: 0 rows (query returns only violations).
SELECT
  b.id AS bid_id,
  b.manager_id,
  b.player_add_id,
  b.player_drop_id,
  rp_add.id  AS add_roster_row,
  rp_drop.id AS drop_roster_row,
  rp_drop.dropped_at AS drop_dropped_at
FROM faab_bid b
LEFT JOIN roster_player rp_add
  ON rp_add.manager_id = b.manager_id
 AND rp_add.player_id  = b.player_add_id
 AND rp_add.dropped_at IS NULL
LEFT JOIN roster_player rp_drop
  ON rp_drop.manager_id = b.manager_id
 AND rp_drop.player_id  = b.player_drop_id
WHERE b.batch_id = (
  SELECT fb.id FROM period p JOIN faab_batch fb
    ON fb.league_id = p.league_id AND fb.run_at = p.batch_cleared_at
  WHERE p.kind = 'knockout_round' AND p.label = 'QF'
)
  AND b.status = 'won'
  AND (
    rp_add.id IS NULL
    OR (b.player_drop_id IS NOT NULL AND (rp_drop.id IS NULL OR rp_drop.dropped_at IS NULL))
  );

-- C6. Waiver order contiguous 1..K over alive playoff managers (move-to-bottom fires on
-- EVERY won claim, so the QF batch — likely multi-win — should have shuffled several
-- managers; contiguity is a batch-transaction invariant, not DB-enforced beyond uniqueness).
-- Expect: alive_count = distinct_positions = max_pos; min_pos = 1; null_positions = 0.
SELECT
  COUNT(*)                                                      AS alive_count,
  COUNT(DISTINCT m.waiver_order_position)                       AS distinct_positions,
  MIN(m.waiver_order_position)                                  AS min_pos,
  MAX(m.waiver_order_position)                                  AS max_pos,
  COUNT(*) FILTER (WHERE m.waiver_order_position IS NULL)       AS null_positions
FROM manager m
JOIN playoff_entry pe ON pe.manager_id = m.id
WHERE pe.status = 'alive';

-- ============================================================================
-- D. RUBRIC (manual, not SQL) — run alongside the queries above, ~18:05 ET:
--
--  - Sentry: zero faab-path events in the run window (2026-07-08 21:55–22:15 UTC). The
--    faab/bid POST/PATCH/DELETE routes have explicit capture-and-rethrow (HARD-1); an event
--    here means a write-path exception during or just before the batch, worth cross-
--    referencing against any anomalies in Section B/C above. Requires SENTRY_DSN configured
--    (operator debt per hard1-observability-fix — confirm it's set before trusting a
--    "zero events" read as a clean signal rather than a dark integration).
--  - Healthchecks.io: WORKER_TICK_HEARTBEAT_URL ping unbroken through 18:00 ET / 22:00 UTC —
--    this is the resident worker's tick-loop liveness, separate from
--    PERIOD_CLOSE_HEARTBEAT_URL (which watches only the hourly period-close cron and says
--    nothing about the FAAB batch). A gap here around the batch window is the strongest
--    signal of a hung/crashed tick that a retried batch or missing faab_batch row would
--    otherwise leave ambiguous.
--  - Paste the Section B census plus any non-empty rows from C1/C3(unexpected shape)/C4
--    (won_amount > pre_batch_budget only)/C5/C6 back to Chat for review.
-- ============================================================================
