# BACKLOG.md — Pending features & fixes

Living work queue for XI — The Starting Eleven. Maintained alongside the brain files
(`PROJECT.md` / `DECISIONS.md` / `ARCHITECTURE.md` / `SCORING.md`); re-upload to Project
knowledge when it changes. **Guiding constraint: boring and reliable over clever.**

_Last updated: 2026-06-21._

---

## Legend

**Status:** `TODO` · `DIAGNOSING` · `IN PROGRESS` · `BLOCKED` · `VERIFY` (believed done — confirm in DB) · `DONE`
**Value:** Critical (correctness in a live competitive league) · High · Med · Low
**Effort:** S · M · L
**Risk class** (governs merge authority):
- `contained` — Code-autonomous on green gates (read/UI/loader, no schema/purity/auth change)
- `review` — Chat clearance before merge (resolver / purity / migration-adjacent / auth-or-reveal gated)
- `migration` — schema/RLS change; Sergio is merge authority

Gate: `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` (+ `pnpm --filter @app/web build` for web/CSS threads).

---

## Gating prefix — integrity & security (precede feature work)

These come before the T-items. A wrong standing or an open RLS hole outranks any feature. **All three closed as of 2026-06-21 — the integrity gate is clear.**

| ID | Item | Value | Status | Notes |
|----|------|-------|--------|-------|
| SEC-P0 | `faab_bid_select_settled` RLS — add `TO authenticated` (audit F-P2-01) | Critical | `DONE` (2026-06-21) | Scoped to authenticated league members (`8d0c036`). anon=0 verified live 2026-06-21. |
| SEC-P1 | `pool_pick` Realtime publication — auth-or-clock gate on SELECT (audit F-P2-02) | High (latent) | `DONE` (2026-06-21) | Clock-gated SELECT (`4cb29e5`, migration `20260621120000_fix_pool_pick_realtime_rls`), deployed live. `pg_policies` USING = league-member AND (own-pick OR `pool_pick_match_kicked_off(match_id)`); SECURITY DEFINER helper exists (`prosecdef=t`). Role-switched integration suite green. |
| DATA-VAR | VAR remediation — stale `stat_player_match` conceded rows re-scored | Critical | `DONE` (2026-06-19) | Whole VAR theme (incl. Algeria–Argentina / Martínez remediation) closed; commish confirmed 2026-06-21. **Do not reopen.** |

---

## Triage — open feature work

| ID | Item | Value | Effort | Risk | Status | Notes |
|----|------|-------|--------|------|--------|-------|
| **T5/T6** | Game detail — click a game (dashboard + Quiniela) → both squads (XI+subs+cards) + every player's live pts + fantasy-owner overlay | High | L | contained (new loader; review-class) | `DONE`\* | `feat/game-detail` — full DoD gate green (2466 tests + web build); **merge HELD** for Chat clearance (review-class); hash on merge. "Games tab" resolved → `/pool` (Quiniela). New `/games/[matchId]` route + pure `buildGameDetail` + read-only `loadGameDetail` (no engine re-run, no RLS/migration, no Realtime). |
| **T11** | Full stat sheet for previous matchday — in Lineup, Vs the Field, Waivers | Med | M | contained | `TODO` | verified still TODO 2026-06-21 — shared player-card Points/Stats tabs shipped (current-period box score + per-player tournament log), but **no prior-matchday selector** across the three surfaces |
| **T12** | "Season" tab: each team's score by matchday | Med | M | contained | `TODO` | PARTIAL 2026-06-21 — per-team-per-matchday points data + per-row expandable breakdown + form strip shipped on `/standings` Cumulative (`131eaba`); still missing a dedicated "Season" tab and a season-by-matchday score grid |
| **T13** | Subs rendered with their jerseys (kit chips), not the pill box | Low–Med | S | contained | `TODO` | reuse the starter kit-chip `JERSEY_BG`; do **NOT** set `background-size: cover` (CLAUDE.md kit gotcha) |
| **T14** | Vs-the-Field benches: show each bench player's points + click → player card | Med | M | contained | `TODO` | extends shipped T1 (`loadVsField` already carries benches); reuse `PlayerScoreSheet` / `score_player_match` box-score path |
| **T2** | Waiver watchlist / "star" a player to track | Low | M | migration | `TODO` | commish re-confirmed 2026-06-21; new table + RLS, Sergio is merge authority |
| **T15** | Mobile UX/UI audit → responsiveness overhaul, bottom nav first (target: Apple-feature-worthy) | High | L (epic) | review/design | `TODO` | **EPIC, not a single thread** — decompose: read-only audit punch-list → AppShell/bottom-nav → per-screen passes; canonical `design/design_reference/`, verify on live Render |

**Reuse notes (so we don't rebuild):**
- T5/T6 — DONE (held). Confirmed the box-score gate: `score_player_match` (+ `stat_player_match`) exist for EVERY match participant, not just rostered players (recompute's `playerAppearedInMatch` gate, no roster join), so a full 22+ box score with fantasy points is fully backed by stored data. New `loadGameDetail` reads it read-only; squads from `match_lineup_entry` (starters AND bench), cards/subs from `event_match`, owner overlay from `lineup_slot` (period-keyed) + `roster_player`. Per-player drill-in reuses `PlayerScoreSheet` verbatim.
- T11 — box-score is already period-aware; add prior-period selection across three surfaces (no prior-matchday selector exists yet — lineup `PeriodTabs` is current+upcoming only; vsfield/waivers have no period tabs).
- T12 — `periodRecords` / `computeStandings` already compute per-period all-play-all records, and `standingsView` threads `PeriodFormCell.points` per matchday onto each cumulative row; remaining work is the grid presentation + a "Season" tab.
- T14 — `loadVsField` read already carries benches (shipped with T1).

---

## Thread sequence (one theme per thread)

1. ~~**T5/T6** — match/game detail + dashboard game-click.~~ ✅ DONE (`feat/game-detail`, merge HELD).
2. **T11** — prior-matchday stat sheets across the three surfaces.
3. **T12** — "Season" tab + season-by-matchday score grid (data already threaded; presentation only).
4. **T13** — sub kit-chips.
5. **T14** — Vs-the-Field bench points + player-card drill-in.
6. **T2** — waiver watchlist (migration; Sergio merge authority).
7. **T15** — mobile UX/UI audit + responsiveness overhaul (**LAST**).

T15 (the mobile audit) is deliberately deferred to the end: running it before the feature threads land would force re-skinning the same screens twice. Grouping otherwise minimizes merges (each merge = a brain-file re-upload).

---

## Open questions

- ~~**T5** — screenshot text was truncated; confirm the full intent when the thread opens.~~ RESOLVED 2026-06-21: "the user's own Games tab" = `/pool` (Quiniela, the match pick'em). Detail opens from the dashboard matchday rows AND a separate non-intrusive tap target on the Quiniela fixture cards (the teams-score area → `/games/[matchId]`); the HOME/DRAW/AWAY pick buttons are untouched.

---

## Recently shipped (context — not pending)

Shipped this session (2026-06-21):
- **T5/T6** — Game detail (`feat/game-detail`, **merge HELD**, review-class): new `/games/[matchId]` route opens a real-match box score (both squads incl. subs + cards) overlaid with the fantasy layer (each player's points + a started/benched/owned manager tag), reached from the dashboard matchday rows + a separate Quiniela tap target. Pure `buildGameDetail` + read-only owner-bypass `loadGameDetail` (NO engine re-run, NO RLS/migration, NO Realtime widening); nation via `fifa_team.name` (never `player.country`); per-player drill-in reuses `PlayerScoreSheet`. (Out of scope, as specified: two-yellow→red banding — rows shown as `classifyCard` returns them.)
- **T-CARD1** — single-sourced `classifyCard` (`refactor/classifycard-single-source`, **merge HELD**, review-class): the canonical classifier in `@app/recompute` (`packages/recompute/src/adapter.ts`) is now `export`ed and imported by the web Game-Detail builder (`apps/web/src/games/buildGameDetail.ts`), deleting the replicated copy + its `norm`/`CardKind` duplicates. Param widened `EventRow` → structural `CardEvent`; **engine scoring byte-identical** (function body unchanged, all `adapter.test.ts` engine tests pass unchanged, the "2nd yellow stays a 2nd yellow" test now exercises the shared fn). No server-only/Prisma leak: the main `@app/recompute` entry is IO-free (Prisma is behind the `/prisma` subpath), confirmed by a green `next build`. Gate green (2466 tests + web build).
- **T9** — tied matchups recorded as informational Draws, W-L-D (`8d0c9f4`); equal points → Draw + joint rank, seeding untouched. (Residual, FLAGGED: playoff "power record" surfaces show no D — knockout phase only, not a group-stage regression.)
- **T10** — dedicated `/standings` page: Matchday (default) + Cumulative tabs (`131eaba`).
- **T1** — Vs the Field shows the opponent's bench and yours at the bottom of H2H (`7929512`).
- **T3** — dashboard standings rows link to the manager's scores (`4923765` → `/vsfield?manager=<id>`).
- **T4** — quiniela leaderboard → manager picks reveal (`f9ae476`); stayed read-only (no `pool_pick` subscription).
- **T7** — forfeit-sub spurious error suppressed (`9935472`) + forfeit confirm now survives a period switch via `forfeitsByPeriod` (`0003f50`).
- **T8** — waivers shows each free agent's next opponent (`6776212`).
- Opponent-tag UUID-on-null-name fix → `UNNAMED_OPPONENT` (`0003f50`) — shared `resolveOpponentByPlayer` never surfaces a team UUID.

Earlier:
- VAR phantom-goals fix (`395443e`) — `isGoalEvent` keys on `incident_type === "goal"` exactly.
- Card classifier fix (`0ac4bb8`) — `classifyCard` keys on `incident_type` exactly.
- FAAB live-unowned free agency (`587b3ad`).
