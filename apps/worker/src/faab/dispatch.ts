/**
 * The per-period FAAB batch driver (DECISIONS.md → Theme D "per-matchday acquisition window"). Called
 * each worker tick: find the periods whose batch deadline has passed and that have not yet cleared,
 * and run the UNCHANGED `@app/faab` `runFaabBatch` once per period — then stamp each period's
 * `batch_cleared_at` latch so a later tick is a clean no-op.
 *
 * `runFaabBatch` clears the WHOLE league's pending bids (the cadence amendment changed only WHEN it
 * runs, never the clearing algorithm). Stamping AFTER the batch is safe either way: if the stamp fails,
 * the next tick re-runs the batch (a no-op — the bids are already terminal) and re-stamps. Each period
 * is isolated so one league's failure never starves the others (the scheduler-tick convention).
 */
import { runFaabBatch, type FaabBatchStore } from "@app/faab";
import { selectPeriodsToClear } from "./selectors";
import type { FaabCadenceStore } from "./store";

export interface DispatchFaabResult {
  /** How many periods were due this tick. */
  due: number;
  /** The periods whose batch ran (with the created batch id, or null when nothing was pending). */
  cleared: { periodId: string; leagueId: string; batchId: string | null }[];
  /** Periods whose batch threw — recorded, not stamped, so the next tick retries them. */
  errors: { periodId: string; message: string }[];
}

export async function dispatchFaabBatches(
  cadenceStore: FaabCadenceStore,
  faabBatchStore: FaabBatchStore,
  now: Date,
  leadMs: number,
): Promise<DispatchFaabResult> {
  const periods = await cadenceStore.loadPeriodsForCadence();
  const dueIds = selectPeriodsToClear(periods, now, leadMs);
  const byId = new Map(periods.map((p) => [p.id, p]));

  const cleared: DispatchFaabResult["cleared"] = [];
  const errors: DispatchFaabResult["errors"] = [];

  for (const periodId of dueIds) {
    const period = byId.get(periodId);
    if (!period) continue;
    try {
      // runFaabBatch claims this period (conditional, IS NULL) atomically with the apply — the once-only
      // entry gate. stampBatchCleared still latches the EMPTY-batch case (no pending bids → no apply →
      // commitBatch isn't reached), and is a harmless no-op once the apply already claimed the period.
      const summary = await runFaabBatch(faabBatchStore, period.leagueId, now, periodId);
      await cadenceStore.stampBatchCleared(periodId, now);
      cleared.push({ periodId, leagueId: period.leagueId, batchId: summary.batchId });
    } catch (err) {
      errors.push({ periodId, message: (err as Error).message });
    }
  }

  return { due: dueIds.length, cleared, errors };
}
