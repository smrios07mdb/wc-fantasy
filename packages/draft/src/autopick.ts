/**
 * Autopick selection — PURE (no clock / IO / env). When a manager's pick timer expires, the
 * controller fills their pick automatically (DECISIONS.md → Theme C):
 *
 *   "highest-ranked still-available player from the manager's pre-set queue,
 *    falling back to best-available by default ranking."
 *
 * Both stages are filtered to players that are (a) still AVAILABLE (not owned in the league) and
 * (b) POSITION-LEGAL (adding them does not exceed the 2/5/5/3 cap). Availability and the manager's
 * current squad counts are passed IN — this function only decides; it never reads the world. The
 * inputs are ORDERED lists consumed as-is (the queue in its stored `draft_queue.position` order, the
 * ranking best-first), so selection is deterministic by construction: first eligible wins, no
 * re-sorting and no tie-break.
 *
 * The `ranking` is an INJECTED input the controller obtains from the store. Its source is
 * `player.default_rank` (1-based, lower = better), populated at provision time; the store builds the
 * list with {@link orderDraftPool} so it spans the WHOLE pool (ranked first, then unranked by id) and
 * autopick is total — it can never stall on an unranked pool. Do NOT invent a ranking here.
 */
import { isPositionLegal, type PositionCounts } from "./roster";
import type { Position } from "@app/shared";

/** One entry of a manager's pre-set autopick queue, enriched with the player's position.
 *  Consumed in stored order (the store reads `draft_queue` ordered by `position` asc). */
export interface QueueEntry {
  playerId: string;
  position: Position;
}

/** A player in the injected default ranking, ordered best-first. */
export interface RankedPlayer {
  playerId: string;
  position: Position;
}

/** A candidate in the raw draft pool, carrying its objective `default_rank` (1-based, lower = better)
 *  or null when unranked. This is the shape {@link orderDraftPool} turns into the ordered ranking. */
export interface PoolPlayer {
  playerId: string;
  position: Position;
  defaultRank: number | null;
}

export interface AutopickInput {
  /** The manager's pre-set queue, in stored priority order (read as-is — no re-sort). */
  queue: readonly QueueEntry[];
  /** The injected best-available default ranking, best-first (SEAM — see file header). */
  ranking: readonly RankedPlayer[];
  /** The manager's current per-position counts (for the legality filter). */
  counts: PositionCounts;
  /** True if `playerId` is still draftable (not actively owned anywhere in the league). */
  isAvailable: (playerId: string) => boolean;
}

/**
 * Choose the autopick for a manager, or `null` if nobody is eligible.
 *
 * 1. Walk the queue in its stored order; return the first available + position-legal player.
 * 2. If the queue yields nobody, walk the injected `ranking` (best-first) the same way.
 * 3. If neither yields an eligible player, return null (the controller decides what a stall means).
 */
export function selectAutopick(input: AutopickInput): string | null {
  const { counts, isAvailable } = input;
  const eligible = (p: { playerId: string; position: Position }): boolean =>
    isAvailable(p.playerId) && isPositionLegal(counts, p.position);

  // 1. The manager's pre-set queue, in stored priority order (the stored order IS the rank).
  const fromQueue = input.queue.find(eligible);
  if (fromQueue) return fromQueue.playerId;

  // 2. Best-available by the injected default ranking. The store builds this list with
  // {@link orderDraftPool}, so it spans the WHOLE pool (ranked players first, then unranked by id) —
  // which makes this fall-through total: whenever any undrafted, position-legal player exists it is in
  // the ranking and is returned here. `null` therefore means a genuinely empty legal pool, never an
  // unranked-pool stall (the original mock-draft pick-1 bug).
  const fromRanking = input.ranking.find(eligible);
  return fromRanking ? fromRanking.playerId : null;
}

/**
 * Order the whole draft candidate pool into the "best-available" ranking the autopick consumes:
 * `default_rank` ascending, NULLS LAST (every unranked player after every ranked one), then `playerId`
 * ascending as the stable final tiebreak. PURE + TOTAL: each input player appears exactly once in the
 * output, so a non-empty pool can never order down to empty. That totality is what makes
 * {@link selectAutopick} unable to stall on an unranked pool — the order encodes the locked preference
 * "queue → default_rank (NULLS LAST) → stable id tiebreak" (DECISIONS.md → Mock-draft open items).
 * Does not mutate its input.
 */
export function orderDraftPool(pool: readonly PoolPlayer[]): RankedPlayer[] {
  return [...pool]
    .sort((a, b) => {
      const ra = a.defaultRank ?? Number.POSITIVE_INFINITY;
      const rb = b.defaultRank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
    })
    .map((p) => ({ playerId: p.playerId, position: p.position }));
}
