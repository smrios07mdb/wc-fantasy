/**
 * Pure per-period FAAB cadence logic (DECISIONS.md → Theme D, the "per-matchday acquisition window"
 * amendment). IO-free: every input — the period rows, `now`, and the batch lead — is injected, so the
 * scheduling decision is unit-testable with literals and carries no Prisma/Supabase/clock.
 *
 * This REPLACES the retired daily 06:00 cron cadence. There is one blind-bid batch per scoring period
 * (each group matchday, each knockout round); the batch must clear BEFORE the period's first kickoff.
 * The clearing algorithm itself (`@app/faab` `resolveFaabBatch`) is unchanged — only WHEN it runs.
 *
 * Idempotency lives here, not in a flag: a period drops out of `selectPeriodsToClear` the instant its
 * `batchClearedAt` latch is stamped, so the 60s worker tick can fire repeatedly and the batch runs once.
 */

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

// The acquisition-window predicate moved to the shared FAAB package (Prompt 48) so the web $0-FA route
// can reuse it (apps/web cannot import apps/worker). Re-exported here for back-compat with Prompt 47.
export { acquisitionWindowState, type AcquisitionWindow } from "@app/faab";

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

/**
 * The period IDs whose FAAB batch is due NOW: not yet cleared, has a resolvable deadline, and that
 * deadline has passed. The tick runs `resolveFaabBatch` once per returned period and stamps its latch.
 *
 * A batch may legitimately run AFTER the first kickoff (e.g. the worker was down through the deadline):
 * the period still appears here until its latch is stamped, and the resolver's per-player void-refund
 * branch defends any add target whose match already started. So clearing is never silently skipped.
 */
export function selectPeriodsToClear(
  periods: readonly PeriodCadenceView[],
  now: Date,
  leadMs: number,
): string[] {
  const due: string[] = [];
  for (const p of periods) {
    if (p.batchClearedAt !== null) continue; // already cleared — the idempotent latch
    const deadline = effectiveBatchAt(p, leadMs);
    if (deadline === null) continue; // no fixtures / no deadline yet
    if (deadline.getTime() <= now.getTime()) due.push(p.id);
  }
  return due;
}
