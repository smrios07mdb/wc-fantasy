/**
 * The worker-local FAAB CADENCE store port (DECISIONS.md → Theme D "per-matchday acquisition window").
 * The per-period trigger reads the live-league periods + their first kickoff + the cadence latch, and
 * stamps the latch once a period's batch has run. Kept as a port (not raw Prisma) so the dispatcher is
 * unit-testable against the in-memory double — the same arrangement as the notify trigger store.
 *
 * The CLEARING itself is the unchanged `@app/faab` `runFaabBatch` against its own `FaabBatchStore`;
 * this store only carries the SCHEDULING reads/writes the FAAB package shouldn't own.
 */
import type { PeriodCadenceView } from "./selectors";

export interface FaabCadenceStore {
  /** Live-league (group/playoff) periods with their first kickoff + cadence latch fields — exactly the
   *  pure selector's input. */
  loadPeriodsForCadence(): Promise<PeriodCadenceView[]>;
  /** Stamp the period's `batch_cleared_at` latch (= `at`). Idempotent: only sets it when still null. */
  stampBatchCleared(periodId: string, at: Date): Promise<void>;
}
