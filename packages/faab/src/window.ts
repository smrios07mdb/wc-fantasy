/**
 * The acquisition-window phase for a scoring period (DECISIONS.md → Theme D "per-matchday acquisition
 * window" amendment). PURE: `now` + the period's two timestamps are passed in, no Prisma/Supabase/clock.
 *
 * Shared by the worker (Prompt 47 cadence) and the web $0-free-agency route (Prompt 48): a period moves
 * sealed-bid → free-agency → locked, and the FA grant is accepted ONLY in the free-agency phase.
 * (`apps/web` cannot import `apps/worker`, so this lives in the shared FAAB package.)
 */

/** The three acquisition phases of a scoring period. */
export type AcquisitionWindow = "sealed-bid" | "free-agency" | "locked";

/** The slice of a period the window predicate needs (the IO layer resolves these). */
export interface PeriodWindowView {
  /** When the period's blind-bid batch cleared (the FA window opens here); null = not yet cleared. */
  batchClearedAt: Date | null;
  /** The period's first kickoff (MIN fixture kickoff); the hard league-wide lock. Null = no fixtures. */
  firstKickoffAt: Date | null;
}

/**
 * The acquisition window state at `now`:
 *  - "sealed-bid"  — before the batch clears: sealed bids accepted (cleared at this period's batch);
 *  - "free-agency" — after the batch cleared, before first kickoff: $0 first-come grants (Prompt 48);
 *  - "locked"      — at/after the period's first kickoff: waivers + FA both closed, roster frozen.
 *
 * The bid-submission hard cutoff (`validateBidSubmission` `acquisitionCutoffAt`) is exactly the
 * "locked" boundary (`now >= firstKickoffAt`); the $0 FA grant gates on the "free-agency" phase.
 */
export function acquisitionWindowState(p: PeriodWindowView, now: Date): AcquisitionWindow {
  if (p.firstKickoffAt !== null && now.getTime() >= p.firstKickoffAt.getTime()) return "locked";
  if (p.batchClearedAt !== null) return "free-agency";
  return "sealed-bid";
}
