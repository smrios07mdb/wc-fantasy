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
 *  3. the add target is unowned league-wide AND its PERIOD is still in its SEALED-BID phase at `now`.
 *     The window is the shared `acquisitionWindowState` (single source of truth): "locked" once the
 *     league-wide period first kickoff passes (`add-kicked-off` — the outer bound, NOT the player's own
 *     kickoff per the amendment), and "free-agency" once that period's blind-bid batch has CLEARED
 *     (`bid-window-closed` — sealed bids are closed; the $0 FA grab takes over). The IO layer resolves
 *     both `acquisitionCutoffAt` (the period first kickoff) and `batchClearedAt` (the batch-clear latch).
 *  4. the drop ≠ the add; the drop is owned by this manager; a drop is REQUIRED once the squad is full.
 *  5. the add/drop keeps the roster within the phase roster cap (15 group / 9 playoff; the per-position
 *     2/5/5/3 cap was lifted — Prompt 44 extended to FAAB; lineup/formation legality is a separate
 *     rule in @app/lineup). The cap is injected (`ctx.rosterCap`) so this validator stays phase-agnostic.
 */
import { POSITIONS, type Position } from "@app/shared";
import type { PositionCounts } from "./resolve";
import { acquisitionWindowState, type AcquisitionWindow } from "./window";
import {
  addKickedOff,
  addOwned,
  addTeamEliminated,
  amountNegative,
  bidWindowClosed,
  dropEqualsAdd,
  dropLocked,
  dropNotOwned,
  dropRequired,
  faNotEligible,
  faWindowClosed,
  notParticipant,
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
  /** The manager's active squad size (≥ `rosterCap` ⇒ full ⇒ a drop is required). */
  squadSize: number;
  /** The squad roster cap for the league's current phase (15 group / 9 playoff). Resolved by the IO layer
   *  from the playoff phase (`rosterCapForPlayoffPhase` / `loadPlayoffPhaseActive`) so this validator stays
   *  phase-agnostic. */
  rosterCap: number;
  /** Players actively owned by THIS manager (validates the drop). */
  ownedByManager: ReadonlySet<string>;
  /** Players actively owned by ANY manager in the league (validates the add availability). */
  ownedByLeague: ReadonlySet<string>;
  /** The acquisition cutoff: the add target's PERIOD first kickoff (league-wide), or null if none
   *  upcoming. Superseded the per-player kickoff (Theme-D amendment). Resolved by the IO layer. This is
   *  the HARD "locked" boundary (outer bound); the sealed→free-agency boundary below fires earlier. */
  acquisitionCutoffAt: Date | null;
  /** The add target's PERIOD blind-bid batch-clear LATCH (`period.batch_cleared_at`), or null if the
   *  batch has not yet cleared. NOT-NULL ⇒ the period left its sealed-bid phase for free agency, so a
   *  (sealed) bid is rejected (`bid-window-closed`) and the manager must use the $0 FA grab instead. Keyed
   *  on the actual latch (not the scheduled batch time), mirroring `acquisitionWindowState`. IO-resolved. */
  batchClearedAt: Date | null;
  /** Is the named drop LOCKED by play (lineup_slot.locked_at in a still-active matchday)? A locked drop
   *  has played this matchday and can't be dropped yet. False when there is no drop. */
  dropLocked: boolean;
  /** D4 (trim-down) participant gate. The IO layer sets this `false` ONLY for a playoff non-participant (a
   *  manager with no `alive` playoff_entry while the league is in its playoff phase); group-phase / pre-playoff
   *  it is always `true`. Optional + DEFAULT-PARTICIPANT (absent ⇒ participates) so group behavior — and
   *  every existing test — is byte-identical. */
  isPlayoffParticipant?: boolean;
  /** Add-side eliminated-team gate (DECISIONS §D "eliminated-team add gate"). The IO layer resolves it
   *  via `isAddTeamEliminated(fifa_team.eliminated)` for the ADD target (a no-team player ⇒ `false`).
   *  Optional + DEFAULT-NOT-ELIMINATED (absent ⇒ `false`) so every existing test is byte-identical. */
  addTeamEliminated?: boolean;
}

export function validateBidSubmission(
  sub: BidSubmission,
  ctx: BidValidationContext,
): FaabBidError | null {
  // (0) D4: a playoff non-participant may not bid (inert in group — the flag is only ever false in playoff).
  if (ctx.isPlayoffParticipant === false) return notParticipant(sub.managerId);

  // (1) amount ≥ 0 — $0 is the legal minimum.
  if (sub.amount < 0) return amountNegative(sub.amount);

  // (2) no over-commit: amount ≤ budget − other pending bids.
  const available = ctx.faabBudget - ctx.pendingTotal;
  if (sub.amount > available) return overBudget(sub.amount, available);

  // (3) add availability + the acquisition WINDOW. The shared `acquisitionWindowState` is the single
  //     source of truth (it keys the sealed→free-agency boundary on the period's batch-clear LATCH, not a
  //     scheduled time): a period past its first kickoff is "locked" (`add-kicked-off`, the same outer
  //     bound as before — the condition is identical), and a period whose blind-bid batch has CLEARED is
  //     in "free-agency" — sealed bids are closed, so the manager must use the $0 FA grab route instead
  //     (`bid-window-closed`). A sealed $0 bid accepted in this gap was the MD1 strand incident. Only the
  //     still-sealed phase accepts a bid.
  if (ctx.ownedByLeague.has(sub.playerAddId)) return addOwned(sub.playerAddId);
  // The add target's WC team is eliminated (commissioner-set) — add-side gate, sibling of the $0-grant's
  // fa-not-eligible. Sits in the add-availability block (right after add-owned, before the window check).
  if (ctx.addTeamEliminated === true) return addTeamEliminated(sub.playerAddId);
  const window = acquisitionWindowState(
    { batchClearedAt: ctx.batchClearedAt, firstKickoffAt: ctx.acquisitionCutoffAt },
    ctx.now,
  );
  if (window === "locked") return addKickedOff(sub.playerAddId);
  if (window === "free-agency") return bidWindowClosed(sub.playerAddId);

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

/** Everything the FA-grant validator needs (DECISIONS §D amendment, Prompt 48 + the Jun 18 2026
 *  live-unowned amendment). No budget/amount: the cost is $0. Timing is the WINDOW (free-agency phase) +
 *  the LIVE-UNOWNED ELIGIBILITY, both IO-resolved. */
export interface FaGrantValidationContext {
  /** The add target's period acquisition window at `now` — the grant is accepted ONLY in free-agency. */
  windowState: AcquisitionWindow;
  /** Is the target a LIVE free agent: holds NO active roster spot right now? Live-unowned rule (Jun 18
   *  2026) — a player dropped during the window (batch droppee or manual drop) IS eligible immediately;
   *  the IO layer resolves it via the single `liveOwnedWhere` predicate (`@app/faab/prisma`). */
  faEligible: boolean;
  counts: PositionCounts;
  squadSize: number;
  /** The squad roster cap for the league's current phase (15 group / 9 playoff). See
   *  {@link BidValidationContext.rosterCap}. */
  rosterCap: number;
  ownedByManager: ReadonlySet<string>;
  dropLocked: boolean;
  /** D4 (trim-down) participant gate — see {@link BidValidationContext.isPlayoffParticipant}. Optional +
   *  default-participant (absent ⇒ participates) so group-phase FA grants are byte-identical. */
  isPlayoffParticipant?: boolean;
}

/**
 * PURE validation for an instant $0 free-agency grant (DECISIONS §D amendment). Order:
 *  0. D4: a playoff non-participant may not grab (inert in group).
 *  1. window: the add target's period must be in its free-agency phase (post-batch, pre-first-kickoff).
 *  2. eligibility: the target must be a LIVE free agent — no active roster spot (Jun 18 2026 amendment).
 *  3+4. the SAME drop + roster rules as a bid (shared `checkDropAndRoster`): drop ≠ add, drop owned,
 *       drop not locked-by-play, drop required when full, and the phase roster cap (15 group / 9 playoff).
 * No amount/budget check ($0 is always affordable) and no waiver-order concern (instant FA is bids-free).
 */
export function validateFaGrant(
  sub: FaGrantSubmission,
  ctx: FaGrantValidationContext,
): FaGrantError | null {
  // (0) D4: a playoff non-participant may not grab (inert in group — the flag is only ever false in playoff).
  if (ctx.isPlayoffParticipant === false) return notParticipant(sub.managerId);

  // (1) window: accept ONLY in the free-agency phase.
  if (ctx.windowState !== "free-agency") return faWindowClosed(ctx.windowState);

  // (2) eligibility: a LIVE free agent — the target holds no active roster spot (Jun 18 2026 amendment).
  if (!ctx.faEligible) return faNotEligible(sub.playerAddId);

  // (3)+(4) drop rules + roster legality — shared with the bid path.
  return checkDropAndRoster(sub, ctx);
}

/** The drop + roster-legality rules shared by a bid and a $0 FA grant (DECISIONS §D): a drop is
 *  required once the squad is full, the drop must be owned + not the add + not locked-by-play, and the
 *  resulting roster must stay within the 15-man cap. Pure. */
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
    rosterCap: number;
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
  } else if (ctx.squadSize >= ctx.rosterCap) {
    return dropRequired();
  }

  // roster legality: the drop frees a slot, the add fills one; only the TOTAL is capped at the phase
  // cap (15 group / 9 playoff — the per-position 2/5/5/3 cap was lifted, Prompt 44 extended to FAAB).
  // Per-position legality is a separate matchday rule in @app/lineup (FORMATION_BOUNDS), unaffected here.
  const after: Record<Position, number> = { ...ctx.counts };
  if (add.playerDropId !== null && add.dropPosition !== null) after[add.dropPosition] -= 1;
  after[add.addPosition] += 1;
  const total = POSITIONS.reduce((sum, p) => sum + after[p], 0);
  if (total > ctx.rosterCap) return rosterIllegal(add.addPosition, ctx.rosterCap);

  return null;
}
