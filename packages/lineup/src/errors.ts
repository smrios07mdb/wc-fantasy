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

/** A locked (already-played) player was moved into or out of the XI — forbidden by lock-on-play. */
export interface LockedPlayerMovedError {
  code: "locked-player-moved";
  message: string;
  playerId: string;
  /** The role the player is frozen in (where he played from). */
  frozenRole: "starter" | "bench";
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
  | WrongPeriodError;

// ── constructors (centralise the messages) ────────────────────────────────────

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
