-- ============================================================================
-- One-off repair: backfill MISSED lock-on-play stamps (coverage gap)
-- ============================================================================
-- Context: `locked_at` was stamped only from two transient feed-observation
-- paths — the one-shot pre_match official-XI pull and per-event live sub-locking
-- (packages/ingest/src/ingest.ts). Neither re-fires once a match leaves its
-- window, and settle did no locking. So any appearance the 60s poller missed (a
-- late/missed XI confirmation, a sub event between polls) left a PLAYED player's
-- current-period `lineup_slot` rows `locked_at = NULL` forever. The two completed
-- MD1 matches (Mexico 4358860e, Korea b0ce5e18) ended up with only a partial
-- subset of each played XI stamped (e.g. Jiménez/Mora locked; Rangel, Reyes,
-- Gallardo, Vásquez, Schick not). The code fix (reconcileAppearanceLocks in
-- ingestLive + ingestSettle) closes this going forward; this artifact repairs the
-- EXISTING rows, because `locked_at` is a monotonic latch and will not self-heal.
--
-- Authoritative appearance source: `score_player_match`. A row exists there ONLY
-- for actual participants — the recompute participant gate
-- (packages/recompute/src/adapter.ts playerAppearedInMatch) already excluded
-- non-appearers and cross-team contamination. So "has a score row" == "played".
--
-- Rule (this is the exact mirror of the code fix): for every player who appeared,
-- stamp locked_at = THAT match's kickoff on their `lineup_slot` rows whose
--   period == the appeared match's period   ← PERIOD SCOPE (mandatory; see below)
--   AND locked_at IS NULL                    ← monotonic: fill gaps only
--
-- *** PERIOD SCOPE IS MANDATORY ***  A naive player-level version
-- (`SET locked_at WHERE player appeared`) would also stamp that player's FUTURE-
-- period slots — matchdays they have not played — which re-creates the exact
-- phantom-lock bug that ops/2026-06-11-clear-premature-md1-locks.sql just cleared.
-- Joining ls.period_id = m.period_id confines each stamp to the one period the
-- appearance belongs to.
--
-- Idempotent: the `locked_at IS NULL` filter means a re-run stamps nothing new
-- (already-locked slots are skipped). Safe to run repeatedly.
--
-- Override-wrapped: a direct UPDATE to `locked_at` passes through the
-- `enforce_lineup_lock()` trigger. For NULL→value the trigger already returns NEW,
-- but we set the per-transaction commissioner GUC so the bulk write is guaranteed
-- to land regardless of any trigger edge case — and because the WHERE clause is
-- pinned to `locked_at IS NULL`, the GUC can only ever permit the legitimate
-- NULL→kickoff stamp here (never a re-lock or a frozen-field change).
--
-- Schema-verified against packages/db/prisma/schema.prisma:
--   lineup_slot(locked_at, player_id, period_id)
--   score_player_match(match_id, player_id)
--   fifa_match(id, period_id, kickoff_at)
--
-- DO NOT auto-run. Sergio executes against live. Run the PREVIEW first, eyeball
-- the rows, then run the UPDATE inside the transaction and verify the count.
-- ============================================================================

-- ── 1. PREVIEW: which slots would be stamped, and at what kickoff (run first) ─
SELECT ls.id           AS lineup_slot_id,
       pl.display_name AS player,
       p.label         AS period,
       m.balldontlie_match_id AS appeared_match,
       m.kickoff_at    AS lock_to_kickoff
FROM lineup_slot ls
JOIN score_player_match spm ON spm.player_id = ls.player_id
JOIN fifa_match m           ON m.id = spm.match_id
                          AND m.period_id = ls.period_id   -- PERIOD SCOPE
JOIN player pl ON pl.id = ls.player_id
JOIN period p  ON p.id = ls.period_id
WHERE ls.locked_at IS NULL          -- only fill gaps (monotonic)
  AND m.kickoff_at <= NOW()         -- only matches that have kicked off (write-boundary invariant)
ORDER BY p.label, m.kickoff_at, pl.display_name;

-- ── 2. APPLY: stamp the missed locks (wrapped so you can verify the count) ────
BEGIN;

-- Per-transaction commissioner carve-out (see header). Scoped to THIS tx only.
SET LOCAL app.commish_override = 'on';

UPDATE lineup_slot ls
SET locked_at = m.kickoff_at
FROM score_player_match spm
JOIN fifa_match m ON m.id = spm.match_id
WHERE ls.player_id = spm.player_id
  AND ls.period_id = m.period_id    -- PERIOD SCOPE (mandatory — never a future period)
  AND ls.locked_at IS NULL          -- monotonic: fill gaps only
  AND m.kickoff_at <= NOW();        -- never stamp a not-yet-kicked-off match

-- Inspect the row count above. It should equal the PREVIEW count. If it looks
-- wrong, ROLLBACK. (Re-running later is a no-op thanks to `locked_at IS NULL`.)
-- COMMIT;
-- ROLLBACK;
