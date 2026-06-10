/**
 * Server-side data loader for the dashboard home — thin IO edge that assembles the phase-aware
 * `DashboardData` the home page hydrates. Reuses `loadDraftRoom` DIRECTLY (no second source, no
 * re-derivation of draft state — the exact same shape that /draft reads). The phase is resolved
 * by the pure `selectDashboardPhase` selector so this file's only job is IO + assembly.
 *
 * Like the other loaders (loadDraftRoom / loadVsField) this edge has no unit test (it needs a
 * live DB); `tsc` + the pure-selector suite cover the shapes it produces.
 */
import { loadDraftRoom } from "../draft/loadDraftRoom";
import {
  selectDashboardPhase,
  type DashboardPhase,
} from "../../src/dashboard/selectDashboardPhase";
import type { DraftRoomState } from "../../src/draft/types";

export interface DashboardData {
  /** The resolved display phase for this render. */
  phase: DashboardPhase;
  /**
   * The authoritative draft snapshot. Null only when no draft record exists yet (edge case:
   * league provisioned but no draft row written). Pre-draft shows "waiting for commissioner".
   */
  draft: DraftRoomState | null;
}

/**
 * Load the dashboard snapshot for the session manager. Reuses `loadDraftRoom` so the dashboard
 * reads the SAME authoritative data as /draft — no parallel reads, no stale divergence.
 */
export async function loadDashboard(sessionManagerId: string): Promise<DashboardData> {
  const draft = await loadDraftRoom(sessionManagerId);
  if (!draft) {
    // No draft row: treat as pre-draft (the draft hasn't been configured yet).
    return { phase: "pre-draft", draft: null };
  }
  const phase = selectDashboardPhase(draft.status);
  return { phase, draft };
}
