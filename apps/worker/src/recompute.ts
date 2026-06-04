/**
 * Worker seam for the recompute sweeper. A real schedule (cron / tick cadence) is a later prompt;
 * this is just the function the worker can call to drain the dirty markers and walk the chain
 * `(match,player) → (manager,period) → standing` (ARCHITECTURE.md §3). No polling is wired here.
 */
import { prisma } from "@app/db";
import { sweep, type RecomputeOptions, type SweepResult } from "@app/recompute";
import { createPrismaStore } from "@app/recompute/prisma";

const store = createPrismaStore(prisma);

/** Run one recompute sweep against the live database. Pass `{ allowFrozen: true }` for a commissioner override. */
export function runRecomputeSweep(opts?: RecomputeOptions): Promise<SweepResult> {
  return sweep(store, opts);
}
