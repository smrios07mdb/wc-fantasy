/**
 * The typed `PoolPickError` family for SUBMISSION-time validation (Prompt 40). Like @app/faab's
 * `FaabBidError` and @app/lineup's `LineupError` (and unlike @app/draft's thrown classes) these are
 * RETURNED as data — a discriminated union on `code` — so a future pick form can call the validator to
 * drive "submit disabled + reason", and the route can map `code` → HTTP status without try/catch. Each
 * carries a human `message` (surfaced verbatim).
 */

export type PoolPickErrorCode =
  | "pick-locked"
  | "draw-not-allowed-knockout"
  | "pick-on-undecided-match";

/** The match is locked: kickoff has passed, or it has left `scheduled`. Picks close at kickoff. */
export interface PickLockedError {
  code: "pick-locked";
  message: string;
}

/** A DRAW pick was submitted for a knockout match — the result is the advancer, never DRAW. */
export interface DrawNotAllowedKnockoutError {
  code: "draw-not-allowed-knockout";
  message: string;
}

/**
 * A pick was submitted for a knockout fixture whose two sides aren't both resolved yet — at least one is a
 * TBD placeholder (`Team {id}`) or a null FK. The matchup doesn't exist until the prior round finishes, so
 * NO prediction is valid (the write-path twin of the UI hiding the buttons; see SEC-P4 / DECISIONS → Pool).
 */
export interface PickOnUndecidedMatchError {
  code: "pick-on-undecided-match";
  message: string;
}

export type PoolPickError =
  | PickLockedError
  | DrawNotAllowedKnockoutError
  | PickOnUndecidedMatchError;

// ── constructors (centralise the messages) ───────────────────────────────────────

export function pickLocked(): PickLockedError {
  return { code: "pick-locked", message: "this match is locked — picks close at kickoff" };
}

export function drawNotAllowedKnockout(): DrawNotAllowedKnockoutError {
  return {
    code: "draw-not-allowed-knockout",
    message: "a DRAW pick is invalid for a knockout match — pick the team that advances",
  };
}

export function pickOnUndecidedMatch(): PickOnUndecidedMatchError {
  return {
    code: "pick-on-undecided-match",
    message:
      "this knockout match isn't set yet — both teams are decided once the prior round finishes",
  };
}
