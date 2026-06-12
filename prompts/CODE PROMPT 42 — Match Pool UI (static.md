# CODE PROMPT 42 — Match Pool UI (static)  [PARALLEL with notifications; NO Realtime → #43]

## Goal
User-facing surface for the pick pool whose engine + data layer shipped in Prompt 40:
a `/pool` route where managers make per-match picks and see a leaderboard. Reads on
load/refetch — NO Realtime client (that's #43; the pool_pick publication is already in
place from P40).

## PARALLEL STAGING — strict file-disjointness (READ FIRST)
- Branch `feat/pool-ui` off CURRENT `main` now. Runs alongside the in-flight
  notifications branch. Conventional commits. No force-push.
- Touch ONLY pool-owned paths: `apps/web/app/pool/**`, `apps/web/src/pool/**`, pool-only
  components, pool-SCOPED css (e.g. a new `pool.css` — do NOT edit global ds.css/shell.css),
  pool tests.
- DO NOT touch: the App Shell nav/layout, global `ds.css`/`shell.css`, `schema.prisma`,
  any migration, or anything the notifications branch could plausibly edit. If you find you
  NEED a shared file, STOP and flag it in your report — do not edit it.
- NO migration / NO schema change (pool schema landed in P40; #42 is UI-only).
- NAV ENTRY DEFERRED: do NOT add the "Pool" nav link. `/pool` is reachable by direct URL
  only this prompt; the nav wiring is a post-merge step after both branches land.
- BRAIN FILES DEFERRED: do NOT edit DECISIONS/ARCHITECTURE/PROJECT/SCORING in this branch.
  Instead include a short "docs delta" in your report (the exact lines to add) for the
  combined post-merge docs commit.

## Design
No pool screens exist in `design/design_reference` — build net-new on the existing system:
ds.css/shell.css conventions, `--phc` phase colour, ZERO hex, flag kits via `JERSEY_BG`
(NEVER `background-size:cover`), and the `design/CLAUDE.md` gotchas (kit-render; explicit
`color` on text buttons on dark surfaces). Reuse `Flag`/`Avatar`, the lock-state visual
language from `setlineup`/`vsfield` (`statusOf`), and the standings table styling for the
leaderboard. Pool-scoped CSS only.

## 1. Route (no nav)
- New route `/pool` with two views (tabs/toggle): **Picks** (default) and **Leaderboard**.

## 2. Picks view  (per-match picks — NOT a fill-the-bracket predictor)
- Phase from `selectTournamentPhase(matches[])` (reuse the P38 selector; do not re-derive).
- Group fixtures → matchday lists; 3-way control Home / Draw / Away.
- Knockout fixtures → bracket LAYOUT (the "March Madness feel"), 2-way control Home / Away
  (advancer). The bracket is PRESENTATION ONLY — picks remain per-match on KNOWN fixtures.
  Undecided future-round slots render as honest TBD placeholders (Guillotine "projected,
  not invented" principle) — never fabricate matchups.
- Lock per match at its `kickoffAt` (reuse the lock-on-play visual language): past kickoff
  or non-`scheduled` → control disabled, shows the result.
- Reveal: own pick always; others' picks only for matches past kickoff (the P40 read path
  enforces this server-side — UI just renders what it returns).

## 3. Leaderboard view + read-only loader (pool-owned)
- New read-only loader in `apps/web/src/pool`: gather the league's picks + relevant
  `fifa_match` rows with resolved `periodKind` (fifa_match.periodId → period.kind), feed
  `buildPoolLeaderboard` (already pure in `@app/pool`). NO stored score table — on read.
- Ranked table: manager, played, correct, points (points desc → name).

## 4. Submit wiring
- Picks POST to existing `POST /api/pool/pick`. On success refetch/revalidate (no
  optimistic-only state). Surface the route's 409s (lock, knockout-DRAW) as inline errors.

## 5. Tests (Vitest, P37/P38 source-contract-smoke style)
- Leaderboard loader: picks + matches → expected ranked rows (periodKind resolution;
  pending/unscored excluded).
- View/phase selection: group → matchday lists, knockout → bracket, TBD placeholders.
- Lock + reveal contract smokes (own-always / others-post-kickoff; disabled past kickoff).
- Report test-count delta.

## Explicitly OUT of scope
- Realtime client (subscribe / live leaderboard / pick-reveal-at-kickoff) → Prompt 43.
- The "Pool" nav entry → post-merge wiring step.
- Brain-file edits → combined post-merge docs commit (report a docs delta instead).
- Escalating knockout weights (flat 1; seam only). Any fill-the-bracket-up-front predictor.

## Definition of Done
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` all green.
- NO brain-file edits, NO nav edit, NO schema/migration in this branch (parallel staging).
- Report: diffs, test-count delta, branch@sha, the docs delta, and an explicit confirmation
  that no shared/non-pool files were touched.
- Do NOT merge — Chat holds merge until explicit clearance.