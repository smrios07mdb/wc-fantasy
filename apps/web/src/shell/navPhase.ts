/**
 * Pure nav-phase derivation for the phase-aware App Shell (T15-CUT, executing the T15-4 IA decision):
 * during the knockout the vsfield slot relabels to "The Cut" (machete glyph + live dot) and the More
 * sheet's Playoffs entry relabels to "Theater" — no new tab, same slots (spec §6).
 *
 * Reuses `selectTournamentPhase` (period.kind discriminator — NEVER fifa_match.round; Prompt 44) and
 * adds the ONE extra signal the tab needs: `knockoutLive` — is a knockout ROUND live right now
 * (some match kicked off AND not every match completed)? The dot is dark between rounds, in the
 * pend window (all FT, awaiting official results — mock state f), and after the Final.
 */
import {
  selectTournamentPhase,
  type TournamentMatchSummary,
} from "@/src/dashboard/selectTournamentPhase";
import type { NavPhase } from "./crossNav";

/** `TournamentMatchSummary` + the period id, so live-round detection can group by period. */
export interface NavPhaseMatchSummary extends TournamentMatchSummary {
  periodId: string | null;
}

export interface NavPhaseState {
  phase: NavPhase;
  /** A knockout round is underway right now — lights the tab's live dot. */
  knockoutLive: boolean;
}

const KICKED_OFF = new Set(["in_progress", "completed", "abandoned"]);

export function deriveNavPhaseState(matches: ReadonlyArray<NavPhaseMatchSummary>): NavPhaseState {
  const tournament = selectTournamentPhase(matches);
  const phase: NavPhase =
    tournament === "playoff" ? "knockout" : tournament === "complete" ? "complete" : "group";
  if (phase !== "knockout") return { phase, knockoutLive: false };

  // A knockout period is LIVE when some of its matches kicked off and not all are completed.
  const byPeriod = new Map<string, { kicked: boolean; allCompleted: boolean }>();
  for (const m of matches) {
    if (m.periodKind !== "knockout_round" || m.periodId === null) continue;
    const cur = byPeriod.get(m.periodId) ?? { kicked: false, allCompleted: true };
    cur.kicked = cur.kicked || KICKED_OFF.has(m.status);
    cur.allCompleted = cur.allCompleted && m.status === "completed";
    byPeriod.set(m.periodId, cur);
  }
  const knockoutLive = [...byPeriod.values()].some((p) => p.kicked && !p.allCompleted);
  return { phase, knockoutLive };
}
