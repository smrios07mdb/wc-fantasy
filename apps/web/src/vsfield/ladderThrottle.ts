/**
 * The Cut ladder re-sort throttle (T15-CUT, spec §3): while the knockout ladder is on screen, live
 * point swings may re-order rows at most ONCE per 10s window — no mid-read rug-pulls — while every
 * row's DATA (points, zone tag) stays live-fresh in place. The YOU band margin is computed straight
 * from the latest snapshot and NEVER passes through this throttle.
 *
 * Pure decision function (clock injected) — the client hook feeds it the authoritative order from
 * `ko.ladder` on every snapshot and renders `order`. Membership changes (a round rollover swaps the
 * entrant set) adopt IMMEDIATELY: holding a stale roster crosses rounds, which is worse than a jump.
 */
export const LADDER_RESORT_MS = 10_000;

export interface LadderOrderState {
  order: readonly string[];
  /** When `order` was last adopted (ms epoch of the injected clock). */
  adoptedAt: number;
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function nextLadderOrder(
  prev: LadderOrderState | null,
  incoming: readonly string[],
  now: number,
): LadderOrderState {
  if (prev === null) return { order: incoming, adoptedAt: now };
  if (sameOrder(prev.order, incoming)) return prev;
  // Round rollover / entrant-set change → adopt immediately (never render a stale roster).
  if (!sameMembers(prev.order, incoming)) return { order: incoming, adoptedAt: now };
  // Same members, new order → adopt only once the 10s window has elapsed.
  if (now - prev.adoptedAt >= LADDER_RESORT_MS) return { order: incoming, adoptedAt: now };
  return prev;
}
