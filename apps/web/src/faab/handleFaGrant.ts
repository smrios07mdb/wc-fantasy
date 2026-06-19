/**
 * The testable orchestration behind `POST /api/faab/free-agent` (DECISIONS.md → Theme D amendment,
 * Prompt 48): the INSTANT $0 free-agency pickup. Framework-agnostic (`{ status, body }`, no
 * NextResponse / Supabase / Prisma). Same shape as `handleSubmitBid`:
 *
 *   1. identity FIRST — `faabGate` rejects 401 (no session) / 403 (not your manager) BEFORE any store
 *      access (a $0 grab is a strict SELF op — a commissioner may not grab for another manager);
 *   2. window gate — the add target's period must be in its FREE-AGENCY phase (post-batch, pre-first-
 *      kickoff). Sealed-bid → bid instead; locked → window over;
 *   3. live-unowned eligibility — the target must hold NO active roster spot right now (the IO layer
 *      resolves it from roster history). A player dropped during the window — by a winning batch bid or a
 *      manual mid-window drop — IS grabbable (commish decision Jun 18 2026; the Prompt-48 batch-clear
 *      snapshot + anti-snipe hold are retired);
 *   4. drop + roster rules (shared `validateFaGrant`);
 *   5. atomic first-come claim — `claimFreeAgent` applies the add/drop in ONE transaction gated on the
 *      active-ownership unique; the loser of a race gets a clean `fa-conflict` (409), fully rolled back.
 *
 * No amount (the cost is $0 — budget unchanged), no waiver-order mutation (instant FA is bids-free).
 */
import {
  validateFaGrant,
  acquisitionWindowState,
  type FaGrantError,
  type FaGrantStore,
  type FaGrantSubmission,
} from "@app/faab";
import type { SessionManagerOutcome } from "@app/auth";
import { faabGate } from "./gate";

export interface FaGrantDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: FaGrantStore;
  now: Date;
}

export interface FaGrantResult {
  status: number;
  body: unknown;
}

export interface FaGrantBody {
  managerId: string;
  playerAddId: string;
  playerDropId: string | null;
}

/** A validation rejection is a domain conflict with the rules (identity verified) → 409. */
function grantErrorResult(error: FaGrantError): FaGrantResult {
  return { status: 409, body: { error: error.code, message: error.message } };
}

export async function handleFaGrant(deps: FaGrantDeps, body: FaGrantBody): Promise<FaGrantResult> {
  const g = await faabGate(deps.resolveManager, body.managerId);
  if (!g.ok) return { status: g.status, body: { error: g.error } };

  const ctx = await deps.store.loadManagerFaContext(g.managerId);
  if (!ctx) return { status: 404, body: { error: "no_manager" } };

  const addFacts = await deps.store.getFaTargetFacts(ctx.leagueId, body.playerAddId);
  if (!addFacts)
    return { status: 404, body: { error: "unknown_player", playerId: body.playerAddId } };

  let dropPosition = null as FaGrantSubmission["dropPosition"];
  let dropLocked = false;
  if (body.playerDropId !== null) {
    const dropFacts = await deps.store.getDropFacts(body.playerDropId);
    if (!dropFacts)
      return { status: 404, body: { error: "unknown_player", playerId: body.playerDropId } };
    dropPosition = dropFacts.position;
    dropLocked = await deps.store.isDropLocked(g.managerId, body.playerDropId);
  }

  const error = validateFaGrant(
    {
      managerId: g.managerId,
      playerAddId: body.playerAddId,
      addPosition: addFacts.position,
      playerDropId: body.playerDropId,
      dropPosition,
    },
    {
      windowState: acquisitionWindowState(addFacts.window, deps.now),
      faEligible: addFacts.faEligible,
      counts: ctx.counts,
      squadSize: ctx.squadSize,
      rosterCap: ctx.rosterCap,
      ownedByManager: ctx.ownedByManager,
      dropLocked,
      isPlayoffParticipant: ctx.isPlayoffParticipant,
    },
  );
  if (error) return grantErrorResult(error);

  const outcome = await deps.store.claimFreeAgent({
    leagueId: ctx.leagueId,
    managerId: g.managerId,
    playerAddId: body.playerAddId,
    playerDropId: body.playerDropId,
    runAt: deps.now,
  });
  if (outcome === "conflict") {
    // Lost the first-come race (or the target is no longer an open FA) — a clean rejection.
    return { status: 409, body: { error: "fa-conflict" } };
  }
  return { status: 200, body: { ok: true, playerAddId: body.playerAddId } };
}
