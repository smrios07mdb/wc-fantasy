/**
 * The testable orchestration behind `POST/PATCH/DELETE /api/faab/bid` (framework-agnostic — returns a
 * plain `{ status, body }`, no NextResponse / Supabase / Prisma). It is the `/api/draft/pick` template:
 *
 *   1. resolve the session → manager (injected; the edge reads Supabase + Prisma);
 *   2. reject 401 (no session) / 403 (not allowlisted / no manager / not your manager) — BEFORE any DB
 *      read or write — submitting / editing / cancelling a bid is a strict SELF op (scope "self"), so a
 *      commissioner may NOT act on another manager's bids;
 *   3. only then validate + persist via the unchanged pure `@app/faab` validator.
 *
 * Edit / cancel additionally re-verify that the TARGET BID belongs to the session manager (a manager
 * may pass the body-managerId gate yet name a bid that is not theirs) and that it is still `pending`.
 */
import {
  validateBidSubmission,
  type FaabBidError,
  type FaabBidStore,
  type BidSubmission,
} from "@app/faab";
import type { SessionManagerOutcome } from "@app/auth";
import { faabGate } from "./gate";

export interface FaabBidDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: FaabBidStore;
  now: Date;
}

export interface FaabHandlerResult {
  status: number;
  body: unknown;
}

export interface SubmitBidBody {
  managerId: string;
  playerAddId: string;
  playerDropId: string | null;
  amount: number;
  note: string | null;
}

export interface EditBidBody {
  managerId: string;
  bidId: string;
  amount: number;
  playerDropId: string | null;
  note: string | null;
}

export interface CancelBidBody {
  managerId: string;
  bidId: string;
}

/** A submission rejection is a domain conflict with the rules (identity is already verified) → 409. */
function bidErrorResult(error: FaabBidError): FaabHandlerResult {
  return { status: 409, body: { error: error.code, message: error.message } };
}

/** Run the shared FAAB gate and adapt its result to this handler's `{ status, body }` shape. */
type GateOk = { ok: true; managerId: string } | { ok: false; result: FaabHandlerResult };
async function gate(deps: FaabBidDeps, targetManagerId: string): Promise<GateOk> {
  const g = await faabGate(deps.resolveManager, targetManagerId);
  return g.ok ? g : { ok: false, result: { status: g.status, body: { error: g.error } } };
}

export async function handleSubmitBid(
  deps: FaabBidDeps,
  body: SubmitBidBody,
): Promise<FaabHandlerResult> {
  const g = await gate(deps, body.managerId);
  if (!g.ok) return g.result;

  const ctx = await deps.store.loadManagerBidContext(g.managerId);
  if (!ctx) return { status: 404, body: { error: "no_manager" } };

  const addFacts = await deps.store.getPlayerFacts(body.playerAddId);
  if (!addFacts)
    return { status: 404, body: { error: "unknown_player", playerId: body.playerAddId } };

  let dropPosition = null as BidSubmission["dropPosition"];
  let dropLocked = false;
  if (body.playerDropId !== null) {
    const dropFacts = await deps.store.getPlayerFacts(body.playerDropId);
    if (!dropFacts)
      return { status: 404, body: { error: "unknown_player", playerId: body.playerDropId } };
    dropPosition = dropFacts.position;
    dropLocked = await deps.store.isDropLocked(g.managerId, body.playerDropId);
  }

  // A bid here is a SEALED bid that clears at the add-period's blind-bid batch. The validator now gates
  // BOTH boundaries of the acquisition window (via `acquisitionWindowState`): the HARD first-kickoff lock
  // (`acquisitionCutoffAt`) AND the sealed→free-agency latch (`batchClearedAt`). Once the period's batch
  // has cleared, the sealed phase is over and this route rejects (`bid-window-closed`, 409) — the manager
  // uses the dedicated $0 first-come FA route (`/api/faab/free-agent`, `handleFaGrant`) instead. (A sealed
  // $0 bid accepted in the post-clear gap was stranded behind the latch in MD1 — this closes that gap.)
  const pendingTotal = await deps.store.sumOtherPendingBids(g.managerId, null);
  const submission: BidSubmission = {
    managerId: g.managerId,
    playerAddId: body.playerAddId,
    addPosition: addFacts.position,
    playerDropId: body.playerDropId,
    dropPosition,
    amount: body.amount,
  };
  const error = validateBidSubmission(submission, {
    now: deps.now,
    faabBudget: ctx.faabBudget,
    pendingTotal,
    counts: ctx.counts,
    squadSize: ctx.squadSize,
    rosterCap: ctx.rosterCap,
    ownedByManager: ctx.ownedByManager,
    ownedByLeague: ctx.ownedByLeague,
    acquisitionCutoffAt: addFacts.periodFirstKickoffAt,
    batchClearedAt: addFacts.periodBatchClearedAt,
    dropLocked,
    isPlayoffParticipant: ctx.isPlayoffParticipant,
    addTeamEliminated: addFacts.addTeamEliminated,
  });
  if (error) return bidErrorResult(error);

  const bid = await deps.store.createBid({
    leagueId: ctx.leagueId,
    managerId: g.managerId,
    playerAddId: body.playerAddId,
    playerDropId: body.playerDropId,
    amount: body.amount,
    note: body.note,
    submittedAt: deps.now,
  });
  return { status: 200, body: { ok: true, bid } };
}

export async function handleEditBid(
  deps: FaabBidDeps,
  body: EditBidBody,
): Promise<FaabHandlerResult> {
  const g = await gate(deps, body.managerId);
  if (!g.ok) return g.result;

  const existing = await deps.store.getBid(body.bidId);
  if (!existing) return { status: 404, body: { error: "bid_not_found" } };
  if (existing.managerId !== g.managerId)
    return { status: 403, body: { error: "not_your_manager" } };
  if (existing.status !== "pending") return { status: 409, body: { error: "bid_not_pending" } };

  const ctx = await deps.store.loadManagerBidContext(g.managerId);
  if (!ctx) return { status: 404, body: { error: "no_manager" } };

  // The add target is FIXED on an edit (change the add = cancel + resubmit); re-validate amount/drop.
  const addFacts = await deps.store.getPlayerFacts(existing.playerAddId);
  if (!addFacts)
    return { status: 404, body: { error: "unknown_player", playerId: existing.playerAddId } };

  let dropPosition = null as BidSubmission["dropPosition"];
  let dropLocked = false;
  if (body.playerDropId !== null) {
    const dropFacts = await deps.store.getPlayerFacts(body.playerDropId);
    if (!dropFacts)
      return { status: 404, body: { error: "unknown_player", playerId: body.playerDropId } };
    dropPosition = dropFacts.position;
    dropLocked = await deps.store.isDropLocked(g.managerId, body.playerDropId);
  }

  // Exclude THIS bid from the pending total so a raise is measured against the manager's other claims.
  const pendingTotal = await deps.store.sumOtherPendingBids(g.managerId, body.bidId);
  const error = validateBidSubmission(
    {
      managerId: g.managerId,
      playerAddId: existing.playerAddId,
      addPosition: addFacts.position,
      playerDropId: body.playerDropId,
      dropPosition,
      amount: body.amount,
    },
    {
      now: deps.now,
      faabBudget: ctx.faabBudget,
      pendingTotal,
      counts: ctx.counts,
      squadSize: ctx.squadSize,
      rosterCap: ctx.rosterCap,
      ownedByManager: ctx.ownedByManager,
      ownedByLeague: ctx.ownedByLeague,
      acquisitionCutoffAt: addFacts.periodFirstKickoffAt,
      batchClearedAt: addFacts.periodBatchClearedAt,
      dropLocked,
      isPlayoffParticipant: ctx.isPlayoffParticipant,
      // The add target is FIXED on an edit — re-validate it: a team eliminated after the bid was placed
      // makes the pending claim rejected here too (add-side, consistent with submit). Cancel runs no
      // validator, so a bid on a now-eliminated player can always be withdrawn.
      addTeamEliminated: addFacts.addTeamEliminated,
    },
  );
  if (error) return bidErrorResult(error);

  const bid = await deps.store.updateBid(body.bidId, {
    amount: body.amount,
    playerDropId: body.playerDropId,
    note: body.note,
  });
  if (!bid) return { status: 409, body: { error: "bid_not_pending" } }; // guard lost (settled meanwhile)
  return { status: 200, body: { ok: true, bid } };
}

export async function handleCancelBid(
  deps: FaabBidDeps,
  body: CancelBidBody,
): Promise<FaabHandlerResult> {
  const g = await gate(deps, body.managerId);
  if (!g.ok) return g.result;

  const existing = await deps.store.getBid(body.bidId);
  if (!existing) return { status: 404, body: { error: "bid_not_found" } };
  if (existing.managerId !== g.managerId)
    return { status: 403, body: { error: "not_your_manager" } };
  if (existing.status !== "pending") return { status: 409, body: { error: "bid_not_pending" } };

  const cancelled = await deps.store.cancelBid(body.bidId);
  if (!cancelled) return { status: 409, body: { error: "bid_not_pending" } };
  return { status: 200, body: { ok: true } };
}
