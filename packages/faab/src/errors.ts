/**
 * The typed `FaabBidError` family for SUBMISSION-time validation. Like `@app/lineup`'s `LineupError`
 * (and unlike `@app/draft`'s thrown classes) these are RETURNED as data — a discriminated union on
 * `code` — so the bid form can call the validator on every keystroke to drive "submit disabled +
 * reason", and the route can map `code` → HTTP status without try/catch. Each carries a human
 * `message` (surfaced verbatim) plus the typed fields a caller needs to explain the rejection.
 *
 * NB: this is the SUBMISSION error family (one bid, placed by a manager). The BATCH outcome of a bid
 * (won / lost / voided_refunded, with a `LostReason`) is a different vocabulary and lives in
 * {@link ./resolve}.
 */
import type { Position } from "@app/shared";

export type FaabBidErrorCode =
  | "amount-negative"
  | "over-budget"
  | "add-owned"
  | "add-kicked-off"
  | "drop-required"
  | "drop-not-owned"
  | "drop-equals-add"
  | "drop-locked"
  | "roster-illegal";

/** The bid amount is below the $0 minimum. */
export interface AmountNegativeError {
  code: "amount-negative";
  message: string;
  amount: number;
}

/** The amount exceeds the budget still uncommitted across the manager's OTHER pending bids. */
export interface OverBudgetError {
  code: "over-budget";
  message: string;
  amount: number;
  /** faabBudget − sum(other pending bids) — the most this bid may be. */
  available: number;
}

/** The add target is already owned by some manager in the league. */
export interface AddOwnedError {
  code: "add-owned";
  message: string;
  playerAddId: string;
}

/** The add target's match has already kicked off — the acquisition deadline has passed. */
export interface AddKickedOffError {
  code: "add-kicked-off";
  message: string;
  playerAddId: string;
}

/** The roster is full but the bid named no drop (every full-squad claim is add-X / drop-Y). */
export interface DropRequiredError {
  code: "drop-required";
  message: string;
}

/** The named drop is not actively owned by this manager. */
export interface DropNotOwnedError {
  code: "drop-not-owned";
  message: string;
  playerDropId: string;
}

/** The drop is the same player as the add. */
export interface DropEqualsAddError {
  code: "drop-equals-add";
  message: string;
  playerId: string;
}

/** The drop has played this matchday (lineup_slot locked-on-play) — he can't be dropped until it ends. */
export interface DropLockedError {
  code: "drop-locked";
  message: string;
  playerDropId: string;
}

/** The add/drop would break the 2/5/5/3 positional caps (or the 15-man cap). */
export interface RosterIllegalError {
  code: "roster-illegal";
  message: string;
  position: Position;
}

export type FaabBidError =
  | AmountNegativeError
  | OverBudgetError
  | AddOwnedError
  | AddKickedOffError
  | DropRequiredError
  | DropNotOwnedError
  | DropEqualsAddError
  | DropLockedError
  | RosterIllegalError;

// ── constructors (centralise the messages) ────────────────────────────────────

export function amountNegative(amount: number): AmountNegativeError {
  return {
    code: "amount-negative",
    message: `bid amount ${amount} is below the $0 minimum`,
    amount,
  };
}

export function overBudget(amount: number, available: number): OverBudgetError {
  return {
    code: "over-budget",
    message: `bid ${amount} exceeds your available budget of ${available} (budget minus your other pending bids)`,
    amount,
    available,
  };
}

export function addOwned(playerAddId: string): AddOwnedError {
  return {
    code: "add-owned",
    message: `player ${playerAddId} is already owned in this league`,
    playerAddId,
  };
}

export function addKickedOff(playerAddId: string): AddKickedOffError {
  return {
    code: "add-kicked-off",
    message: `player ${playerAddId}'s match has already kicked off — he can no longer be acquired`,
    playerAddId,
  };
}

export function dropRequired(): DropRequiredError {
  return {
    code: "drop-required",
    message: "your squad is full — every claim must name a player to drop",
  };
}

export function dropNotOwned(playerDropId: string): DropNotOwnedError {
  return {
    code: "drop-not-owned",
    message: `you do not own player ${playerDropId}, so you cannot drop him`,
    playerDropId,
  };
}

export function dropEqualsAdd(playerId: string): DropEqualsAddError {
  return {
    code: "drop-equals-add",
    message: `the drop and the add are the same player (${playerId})`,
    playerId,
  };
}

export function dropLocked(playerDropId: string): DropLockedError {
  return {
    code: "drop-locked",
    message: `player ${playerDropId} has played this matchday and is locked — you can't drop him until it ends`,
    playerDropId,
  };
}

export function rosterIllegal(position: Position): RosterIllegalError {
  return {
    code: "roster-illegal",
    message: `this add/drop would break your ${position} positional limit`,
    position,
  };
}
