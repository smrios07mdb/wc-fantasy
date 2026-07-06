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

/** The dirty-backlog gauge's shape (HARD-1 F-A03) — one number per dirty source the sweep drains. */
export interface DirtyBacklog {
  /** `stat_player_match.dirty = true` rows (raw feed stat lines awaiting Phase-1 rescore). */
  statDirty: number;
  /** `rating_player_match.dirty = true` rows. */
  ratingDirty: number;
  /** `manual_stat_player_match.dirty = true` rows (commissioner feed-gap entries). */
  manualDirty: number;
  /** Unprocessed `recompute_dirty` markers (manager_period + standing scopes, Phase 2/3). */
  markersPending: number;
}

/**
 * Read-only dirty-backlog gauge (HARD-1 F-A03): counts what is still queued for the NEXT sweep —
 * re-dirtied poison rows plus writes that landed after the sweep's atomic claim. Sampled once per
 * tick right after the sweep and logged at info, so "is recompute keeping up?" is answerable from
 * prod logs: a count that grows tick over tick means it is not. Pure SELECTs against the same
 * dirty indexes the sweep uses — this NEVER claims, clears, or re-dirties anything (the sweep math
 * in @app/recompute is byte-untouched).
 */
export async function countDirtyBacklog(): Promise<DirtyBacklog> {
  const [statDirty, ratingDirty, manualDirty, markersPending] = await Promise.all([
    prisma.statPlayerMatch.count({ where: { dirty: true } }),
    prisma.ratingPlayerMatch.count({ where: { dirty: true } }),
    prisma.manualStatPlayerMatch.count({ where: { dirty: true } }),
    prisma.recomputeDirty.count({ where: { processedAt: null } }),
  ]);
  return { statDirty, ratingDirty, manualDirty, markersPending };
}
