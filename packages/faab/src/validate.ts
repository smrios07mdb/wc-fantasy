/**
 * PURE submission-time validation for a single FAAB bid (DECISIONS.md §D — "rejected at submission,
 * not deferred to the batch"). Returns a typed {@link FaabBidError} (as data) or `null` when the bid is
 * legal. No Prisma / Supabase / clock: `now`, the add target's kickoff, and the manager snapshot are
 * all injected, so the rule set is unit-testable with literals and reusable by the form and the route.
 *
 * The rules, in order (DECISIONS §D "$0 bids / out-of-budget" + the Theme-D "per-matchday acquisition
 * window" amendment):
 *  1. amount ≥ 0 ($0 is legal; negative is not).
 *  2. amount ≤ faabBudget − (sum of the manager's OTHER pending bids) — no over-commit across claims.
 *  3. the add target is unowned league-wide AND its PERIOD's first kickoff has not passed at `now`. The
 *     cutoff is the league-wide period first kickoff (NOT the player's own kickoff) — the amendment
 *     supersedes the per-player-kickoff deadline. The IO layer resolves `acquisitionCutoffAt`.
 *  4. the drop ≠ the add; the drop is owned by this manager; a drop is REQUIRED once the squad is full.
 *  5. the add/drop keeps the roster within the 2/5/5/3 caps (and the 15-man cap).
 */
import { POSITIONS, SQUAD_COMPOSITION, SQUAD_SIZE, type Position } from "@app/shared";
import type { PositionCounts } from "./resolve";
import type { AcquisitionWindow } from "./window";
import {
  addKickedOff,
  addOwned,
  amountNegative,
  dropEqualsAdd,
  dropLocked,
  dropNotOwned,
  dropRequired,
  faNotEligible,
  faWindowClosed,
  overBudget,
  rosterIllegal,
  type FaabBidError,
  type FaGrantError,
  type DropRosterError,
} from "./errors";

/** The bid a manager is placing (or editing). Positions are resolved by the IO layer from the player. */
export interface BidSubmission {
  managerId: string;
  playerAddId: string;
  addPosition: Position;
  playerDropId: string | null;
  dropPosition: Position | null;
  amount: number;
}

/** Everything the validator needs about the manager + the add target, read by the IO layer. */
export interface BidValidationContext {
  now: Date;
  faabBudget: number;
  /** Sum of the amounts of the manager's OTHER pending bids (exclude the one being edited). */
  pendingTotal: number;
  /** The manager's active per-position roster counts. */
  counts: PositionCounts;
  /** The manager's active squad size (≥ SQUAD_SIZE ⇒ full ⇒ a drop is required). */
  squadSize: number;
  /** Players actively owned by THIS manager (validates the drop). */
  ownedByManager: ReadonlySet<string>;
  /** Players actively owned by ANY manager in the league (validates the add availability). */
  ownedByLeague: ReadonlySet<string>;
  /** The acquisition cutoff: the add target's PERIOD first kickoff (league-wide), or null if none
   *  upcoming. Superseded the per-player kickoff (Theme-D amendment). Resolved by the IO layer. */
  acquisitionCutoffAt: Date | null;
  /** Is the named drop LOCKED by play (lineup_slot.locked_at in a still-active matchday)? A locked drop
   *  has played this matchday and can't be dropped yet. False when there is no drop. */
  dropLocked: boolean;
}

export function validateBidSubmission(
  sub: BidSubmission,
  ctx: BidValidationContext,
): FaabBidError | null {
  // (1) amount ≥ 0 — $0 is the legal minimum.
  if (sub.amount < 0) return amountNegative(sub.amount);

  // (2) no over-commit: amount ≤ budget − other pending bids.
  const available = ctx.faabBudget - ctx.pendingTotal;
  if (sub.amount > available) return overBudget(sub.amount, available);

  // (3) add availability + the acquisition cutoff (the period's first kickoff, league-wide).
  if (ctx.ownedByLeague.has(sub.playerAddId)) return addOwned(sub.playerAddId);
  if (ctx.acquisitionCutoffAt !== null && ctx.acquisitionCutoffAt.getTime() <= ctx.now.getTime()) {
    return addKickedOff(sub.playerAddId);
  }

  // (4)+(5) drop rules + roster legality — shared with the $0 FA grant.
  return checkDropAndRoster(sub, ctx);
}

/** The add/drop a $0 free-agency grant applies (no amount — the cost is $0). */
export interface FaGrantSubmission {
  managerId: string;
  playerAddId: string;
  addPosition: Position;
  playerDropId: string | null;
  dropPosition: Position | null;
}

/** Everything the FA-grant validator needs (DECISIONS §D amendment, Prompt 48). No budget/amount: the
 *  cost is $0. Timing is the WINDOW (free-agency phase) + the snapshot ELIGIBILITY, both IO-resolved. */
export interface FaGrantValidationContext {
  /** The add target's period acquisition window at `now` — the grant is accepted ONLY in free-agency. */
  windowState: AcquisitionWindow;
  /** Is the target an OPEN free agent: unowned at this period's batch-clear AND currently unowned?
   *  Snapshot rule (NOT live-unowned) — a player dropped during the window is NOT eligible. */
  faEligible: boolean;
  counts: PositionCounts;
  squadSize: number;
  ownedByManager: ReadonlySet<string>;
  dropLocked: boolean;
}

/**
 * PURE validation for an instant $0 free-agency grant (DECISIONS §D amendment). Order:
 *  1. window: the add target's period must be in its free-agency phase (post-batch, pre-first-kickoff).
 *  2. eligibility: the target must be an open FA per the batch-clear snapshot (not live-unowned).
 *  3+4. the SAME drop + roster rules as a bid (shared `checkDropAndRoster`): drop ≠ add, drop owned,
 *       drop not locked-by-play, drop required when full, and the 2/5/5/3 + 15-man caps.
 * No amount/budget check ($0 is always affordable) and no waiver-order concern (instant FA is bids-free).
 */
export function validateFaGrant(
  sub: FaGrantSubmission,
  ctx: FaGrantValidationContext,
): FaGrantError | null {
  // (1) window: accept ONLY in the free-agency phase.
  if (ctx.windowState !== "free-agency") return faWindowClosed(ctx.windowState);

  // (2) eligibility: open FA per the batch-clear snapshot (not live-unowned).
  if (!ctx.faEligible) return faNotEligible(sub.playerAddId);

  // (3)+(4) drop rules + roster legality — shared with the bid path.
  return checkDropAndRoster(sub, ctx);
}

/** The drop + roster-legality rules shared by a bid and a $0 FA grant (DECISIONS §D): a drop is
 *  required once the squad is full, the drop must be owned + not the add + not locked-by-play, and the
 *  resulting roster must stay within the 2/5/5/3 caps and the 15-man cap. Pure. */
function checkDropAndRoster(
  add: {
    playerAddId: string;
    addPosition: Position;
    playerDropId: string | null;
    dropPosition: Position | null;
  },
  ctx: {
    counts: PositionCounts;
    squadSize: number;
    ownedByManager: ReadonlySet<string>;
    dropLocked: boolean;
  },
): DropRosterError | null {
  // drop rules.
  if (add.playerDropId !== null) {
    if (add.playerDropId === add.playerAddId) return dropEqualsAdd(add.playerAddId);
    if (!ctx.ownedByManager.has(add.playerDropId)) return dropNotOwned(add.playerDropId);
    // A drop that has played this matchday (locked-on-play) can't be dropped until the matchday ends.
    if (ctx.dropLocked) return dropLocked(add.playerDropId);
  } else if (ctx.squadSize >= SQUAD_SIZE) {
    return dropRequired();
  }

  // roster legality: the drop frees a slot of its position, the add fills one of its position.
  const after: Record<Position, number> = { ...ctx.counts };
  if (add.playerDropId !== null && add.dropPosition !== null) after[add.dropPosition] -= 1;
  after[add.addPosition] += 1;
  if (after[add.addPosition] > SQUAD_COMPOSITION[add.addPosition]) {
    return rosterIllegal(add.addPosition);
  }
  const total = POSITIONS.reduce((sum, p) => sum + after[p], 0);
  if (total > SQUAD_SIZE) return rosterIllegal(add.addPosition);

  return null;
}
