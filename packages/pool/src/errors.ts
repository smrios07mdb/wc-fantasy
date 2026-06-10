/**
 * The typed `PoolPickError` family for SUBMISSION-time validation (Prompt 40). Like @app/faab's
 * `FaabBidError` and @app/lineup's `LineupError` (and unlike @app/draft's thrown classes) these are
 * RETURNED as data — a discriminated union on `code` — so a future pick form can call the validator to
 * drive "submit disabled + reason", and the route can map `code` → HTTP status without try/catch. Each
 * carries a human `message` (surfaced verbatim).
 */

export type PoolPickErrorCode = "pick-locked" | "draw-not-allowed-knockout";

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

export type PoolPickError = PickLockedError | DrawNotAllowedKnockoutError;

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
