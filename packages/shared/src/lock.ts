/**
 * PURE lock-on-play READ predicate (DECISIONS Theme B). The write side stamps `lineup_slot.locked_at`
 * with the instant a player's match actually locks him (a starter at kickoff, a sub at his entry minute).
 * A reader must therefore treat a slot as locked ONLY once that instant has ARRIVED — never on presence
 * alone. A `locked_at` that is null, or still in the future relative to `now`, is movable.
 *
 * Both read sites (the /lineup editor and the /vsfield live view) derive "locked" through this one
 * function so they can never drift back to a presence-only check.
 */
export function isLockedNow(lockedAt: Date | null | undefined, now: Date): boolean {
  return lockedAt != null && lockedAt.getTime() <= now.getTime();
}
