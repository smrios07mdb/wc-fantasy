/**
 * In-memory {@link FaabCadenceStore} double for the dispatcher tests — models just the period rows +
 * the `batch_cleared_at` latch, with an idempotent stamp (mirrors the Prisma adapter's guarded write)
 * and a read helper for assertions. NOT used in production (the Prisma adapter is `prismaStore.ts`).
 */
import type { FaabCadenceStore } from "./store";
import type { PeriodCadenceView } from "./selectors";

export class MemoryFaabCadenceStore implements FaabCadenceStore {
  private readonly periods: PeriodCadenceView[];

  constructor(periods: PeriodCadenceView[]) {
    this.periods = periods.map((p) => ({ ...p }));
  }

  async loadPeriodsForCadence(): Promise<PeriodCadenceView[]> {
    return this.periods.map((p) => ({ ...p }));
  }

  async stampBatchCleared(periodId: string, at: Date): Promise<void> {
    const p = this.periods.find((x) => x.id === periodId);
    if (p && p.batchClearedAt === null) p.batchClearedAt = at; // idempotent latch
  }

  /** The stamped latch for a period (for assertions). */
  latchOf(periodId: string): Date | null {
    return this.periods.find((p) => p.id === periodId)?.batchClearedAt ?? null;
  }
}
