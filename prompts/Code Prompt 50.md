Run Opus 4.8, high. Branch off main (47+48+49 merged): feat/waivers-batch-time-ui.
Context: the Waivers screen (Prompt 26) shows a "next batch" element with an illustrative/daily placeholder. Cadence is now real and per-period (47–49), pinned per period via period.waiver_batch_at (MD1 = 1 PM ET). The screen must show the actual time. No redesign — wire real data into the existing element, following design/design_reference/waivers/*.
Read first: the apps/web Waivers screen/components; @app/faab/window.ts (acquisitionWindowState, PeriodWindowView); the worker's effectiveBatchAt (apps/worker/src/faab/selectors.ts); period (waiver_batch_at, batch_cleared_at, label); fifa_match.kickoff_at + period_id; league.timezone.
Scope:

One source of truth for the batch time. The UI must show the exact time the worker fires. effectiveBatchAt (waiver_batch_at ?? firstKickoff − lead) currently lives in the worker (not importable by web — the same constraint that moved window.ts). Extract effectiveBatchAt into @app/faab (beside window.ts); re-export from the worker selector to preserve its surface; move its tests. Now web + worker compute the identical time.
Render the live window state, server-side, from the current period's effectiveBatchAt + first kickoff (MIN(fifa_match.kickoff_at) for the period) + batch_cleared_at, via acquisitionWindowState. Show, in league.timezone (Intl-formatted, so it reads ET/EDT):

Before the batch: "Waivers process at {batchTime}" + existing countdown.
Free-agency phase (batch cleared → first kickoff): "Free agency open — locks at {firstKickoff}".
Locked (after first kickoff): "Waivers locked for {period.label}".


Reuse the existing element/typography — data wiring, not a re-skin.

Out of scope: any change to firing logic, the resolver, resolve.ts/purity matrix. Display only.
Tests: the phase→label/time mapping renders for all three phases in a non-UTC league tz; the effectiveBatchAt extraction preserves worker behavior (existing worker tests green).
Brain files (you write them): ARCHITECTURE.md (note effectiveBatchAt now shared in @app/faab); PROJECT.md status. DECISIONS.md/SCORING.md untouched.
Gate: pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test.
STOP after committing (conventional, no force-push). Report the diff, the three phase renderings with the league-tz formatting, and confirm resolve.ts/purity matrix untouched. No merge, no push — Chat clears, then you verify on the live deploy.