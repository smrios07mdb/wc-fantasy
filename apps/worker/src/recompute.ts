/**
 * Worker seam for the recompute sweeper. A real schedule (cron / tick cadence) is a later prompt;
 * this is just the function the worker can call to drain the dirty markers and walk the chain
 * `(match,player) → (manager,period) → standing` (ARCHITECTURE.md §3). No polling is wired here.
 */
import { prisma } from "@app/db";
import { sweep, type RecomputeOptions, type SweepResult } from "@app/recompute";
import { createPrismaStore } from "@app/recompute/prisma";
import { log } from "./logger";

const store = createPrismaStore(prisma);

/**
 * Run one recompute sweep against the live database. Pass `{ allowFrozen: true }` for a commissioner
 * override. A Phase-1 recompute that throws is isolated by `sweep` (the key is re-dirtied for retry); we
 * wire the default `onPlayerMatchError` to the structured logger so a poison row is VISIBLE — it re-fires
 * every tick (see `SweepResult.playerMatchFailures`) until fixed — rather than failing silently.
 */
export function runRecomputeSweep(opts?: RecomputeOptions): Promise<SweepResult> {
  return sweep(store, {
    ...opts,
    onPlayerMatchError:
      opts?.onPlayerMatchError ??
      ((ref, error) =>
        log.error("recompute.player_match.failed", {
          matchId: ref.matchId,
          playerId: ref.playerId,
          message: (error as Error)?.message ?? String(error),
        })),
  });
}
