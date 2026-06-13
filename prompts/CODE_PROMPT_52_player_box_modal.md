PROMPT 52 — Player box-score modal + Set-Lineup score breakdown

ROLE / MODEL: Claude Code · Sonnet 4.6 · HIGH effort.
(Well-specified multi-file UI + one new authed read reusing requireManager. Subtle seams:
the no-403 league-scoped posture, the country-derivation join, removing the design's
"illustrative" honesty caveat now that SCORING.md is canonical. Bump to Opus 4.8 / high only
if the auth gate feels under-specified once you're in it.)

CONTEXT
Closes one of the three "flagged-not-built" Vs-the-Field/Set-Lineup seams (see PROJECT.md
Prompt-24 close-out): the clickable per-player score breakdown. Data + design already exist:
- score_player_match.breakdown_json = { total, lines:[{category, points, detail}] }, already
  computed and stable (the SCORING.md §1→§8 model). This IS the breakdown.
- stat_player_match = the raw stat counts (tackles, key passes, saves, …).
- Design references (read from repo, do NOT redesign):
    * design/design_handoff_score_breakdown/ — the LATEST handoff; prefer it where it conflicts
      with anything below.
    * design/design_reference/boxscore/{data,components,desktop,mobile,app}.jsx — grouped category layout.
    * design/design_reference/setlineup/components.jsx — ScorePill + PlayerScoreSheet.

SCOPE — three pieces. Keep aggregation pure; the screen stays a thin authed client.

1) PURE VIEW-MODEL (a small package mirroring packages/lineup / packages/vsfield — follow the
   ARCHITECTURE precedent for where pure view-models live; do NOT scatter it into the route):
   buildPlayerBox(scorePlayerMatch, statPlayerMatch, identity, fixture, now) → the modal display
   model:
   - header: display name, position, nation, fixture (opponent + flag, kickoff, status, and
     minute or "FT"), and the period total (= breakdown_json.total, must equal the ScorePill).
   - breakdown: breakdown_json.lines grouped by SCORING.md section, each row = category label,
     SIGNED points, and the `detail` derivation string verbatim.
   - tracked stats: stat_player_match counts that are NOT scored categories render as stat-only
     rows (count shown, points "—") so the modal reads as "categories AND stats."
   - NATION: derive from player.team.fifa_team.name (the P34 pattern). Do NOT read
     player.country (never populated by ingestion).
   - PURE: all inputs injected; no DB / Supabase / process.env / wall-clock. TDD-first, exhaustive
     tests: total equals sum of scored lines; an empty/not-yet-played input yields the empty state;
     a negative line (card) renders signed; nation comes from the fifa_team join.
   - Season total: PERIOD-FIRST. If a cheap sum of the player's score_player_match across the
     season is available at the read layer, include it; otherwise emit season=null and leave a
     // TODO(confirm): — do NOT invent a projection.

2) AUTHED SERVER READ (the modal lazy-loads on open — NO browser-direct table read):
   A gated read (e.g. GET /api/player-box?matchId=&playerId=, or a server action — mirror the
   Prompt-07 / vsfield gate) that:
   - resolves the session manager via requireManager. 401 on no-session / non-league-member.
     NO 403 — league-scoped, all-play-all visibility (any league player's breakdown is viewable,
     same posture as GET /api/vsfield).
   - loads score_player_match + stat_player_match + identity (name/pos/nation via fifa_team join)
     + fixture for (matchId, playerId) via the SSR Prisma owner-bypass path (same as loadVsField),
     runs buildPlayerBox, returns the snapshot.
   - SERVER-ONLY. The browser must NOT gain direct read of score_player_match / stat_player_match.
     This preserves the Theme F server-only posture for player/lineup data → NO new RLS migration,
     NO new entry in supabase_realtime. (Confirm you add none.)

3) MODAL COMPONENT + SET-LINEUP WIRING:
   - Build the modal to the design handoff (grouped category layout) — a reusable component (it
     will be reused by Vs-the-Field in the next prompt, so keep it surface-agnostic: it takes a
     {matchId, playerId} and fetches piece (2) itself, or accepts an injected snapshot).
   - REMOVE the design reference's "values illustrative / pending SCORING.md" caveat — SCORING.md
     is canonical now; show real per-category points.
   - On Set-Lineup (apps/web LineupClient): add a ScorePill under each PLAYED/LOCKED player token
     (the design already specs "a score line under each token"; read pointsAtStake from the
     existing loadLineup slotMeta — do NOT add a second heavy read to the page load). A not-yet-
     played / movable player shows no pill (or a disabled "—"). Click pill → open the modal, which
     fetches the full breakdown via piece (2). Empty state when no score row exists yet.
   - UI per design/CLAUDE.md; map to COMPONENT_MAP.md. Reuse shell/* atoms (Pos, Flag, Avatar).

EXPLICITLY OUT OF SCOPE (next thread — Prompt 53; leave seams intact):
- Vs-the-Field per-manager XI drill-in, reusing this modal on per-player click.
- The Scoring Feed panel (event_match).
- Mini-pitch status-dot coloring.
Do not touch packages/vsfield, buildVsField, loadVsField, GET /api/vsfield, or VsFieldClient.

DEFINITION OF DONE
- Set-Lineup shows a score pill on every played/locked player; clicking it opens a modal with the
  REAL per-category breakdown (points + derivation detail) + tracked stat rows, header total ==
  the pill, nation from the fifa_team join, empty state when unscored.
- New authed read: 401 no-session/non-member, NO 403, league-scoped, server-only; adds NO
  browser-readable table and NO RLS/publication migration.
- buildPlayerBox is pure (grep-clean of DB/Supabase/process.env/clock) with exhaustive tests.
- No signature churn to engine / recompute / standings / ingestion / auth / vsfield; no new write
  path; SCORING.md values consumed (breakdown_json rendered verbatim), not re-derived.
- pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test  → exit 0, green (+ new suites).

GATES (run in: local Claude Code session)
  pnpm db:generate && pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test

BRANCH / MERGE
- Branch: feat/player-box-score (file-disjoint; single worktree is fine — no parallel branch).
- Conventional commits; --ff-only merge; NO force-push ever. Sergio owns merge/push.
- Feature commit does NOT carry [skip render] (it's a real web change → Render WEB deploy on merge;
  no migration, so NO Supabase step). Sergio triggers the Render deploy after merge.

BRAIN-FILE UPDATES (Code performs these as a SEPARATE docs commit carrying [skip render]; all four
files re-uploaded together to Project knowledge afterward by Sergio):
- PROJECT.md: add "Prompt 52 — player box-score modal + Set-Lineup breakdown, DONE". Note the new
  /api/player-box authed read (401 / NO 403, league-scoped, SERVER-ONLY — no new browser-readable
  table, Theme F intact); the "illustrative" caveat removed (real SCORING.md values shown). Move
  the Vs-the-Field "scoring feed" + "per-player H2H XI list" seams to "next thread (Prompt 53)".
- DECISIONS.md: log — player-match breakdowns are surfaced via a SERVER read, not a browser-direct
  table read, preserving the Theme F server-only posture for player/lineup data; the box-score
  modal is built surface-agnostic for reuse on Vs-the-Field.
- ARCHITECTURE.md: record the pure buildPlayerBox view-model + the /api/player-box read; nation
  derived from player.team.fifa_team.name (P34); period-first total, season handling as built.
- SCORING.md: one line noting the box-score modal renders breakdown_json lines verbatim (label +
  signed points + detail) as the canonical per-player audit surface.

STOP. Do not start Prompt 53. After the gates pass, paste back: the diff stat, the new test count,
the gate output, and confirmation that no RLS/publication migration was added. I hold merge until
I've reviewed against this DoD.