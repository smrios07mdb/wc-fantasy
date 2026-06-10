/**
 * Pure tournament-phase selector (mirrors `selectDashboardPhase`): derives the render phase from
 * `fifa_match` rows after the draft completes. IO-free, unit-tested.
 *
 * Algorithm — checked in precedence order (highest wins):
 *   complete    — the Final match is fully completed.
 *   playoff     — any knockout fixture (round !== null) has kicked off.
 *   group       — any group fixture (round === null) has kicked off.
 *   pre-kickoff — no fixture has kicked off yet (incl. no fixtures at all = empty array).
 *
 * "Kicked off" = status in_progress | completed | abandoned.
 * scheduled + postponed = NOT kicked off (a postponement does NOT advance phase).
 *
 * Exhaustiveness guard: adding a new TournamentPhase becomes a compile error until handled.
 */
import type { MatchStatus } from "@app/shared";

export type TournamentPhase = "pre-kickoff" | "group" | "playoff" | "complete";

/** Minimal match shape needed for phase detection (subset of the fifa_match row). */
export interface TournamentMatchSummary {
  status: MatchStatus;
  /**
   * Knockout round label ("R32" | "R16" | "QF" | "SF" | "Final"), or null for group-stage games.
   * Mirrors `fifa_match.round` — set at schedule-sync, NEVER derived from kickoff time.
   */
  round: string | null;
}

/** A match has "kicked off" if play has or had started (regardless of outcome). */
function hasKickedOff(m: TournamentMatchSummary): boolean {
  return m.status === "in_progress" || m.status === "completed" || m.status === "abandoned";
}

export function selectTournamentPhase(
  matches: ReadonlyArray<TournamentMatchSummary>,
): TournamentPhase {
  // complete: the Final is done.
  if (matches.some((m) => m.round === "Final" && m.status === "completed")) {
    return "complete";
  }

  // playoff: any knockout match has kicked off.
  if (matches.some((m) => m.round !== null && hasKickedOff(m))) {
    return "playoff";
  }

  // group: any group match has kicked off.
  if (matches.some((m) => m.round === null && hasKickedOff(m))) {
    return "group";
  }

  // pre-kickoff: nothing kicked off yet (or no fixtures loaded at all).
  return "pre-kickoff";
}
