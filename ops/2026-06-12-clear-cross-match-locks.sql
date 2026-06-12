-- ============================================================================
-- One-off cleanup: clear CROSS-MATCH premature lineup locks (2026-06-12 incident)
-- ============================================================================
-- Context (the THIRD premature-lock recurrence — see DECISIONS.md lock-on-play):
-- during the Canada–Bosnia live window the worker's sub-event lock path stamped
-- `locked_at` on ~44 `lineup_slot` rows belonging to NON-participants — pooled WC
-- players (France/Portugal/Argentina/… whose own MD-fixtures are days out) whose
-- substitution events leaked in from OTHER fixtures via an unfiltered feed
-- response. The instants are `kickoff + their-other-match minute`, so the now-gate
-- (which only checks "has the instant arrived") could not catch them — the defect
-- is IDENTITY/SCOPING, not timing.
--
-- The CODE fix (single `lockSlot` boundary with a team-in-match + in-play-status
-- gate, plus the ingestLive foreign-event guard and feed re-filter) prevents NEW
-- cross-match stamps. This artifact repairs the EXISTING rows — `locked_at` is a
-- monotonic latch, so they will not self-heal.
--
-- *** RUN ORDER IS LOAD-BEARING ***
--   1. Render deploy of this branch (migration 20260612220000 + the new worker)
--      FIRST. The migration adds the self-heal carve-out to enforce_lineup_lock()
--      AND the new worker stops re-leaking on the next live tick. If you run this
--      cleanup BEFORE the worker redeploys, the next live match re-stamps the same
--      strangers (exactly how the Jun-11 cleanup was undone overnight).
--   2. THIS cleanup SECOND (in Supabase SQL editor).
--   3. Live-window verification THIRD (the fact-7 predicate returns 0 throughout
--      the next live match; James Rodríguez reads movable; Raúl Rangel stays locked).
--
-- Scope: a slot is repaired only when the player's OWN fixture in that period
-- (player.team_id → fifa_match home/away) is still SCHEDULED and in the future
-- (kickoff_at > NOW()) — i.e. a lock that should never have existed. ALL PERIODS
-- (not just MD1). Already-kicked-off / completed fixtures have legitimately locked
-- players (e.g. Raúl Rangel, the Canada/Bosnia XI) and are LEFT INTACT.
--
-- GUC-wrapped: a direct `locked_at` set→NULL passes through enforce_lineup_lock().
-- After migration 20260612220000 the trigger's self-heal branch ALREADY permits
-- this exact clear (source fixture still 'scheduled'); the `app.commish_override`
-- GUC is belt-and-suspenders so the bulk write lands regardless, and because every
-- targeted row is `status='scheduled' AND kickoff_at > NOW()` the GUC can only ever
-- permit the legitimate premature-stamp clear here (never a played-lock change).
--
-- Schema-verified against packages/db/prisma/schema.prisma:
--   lineup_slot(locked_at, player_id, period_id)   player(id, team_id)
--   period(id, label)   fifa_match(period_id, status, home_team_id, away_team_id, kickoff_at)
--
-- DO NOT auto-run. Sergio executes against live. Run the PREVIEW first, eyeball the
-- rows (expect ~44, the incident count), then run the UPDATE inside the transaction.
-- ============================================================================

-- ── 1. PREVIEW: every cross-match premature lock, all periods (run first, inspect) ─
SELECT p.label           AS period,
       pl.display_name   AS player,
       t.name            AS team,
       ls.locked_at      AS bad_locked_at,
       m.kickoff_at      AS own_fixture_kickoff,
       m.status          AS own_fixture_status
FROM lineup_slot ls
JOIN player     pl ON ls.player_id = pl.id
JOIN period     p  ON ls.period_id = p.id
JOIN fifa_match m  ON m.period_id = ls.period_id
                  AND (m.home_team_id = pl.team_id OR m.away_team_id = pl.team_id)
LEFT JOIN fifa_team t ON t.id = pl.team_id
WHERE ls.locked_at IS NOT NULL
  AND m.status = 'scheduled'        -- the player's fixture has NOT started …
  AND m.kickoff_at > NOW()          -- … and is still in the future (a premature stamp)
ORDER BY p.label, m.kickoff_at, pl.display_name;

-- ── 2. APPLY: null the premature cross-match stamps (wrapped so you can verify) ───
BEGIN;

-- Per-transaction commissioner carve-out (belt-and-suspenders; see header). THIS tx only.
SET LOCAL app.commish_override = 'on';

UPDATE lineup_slot ls
SET locked_at = NULL
FROM player pl, fifa_match m
WHERE ls.player_id = pl.id
  AND m.period_id = ls.period_id
  AND (m.home_team_id = pl.team_id OR m.away_team_id = pl.team_id)
  AND ls.locked_at IS NOT NULL
  AND m.status = 'scheduled'
  AND m.kickoff_at > NOW();

-- Inspect the row count above — it should equal the PREVIEW count (~44, the incident
-- size). If it looks wrong, ROLLBACK. (Re-running later is a no-op: the now-fixed
-- worker never re-stamps these, and the WHERE clause only matches future-scheduled.)
-- COMMIT;
-- ROLLBACK;
