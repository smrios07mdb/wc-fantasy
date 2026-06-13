/**
 * Pure tournament-phase selector (mirrors `selectDashboardPhase`): derives the render phase from the
 * `fifa_match` rows once the draft completes. IO-free, unit-tested.
 *
 * Algorithm — checked in precedence order (highest wins):
 *   complete    — the Final (period.label === "Final") is fully completed.
 *   playoff     — any knockout fixture (period.kind === "knockout_round") has kicked off.
 *   group       — any group fixture (period.kind === "group_md") has kicked off.
 *   pre-kickoff — no fixture has kicked off yet (incl. no fixtures / no linked periods = empty array).
 *
 * Discriminator = `period.kind`, NEVER `fifa_match.round`. The live feed populates `round` with the
 * matchday NUMBER for group games ("1"/"2"/"3", NON-NULL), so a `round !== null` test mis-fires the
 * knockout branch and renders the playoff interim while the tournament is still in the group stage.
 * The Final is detected by `period.label === "Final"` (the canonical provisioning-stored label), not
 * a round string. `period.kind` is the same signal locking / recompute / period-close / Pool already
 * trust (DECISIONS → Pool).
 *
 * "Kicked off" = status in_progress | completed | abandoned. scheduled + postponed = NOT kicked off
 * (a postponement does NOT advance phase). Kickoff time / the clock is NOT consulted for phase
 * detection — phase is purely structural (period.kind + period.label + status).
 */
import type { MatchStatus, PeriodKind } from "@app/shared";

export type TournamentPhase = "pre-kickoff" | "group" | "playoff" | "complete";

/** Minimal match shape needed for phase detection (subset of a fifa_match row + its linked period). */
export interface TournamentMatchSummary {
  status: MatchStatus;
  /** `fifa_match.periodId → period.kind`. Authoritative group↔knockout discriminator
   *  (NEVER fifa_match.round — the live feed populates round with the matchday number for
   *  group games, so round !== null mis-fires). null = period not yet linked. */
  periodKind: PeriodKind | null;
  /** Canonical `period.label` (MD1…/R32…/Final). Used only to detect the Final. null when unseeded. */
  periodLabel: string | null;
}

/** A match "kicked off" if play has or had started (regardless of outcome). */
function hasKickedOff(m: TournamentMatchSummary): boolean {
  return m.status === "in_progress" || m.status === "completed" || m.status === "abandoned";
}

export function selectTournamentPhase(
  matches: ReadonlyArray<TournamentMatchSummary>,
): TournamentPhase {
  // complete: the Final is done.
  if (
    matches.some(
      (m) =>
        m.periodKind === "knockout_round" && m.periodLabel === "Final" && m.status === "completed",
    )
  ) {
    return "complete";
  }

  // playoff: any knockout match has kicked off.
  if (matches.some((m) => m.periodKind === "knockout_round" && hasKickedOff(m))) {
    return "playoff";
  }

  // group: any group match has kicked off.
  if (matches.some((m) => m.periodKind === "group_md" && hasKickedOff(m))) {
    return "group";
  }

  // pre-kickoff: nothing kicked off yet (or no fixtures / no linked periods).
  return "pre-kickoff";
}
