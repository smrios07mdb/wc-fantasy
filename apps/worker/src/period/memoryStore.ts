/**
 * In-memory {@link PeriodStatusStore} double for the dispatcher tests — holds the period rows and
 * applies the close/open transitions with the SAME guarded semantics as the Prisma adapter (close only
 * a not-yet-closed row, open only a still-pending row), so the idempotency test is meaningful. Also
 * counts `applyStatusTransitions` invocations so a no-op tick can be asserted to skip the write entirely.
 * NOT used in production (the Prisma adapter is `prismaStore.ts`).
 */
import type { PeriodStatus } from "@app/shared";
import type { PeriodStatusTransitions } from "@app/recompute";
import type { LifecyclePeriod, PeriodStatusStore } from "./store";

export class MemoryPeriodStatusStore implements PeriodStatusStore {
  private readonly periods: LifecyclePeriod[];
  /** How many times `applyStatusTransitions` was invoked — asserts the no-op tick skips the write. */
  applyCalls = 0;

  constructor(periods: LifecyclePeriod[]) {
    this.periods = periods.map((p) => ({ ...p, matches: p.matches.map((m) => ({ ...m })) }));
  }

  async loadLifecyclePeriods(): Promise<LifecyclePeriod[]> {
    return this.periods.map((p) => ({ ...p, matches: p.matches.map((m) => ({ ...m })) }));
  }

  async applyStatusTransitions({ toClose, toOpen }: PeriodStatusTransitions): Promise<void> {
    this.applyCalls += 1;
    for (const id of toClose) {
      const p = this.periods.find((x) => x.id === id);
      if (p && p.status !== "closed") p.status = "closed"; // guarded: WHERE status != "closed"
    }
    for (const id of toOpen) {
      const p = this.periods.find((x) => x.id === id);
      if (p && p.status === "pending") p.status = "open"; // guarded: WHERE status = "pending"
    }
  }

  /** Current status of a period (for assertions). */
  statusOf(periodId: string): PeriodStatus | undefined {
    return this.periods.find((p) => p.id === periodId)?.status;
  }
}
