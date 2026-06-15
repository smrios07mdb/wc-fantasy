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
import type { AcquisitionWindow } from "./window";

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

/** The add/drop would exceed the phase squad cap (15 group / 9 playoff; the per-position 2/5/5/3 cap was
 *  lifted — Prompt 44 extended to FAAB). `position` is the add's position, `cap` the limit hit. */
export interface RosterIllegalError {
  code: "roster-illegal";
  message: string;
  position: Position;
  cap: number;
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

// ── $0 free-agency grant errors (Prompt 48) ───────────────────────────────────
// The instant $0 FA pickup (DECISIONS §D amendment) shares the drop/roster errors above but adds two
// FA-specific rejections: the window is not in its free-agency phase, and the target is not an open FA.

/** The add target's acquisition window is not in the free-agency phase (still sealed-bid, or locked). */
export interface FaWindowClosedError {
  code: "fa-window-closed";
  message: string;
  /** Which non-free-agency phase blocked the grant (sealed-bid → bid instead; locked → window over). */
  phase: Exclude<AcquisitionWindow, "free-agency">;
}

/** The target is not an open free agent: it was owned at this period's batch-clear, or is owned now —
 *  the snapshot rule (NOT live-unowned), so a player dropped during the window is not grabbable. */
export interface FaNotEligibleError {
  code: "fa-not-eligible";
  message: string;
  playerAddId: string;
}

/** The drop + roster-legality errors shared by a bid and a $0 FA grant (the `checkDropAndRoster` set). */
export type DropRosterError =
  | DropRequiredError
  | DropNotOwnedError
  | DropEqualsAddError
  | DropLockedError
  | RosterIllegalError;

/** The grant rejection family — the shared drop/roster errors plus the two FA-specific ones. */
export type FaGrantError = FaWindowClosedError | FaNotEligibleError | DropRosterError;

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

export function rosterIllegal(position: Position, cap: number): RosterIllegalError {
  return {
    code: "roster-illegal",
    message: `this add/drop would exceed your ${cap}-man squad limit`,
    position,
    cap,
  };
}

export function faWindowClosed(phase: FaWindowClosedError["phase"]): FaWindowClosedError {
  return {
    code: "fa-window-closed",
    message:
      phase === "sealed-bid"
        ? "free agency has not opened for this period yet — place a sealed bid instead"
        : "the acquisition window is closed for this period — the first match has kicked off",
    phase,
  };
}

export function faNotEligible(playerAddId: string): FaNotEligibleError {
  return {
    code: "fa-not-eligible",
    message: `player ${playerAddId} is not an open free agent this period (claimed, or released into the next period's batch pool)`,
    playerAddId,
  };
}

// ── roster-release errors (the playoff trim-down drop-only path) ───────────────
// The immediate drop-only release a playoff advancer uses to trim 15 → ≤9 (DECISIONS §D trim-down). Unlike
// a bid/FA grant this is a NET SHED (no add), so it has its own rejection family: a drop must be owned + not
// locked-by-play, the squad can never fall below the 7-starter floor, and a 7–9-man end state that cannot
// field a legal playoff XI is a CONFIRM-GATED warning (not a hard error) the caller surfaces and re-submits.

/** A named release target is not actively owned by this manager. */
export interface ReleaseNotOwnedError {
  code: "release-not-owned";
  message: string;
  playerId: string;
}

/** The release named no players to drop (nothing to do). */
export interface ReleaseNothingError {
  code: "release-nothing";
  message: string;
}

/** A release target has played this matchday (lineup_slot locked-on-play) — it can't be released yet
 *  (unless the commissioner `--allow-locked-slot` carve-out is in force). */
export interface ReleaseLockedError {
  code: "release-locked";
  message: string;
  playerId: string;
}

/** The release would drop the squad below the playoff starter floor (7) — it could never field an XI. */
export interface ReleaseBelowFloorError {
  code: "release-below-floor";
  message: string;
  /** The squad size that would remain after the release. */
  postCount: number;
  /** The hard floor (PLAYOFF_ROSTER.starters = 7). */
  floor: number;
}

/** SOFT-WARN (confirm-gated): the 7–9-man end state cannot field a legal playoff XI (a lane is too thin).
 *  The caller surfaces this and re-submits with `confirmedUnfillable` to proceed deliberately. */
export interface ReleaseUnfillableError {
  code: "release-unfillable";
  message: string;
  /** The squad size that would remain after the release. */
  postCount: number;
}

export type ReleaseError =
  | ReleaseNotOwnedError
  | ReleaseNothingError
  | ReleaseLockedError
  | ReleaseBelowFloorError
  | ReleaseUnfillableError;

export function releaseNotOwned(playerId: string): ReleaseNotOwnedError {
  return {
    code: "release-not-owned",
    message: `you do not own player ${playerId}, so you cannot release him`,
    playerId,
  };
}

export function releaseNothing(): ReleaseNothingError {
  return {
    code: "release-nothing",
    message: "no players selected to release",
  };
}

export function releaseLocked(playerId: string): ReleaseLockedError {
  return {
    code: "release-locked",
    message: `player ${playerId} has played this matchday and is locked — you can't release him until it ends`,
    playerId,
  };
}

export function releaseBelowFloor(postCount: number, floor: number): ReleaseBelowFloorError {
  return {
    code: "release-below-floor",
    message: `releasing this many would leave ${postCount} player(s) — below the ${floor}-starter playoff floor`,
    postCount,
    floor,
  };
}

export function releaseUnfillable(postCount: number): ReleaseUnfillableError {
  return {
    code: "release-unfillable",
    message: `the resulting ${postCount}-man squad cannot field a legal playoff XI — confirm to release anyway`,
    postCount,
  };
}
