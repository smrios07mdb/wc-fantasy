/**
 * Server-side data loader for the dashboard home — thin IO edge that assembles the phase-aware
 * `DashboardData` the home page hydrates. Reuses `loadDraftRoom` DIRECTLY (no second source, no
 * re-derivation of draft state — the exact same shape that /draft reads). When the draft is
 * complete the loader ALSO:
 *   1. reads a minimal `fifa_match` summary (status + round + kickoffAt) to derive the tournament
 *      phase via the pure `selectTournamentPhase` selector (Prompt 38), and
 *   2. calls `loadVsField` READ-ONLY for the group-phase module data.
 *
 * No scoring/engine touch, no RLS bypass beyond the established loader posture.
 *
 * Like the other loaders (loadDraftRoom / loadVsField) this edge has no unit test (it needs a
 * live DB); `tsc` + the pure-selector suite cover the shapes it produces.
 */
import { prisma } from "@app/db";
import { loadDraftRoom } from "../draft/loadDraftRoom";
import { loadVsField } from "../vsfield/loadVsField";
import {
  selectDashboardPhase,
  type DashboardPhase,
} from "../../src/dashboard/selectDashboardPhase";
import { selectTournamentPhase } from "../../src/dashboard/selectTournamentPhase";
import type { DraftRoomState } from "../../src/draft/types";
import type { VsFieldView } from "@app/vsfield";

export interface DashboardData {
  /** The resolved display phase for this render. */
  phase: DashboardPhase;
  /**
   * The authoritative draft snapshot. Null only when no draft record exists yet (edge case:
   * league provisioned but no draft row written). Pre-draft shows "waiting for commissioner".
   */
  draft: DraftRoomState | null;
  /**
   * Full vs-the-field view — populated for the "group" phase only; null otherwise.
   * Contains: field (current-period field entries), season (standings), matches, currentPeriod.
   */
  vsField: VsFieldView | null;
  /**
   * ISO datetime of the earliest scheduled group kickoff — populated for "pre-kickoff" only.
   * Used for the real countdown display in the PrimaryBanner. Null = no fixtures loaded yet.
   */
  earliestGroupKickoff: string | null;
}

/**
 * Load the dashboard snapshot for the session manager. Reuses `loadDraftRoom` so the dashboard
 * reads the SAME authoritative data as /draft — no parallel reads, no stale divergence.
 *
 * When the draft is complete, additionally reads `fifa_match` (minimal: status, round, kickoffAt)
 * to derive the tournament phase, and calls `loadVsField` for the group phase module data.
 */
export async function loadDashboard(sessionManagerId: string): Promise<DashboardData> {
  const draft = await loadDraftRoom(sessionManagerId);
  if (!draft) {
    // No draft row: treat as pre-draft (the draft hasn't been configured yet).
    return { phase: "pre-draft", draft: null, vsField: null, earliestGroupKickoff: null };
  }

  const draftPhase = selectDashboardPhase(draft.status);

  // Pre-tournament phases don't need match data — return immediately.
  if (draftPhase !== "post-draft") {
    return { phase: draftPhase, draft, vsField: null, earliestGroupKickoff: null };
  }

  // Draft complete — derive tournament phase from fifa_match rows.
  // The match query is READ-ONLY and minimal: only status + round for phase detection,
  // plus kickoffAt for the pre-kickoff countdown (NOT used for phase logic).
  const matchRows = await prisma.fifaMatch.findMany({
    select: { status: true, round: true, kickoffAt: true },
  });

  const phase = selectTournamentPhase(matchRows);

  if (phase === "pre-kickoff") {
    // Find the earliest scheduled group kickoff for the real countdown display.
    const earliest = matchRows
      .filter((m) => m.round === null && m.status === "scheduled")
      .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime())[0];
    return {
      phase,
      draft,
      vsField: null,
      earliestGroupKickoff: earliest?.kickoffAt.toISOString() ?? null,
    };
  }

  if (phase === "group") {
    // Load the full vs-the-field snapshot: standings, current-period scores, starters, matches.
    // READ-ONLY — no scoring/engine touch. The same data /vsfield shows.
    const vsField = await loadVsField(sessionManagerId);
    return { phase, draft, vsField, earliestGroupKickoff: null };
  }

  // playoff or complete: minimal honest interim — Guillotine + recap are deferred (later prompts).
  // STOP(P38): Do NOT build playoff bracket, Guillotine, or tournament-complete recap here.
  return { phase, draft, vsField: null, earliestGroupKickoff: null };
}
