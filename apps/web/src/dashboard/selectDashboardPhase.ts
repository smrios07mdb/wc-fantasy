/**
 * Pure dashboard-phase selector (mirrors `selectLandingView` / `selectActiveNav`): maps the
 * authoritative `DraftStatus` from the DB to the draft-level phase. IO-free, unit-tested.
 *
 * Returns:
 *   pre-draft  — draft.status "pending": the draft is configured but not yet started.
 *   draft      — "active" or "paused": draft in progress.
 *   post-draft — "complete": draft done; the LOADER refines this to a tournament phase
 *                (pre-kickoff | group | playoff | complete) via selectTournamentPhase.
 *
 * The exported `DashboardPhase` is the FULL render-phase union (includes tournament phases added
 * in Prompt 38). "post-draft" is an internal loader intermediate — NOT a render phase.
 *
 * Exhaustiveness guard: adding a new DraftStatus value becomes a TypeScript compile error here
 * until the new phase is handled, so the dashboard can never silently fall through.
 */
import type { DraftStatus } from "@app/shared";

/**
 * All render phases for the dashboard home — the complete union after draft + tournament phase
 * composition (Prompt 37: pre-draft/draft; Prompt 38: pre-kickoff/group/playoff/complete).
 * "post-draft" is a loader-internal intermediate only; it never appears in rendered output.
 */
export type DashboardPhase =
  | "pre-draft" // draft pending — show league info + manager readiness
  | "draft" // draft active/paused — show forming squad + recent picks
  | "pre-kickoff" // draft done, no group match kicked off yet — show countdown
  | "group" // group-stage matches underway — show standings + field view
  | "playoff" // knockout matches kicked off — minimal interim (Guillotine deferred)
  | "complete"; // Final completed — minimal interim (recap deferred)

/** Internal intermediate returned by selectDashboardPhase when draft is complete. The loader
 * refines this to the appropriate tournament phase via selectTournamentPhase. */
type PostDraft = "post-draft";

export function selectDashboardPhase(status: DraftStatus): "pre-draft" | "draft" | PostDraft {
  switch (status) {
    case "pending":
      return "pre-draft";
    case "active":
    case "paused":
      return "draft";
    case "complete":
      return "post-draft";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
