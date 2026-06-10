/**
 * Pure dashboard-phase selector (mirrors `selectLandingView` / `selectActiveNav`): maps the
 * authoritative `DraftStatus` from the DB to the dashboard's render phase. IO-free, unit-tested.
 *
 * For Prompt 37 (foundation + pre-draft + draft) the three outcomes are:
 *   pre-draft — draft.status "pending": the draft is configured but not yet started.
 *   draft     — "active" or "paused": draft in progress.
 *   post-draft — "complete": draft done; group/playoff/complete are next prompts.
 *
 * Exhaustiveness guard: adding a new DraftStatus value becomes a TypeScript compile error here
 * until the new phase is handled, so the dashboard can never silently fall through.
 */
import type { DraftStatus } from "@app/shared";

export type DashboardPhase = "pre-draft" | "draft" | "post-draft";

export function selectDashboardPhase(status: DraftStatus): DashboardPhase {
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
