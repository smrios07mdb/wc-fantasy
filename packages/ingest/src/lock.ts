/**
 * PURE lock-on-play derivation (Theme B / DECISIONS Data-source Amendment 1). Decides which player
 * BDL-ids lock and at what UTC instant, given the kickoff. No IO. `locked_at` governs swap-editability
 * ONLY — it never enters scoring. Starters lock at kickoff (any official-XI appearance); subs lock at
 * their effective entry minute; players who never appear are simply absent (caller leaves locked_at null).
 *
 * TEMPORAL INVARIANT (the `now` gate): a candidate lock is NEVER emitted before its instant has arrived —
 * a starter only once `now >= kickoff`, a sub only once `now >= entry`. The kickoff and `now` are both
 * passed in, so this module never reads the wall clock — it stays deterministic. The only Date it
 * constructs is a fixed offset derived FROM the injected kickoff.
 *
 * WHAT THE `now` GATE DOES NOT DO (corrected after the 2026-06-12 recurrence — DECISIONS lock-on-play):
 * it is ONLY a temporal boundary. It does NOT verify that a candidate belongs to the right match or is a
 * participant. The 2026-06-12 incident proved this: foreign-fixture substitution events (other matches'
 * subs whose `player_in` is a pooled player) carry instants that are LEGITIMATELY past for the live match,
 * so the `now` gate passes them and they stamp strangers' slots. IDENTITY/SCOPING — "does this slot's
 * player actually play in the source match, and is that match in-play-or-later" — is a SEPARATE, categorical
 * check enforced at the single write boundary {@link isLockWriteAuthorized} (called only from the store's
 * `lockSlot`). These pure helpers only PROPOSE (player, instant) pairs; `lockSlot` decides whether to write.
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

/**
 * Coverage reconciliation (the lock-on-play under-stamping fix): given the AUTHORITATIVE set of player
 * BDL-ids who actually appeared in the match (the `score_player_match` participant set — team-in-match
 * AND a real stat/event/shot signal), every one locks at kickoff. The two transient feed paths above —
 * the one-shot pre_match XI-pull and per-event live sub-locking — silently miss appearances the 60s
 * poller never observed (a late/missed XI confirmation, a sub event between polls), leaving a played
 * player's slots `locked_at = NULL` forever. This reconciles against who-actually-played instead, so any
 * appeared player still gets stamped. Same write-boundary invariant: NOTHING is emitted before kickoff
 * (`now >= kickoff`). Stamping at kickoff (not the precise entry minute) is intentionally conservative —
 * the store's monotonic `locked_at IS NULL` latch means a sub already locked at his real entry instant is
 * never overwritten, so this only FILLS gaps. Mirrors the period-scoped one-off SQL repair exactly.
 */
export function lockInstantsFromAppearances(
  appearedPlayerBdlIds: readonly number[],
  kickoffAt: Date,
  now: Date,
): PlayerLock[] {
  if (now.getTime() < kickoffAt.getTime()) return []; // not kicked off → never stamp (the invariant)
  return appearedPlayerBdlIds.map((playerBdlId) => ({ playerBdlId, lockedAt: kickoffAt }));
}

/** Why a lock write was refused — logged at `lockSlot` so the NEXT incident is diagnosable in minutes. */
export type LockDenyReason =
  | "no-period" // the source match has no period_id → cannot scope the slot
  | "before-instant" // the lock instant has not arrived yet (now-gate; defence vs a corrupt caller)
  | "match-not-in-play" // the source match is not in_progress/completed → it cannot authorise any stamp
  | "player-not-in-match"; // the player's team is neither side of the source match → NON-participant

/**
 * Facts the write boundary needs to authorise a single `locked_at` stamp. Ids are compared by equality
 * only, so they may be internal UUIDs (Prisma store) or BDL ids (memory store) — the gate is id-space
 * agnostic, it never interprets them.
 */
export interface LockWriteFacts {
  /** `period_id` of the SOURCE match (the fixture the lock derives from). Null ⇒ unscopable ⇒ deny. */
  periodId: string | null;
  /** `status` of the SOURCE match. Only an in-play-or-later match may authorise a stamp. */
  matchStatus: string | null;
  /** The SOURCE match's two team ids (same id-space as `playerTeamId`). */
  homeTeamId: string | number | null;
  awayTeamId: string | number | null;
  /** The candidate player's team id. Must equal one side of the source match (team-membership proof). */
  playerTeamId: string | number | null;
  /** The candidate lock instant and the tick's wall clock (the now-gate). */
  lockedAtMs: number;
  nowMs: number;
}

export type LockAuthz = { ok: true } | { ok: false; reason: LockDenyReason };

/** A match may authorise a lock only once it is in-play-or-later — never while `scheduled`/postponed/abandoned. */
const MATCH_IN_PLAY_OR_LATER: ReadonlySet<string> = new Set(["in_progress", "completed"]);

/**
 * THE lock-write invariant (DECISIONS lock-on-play; the categorical kill for the 2026-06-12 wrong-match /
 * non-participant leak class). A `locked_at` stamp is authorised IFF ALL hold for the SOURCE match the lock
 * derives from:
 *   1. the match has a period to scope the slot to,
 *   2. the lock instant has arrived (`lockedAt <= now`) — the temporal now-gate, re-checked here so the
 *      boundary never trusts the caller,
 *   3. the match is in-play-or-later (`in_progress`/`completed`) — a `scheduled` match can NEVER authorise
 *      a stamp, which blocks the entire defect class regardless of any future feed/mapping bug, and
 *   4. the player's team is one side of the match (team-membership = participant proof) — a player whose
 *      fixture in this period is a DIFFERENT match can never be stamped by this one.
 * Pure: the caller supplies the facts; this never reads the clock or the DB.
 */
export function isLockWriteAuthorized(f: LockWriteFacts): LockAuthz {
  if (f.periodId == null) return { ok: false, reason: "no-period" };
  if (f.lockedAtMs > f.nowMs) return { ok: false, reason: "before-instant" };
  if (f.matchStatus == null || !MATCH_IN_PLAY_OR_LATER.has(f.matchStatus)) {
    return { ok: false, reason: "match-not-in-play" };
  }
  if (
    f.playerTeamId == null ||
    (f.playerTeamId !== f.homeTeamId && f.playerTeamId !== f.awayTeamId)
  ) {
    return { ok: false, reason: "player-not-in-match" };
  }
  return { ok: true };
}
