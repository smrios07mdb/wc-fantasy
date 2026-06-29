/**
 * The resident-tick PERIOD STATUS-ADVANCE driver (P1a — the dual-writer redundancy; DECISIONS.md
 * "dual-writer status-advance"). Called each worker tick: re-run the UNCHANGED pure `@app/recompute`
 * `selectPeriodStatusTransitions` over the league's periods+fixtures, and apply the result through the
 * SAME guarded `updateMany` shape as the hourly `wc-fantasy-period-close` cron
 * (apps/worker/src/jobs/periodClose.ts:114-136).
 *
 * This is a SECOND writer, not a move — the cron stays the primary. The guarded apply WHERE-matches the
 * expected prior status, so cron + tick running near-simultaneously is a clean no-op for whichever loses
 * the race (the `dispatchFaabBatches` idempotent-claim pattern). Steady state emits empty arrays and
 * skips the transaction entirely. It removes the silent status-open SPOF: a stalled cron no longer skips
 * a round's `pending → open` (FA-window) mount, because the 60s tick re-emits the same transition.
 *
 * NON-FIX (by design): the anomaly path is untouched — a stuck-`open` anomalous wave blocks the next
 * wave's open INSIDE the pure selector regardless of caller (periodStatus.ts:85-96), so this redundancy
 * does not, and is not meant to, bypass it. Freeze stays cron-only (out of scope; see {@link ./store}).
 */
import { selectPeriodStatusTransitions, type PeriodStatusTransitions } from "@app/recompute";
import type { PeriodStatusStore } from "./store";

export async function dispatchPeriodStatusAdvance(
  store: PeriodStatusStore,
): Promise<PeriodStatusTransitions> {
  const periods = await store.loadLifecyclePeriods();
  const fixturesByPeriod = Object.fromEntries(periods.map((p) => [p.id, p.matches]));

  const { toClose, toOpen } = selectPeriodStatusTransitions(periods, fixturesByPeriod);

  // Skip the transaction when there is nothing to do (steady-state no-op), mirroring the cron's
  // `if (toClose.length > 0 || toOpen.length > 0)` guard so a quiet tick never opens a write.
  if (toClose.length > 0 || toOpen.length > 0) {
    await store.applyStatusTransitions({ toClose, toOpen });
  }

  return { toClose, toOpen };
}
