/**
 * PURE lock-on-play derivation (Theme B / DECISIONS Data-source Amendment 1). Decides which player
 * BDL-ids lock and at what UTC instant, given the kickoff. No IO. `locked_at` governs swap-editability
 * ONLY — it never enters scoring. Starters lock at kickoff (any official-XI appearance); subs lock at
 * their effective entry minute; players who never appear are simply absent (caller leaves locked_at null).
 *
 * Time is passed in as a `Date` (kickoff) so this module is clock-free — no `Date.now`/`new Date()` of
 * the wall clock; the only `new Date(...)` here derives an offset FROM the given kickoff.
 */
export interface LineupAppearance {
  playerBdlId: number;
  /** Whether the player is in the official starting XI (true) — bench appearances lock via subs. */
  isStarter: boolean;
}

export interface PlayerLock {
  playerBdlId: number;
  lockedAt: Date;
}

/** Every official-XI starter locks at kickoff (played from minute 1). */
export function lockInstantsFromLineup(
  entries: readonly LineupAppearance[],
  kickoffAt: Date,
): PlayerLock[] {
  return entries
    .filter((e) => e.isStarter)
    .map((e) => ({ playerBdlId: e.playerBdlId, lockedAt: kickoffAt }));
}

export interface SubEvent {
  playerInBdlId: number | null;
  timeMinute: number | null;
  addedTime: number | null;
}

/** A substitute locks at kickoff + (time_minute + added_time) minutes. Null if no player came on. */
export function lockInstantFromSub(sub: SubEvent, kickoffAt: Date): PlayerLock | null {
  if (sub.playerInBdlId == null) return null;
  const minutes = (sub.timeMinute ?? 0) + (sub.addedTime ?? 0);
  return {
    playerBdlId: sub.playerInBdlId,
    lockedAt: new Date(kickoffAt.getTime() + minutes * 60_000),
  };
}
