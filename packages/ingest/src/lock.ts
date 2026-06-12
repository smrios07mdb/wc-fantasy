/**
 * PURE lock-on-play derivation (Theme B / DECISIONS Data-source Amendment 1). Decides which player
 * BDL-ids lock and at what UTC instant, given the kickoff. No IO. `locked_at` governs swap-editability
 * ONLY — it never enters scoring. Starters lock at kickoff (any official-XI appearance); subs lock at
 * their effective entry minute; players who never appear are simply absent (caller leaves locked_at null).
 *
 * INVARIANT (write boundary): a lock is NEVER emitted before its instant has arrived — a starter only
 * locks once `now >= kickoff`, a sub only once `now >= entry`. This makes the lock write self-guarding:
 * even if an upstream gate mis-fires (a corrupt kickoff, an early mode decision), a not-yet-kicked-off
 * match can never stamp `locked_at`. The 2026-06-11 MD1 incident — starters stamped at ~now while their
 * fixtures were days out — is exactly what this `now` gate prevents going forward.
 *
 * The kickoff and `now` are both passed in, so this module never reads the wall clock — it stays
 * deterministic. The only Date it constructs is a fixed offset derived FROM the injected kickoff.
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

/**
 * Every official-XI starter locks at kickoff (played from minute 1) — but ONLY once `now >= kickoff`.
 * Before kickoff the match cannot have locked anyone, so nothing is stamped (the invariant above).
 */
export function lockInstantsFromLineup(
  entries: readonly LineupAppearance[],
  kickoffAt: Date,
  now: Date,
): PlayerLock[] {
  if (now.getTime() < kickoffAt.getTime()) return []; // not kicked off → never stamp a starter
  return entries
    .filter((e) => e.isStarter)
    .map((e) => ({ playerBdlId: e.playerBdlId, lockedAt: kickoffAt }));
}

export interface SubEvent {
  playerInBdlId: number | null;
  timeMinute: number | null;
  addedTime: number | null;
}

/**
 * A substitute locks at kickoff + (time_minute + added_time) minutes — but ONLY once that entry instant
 * has actually arrived (`now >= entry`). Null if no player came on, or if the entry is still in the
 * future (we never stamp a lock instant ahead of `now`; the invariant above).
 */
export function lockInstantFromSub(sub: SubEvent, kickoffAt: Date, now: Date): PlayerLock | null {
  if (sub.playerInBdlId == null) return null;
  const minutes = (sub.timeMinute ?? 0) + (sub.addedTime ?? 0);
  const lockedAt = new Date(kickoffAt.getTime() + minutes * 60_000);
  if (now.getTime() < lockedAt.getTime()) return null; // entry not yet reached → not locked
  return { playerBdlId: sub.playerInBdlId, lockedAt };
}
