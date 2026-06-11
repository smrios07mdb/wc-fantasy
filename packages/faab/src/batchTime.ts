/**
 * The per-period FAAB batch DEADLINE (DECISIONS.md → Theme D "per-matchday acquisition window"). PURE:
 * the period's two timestamps + the lead are passed in, no Prisma/Supabase/clock.
 *
 * This was extracted FROM the worker (`apps/worker/src/faab/selectors.ts`) INTO the shared FAAB package
 * so the web waivers screen can render the EXACT instant the worker fires its batch — `apps/web` cannot
 * import `apps/worker`, the same boundary that moved {@link ./window.ts | acquisitionWindowState} here.
 * The worker re-exports these for back-compat; `selectPeriodsToClear` (the worker's cadence trigger)
 * still lives there and consumes `effectiveBatchAt` from here.
 */

/**
 * How far BEFORE a period's first kickoff its blind-bid FAAB batch clears, when the commissioner has not
 * set `period.waiver_batch_at`. The retired daily model cleared ~06:00 league-local before a ~12:00 WC
 * first kickoff ≈ 6h, so 360 min reproduces that pre-kickoff instant. Both the worker config default and
 * the web loader anchor to THIS constant so the displayed time can never drift from the fired time.
 */
export const DEFAULT_FAAB_BATCH_LEAD_MIN = 360;

/** The slice of a period the cadence logic needs (the IO loader resolves these from `period` + fixtures). */
export interface PeriodCadenceView {
  id: string;
  leagueId: string;
  /** The idempotency latch: set when this period's FAAB batch has run. Null = not yet cleared. */
  batchClearedAt: Date | null;
  /** Commissioner override of the batch deadline (per period); null = use the computed default below. */
  waiverBatchAt: Date | null;
  /** The period's first kickoff = MIN(kickoff) among its fixtures; null if the period has no fixtures. */
  firstKickoffAt: Date | null;
}

/**
 * The effective batch deadline for a period: the commissioner's `waiverBatchAt` if set, else the
 * computed default `firstKickoff − lead`. Null when the period has no fixtures yet (no kickoff to
 * anchor to) and no explicit override. The default always precedes the first kickoff for `lead > 0`,
 * honoring the amendment's "must sit before the period's first kickoff."
 */
export function effectiveBatchAt(p: PeriodCadenceView, leadMs: number): Date | null {
  if (p.waiverBatchAt !== null) return p.waiverBatchAt;
  if (p.firstKickoffAt !== null) return new Date(p.firstKickoffAt.getTime() - leadMs);
  return null;
}
