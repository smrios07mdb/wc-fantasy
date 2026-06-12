-- ============================================================================
-- One-off remediation: evict NON-PARTICIPANT score_player_match rows (2026-06-11)
-- ============================================================================
-- Context: score_player_match rows were generated for players who did NOT appear
-- in a match. The live trigger was the completed Mexico–South Africa fixture:
-- every rostered GK/DEF whose team was NEITHER home nor away was charged −1
-- (the match's goals counted as "conceded" by their uninvolved team), dragging
-- the whole field negative. The MID/FWD non-participants scored 0 (no §6 line).
--
-- Root cause (fixed in code on fix/score-nonparticipants):
--   * recompute scored ANY (match, player) with a dirty raw row, with NO check
--     that the player appeared — packages/recompute now gates on
--     playerAppearedInMatch (team-in-match AND an appearance signal).
--   * the conceded derivation lacked a team-in-match guard
--     (packages/recompute/src/adapter.ts concededByPlayerTeam) — now added.
-- The CODE fix prevents RECURRENCE. This artifact repairs the EXISTING rows:
-- a manager-period restate alone will NOT clear them (job:recompute only re-sums
-- the score_player_match rows it finds — so the bogus rows must be deleted first).
--
-- KEY FACT that makes this safe & match-agnostic: a CORRECT score_player_match row
-- is never cross-team (player.team_id is always home_team_id or away_team_id). So
-- the cross-team predicate below can run across ALL matches — it can only ever
-- match bogus rows. (Cross-team rows only exist for matches that have been scored.)
--
-- Schema-verified against packages/db/prisma/schema.prisma:
--   score_player_match(match_id, player_id, points)
--   stat_player_match(match_id, player_id, dirty)   rating_player_match(match_id, player_id)
--   player(id, team_id)   fifa_match(id, home_team_id, away_team_id, status)
--   score_manager_period(manager_id, period_id, points)   manager(id, display_name)
--   period(id, label)
--
-- DO NOT auto-run. Sergio executes against live. Run each PREVIEW first, eyeball
-- the rows, then run the DELETE inside the transaction.
-- ============================================================================

-- ── PREVIEW 1: the bogus cross-team score rows that will be deleted ──────────
-- Expect: FENIX's England/Germany/Argentina GK/DEF tagged to Mexico–South Africa, etc.
SELECT spm.match_id, spm.player_id, p.display_name, p.team_id,
       m.home_team_id, m.away_team_id, spm.points
FROM score_player_match spm
JOIN player p     ON p.id = spm.player_id
JOIN fifa_match m ON m.id = spm.match_id
WHERE p.team_id IS DISTINCT FROM m.home_team_id
  AND p.team_id IS DISTINCT FROM m.away_team_id
ORDER BY spm.match_id, spm.points;

-- ── PREVIEW 2: which managers/periods will need restating (the rollup victims) ─
SELECT DISTINCT mgr.display_name, pr.label, smp.points AS current_manager_period_points
FROM score_player_match spm
JOIN player p       ON p.id = spm.player_id
JOIN fifa_match m   ON m.id = spm.match_id
JOIN lineup_slot ls ON ls.player_id = spm.player_id AND ls.period_id = m.period_id
JOIN manager mgr    ON mgr.id = ls.manager_id
JOIN period pr      ON pr.id = m.period_id
LEFT JOIN score_manager_period smp
       ON smp.manager_id = ls.manager_id AND smp.period_id = m.period_id
WHERE p.team_id IS DISTINCT FROM m.home_team_id
  AND p.team_id IS DISTINCT FROM m.away_team_id
ORDER BY pr.label, mgr.display_name;

-- ── REPAIR (transaction) ─────────────────────────────────────────────────────
BEGIN;

-- 1) Delete the bogus cross-team score rows. After this, job:recompute restates
--    every manager-period from the REMAINING (correct) score_player_match rows.
DELETE FROM score_player_match spm
USING player p, fifa_match m
WHERE spm.match_id = m.id
  AND spm.player_id = p.id
  AND p.team_id IS DISTINCT FROM m.home_team_id
  AND p.team_id IS DISTINCT FROM m.away_team_id;

-- 2) Delete the all-null stub raw rows that spawned them (defensive — these are
--    no longer `dirty`, so the sweeper would not revisit them, and the new
--    participant gate would skip them anyway; we remove them to leave clean data).
DELETE FROM stat_player_match s
USING player p, fifa_match m
WHERE s.match_id = m.id
  AND s.player_id = p.id
  AND p.team_id IS DISTINCT FROM m.home_team_id
  AND p.team_id IS DISTINCT FROM m.away_team_id;

DELETE FROM rating_player_match r
USING player p, fifa_match m
WHERE r.match_id = m.id
  AND r.player_id = p.id
  AND p.team_id IS DISTINCT FROM m.home_team_id
  AND p.team_id IS DISTINCT FROM m.away_team_id;

-- Eyeball the row counts from the three DELETEs, then:
COMMIT;   -- or ROLLBACK if anything looks wrong.

-- ── THEN restate manager-periods + standing (run in the repo, NOT here) ──────
--   cd apps/worker && pnpm job:recompute -- --period "MD1"
-- (forced restatement re-sums every manager-period from the cleaned
--  score_player_match rows, then recomputes the league standing.)

-- ── VERIFY (run after the restate) ───────────────────────────────────────────
-- (a) ZERO cross-team score rows remain (any match):
SELECT count(*) AS cross_team_rows_remaining
FROM score_player_match spm
JOIN player p     ON p.id = spm.player_id
JOIN fifa_match m ON m.id = spm.match_id
WHERE p.team_id IS DISTINCT FROM m.home_team_id
  AND p.team_id IS DISTINCT FROM m.away_team_id;   -- expect 0

-- (b) Only REAL participants are scored for the completed Mexico–South Africa match
--     (every scored player's team is one of the two that played it):
SELECT p.display_name, p.team_id, spm.points
FROM score_player_match spm
JOIN player p     ON p.id = spm.player_id
JOIN fifa_match m ON m.id = spm.match_id
WHERE m.status = 'completed'
  AND (m.home_team_id IN (SELECT id FROM fifa_team WHERE name ILIKE 'mexico')
       OR m.away_team_id IN (SELECT id FROM fifa_team WHERE name ILIKE 'mexico'))
ORDER BY spm.points;

-- (c) FENIX's MD1 manager-period total is no longer dragged negative by phantom −1s:
SELECT mgr.display_name, pr.label, smp.points
FROM score_manager_period smp
JOIN manager mgr ON mgr.id = smp.manager_id
JOIN period pr   ON pr.id = smp.period_id
WHERE mgr.display_name = 'FENIX' AND pr.label = 'MD1';
