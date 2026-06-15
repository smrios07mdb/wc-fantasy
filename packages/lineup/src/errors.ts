/**
 * The typed `LineupError` family. Unlike `@app/draft`'s thrown `DraftError` classes, `validateLineup`
 * RETURNS one of these as data (a discriminated union on `code`) so the screen can call the validator
 * every render to drive "save disabled + reason" without try/catch, and the route can map `code` → HTTP
 * status. Each carries a human `message` (surfaced verbatim in the UI) plus the typed fields a caller
 * needs to explain or localise the rejection. Mirrors the repo convention of small, well-typed errors.
 */
import type { Position, PeriodStatus } from "@app/shared";

export type LineupErrorCode =
  | "illegal-formation"
  | "incomplete-xi"
  | "not-your-player"
  | "locked-player-moved"
  | "played-player-started"
  | "voided-player-started"
  | "forfeit-requires-confirm"
  | "playoff-roster-cap"
  | "wrong-period";

/** A starting XI whose per-position count breaks a Theme B formation bound (FORMATION_BOUNDS). */
export interface IllegalFormationError {
  code: "illegal-formation";
  message: string;
  position: Position;
  count: number;
  bound: { min: number; max: number };
}

/** The XI does not have exactly 11 DISTINCT starters (too few, too many, or a duplicate id). */
export interface IncompleteXiError {
  code: "incomplete-xi";
  message: string;
  /** Distinct starters proposed. */
  have: number;
  /** STARTING_XI_SIZE (11). */
  need: number;
}

/** A proposed starter is not in the manager's active squad (ownership check). */
export interface NotYourPlayerError {
  code: "not-your-player";
  message: string;
  playerId: string;
}

/** A locked (already-played) player was moved at write time — the latch caught a player who locked between
 *  the read and the commit (the read-time play rules are the three codes below). */
export interface LockedPlayerMovedError {
  code: "locked-player-moved";
  message: string;
  playerId: string;
  /** The role the player is frozen in (where he played from). */
  frozenRole: "starter" | "bench";
}

/** A player who has already PLAYED was promoted INTO the XI from the bench — forbidden (hindsight upside:
 *  the forfeit model relaxes the OUT direction only; the IN direction stays a hard block, DECISIONS Theme B
 *  in-matchday-substitution amendment). */
export interface PlayedPlayerStartedError {
  code: "played-player-started";
  message: string;
  playerId: string;
}

/** A VOIDED (forfeited) slot was put back in the XI — forbidden: a forfeit is a one-way door for the period. */
export interface VoidedPlayerStartedError {
  code: "voided-player-started";
  message: string;
  playerId: string;
}

/** A played starter was benched WITHOUT an explicit forfeit confirmation. Benching a played starter forfeits
 *  his earned points one-way, so the engine refuses it unless the caller confirms the player by id. The C1
 *  route never confirms (the current UI sends no confirm) → benching a played starter is rejected, exactly
 *  as before; the destructive-confirm path is C2. */
export interface ForfeitRequiresConfirmError {
  code: "forfeit-requires-confirm";
  message: string;
  playerId: string;
}

/** The active squad exceeds the playoff reduced-roster cap (PLAYOFF_ROSTER.cap = 9). Playoff mode only;
 *  the group stage's 15-man squad is bounded by FAAB/draft, not by `validateLineup`. */
export interface PlayoffRosterCapError {
  code: "playoff-roster-cap";
  message: string;
  /** The current active squad size. */
  have: number;
  /** PLAYOFF_ROSTER.cap (9). */
  cap: number;
}

/** The target period is not editable: it doesn't exist, its wave is closed, or `now` is past the window. */
export interface WrongPeriodError {
  code: "wrong-period";
  message: string;
  reason: "unknown" | "closed" | "window-closed";
  status: PeriodStatus | null;
}

export type LineupError =
  | IllegalFormationError
  | IncompleteXiError
  | NotYourPlayerError
  | LockedPlayerMovedError
  | PlayedPlayerStartedError
  | VoidedPlayerStartedError
  | ForfeitRequiresConfirmError
  | PlayoffRosterCapError
  | WrongPeriodError;

// ── constructors (centralise the messages) ────────────────────────────────────

export function playoffRosterCap(have: number, cap: number): PlayoffRosterCapError {
  return {
    code: "playoff-roster-cap",
    message: `playoff roster is ${have} players — the reduced cap is ${cap}`,
    have,
    cap,
  };
}

export function illegalFormation(
  position: Position,
  count: number,
  bound: { min: number; max: number },
): IllegalFormationError {
  const want = bound.min === bound.max ? `exactly ${bound.min}` : `${bound.min}–${bound.max}`;
  return {
    code: "illegal-formation",
    message: `illegal formation: ${count} ${position} selected (need ${want})`,
    position,
    count,
    bound,
  };
}

export function incompleteXi(have: number, need: number): IncompleteXiError {
  return {
    code: "incomplete-xi",
    message: `starting XI must have exactly ${need} players (got ${have})`,
    have,
    need,
  };
}

export function notYourPlayer(playerId: string): NotYourPlayerError {
  return {
    code: "not-your-player",
    message: `player ${playerId} is not in your squad`,
    playerId,
  };
}

export function lockedPlayerMoved(
  playerId: string,
  frozenRole: "starter" | "bench",
): LockedPlayerMovedError {
  return {
    code: "locked-player-moved",
    message: `player ${playerId} has played and is locked ${
      frozenRole === "starter" ? "in the XI" : "on the bench"
    } — he can't be moved`,
    playerId,
    frozenRole,
  };
}

export function playedPlayerStarted(playerId: string): PlayedPlayerStartedError {
  return {
    code: "played-player-started",
    message: `player ${playerId} has already played — he can't be moved into the starting XI`,
    playerId,
  };
}

export function voidedPlayerStarted(playerId: string): VoidedPlayerStartedError {
  return {
    code: "voided-player-started",
    message: `player ${playerId} was benched after playing — that forfeit is final and can't be undone this period`,
    playerId,
  };
}

export function forfeitRequiresConfirm(playerId: string): ForfeitRequiresConfirmError {
  return {
    code: "forfeit-requires-confirm",
    message: `benching ${playerId} forfeits his points for this period and can't be undone — confirm the forfeit to proceed`,
    playerId,
  };
}

const WRONG_PERIOD_MESSAGE: Record<WrongPeriodError["reason"], string> = {
  unknown: "that period was not found for your league",
  closed: "this period is closed — lineups can no longer be edited",
  "window-closed": "the edit window for this period has closed",
};

export function wrongPeriod(
  reason: "unknown" | "closed" | "window-closed",
  status: PeriodStatus | null = null,
): WrongPeriodError {
  return {
    code: "wrong-period",
    message: WRONG_PERIOD_MESSAGE[reason],
    reason,
    status,
  };
}
