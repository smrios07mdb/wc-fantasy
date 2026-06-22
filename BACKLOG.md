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

These come before the T-items. A wrong standing or an open RLS hole outranks any feature. The first three closed as of 2026-06-21; **SEC-P3 (below) is a newly-recorded latent finding awaiting a commish decision — not a regression and NOT introduced by T11.**

| ID | Item | Value | Status | Notes |
|----|------|-------|--------|-------|
| SEC-P0 | `faab_bid_select_settled` RLS — add `TO authenticated` (audit F-P2-01) | Critical | `DONE` (2026-06-21) | Scoped to authenticated league members (`8d0c036`). anon=0 verified live 2026-06-21. |
| SEC-P1 | `pool_pick` Realtime publication — auth-or-clock gate on SELECT (audit F-P2-02) | High (latent) | `DONE` (2026-06-21) | Clock-gated SELECT (`4cb29e5`, migration `20260621120000_fix_pool_pick_realtime_rls`), deployed live. `pg_policies` USING = league-member AND (own-pick OR `pool_pick_match_kicked_off(match_id)`); SECURITY DEFINER helper exists (`prosecdef=t`). Role-switched integration suite green. |
| DATA-VAR | VAR remediation — stale `stat_player_match` conceded rows re-scored | Critical | `DONE` (2026-06-19) | Whole VAR theme (incl. Algeria–Argentina / Martínez remediation) closed; commish confirmed 2026-06-21. **Do not reopen.** |
| SEC-P3 | Vs-the-Field shows the next wave's XIs during the inter-matchday GAP (pre-existing) | Low–Med (latent) | `TODO` (flagged 2026-06-21) | Surfaced by the T11 review. `loadVsField` pins the current wave via `selectCurrentPeriod` (predicate `now < lastKickoff + MATCH_DURATION_MS`, true for a future wave). Once a wave's last match ends, the next (not-yet-kicked-off) wave becomes the default view, so every manager's lineup_slot XI for it is rendered before kickoff. **Vsfield has no per-fixture reveal gate at all (it shows all XIs by design — ARCHITECTURE §5); the `readVisiblePicks` kickoff gate is the *pool* surface, not vsfield.** PRE-EXISTING — the default selection is byte-identical pre/post-T11, and T11's selectable set (started-only) does NOT widen it. Decision for commish: is the gap-window XI reveal acceptable (lineups public by design) or should vsfield gain a per-fixture reveal gate (mirror pool's clock gate)? |
| SEC-P3b | Set-lineup validator has no period-DONE gate (defense-in-depth) | Low | `TODO` (flagged 2026-06-21) | Surfaced by the `fix/t11-corrections` review. `validateLineup` / the POST `/api/lineup` controller enforce the lock-on-play latch + forfeit play-state rules, but nothing rejects a write to a fully-COMPLETED period outright. A crafted POST could rearrange never-appeared / zero-scoring (never-locked) players within a done period. **UI-unreachable** (the client gates every mutation off `readOnly`) and **zero standings impact** (those slots scored 0 and stay 0; played slots are already latch-protected). Defense-in-depth only: add a `periodIsDone`-style server gate that rejects any lineup write to a completed period. Effort S, risk review (touches the shared write path → hold). |

---

## Triage — open feature work

| ID | Item | Value | Effort | Risk | Status | Notes |
|----|------|-------|--------|------|--------|-------|
| **T5/T6** | Game detail — click a game (dashboard + Quiniela) → both squads (XI+subs+cards) + every player's live pts + fantasy-owner overlay | High | L | contained (new loader; review-class) | `DONE`\* | `feat/game-detail` — full DoD gate green (2466 tests + web build); **merge HELD** for Chat clearance (review-class); hash on merge. "Games tab" resolved → `/pool` (Quiniela). New `/games/[matchId]` route + pure `buildGameDetail` + read-only `loadGameDetail` (no engine re-run, no RLS/migration, no Realtime). |
| **T11** | Full stat sheet for previous matchday — in Lineup, Vs the Field, Waivers | Med | M | contained (reveal-adjacent → review-class) | `DONE`\* | `feat/prior-matchday-selector` — full DoD gate green (2490 tests + web build); **merge HELD** for Chat clearance. Prior-matchday selector on all three surfaces, every period read routed through the EXISTING period-aware models with a `periodId` param (shared pure `selectablePeriods.ts`); selectable set = started periods only (`isPickLocked` on `matches[0]`), future/unstarted NEVER selectable; prior views strictly read-only; `PlayerScoreSheet` reused verbatim; NO new table/RLS/migration/Realtime. **Corrected by `fix/t11-corrections` (merge HELD, stacks on this):** (A) prior **Lineup** now renders from the period's `lineup_slot` snapshot so a fielded-then-dropped player still appears (`snapshotPlayers`); (B) **Waivers** drops the over-applied selector — period concept confined to matchday-labelled Batch results. Display-only; +2 jsdom render tests; gate green. **Round 2 — `fix/t11-corrections-2` (merge HELD, stacks):** (A-2) the **Lineup** pitch shows per-player points on every LOCKED-ON-PLAY tile (the pill now keys on the SAME `!movable` condition the bench uses — decoupled from `readOnly`/`slotKind`, so it works on the CURRENT matchday once matches play, not only read-only priors; movability unchanged via `movable ? onSelect : onScore`) + the manager's canonical matchday total (`score_manager_period.points`, single-sourced via `selectManagerPeriodTotal`, never re-summed, so it matches standings; banner shows whenever a stored total exists — prior OR current-with-scoring); (B-2) **Batch results** group by player (`groupResultsByPlayer`→`WvResultGroup`) — one entry per contested player with all bids (winner + losers) beneath. Display-only, no movability/write/engine/RLS change; tests incl. an editable-period render proof; gate green (2515 tests + web build). |
| **T12** | "Season" tab: each team's score by matchday | Med | M | contained | `TODO` | PARTIAL 2026-06-21 — per-team-per-matchday points data + per-row expandable breakdown + form strip shipped on `/standings` Cumulative (`131eaba`); still missing a dedicated "Season" tab and a season-by-matchday score grid |
| **T13** | Subs rendered with their jerseys (kit chips), not the pill box | Low–Med | S | contained | `TODO` | reuse the starter kit-chip `JERSEY_BG`; do **NOT** set `background-size: cover` (CLAUDE.md kit gotcha) |
| **T14** | Vs-the-Field benches: show each bench player's points + click → player card | Med | M | contained | `TODO` | extends shipped T1 (`loadVsField` already carries benches); reuse `PlayerScoreSheet` / `score_player_match` box-score path |
| **T2** | Waiver watchlist / "star" a player to track | Low | M | migration | `TODO` | commish re-confirmed 2026-06-21; new table + RLS, Sergio is merge authority |
| **T15** | Mobile UX/UI audit → responsiveness overhaul, bottom nav first (target: Apple-feature-worthy) | High | L (epic) | review/design | `TODO` | **EPIC, not a single thread** — decompose: read-only audit punch-list → AppShell/bottom-nav → per-screen passes; canonical `design/design_reference/`, verify on live Render |
| **T16** | Re-skin the `/games/[matchId]` game-detail pages per Sergio's Claude Design exports | Med | M | review/design | `TODO` | **SEQUENCED AFTER T12.** Re-skin the game-detail surfaces (lineups, game stats, cards/subs, fantasy overlay) shipped in T5/T6 (`buildGameDetail` / `loadGameDetail`, ARCHITECTURE §25). Sergio supplies the Claude Design files when the thread opens. Display/skin only — the read-only loader + view-model stay untouched. |

**Reuse notes (so we don't rebuild):**
- T5/T6 — DONE (held). Confirmed the box-score gate: `score_player_match` (+ `stat_player_match`) exist for EVERY match participant, not just rostered players (recompute's `playerAppearedInMatch` gate, no roster join), so a full 22+ box score with fantasy points is fully backed by stored data. New `loadGameDetail` reads it read-only; squads from `match_lineup_entry` (starters AND bench), cards/subs from `event_match`, owner overlay from `lineup_slot` (period-keyed) + `roster_player`. Per-player drill-in reuses `PlayerScoreSheet` verbatim.
- T11 — DONE (held). The box-score path (`PlayerScoreSheet` → `/api/player-box` → `loadPlayerBox`) was already period-aware and needed NO change; only period SELECTION was missing. Added a shared pure `apps/web/src/period/selectablePeriods.ts` (started-set = `isPickLocked` on `matches[0]`, `periodIsDone` = last kickoff + window, `resolveDisplayedPeriodId` = server-side future-rejection) consumed by Lineup + vsfield. Lineup extends `PeriodTabs` (prior periods the manager played, read-only, default pinned to the live wave); vsfield threads `?period=` → `loadVsField(periodId)` (live sub suppressed for a prior). **`fix/t11-corrections` (held, stacks on T11):** Lineup renders a prior from its own `lineup_slot` snapshot (`snapshotPlayers`, dropped-but-fielded players included); Waivers' selector was removed (over-applied) — the period concept is confined to matchday-labelled Batch results, and the FA pool/claims/cards are live/global (drill-down always the period-less `FaPlayerCardSheet`).
- T12 — `periodRecords` / `computeStandings` already compute per-period all-play-all records, and `standingsView` threads `PeriodFormCell.points` per matchday onto each cumulative row; remaining work is the grid presentation + a "Season" tab.
- T14 — `loadVsField` read already carries benches (shipped with T1).

---

## Thread sequence (one theme per thread)

1. ~~**T5/T6** — match/game detail + dashboard game-click.~~ ✅ DONE (`feat/game-detail`, merge HELD).
2. ~~**T11** — prior-matchday stat sheets across the three surfaces.~~ ✅ DONE (`feat/prior-matchday-selector`, merge HELD).
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
- **T11** — Prior-matchday stat-sheet selector (`feat/prior-matchday-selector`, **merge HELD**, reveal-adjacent/review-class): a matchday selector on Lineup, Vs the Field, and Waivers, routing every period read (current + prior) through the EXISTING period-aware models with a `periodId` param — single read path, no parallel/ungated read. Shared pure `apps/web/src/period/selectablePeriods.ts`: started-set = `isPickLocked` on the first fixture (future/unstarted NEVER selectable), `periodIsDone` = last kickoff + window, `resolveDisplayedPeriodId` rejects a future-period request server-side. Lineup `PeriodTabs` extended with read-only priors (anchored on `periodIsDone`, NOT `period.status`; default pinned to the live wave; the write path is unchanged and rejects edits to played slots via the lock-on-play latch + forfeit play-state rules); vsfield threads `?period=` and suppresses the live subscription for a prior; waivers selector swaps the drill-down to `PlayerScoreSheet` for a prior (FA pool/claims/batch stay live/global). `PlayerScoreSheet` reused verbatim; NO new table/RLS/migration/Realtime. Surfaced **SEC-P3** (the pre-existing inter-matchday-gap XI reveal — flagged, not introduced here). Gate green (2490 tests + web build). **Corrected by `fix/t11-corrections`** (merge HELD, stacks on this branch): (A) prior Lineup renders from the period's `lineup_slot` snapshot (`snapshotPlayers`) so a fielded-then-dropped player still appears; (B) the over-applied Waivers selector is removed — the period concept is confined to matchday-labelled Batch results (FA pool/claims/cards stay live/global). Surfaced **SEC-P3b** (lineup validator has no period-done gate) + **T16** (re-skin `/games/[matchId]`).
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
