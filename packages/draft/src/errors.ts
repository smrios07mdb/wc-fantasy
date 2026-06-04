/**
 * Typed draft errors. The controller rejects an invalid operation with one of these (NO partial
 * write) so callers (the future API route / worker) can branch on `instanceof DraftError` or a
 * specific subclass. Mirrors the repo convention: subclass Error, carry typed `readonly` fields, set
 * `this.name`. A small shared base (`DraftError`) lets callers catch the whole family in one place.
 */
import type { DraftStatus, Position } from "@app/shared";

/** Base class for every draft-controller rejection. */
export class DraftError extends Error {}

/** The draft id does not exist. */
export class DraftNotFoundError extends DraftError {
  constructor(readonly draftId: string) {
    super(`draft ${draftId} not found`);
    this.name = "DraftNotFoundError";
  }
}

/** A pick was submitted to a draft that is not `active` (pending / paused / complete). */
export class DraftNotActiveError extends DraftError {
  constructor(
    readonly draftId: string,
    readonly status: DraftStatus,
  ) {
    super(`draft ${draftId} is not active (status: ${status})`);
    this.name = "DraftNotActiveError";
  }
}

/** `startDraft` was called but the draft cannot begin (e.g. no manager has a draft_slot). */
export class DraftNotReadyError extends DraftError {
  constructor(
    readonly draftId: string,
    reason: string,
  ) {
    super(`draft ${draftId} cannot start: ${reason}`);
    this.name = "DraftNotReadyError";
  }
}

/** It is not this manager's turn (the snake clock is on someone else). */
export class NotYourTurnError extends DraftError {
  constructor(
    readonly draftId: string,
    readonly managerId: string,
    readonly currentManagerId: string | null,
  ) {
    super(
      `not manager ${managerId}'s turn in draft ${draftId} (on the clock: ${currentManagerId ?? "none"})`,
    );
    this.name = "NotYourTurnError";
  }
}

/** The player is already owned by some manager in the league (availability check). */
export class PlayerUnavailableError extends DraftError {
  constructor(readonly playerId: string) {
    super(`player ${playerId} is already owned in this league`);
    this.name = "PlayerUnavailableError";
  }
}

/** The player id does not resolve to a known player (and so has no position to legality-check). */
export class UnknownPlayerError extends DraftError {
  constructor(readonly playerId: string) {
    super(`player ${playerId} not found`);
    this.name = "UnknownPlayerError";
  }
}

/** Adding this player would exceed the manager's positional cap (2/5/5/3). */
export class PositionFullError extends DraftError {
  constructor(
    readonly managerId: string,
    readonly position: Position,
  ) {
    super(`manager ${managerId}'s ${position} bucket is full`);
    this.name = "PositionFullError";
  }
}

/** The pick was valid at read time but the draft advanced before the write landed (lost the guard).
 *  The DB constraints (the `draft_pick` and `roster_player` uniques) make this a clean rejection. */
export class PickConflictError extends DraftError {
  constructor(
    readonly draftId: string,
    readonly pickNo: number,
  ) {
    super(`pick ${pickNo} in draft ${draftId} was already taken (the draft advanced concurrently)`);
    this.name = "PickConflictError";
  }
}
