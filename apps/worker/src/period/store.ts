/**
 * The worker-local PERIOD STATUS-LIFECYCLE store port (P1a — the dual-writer redundancy;
 * DECISIONS.md "dual-writer status-advance"). It carries exactly the two IO operations the
 * resident-tick driver needs to mirror the `wc-fantasy-period-close` cron's status block
 * (apps/worker/src/jobs/periodClose.ts:114-136): the unfiltered lifecycle read and the guarded apply.
 *
 * Kept as a port (not raw Prisma) so the dispatcher is unit-testable against the in-memory double —
 * the same arrangement as the FAAB cadence store ({@link ../faab/store}) and the notify trigger store.
 *
 * The DECISION (pending → open → closed) stays in the UNCHANGED pure `@app/recompute`
 * `selectPeriodStatusTransitions`; this store only carries the reads/writes the recompute package
 * shouldn't own. Freeze (`frozen_at`) is deliberately NOT here — it stays cron-only (its plain
 * `update` relies on the `frozenAt: null` query filter, not a WHERE-guard, so it is out of scope).
 */
import type { TransitionFixture, TransitionPeriod, PeriodStatusTransitions } from "@app/recompute";

/**
 * One period plus its fixtures — the pure selector's input, in a single row. The selector reads
 * `{ id, label, status, frozenAt }` (it keys close on "every fixture completed" and open on canonical
 * label order); the fixtures ride along so the dispatcher can build its `fixturesByPeriod` map.
 */
export type LifecyclePeriod = TransitionPeriod & { matches: TransitionFixture[] };

export interface PeriodStatusStore {
  /**
   * ALL periods of the (single) live league with their fixtures — NOT frozen-scoped. The cron's freeze
   * query is `frozenAt: null`-scoped, which would hide the already-closed waves the earliest-current
   * pick needs, so this is a separate, unfiltered read (mirrors periodClose.ts:100-109).
   */
  loadLifecyclePeriods(): Promise<LifecyclePeriod[]>;
  /**
   * Apply the close/open transitions through the SAME guarded `updateMany` shape as the cron: each write
   * WHERE-matches the expected PRIOR status (close → `status != "closed"`, open → `status = "pending"`),
   * so a near-simultaneous cron run is a clean no-op for whichever writer loses the race. Atomic.
   */
  applyStatusTransitions(transitions: PeriodStatusTransitions): Promise<void>;
}
