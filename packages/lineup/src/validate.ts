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
  PLAYOFF_ROSTER,
  POSITIONS,
  type Position,
  type PeriodKind,
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
  playoffRosterCap,
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
  /**
   * The scoring window's kind (ARCHITECTURE.md §4). It selects the roster MODE: a `knockout_round`
   * period is a guillotine playoff window (the reduced 7+2 roster, PLAYOFF_ROSTER + FORMATIONS_PO);
   * anything else (or omitted, for back-compat) is the full 11-man group window. Mode is DERIVED here
   * from the injected period data — never a global toggle — so the validator stays pure + testable.
   */
  kind?: PeriodKind;
}

export type LineupValidation = { ok: true } | { ok: false; error: LineupError };

const fail = (error: LineupError): LineupValidation => ({ ok: false, error });

/** The per-mode legality rules: the XI size, the optional roster cap, and the per-position bounds. */
interface ModeRules {
  /** Exactly this many distinct starters (group 11, playoff 7 = 1 GK + 6 outfield). */
  xiSize: number;
  /** Max active squad size, or null when the validator doesn't cap the squad (group: bounded elsewhere). */
  rosterCap: number | null;
  /** Per-position starter bounds — group `FORMATION_BOUNDS`, playoff derived from `PLAYOFF_ROSTER`. */
  bounds: Record<Position, { min: number; max: number }>;
}

/**
 * The playoff per-position bounds, DERIVED from PLAYOFF_ROSTER (not a second source of truth). The
 * shared constant pins the mins (GK 1, DEF 2, MID 2, FWD 1) + exactly 6 outfield; the implied max for
 * an outfield lane is `6 − (the other two mins)`. With those bounds the only complete shapes are
 * exactly FORMATIONS_PO — 2-2-2 / 2-3-1 / 3-2-1 — so "formation ∈ FORMATIONS_PO" emerges, no extra
 * constant needed.
 */
function playoffBounds(): Record<Position, { min: number; max: number }> {
  const b = PLAYOFF_ROSTER.bounds;
  const of = PLAYOFF_ROSTER.startingOutfield; // 6
  return {
    GK: { min: b.GK.min, max: b.GK.max },
    DEF: { min: b.DEF.min, max: of - b.MID.min - b.FWD.min },
    MID: { min: b.MID.min, max: of - b.DEF.min - b.FWD.min },
    FWD: { min: b.FWD.min, max: of - b.DEF.min - b.MID.min },
  };
}

/** Resolve the mode rules from the period kind. Knockout → playoff; everything else → group. */
function modeRules(kind: PeriodKind | undefined): ModeRules {
  if (kind === "knockout_round") {
    return {
      xiSize: PLAYOFF_ROSTER.starters,
      rosterCap: PLAYOFF_ROSTER.cap,
      bounds: playoffBounds(),
    };
  }
  return { xiSize: STARTING_XI_SIZE, rosterCap: null, bounds: FORMATION_BOUNDS };
}

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
  // Mode is derived from the period kind (knockout_round → playoff reduced roster; else group). All the
  // size/cap/bound numbers below come from this one resolution — the only branch over the group rules.
  const rules = modeRules(period.kind);

  // (1) Edit window — a closed wave, or a window whose clock has passed, accepts no edits at all.
  if (period.status === "closed") return fail(wrongPeriod("closed", period.status));
  if (period.closesAt !== null && now.getTime() >= period.closesAt.getTime()) {
    return fail(wrongPeriod("window-closed", period.status));
  }

  // (1b) Roster cap (playoff only) — the guillotine squad is capped at PLAYOFF_ROSTER.cap (9 = 7+2).
  //      Group mode leaves the squad uncapped here (it's bounded by draft/FAAB, not this validator).
  if (rules.rosterCap !== null && squad.length > rules.rosterCap) {
    return fail(playoffRosterCap(squad.length, rules.rosterCap));
  }

  const positionOf = new Map(squad.map((p) => [p.playerId, p.position]));
  const starters = new Set(proposedXI);

  // (2) Ownership — every proposed starter must be a player the manager actually owns.
  for (const id of proposedXI) {
    if (!positionOf.has(id)) return fail(notYourPlayer(id));
  }

  // (3) XI size — exactly `rules.xiSize` DISTINCT starters (group 11, playoff 7).
  if (starters.size !== rules.xiSize) {
    return fail(incompleteXi(starters.size, rules.xiSize));
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

  // (5) Formation bounds — per-position counts among the starters (Theme B). The bound set is the
  //     mode's: group FORMATION_BOUNDS, or the PLAYOFF_ROSTER-derived playoff bounds (whose only
  //     complete shapes are FORMATIONS_PO).
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of proposedXI) counts[positionOf.get(id)!] += 1;
  for (const position of POSITIONS) {
    const bound = rules.bounds[position];
    const n = counts[position];
    if (n < bound.min || n > bound.max) return fail(illegalFormation(position, n, bound));
  }

  return { ok: true };
}
