-- ============================================================================
-- One-off cleanup: clear PREMATURE MD1 lineup locks (2026-06-11 incident)
-- ============================================================================
-- Context: ~35 MD1 `lineup_slot` rows were stamped with `locked_at ≈ now` while
-- their fixture was still scheduled (kickoff days out). The write-side `now` gate
-- (packages/ingest/src/lock.ts) prevents NEW premature stamps; this artifact
-- repairs the EXISTING rows. `locked_at` is a monotonic latch (only ever written
-- when NULL), so the bad stamps will not self-heal — they must be nulled here.
--
-- Scope: a slot is repaired only when the player's OWN fixture in that period
-- (player.team_id → fifa_match home/away team) is still in the future
-- (kickoff_at > NOW()). Already-kicked-off matches (e.g. Mexico–Saudi Arabia)
-- have legitimately locked players and are LEFT INTACT.
--
-- Schema-verified against packages/db/prisma/schema.prisma:
--   lineup_slot(locked_at, player_id, period_id)   player(id, team_id)
--   period(id, label)   fifa_match(period_id, home_team_id, away_team_id, kickoff_at)
--
-- DO NOT auto-run. Sergio executes against live. Run the PREVIEW first, eyeball
-- the rows, then run the UPDATE inside the transaction.
-- ============================================================================

-- ── 1. PREVIEW: which rows would be cleared (run this first, inspect) ────────
SELECT ls.id            AS lineup_slot_id,
       pl.display_name  AS player,
       m.kickoff_at     AS fixture_kickoff,
       m.status         AS fixture_status,
       ls.locked_at     AS bad_locked_at
FROM lineup_slot ls
JOIN player     pl ON ls.player_id = pl.id
JOIN period     p  ON ls.period_id = p.id
JOIN fifa_match m  ON m.period_id = p.id
                  AND (m.home_team_id = pl.team_id OR m.away_team_id = pl.team_id)
WHERE p.label = 'MD1'
  AND m.kickoff_at > NOW()        -- player's fixture has NOT kicked off
  AND ls.locked_at IS NOT NULL    -- but the slot is stamped locked
ORDER BY m.kickoff_at, pl.display_name;

-- ── 2. APPLY: null the premature stamps (wrapped so you can verify the count) ─
BEGIN;

UPDATE lineup_slot ls
SET locked_at = NULL
FROM player pl, period p, fifa_match m
WHERE ls.player_id = pl.id
  AND ls.period_id = p.id
  AND p.label = 'MD1'
  AND m.period_id = p.id
  AND (m.home_team_id = pl.team_id OR m.away_team_id = pl.team_id)
  AND m.kickoff_at > NOW()
  AND ls.locked_at IS NOT NULL;

-- Expect ~35 (matches the incident count). If it looks wrong, ROLLBACK.
-- COMMIT;
-- ROLLBACK;
