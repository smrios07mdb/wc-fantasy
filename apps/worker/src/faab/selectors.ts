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

// The acquisition-window predicate AND the effective-batch-deadline math both live in the shared FAAB
// package so the web waivers screen can reuse them (apps/web cannot import apps/worker — Prompts 48/49).
// Re-exported here so this module's surface (`PeriodCadenceView`, `effectiveBatchAt`) is unchanged.
import { acquisitionWindowState, effectiveBatchAt } from "@app/faab";
import type { AcquisitionWindow, PeriodCadenceView } from "@app/faab";
export { acquisitionWindowState, effectiveBatchAt };
export type { AcquisitionWindow, PeriodCadenceView };

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
