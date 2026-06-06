/**
 * Pure lineup-legality — the correctness-critical core of the set-lineup flow (DECISIONS.md → Theme B,
 * incl. the lock-on-play amendment). `validateLineup` decides whether a proposed starting XI is legal
 * for a manager's squad in a given period, RIGHT NOW. It is a pure function: the authoritative lock
 * state and the clock are INJECTED — no DB, no Supabase, no `process.env`, no wall-clock — so it is
 * exhaustively unit-testable and can be reused unchanged on the server (the write path) and the client
 * (live "save disabled + why" feedback).
 *
 * It encodes exactly three things, in this order of precedence:
 *   1. the edit window (a closed/expired period takes no edits);
 *   2. ownership + XI size (11 distinct squad players);
 *   3. lock-respect (a played player is frozen in his role) and the Theme B formation bounds.
 *
 * The bounds come from `@app/shared` (FORMATION_BOUNDS / STARTING_XI_SIZE) — the single source of truth,
 * never re-derived here.
 */
import {
  FORMATION_BOUNDS,
  STARTING_XI_SIZE,
  POSITIONS,
  type Position,
  type PeriodStatus,
} from "@app/shared";
import {
  type LineupError,
  illegalFormation,
  incompleteXi,
  notYourPlayer,
  lockedPlayerMoved,
  wrongPeriod,
} from "./errors";

/** A squad member the manager actively owns (active roster_player), with his fixed playing position. */
export interface SquadPlayer {
  playerId: string;
  position: Position;
}

/** A player whose `lineup_slot.locked_at` is set: he has played and is frozen in `isStarter`'s role. */
export interface LockedSlot {
  playerId: string;
  isStarter: boolean;
}

/** The minimal period shape the validator needs: is this window still open for edits at `now`? */
export interface PeriodWindow {
  id: string;
  status: PeriodStatus;
  closesAt: Date | null;
}

export type LineupValidation = { ok: true } | { ok: false; error: LineupError };

const fail = (error: LineupError): LineupValidation => ({ ok: false, error });

/**
 * Validate a proposed starting XI for `squad` in `period` at `now`.
 *
 * @param squad       the manager's active 15-man squad (each player with his position)
 * @param proposedXI  the player ids chosen to START (the other squad players are the bench)
 * @param lockState   the squad players already locked by play, with the role they're frozen in
 * @param period      the target period's editability window
 * @param now         the injected clock (UTC); never read from `Date.now()`
 */
export function validateLineup(
  squad: readonly SquadPlayer[],
  proposedXI: readonly string[],
  lockState: readonly LockedSlot[],
  period: PeriodWindow,
  now: Date,
): LineupValidation {
  // (1) Edit window — a closed wave, or a window whose clock has passed, accepts no edits at all.
  if (period.status === "closed") return fail(wrongPeriod("closed", period.status));
  if (period.closesAt !== null && now.getTime() >= period.closesAt.getTime()) {
    return fail(wrongPeriod("window-closed", period.status));
  }

  const positionOf = new Map(squad.map((p) => [p.playerId, p.position]));
  const starters = new Set(proposedXI);

  // (2) Ownership — every proposed starter must be a player the manager actually owns.
  for (const id of proposedXI) {
    if (!positionOf.has(id)) return fail(notYourPlayer(id));
  }

  // (3) XI size — exactly 11 DISTINCT starters (a duplicate id collapses the set below 11).
  if (starters.size !== STARTING_XI_SIZE) {
    return fail(incompleteXi(starters.size, STARTING_XI_SIZE));
  }

  // (4) Lock-on-play — a played player is frozen in his role; he can't be moved into or out of the XI.
  for (const lock of lockState) {
    if (starters.has(lock.playerId) !== lock.isStarter) {
      return fail(lockedPlayerMoved(lock.playerId, lock.isStarter ? "starter" : "bench"));
    }
  }

  // (5) Formation bounds — per-position counts among the starters (Theme B → FORMATION_BOUNDS).
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of proposedXI) counts[positionOf.get(id)!] += 1;
  for (const position of POSITIONS) {
    const bound = FORMATION_BOUNDS[position];
    const n = counts[position];
    if (n < bound.min || n > bound.max) return fail(illegalFormation(position, n, bound));
  }

  return { ok: true };
}
