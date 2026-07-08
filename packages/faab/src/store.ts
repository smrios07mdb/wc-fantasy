/**
 * The FAAB store PORTS. Every database read/write the two IO callers need is expressed here, so the
 * batch controller ({@link ./controller}) and the route handler are pure functions of these interfaces
 * and are unit-testable against the in-memory double ({@link ./memoryStore}). The production
 * implementations are the thin Prisma adapters ({@link ./prismaStore}), reachable only via
 * `@app/faab/prisma`, keeping the package's `.` surface IO-free.
 *
 * There are THREE ports because there are three callers with very different needs:
 *  - {@link FaabBatchStore} — the per-period batch: read the whole league snapshot, then APPLY the
 *    resolved outcome in ONE transaction (the no-double-spend / valid-drop / contiguity guard).
 *  - {@link FaabBidStore} — the bid route: read just this manager's slice for submission validation,
 *    then persist / amend / cancel a single `pending` bid (all strictly self-scoped).
 *  - {@link FaGrantStore} — the $0 free-agency route (Prompt 48): read the target's window + snapshot
 *    eligibility + this manager's slice, then APPLY an instant add/drop in ONE transaction (the
 *    first-come ownership claim).
 */
import type { Position } from "@app/shared";
import type { BatchOutcome, BidInput, ManagerState } from "./resolve";
import type { ReleaseRosterPlayer } from "./release";
import type { PeriodWindowView } from "./window";

// ── the cron's port ────────────────────────────────────────────────────────────

/** The snapshot the batch reads for one league — exactly the pure resolver's inputs minus `now`. */
export interface BatchContext {
  leagueId: string;
  managers: ManagerState[];
  /** Every PENDING bid in the league, with the add/drop positions + the add-target kickoff resolved. */
  bids: BidInput[];
  /** Players actively owned by ANY manager at batch start. */
  ownedByLeague: ReadonlySet<string>;
  /** The squad roster cap for the league's phase (15 group / 9 playoff), from `league.status`. */
  rosterCap: number;
  /** D4 (trim-down): the `alive` playoff_entry holders when the league is in its playoff phase, else null
   *  (group / pre-playoff — everyone participates). The resolver voids any non-participant's bid. */
  participantManagerIds?: ReadonlySet<string> | null;
}

export interface CommitBatchInput {
  leagueId: string;
  runAt: Date;
  outcome: BatchOutcome;
  /** The due period this batch clears. The apply atomically CLAIMS it (`UPDATE period SET
   *  batch_cleared_at = runAt WHERE id = claimPeriodId AND batch_cleared_at IS NULL`) as the FIRST step
   *  of the transaction; if 0 rows (another worker/tick already cleared it) the whole apply aborts. This
   *  is the once-only entry gate for the irreversible mutation (budget debit + add/drop + renumber). */
  claimPeriodId: string;
}

export interface FaabBatchStore {
  /** Load the league's pending-bid snapshot, or null if the league does not exist. */
  loadBatchContext(leagueId: string): Promise<BatchContext | null>;
  /** Apply the resolved outcome + the period claim in ONE transaction. Returns the created batch id, or
   *  `null` when the conditional period claim found 0 rows (another worker/tick already cleared this
   *  period → nothing applied). Within the apply, each bid is also settled with a guarded `updateMany
   *  WHERE status = 'pending'` (defense-in-depth so a re-run never double-applies). */
  commitBatch(input: CommitBatchInput): Promise<string | null>;
}

// ── the bid route's port ─────────────────────────────────────────────────────────

/** The slice the route reads to validate one manager's submission (mirrors the validator's context). */
export interface ManagerBidContext {
  leagueId: string;
  faabBudget: number;
  counts: Readonly<Record<Position, number>>;
  squadSize: number;
  /** The squad roster cap for the league's phase (15 group / 9 playoff), from `league.status`. */
  rosterCap: number;
  ownedByManager: ReadonlySet<string>;
  ownedByLeague: ReadonlySet<string>;
  /** D4 (trim-down): false ONLY for a playoff non-participant (no `alive` playoff_entry while
   *  `league.status === 'playoff'`); true in group / pre-playoff. Threaded into the submission validator. */
  isPlayoffParticipant: boolean;
}

/** Per-player facts the route needs about the add/drop targets. */
export interface PlayerFacts {
  position: Position;
  /** The acquisition cutoff for adding this player: his relevant fixture's PERIOD first kickoff
   *  (league-wide), or null if none upcoming. Superseded the per-player kickoff (Theme-D amendment). */
  periodFirstKickoffAt: Date | null;
  /** The add target's PERIOD blind-bid batch-clear latch (`period.batch_cleared_at`), or null if the
   *  batch has not yet cleared. NOT-NULL ⇒ the period left sealed-bid for free agency, so a sealed bid is
   *  rejected (`bid-window-closed`); resolved from the SAME add-period window as `periodFirstKickoffAt`. */
  periodBatchClearedAt: Date | null;
  /** Add-side eliminated-team gate (DECISIONS §D): the add target's WC team is eliminated
   *  (`fifa_team.eliminated`, resolved by the IO layer via `isAddTeamEliminated`; a no-team player ⇒
   *  false). Optional + default-false (absent ⇒ not eliminated) so existing bid-test seeds are unchanged. */
  addTeamEliminated?: boolean;
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
  /** The manager's own still-`pending` bids (id + add target) — the reorder handler's set/latch read. */
  listPendingBids(managerId: string): Promise<{ bidId: string; playerAddId: string }[]>;
  /** Rewrite the manager's own pending-claim `priority` to the given permutation (1..N by list index)
   *  in ONE serialized transaction. Returns false — nothing written — when the permutation no longer
   *  matches the manager's pending set (a concurrent submit/cancel/settle); the caller 409s. */
  reorderPendingBids(managerId: string, orderedBidIds: readonly string[]): Promise<boolean>;
}

// ── the $0 free-agency route's port (Prompt 48) ────────────────────────────────────

/** The manager slice the FA grant validates against (no budget — the cost is $0). */
export interface FaGrantContext {
  leagueId: string;
  counts: Readonly<Record<Position, number>>;
  squadSize: number;
  /** The squad roster cap for the league's phase (15 group / 9 playoff), from `league.status`. */
  rosterCap: number;
  ownedByManager: ReadonlySet<string>;
  /** D4 (trim-down): false ONLY for a playoff non-participant; true in group / pre-playoff. */
  isPlayoffParticipant: boolean;
}

/** The add target's facts for a $0 FA grant: position, its period's acquisition window, and whether it
 *  is an open free agent per the BATCH-CLEAR SNAPSHOT (unowned at this period's batch-clear AND
 *  currently unowned — NOT live-unowned, so a player dropped during the window is not eligible). */
export interface FaTargetFacts {
  position: Position;
  window: PeriodWindowView;
  faEligible: boolean;
}

export interface FaGrantStore {
  /** The manager's roster slice, or null if the manager does not exist. */
  loadManagerFaContext(managerId: string): Promise<FaGrantContext | null>;
  /** The add target's position + period window + FA-eligibility snapshot, or null if unknown. */
  getFaTargetFacts(leagueId: string, playerId: string): Promise<FaTargetFacts | null>;
  /** The drop target's position, or null if unknown. */
  getDropFacts(playerId: string): Promise<{ position: Position } | null>;
  /** Is the manager's drop target LOCKED by play (lineup_slot.locked_at in an active matchday)? */
  isDropLocked(managerId: string, playerDropId: string): Promise<boolean>;
  /** Apply the instant grant in ONE transaction: re-check eligibility, drop the named player, claim the
   *  add — gated on the active-ownership unique (the first-come guard). $0 (budget unchanged, waiver
   *  order untouched). Returns "granted", or "conflict" when another manager won the player first / it
   *  is no longer an open FA (a clean rejection, fully rolled back). An optional `periodId` (the
   *  commissioner `--period` pin) resolves the snapshot instant T from THAT period's batch_cleared_at
   *  instead of the add's next-fixture-inferred period — which, for an already-played player, points at a
   *  still-sealed next matchday (T null) and wrongly conflicts. Omitted (live route) ⇒ next-fixture.
   *  `allowEliminated` (D2) is the commissioner override: when true the add-side eliminated-team belt is
   *  bypassed so a commissioner can deliberately add a player from an eliminated team (default false /
   *  omitted ⇒ the belt enforces — the live manager route never passes it). Mirrors the kickoff bypass. */
  claimFreeAgent(input: {
    leagueId: string;
    managerId: string;
    playerAddId: string;
    playerDropId: string | null;
    runAt: Date;
    periodId?: string | null;
    allowEliminated?: boolean;
  }): Promise<"granted" | "conflict">;
}

// ── the playoff trim-down release port (DECISIONS §D trim-down) ─────────────────────

/** The slice the release route + `commish:trim` read to validate + apply a drop-only release. */
export interface ReleaseContext {
  leagueId: string;
  /** The manager's CURRENT active roster (id + position) — the validator's `roster`. */
  roster: ReleaseRosterPlayer[];
  /** The phase squad cap (15 group / 9 playoff), from `league.status`. */
  rosterCap: number;
  /** Of the roster, those LOCKED by play in a still-open matchday (∅ in the R32 pre-kickoff trim window). */
  lockedPlayerIds: ReadonlySet<string>;
  /** Is the league in its playoff phase (`status === 'playoff'`)? Release is offered only then. */
  isPlayoffPhase: boolean;
  /** D4 participant gate: NOT-playoff OR an `alive` playoff_entry. Non-participants can't release. */
  isPlayoffParticipant: boolean;
  /** The current open knockout period (the R32 trim window) id, or null when not in playoff / unresolved.
   *  Passed back to {@link FaabReleaseStore.releaseRoster} as `periodId` to scope a commissioner
   *  locked-slot release to exactly this period. */
  currentPeriodId: string | null;
}

/** A playoff survivor still carrying more than the playoff cap (the `commish:trim --report` listing). */
export interface OverCapSurvivor {
  managerId: string;
  rosterCount: number;
  rosterCap: number;
}

export interface FaabReleaseStore {
  /** The manager's release slice (roster + cap + locked set + participant flag), or null if unknown. */
  loadReleaseContext(managerId: string): Promise<ReleaseContext | null>;
  /**
   * Apply a drop-only release in ONE transaction: set `roster_player.dropped_at = now` for `dropIds` and
   * release their lineup slots (so a dropped starter stops scoring). The MANAGER path releases only
   * UNLOCKED slots and then FAILS LOUD — aborting the transaction — if any drop is left with a still-locked
   * slot (a stale injected lock set / TOCTOU); it never silently leaves a locked starter on a dropped
   * player. The COMMISSIONER path (`allowLocked`) additionally releases a currently-locked slot under the
   * `app.commish_override` GUC (which exempts the lock-on-play DELETE trigger). Returns the slots released.
   */
  releaseRoster(
    managerId: string,
    dropIds: readonly string[],
    opts: { now: Date; periodId: string | null; allowLocked: boolean },
  ): Promise<{ releasedSlots: number }>;
  /** Playoff survivors (alive playoff_entry) whose active roster still exceeds the cap — the report read.
   *  Returns [] outside the playoff phase (nothing to trim). */
  listOverCapPlayoffSurvivors(leagueId: string): Promise<OverCapSurvivor[]>;
}
