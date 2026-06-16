/**
 * Pure playoff-vs-complete reconciler for the dashboard's knockout phases. IO-free, unit-tested.
 *
 * `selectTournamentPhase` already splits the knockout window into "playoff" vs "complete" from the
 * fifa_match rows (the Final's status === "completed"). But the AUTHORITATIVE signal for the
 * dashboard's complete arm is `PlayoffsView.complete` — "every round cut AND a champion playoff_entry
 * exists" (playoffsView.ts) — because the ChampionModule has nothing to render until that champion row
 * is written. The two signals can briefly disagree around the Final whistle (the match flips to
 * completed before — or after — the worker writes the champion entry), so once we are in the knockout
 * window we let `PlayoffsView.complete` decide which arm renders:
 *
 *   (playoff,  false) → playoff
 *   (playoff,  true)  → complete   (champion already written — show it, even if the Final row lags)
 *   (complete, false) → playoff    (Final FT'd but champion not yet written — never show an empty arm)
 *   (complete, true)  → complete
 *
 * Non-knockout phases pass through untouched so the helper is total over TournamentPhase (the loader
 * only calls it in the knockout branch, but the pass-through keeps it safe + trivially testable).
 *
 * `playoffsComplete` is null when there is no playoff read surface yet (no ladder / no seeded field →
 * `loadPlayoffs` returned null) → treated as not-complete → playoff.
 */
import type { TournamentPhase } from "./selectTournamentPhase";

export function resolveKnockoutPhase(
  tournamentPhase: TournamentPhase,
  playoffsComplete: boolean | null,
): TournamentPhase {
  if (tournamentPhase !== "playoff" && tournamentPhase !== "complete") {
    return tournamentPhase;
  }
  return playoffsComplete === true ? "complete" : "playoff";
}
