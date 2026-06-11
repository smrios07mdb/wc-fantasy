/**
 * The FAAB store PORTS. Every database read/write the two IO callers need is expressed here, so the
 * batch controller ({@link ./controller}) and the route handler are pure functions of these interfaces
 * and are unit-testable against the in-memory double ({@link ./memoryStore}). The production
 * implementations are the thin Prisma adapters ({@link ./prismaStore}), reachable only via
 * `@app/faab/prisma`, keeping the package's `.` surface IO-free.
 *
 * There are TWO ports because there are two callers with very different needs:
 *  - {@link FaabBatchStore} — the daily cron: read the whole league snapshot, then APPLY the resolved
 *    outcome in ONE transaction (the no-double-spend / valid-drop / contiguity guard).
 *  - {@link FaabBidStore} — the bid route: read just this manager's slice for submission validation,
 *    then persist / amend / cancel a single `pending` bid (all strictly self-scoped).
 */
import type { Position } from "@app/shared";
import type { BatchOutcome, BidInput, ManagerState } from "./resolve";

// ── the cron's port ────────────────────────────────────────────────────────────

/** The snapshot the batch reads for one league — exactly the pure resolver's inputs minus `now`. */
export interface BatchContext {
  leagueId: string;
  managers: ManagerState[];
  /** Every PENDING bid in the league, with the add/drop positions + the add-target kickoff resolved. */
  bids: BidInput[];
  /** Players actively owned by ANY manager at batch start. */
  ownedByLeague: ReadonlySet<string>;
}

export interface CommitBatchInput {
  leagueId: string;
  runAt: Date;
  outcome: BatchOutcome;
}

export interface FaabBatchStore {
  /** Load the league's pending-bid snapshot, or null if the league does not exist. */
  loadBatchContext(leagueId: string): Promise<BatchContext | null>;
  /** Apply the resolved outcome in ONE transaction and return the created batch id. Settles ONLY the
   *  bids that are still `pending` (the guard that keeps a re-run from double-applying). */
  commitBatch(input: CommitBatchInput): Promise<string>;
}

// ── the bid route's port ─────────────────────────────────────────────────────────

/** The slice the route reads to validate one manager's submission (mirrors the validator's context). */
export interface ManagerBidContext {
  leagueId: string;
  faabBudget: number;
  counts: Readonly<Record<Position, number>>;
  squadSize: number;
  ownedByManager: ReadonlySet<string>;
  ownedByLeague: ReadonlySet<string>;
}

/** Per-player facts the route needs about the add/drop targets. */
export interface PlayerFacts {
  position: Position;
  /** The acquisition cutoff for adding this player: his relevant fixture's PERIOD first kickoff
   *  (league-wide), or null if none upcoming. Superseded the per-player kickoff (Theme-D amendment). */
  periodFirstKickoffAt: Date | null;
}

/** A bid as persisted/echoed by the route. */
export interface PersistedBid {
  bidId: string;
  managerId: string;
  playerAddId: string;
  playerDropId: string | null;
  amount: number;
  note: string | null;
}

export interface FaabBidStore {
  /** The manager's budget + roster slice, or null if the manager does not exist. */
  loadManagerBidContext(managerId: string): Promise<ManagerBidContext | null>;
  /** Sum of the amounts of the manager's OTHER pending bids (excluding `exceptBidId` when editing). */
  sumOtherPendingBids(managerId: string, exceptBidId: string | null): Promise<number>;
  /** Resolve a player's position + add-target kickoff, or null if the player is unknown. */
  getPlayerFacts(playerId: string): Promise<PlayerFacts | null>;
  /** Is the manager's drop target LOCKED by play (lineup_slot.locked_at in a still-active matchday)? A
   *  locked-in-an-open-matchday player has played this matchday and cannot be dropped yet. */
  isDropLocked(managerId: string, playerDropId: string): Promise<boolean>;
  /** Insert a new `pending` bid; returns the persisted row. */
  createBid(bid: {
    leagueId: string;
    managerId: string;
    playerAddId: string;
    playerDropId: string | null;
    amount: number;
    note: string | null;
    submittedAt: Date;
  }): Promise<PersistedBid>;
  /** Load a single bid (for the self-scope + still-pending guard on edit/cancel, and to re-validate an
   *  edit against the FIXED add target), or null. */
  getBid(bidId: string): Promise<{ managerId: string; status: string; playerAddId: string } | null>;
  /** Amend a still-`pending` bid's amount / drop / note (guarded on status = pending). Returns the row,
   *  or null if the guard lost (already settled / gone). */
  updateBid(
    bidId: string,
    patch: { amount: number; playerDropId: string | null; note: string | null },
  ): Promise<PersistedBid | null>;
  /** Cancel (delete) a still-`pending` bid (guarded). Returns true if a row was removed. */
  cancelBid(bidId: string): Promise<boolean>;
}
