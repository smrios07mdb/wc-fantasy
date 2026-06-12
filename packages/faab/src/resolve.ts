/**
 * The PURE FAAB batch resolver (DECISIONS.md §D, the locked blind-FAAB → free-agency pattern). Given a
 * snapshot — pending bids, managers (budget + rolling waiver position + current roster), each add
 * target's kickoff, and `now` — it returns the typed outcome: per-bid won/lost/voided, per-manager
 * budget deltas, and the final (contiguous) waiver order. NO Prisma, NO Supabase, NO clock: `now` and
 * the kickoffs are passed in, so the whole 8-step algorithm is unit-testable with literals.
 *
 * The 8 locked steps, all inside the single award loop unless noted:
 *  1. Void + refund any bid whose add target already kicked off (the pre-loop split into `competing`).
 *  2. Highest bid wins, player-by-player (the loop awards the globally-highest live bid each pass).
 *  3. Tie → rolling waiver order (the per-player winner sort; lower position wins).
 *  4. Move-to-bottom ONLY when the tiebreak is USED (`tiebreakUsed` gates `moveToBottom`).
 *  5. A manager's own multiple wins resolve highest-first, skipping any that no longer fit — emergent
 *     from always awarding the globally-highest live bid against the manager's UPDATED state.
 *  6. $0 bids are legal (no special case — amount 0 is just the lowest amount).
 *  7. Every won claim is add/drop + a budget debit (`applyAward`).
 *  8. Contiguity (1..N) is preserved by `moveToBottom`, which renumbers the whole seeded order.
 *
 * TODO(confirm): priority vs. amount. The Waivers design shows reorderable pending-claim *priority*,
 * but §D locks "a manager's own winning bids resolve highest-first (by AMOUNT)". This resolver honors
 * the locked rule — own bids are ordered by amount, never by a UI priority — and a same-amount own-bid
 * cross-player tie falls to the deterministic playerId order. Treat the design's `priority` as the
 * intra-manager tiebreak for EQUAL-amount own bids (+ a UI apply-order hint) only once confirmed. Note
 * `faab_bid` has NO `priority` column today, so honoring it at all needs a migration first — until
 * then there is nothing to thread through here.
 */
import { POSITIONS, SQUAD_SIZE, type Position } from "@app/shared";

export type PositionCounts = Readonly<Record<Position, number>>;

/** A manager as the batch sees it: current budget, rolling waiver position, and roster state. */
export interface ManagerState {
  managerId: string;
  /** Current FAAB budget. Bids are NOT debited pre-clear; a win debits `amount` here. */
  faabBudget: number;
  /** Rolling waiver order (1 = highest priority); null = unseeded (sorts last, never wins a tie). */
  waiverOrderPosition: number | null;
  /** Active per-position roster counts (used to derive the 15-man total; the per-position 2/5/5/3 cap
   *  was lifted — Prompt 44 extended to FAAB). */
  counts: PositionCounts;
  /** Active player ids owned by this manager (validates that a named drop is still owned). */
  ownedPlayerIds: readonly string[];
}

/** One pending bid. Positions + the add-target kickoff are resolved by the IO layer and passed in. */
export interface BidInput {
  bidId: string;
  managerId: string;
  playerAddId: string;
  addPosition: Position;
  /** Kickoff of the add target's relevant fixture (UTC), or null if none upcoming. Void if <= now. */
  addTargetKickoffAt: Date | null;
  /** Required once the roster is full; null only in the reinforcement open-slot case. */
  playerDropId: string | null;
  dropPosition: Position | null;
  /** True iff the named drop is LOCKED in a still-active matchday (he has played, lock-on-play). Such a
   *  drop is invalid — the IO layer resolves this from `lineup_slot.locked_at` via @app/lineup. */
  dropLocked: boolean;
  amount: number;
}

export interface ResolveBatchInput {
  now: Date;
  managers: readonly ManagerState[];
  bids: readonly BidInput[];
  /** Active league-wide ownership at batch start — an add target already owned can never be won. */
  ownedByLeague: ReadonlySet<string>;
}

/** Why a bid lost (it neither won nor was voided). */
export type LostReason =
  | "outbid" // a strictly higher bid won the player
  | "lost-tiebreak" // equal top bid, lost on waiver order
  | "add-unavailable" // add target already owned league-wide (not actually on the wire)
  | "budget-exhausted" // remaining budget < amount when this bid came up
  | "roster-illegal" // the add/drop would exceed the 15-man squad cap (per-position cap lifted — Prompt 44)
  | "drop-invalid"; // the named drop is no longer owned by this manager

export type BidResolution =
  | {
      bidId: string;
      managerId: string;
      outcome: "won";
      playerAddId: string;
      playerDropId: string | null;
      amount: number;
      /** True iff the waiver tiebreak decided this win — the ONLY trigger for move-to-bottom. */
      tiebreakUsed: boolean;
    }
  | { bidId: string; managerId: string; outcome: "lost"; reason: LostReason }
  | { bidId: string; managerId: string; outcome: "voided_refunded" };

/** Per-manager budget change (only managers who won ≥1 bid appear). */
export interface BudgetDelta {
  managerId: string;
  spent: number;
  newBudget: number;
}

/** One row of the final rolling waiver order. */
export interface WaiverSlot {
  managerId: string;
  position: number;
}

export interface BatchOutcome {
  resolutions: BidResolution[];
  budgetDeltas: BudgetDelta[];
  /** The full waiver order as a CONTIGUOUS 1..N permutation over the seeded managers. */
  waiverOrder: WaiverSlot[];
  /** True iff a move-to-bottom fired — lets the store skip the reorder write when nothing changed. */
  waiverOrderChanged: boolean;
}

// ── internal mutable working state ─────────────────────────────────────────────

interface WorkingManager {
  managerId: string;
  budget: number;
  spent: number;
  counts: Record<Position, number>;
  owned: Set<string>;
}

const HUGE = Number.MAX_SAFE_INTEGER;

export function resolveFaabBatch(inputArg: ResolveBatchInput): BatchOutcome {
  const { now, managers, bids, ownedByLeague } = inputArg;

  const resolutions: BidResolution[] = [];
  const resolved = new Set<string>();

  // (1) Void + refund: any bid whose add target has already kicked off does not compete.
  const competing: BidInput[] = [];
  for (const b of bids) {
    if (b.addTargetKickoffAt !== null && b.addTargetKickoffAt.getTime() <= now.getTime()) {
      resolutions.push({ bidId: b.bidId, managerId: b.managerId, outcome: "voided_refunded" });
      resolved.add(b.bidId);
    } else {
      competing.push(b);
    }
  }

  // Mutable working copies — the resolver evolves budget/roster/ownership as it awards.
  const work = new Map<string, WorkingManager>();
  for (const m of managers) {
    work.set(m.managerId, {
      managerId: m.managerId,
      budget: m.faabBudget,
      spent: 0,
      counts: { ...m.counts },
      owned: new Set(m.ownedPlayerIds),
    });
  }

  // The rolling waiver order as a mutable list (seeded managers only, by current position ascending).
  let order = managers
    .filter((m) => m.waiverOrderPosition !== null)
    .sort((a, b) => (a.waiverOrderPosition ?? HUGE) - (b.waiverOrderPosition ?? HUGE))
    .map((m) => m.managerId);
  const positionOf = (managerId: string): number => {
    const idx = order.indexOf(managerId);
    return idx === -1 ? HUGE : idx; // index IS the priority (0 = top); unseeded sort last
  };
  let waiverOrderChanged = false;

  // Players already owned league-wide can never be won; their bids are unavailable.
  const owned = new Set(ownedByLeague);

  // (2–6) Award loop: repeatedly take the globally-highest LIVE bid's player, award it, repeat.
  // A live bid is unresolved AND targets a still-available player.
  for (;;) {
    const live = competing.filter((b) => !resolved.has(b.bidId) && !owned.has(b.playerAddId));
    if (live.length === 0) break;

    // The next player to resolve is the one carrying the highest live bid (step 2). When several
    // DIFFERENT players are tied at the top amount, they are processed in WAIVER ORDER — by the
    // leading bidder's current waiver position (lower = first), NOT by player id / insertion order —
    // because move-to-bottom sequencing depends on it. (Waiver positions are unique per league, so the
    // only way two candidates' leaders tie is the SAME manager leading both at equal amount; that lone
    // intra-manager case falls back to a deterministic player id — the priority-confirm seam.)
    const topAmount = Math.max(...live.map((b) => b.amount));
    const playersAtTop = [
      ...new Set(live.filter((b) => b.amount === topAmount).map((b) => b.playerAddId)),
    ];
    const player = playersAtTop
      .map((p) => ({ p, winner: winnerForPlayer(live, p, positionOf) }))
      .sort(
        (a, b) =>
          positionOf(a.winner.managerId) - positionOf(b.winner.managerId) || (a.p < b.p ? -1 : 1),
      )[0]!.p;

    // Among this player's live bids, the winner is highest amount, then lowest waiver position (step 3).
    const onPlayer = live.filter((b) => b.playerAddId === player);
    const playerTop = Math.max(...onPlayer.map((b) => b.amount));
    const topBids = onPlayer.filter((b) => b.amount === playerTop);
    const tiebreakUsed = topBids.length > 1; // an equal competing bid exists → order will decide it
    const winner = winnerForPlayer(live, player, positionOf);

    // (5/7) Award only if the winner's claim is STILL legal against its updated state; else skip it
    // (mark lost) and re-loop so the player can fall to the next-best bid.
    const wm = work.get(winner.managerId)!;
    const legality = claimLegality(winner, wm);
    if (!legality.ok) {
      resolutions.push({
        bidId: winner.bidId,
        managerId: winner.managerId,
        outcome: "lost",
        reason: legality.reason,
      });
      resolved.add(winner.bidId);
      continue;
    }

    applyAward(winner, wm);
    owned.add(player); // the player is now owned; remaining bids on him lose
    resolutions.push({
      bidId: winner.bidId,
      managerId: winner.managerId,
      outcome: "won",
      playerAddId: winner.playerAddId,
      playerDropId: winner.playerDropId,
      amount: winner.amount,
      tiebreakUsed,
    });
    resolved.add(winner.bidId);

    // Every OTHER live bid on this player now loses.
    for (const b of onPlayer) {
      if (b.bidId === winner.bidId || resolved.has(b.bidId)) continue;
      resolutions.push({
        bidId: b.bidId,
        managerId: b.managerId,
        outcome: "lost",
        reason: b.amount < playerTop ? "outbid" : "lost-tiebreak",
      });
      resolved.add(b.bidId);
    }

    // (4/8) Move-to-bottom ONLY when the tiebreak was used — and immediately, for the rest of this
    // batch (so a tiebreak winner can't sweep the other tied players). Renumber keeps it contiguous.
    if (tiebreakUsed) {
      order = moveToBottom(order, winner.managerId);
      waiverOrderChanged = true;
    }
  }

  // Any still-unresolved competing bid targeted a player owned at batch start (off the wire).
  for (const b of competing) {
    if (resolved.has(b.bidId)) continue;
    resolutions.push({
      bidId: b.bidId,
      managerId: b.managerId,
      outcome: "lost",
      reason: "add-unavailable",
    });
  }

  const budgetDeltas: BudgetDelta[] = [];
  for (const wm of work.values()) {
    if (wm.spent > 0) {
      budgetDeltas.push({ managerId: wm.managerId, spent: wm.spent, newBudget: wm.budget });
    }
  }

  const waiverOrder: WaiverSlot[] = order.map((managerId, idx) => ({
    managerId,
    position: idx + 1, // contiguous 1..N
  }));

  return { resolutions, budgetDeltas, waiverOrder, waiverOrderChanged };
}

/** The prospective winner of `player` among the LIVE bids: highest amount, then lowest current waiver
 *  position, then a deterministic bid id. Used both to pick the winner and to order tied-top players by
 *  their leading bidder's waiver position. */
function winnerForPlayer(
  live: readonly BidInput[],
  player: string,
  positionOf: (managerId: string) => number,
): BidInput {
  const onPlayer = live.filter((b) => b.playerAddId === player);
  const top = Math.max(...onPlayer.map((b) => b.amount));
  return [...onPlayer.filter((b) => b.amount === top)].sort(
    (a, b) => positionOf(a.managerId) - positionOf(b.managerId) || (a.bidId < b.bidId ? -1 : 1),
  )[0]!;
}

/** Is a winning bid still applicable against the manager's CURRENT (already-updated) state? Encodes
 *  step 5's "still legal" = remaining budget ≥ amount, the named drop still owned AND not locked by
 *  play, and the add/drop keeps the roster within the 15-man cap (with no drop). */
function claimLegality(
  bid: BidInput,
  wm: WorkingManager,
): { ok: true } | { ok: false; reason: LostReason } {
  if (bid.amount > wm.budget) return { ok: false, reason: "budget-exhausted" };

  if (bid.playerDropId !== null && !wm.owned.has(bid.playerDropId)) {
    return { ok: false, reason: "drop-invalid" };
  }

  // A drop locked in an active matchday (he has played — lock-on-play) is invalid; skip the bid so the
  // player passes to the next valid bid (DECISIONS §B lock-on-play, enforced via lineup_slot.locked_at).
  if (bid.playerDropId !== null && bid.dropLocked) {
    return { ok: false, reason: "drop-invalid" };
  }

  // Roster after the swap: the drop frees a slot, the add fills one; only the 15-man TOTAL is capped —
  // the per-position 2/5/5/3 cap was lifted (Prompt 44 extended to FAAB).
  const after: Record<Position, number> = { ...wm.counts };
  if (bid.playerDropId !== null && bid.dropPosition !== null) after[bid.dropPosition] -= 1;
  after[bid.addPosition] += 1;
  const total = POSITIONS.reduce((sum, p) => sum + after[p], 0);
  if (total > SQUAD_SIZE) return { ok: false, reason: "roster-illegal" };

  return { ok: true };
}

/** Apply a legal award to the working manager: debit budget, release the drop, take the add. */
function applyAward(bid: BidInput, wm: WorkingManager): void {
  wm.budget -= bid.amount;
  wm.spent += bid.amount;
  if (bid.playerDropId !== null) {
    wm.owned.delete(bid.playerDropId);
    if (bid.dropPosition !== null) wm.counts[bid.dropPosition] -= 1;
  }
  wm.owned.add(bid.playerAddId);
  wm.counts[bid.addPosition] += 1;
}

/** Move a manager to the bottom of the rolling order, preserving the relative order of everyone else
 *  (and therefore contiguity). Pure — returns a new array. */
function moveToBottom(order: readonly string[], managerId: string): string[] {
  const without = order.filter((id) => id !== managerId);
  return [...without, managerId];
}
