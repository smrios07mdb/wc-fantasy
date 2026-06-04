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
 * SEAM — the `ranking` (the "default ranking" for best-available) is an INJECTED input. The brain
 * files name "best-available by default ranking" but define no source, and no `player.default_rank`
 * column exists. The controller obtains it from the store; the real source is pinned with a
 * `// TODO(confirm):` in the Prisma store (`getDefaultRanking`). Do NOT invent a ranking here.
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

  // 2. Best-available by the injected default ranking.
  // TODO(confirm): the real default-ranking SOURCE (injected for now; no player.default_rank exists).
  const fromRanking = input.ranking.find(eligible);
  return fromRanking ? fromRanking.playerId : null;
}
