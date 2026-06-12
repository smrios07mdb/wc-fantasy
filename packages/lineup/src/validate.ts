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
 *   3. the play-state rules (the forfeit model) and the Theme B formation bounds.
 *
 * The play-state rules replace the old symmetric lock-respect. A player who has played is NO LONGER
 * frozen: he can be benched. But the transitions are directional and one-way:
 *   - a VOIDED (already-forfeited) slot can never start again (one-way door);
 *   - a played player can never be promoted INTO the XI from the bench (no hindsight upside);
 *   - benching a played starter is a FORFEIT — allowed only when the caller confirms it by id
 *     (the destructive-confirm path). The C1 route confirms nothing, so this stays rejected.
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
  playedPlayerStarted,
  voidedPlayerStarted,
  forfeitRequiresConfirm,
  wrongPeriod,
} from "./errors";

/** A squad member the manager actively owns (active roster_player), with his fixed playing position. */
export interface SquadPlayer {
  playerId: string;
  position: Position;
}

/**
 * The authoritative per-slot play state for a squad player in the target period (the forfeit model,
 * DECISIONS Theme B). `hasPlayed` is the SINGLE source of "the player played" — the existence of a
 * `score_player_match` row for (player, his period match) — NOT `locked_at`. `voided` is the one-way
 * forfeit latch (`lineup_slot.voided_at IS NOT NULL`). Only squad players with a play state appear here;
 * an absent player is unplayed + un-voided (freely movable).
 */
export interface SlotState {
  playerId: string;
  /** The player's CURRENT persisted role (`lineup_slot.is_starter`), the direction edits are measured from. */
  isStarter: boolean;
  /** A `score_player_match` row exists for this player in this period — the authoritative "has played". */
  hasPlayed: boolean;
  /** `voided_at IS NOT NULL` — he was benched after playing; the forfeit is final for the period. */
  voided: boolean;
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
 * @param squad             the manager's active 15-man squad (each player with his position)
 * @param proposedXI        the player ids chosen to START (the other squad players are the bench)
 * @param slotStates        the squad players with a play state (played / voided), in their CURRENT role
 * @param period            the target period's editability window
 * @param now               the injected clock (UTC); never read from `Date.now()`
 * @param forfeitConfirmed  player ids the caller has explicitly confirmed forfeiting (benching after play).
 *                          Defaults to empty — the C1 route confirms none, so benching a played starter is
 *                          rejected, preserving the current UI affordance until C2's destructive-confirm UI.
 */
export function validateLineup(
  squad: readonly SquadPlayer[],
  proposedXI: readonly string[],
  slotStates: readonly SlotState[],
  period: PeriodWindow,
  now: Date,
  forfeitConfirmed: ReadonlySet<string> = new Set(),
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

  // (4) Play-state rules (the forfeit model) — directional, one-way. Evaluated per slot against the
  //     proposed XI; an unplayed, un-voided player has no constraint (freely movable).
  for (const s of slotStates) {
    const desiredStarter = starters.has(s.playerId);
    // (4a) One-way door: a voided (already-forfeited) slot can never be returned to the XI.
    if (s.voided && desiredStarter) return fail(voidedPlayerStarted(s.playerId));
    if (!s.hasPlayed) continue; // unplayed → no play-based constraint
    // (4b) Hindsight block: a played player can never be promoted INTO the XI from the bench.
    if (!s.isStarter && desiredStarter) return fail(playedPlayerStarted(s.playerId));
    // (4c) Forfeit: benching a played starter is final + one-way — allowed only with explicit confirm.
    if (s.isStarter && !desiredStarter && !forfeitConfirmed.has(s.playerId)) {
      return fail(forfeitRequiresConfirm(s.playerId));
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
