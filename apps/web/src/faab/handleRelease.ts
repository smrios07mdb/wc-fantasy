/**
 * The testable orchestration behind `POST /api/faab/release` (DECISIONS §D trim-down): the immediate
 * DROP-ONLY release a playoff advancer uses to trim 15 → ≤9. Framework-agnostic (`{ status, body }`, no
 * NextResponse / Supabase / Prisma). Same shape as `handleSubmitBid`:
 *
 *   1. identity FIRST — `faabGate` rejects 401 / 403 BEFORE any store access (a release is a strict SELF
 *      op; a commissioner uses `commish:trim`, not this route);
 *   2. D4 participant gate — a playoff non-participant (no `alive` playoff_entry) is rejected (409);
 *   3. phase gate — release is a playoff-only affordance (the 9-cap net-shed); inert otherwise;
 *   4. pure `validateRelease` — ownership / floor / lock / the unfillable confirm gate. The MANAGER path
 *      never bypasses locks (`allowLocked: false`). The `release-unfillable` verdict is returned to the
 *      client as a confirm-gated 409 (`needsConfirm`), which re-submits with `confirmedUnfillable: true`;
 *   5. `releaseRoster` — one-transaction droppedAt + slot release (fail-loud on a stale lock).
 */
import {
  validateRelease,
  notParticipant,
  type FaabReleaseStore,
  type ReleaseError,
} from "@app/faab";
import type { SessionManagerOutcome } from "@app/auth";
import { faabGate } from "./gate";

export interface FaabReleaseDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: FaabReleaseStore;
  now: Date;
}

export interface FaabReleaseResult {
  status: number;
  body: unknown;
}

export interface ReleaseBody {
  managerId: string;
  dropIds: string[];
  /** The client confirmed an unfillable 7–{cap} end state (re-submit after the `needsConfirm` 409). */
  confirmedUnfillable: boolean;
}

/** A validation rejection is a domain conflict with the rules (identity verified) → 409. The unfillable
 *  warning carries `needsConfirm` so the client shows a confirm and re-submits with confirmedUnfillable. */
function releaseErrorResult(error: ReleaseError): FaabReleaseResult {
  return {
    status: 409,
    body: {
      error: error.code,
      message: error.message,
      ...(error.code === "release-unfillable" ? { needsConfirm: true } : {}),
    },
  };
}

export async function handleRelease(
  deps: FaabReleaseDeps,
  body: ReleaseBody,
): Promise<FaabReleaseResult> {
  const g = await faabGate(deps.resolveManager, body.managerId);
  if (!g.ok) return { status: g.status, body: { error: g.error } };

  const ctx = await deps.store.loadReleaseContext(g.managerId);
  if (!ctx) return { status: 404, body: { error: "no_manager" } };

  // (D4) a playoff non-participant may not release (the commissioner `commish:trim` path bypasses, not here).
  if (!ctx.isPlayoffParticipant) {
    const e = notParticipant(g.managerId);
    return { status: 409, body: { error: e.code, message: e.message } };
  }

  // Release is the playoff-only net-shed; there is no group-phase drop-only path (every group move is a swap).
  if (!ctx.isPlayoffPhase) {
    return {
      status: 409,
      body: {
        error: "release-not-allowed",
        message: "releasing players is only available in the playoff phase",
      },
    };
  }

  const error = validateRelease({
    roster: ctx.roster,
    dropIds: body.dropIds,
    lockedPlayerIds: ctx.lockedPlayerIds,
    rosterCap: ctx.rosterCap,
    allowLocked: false, // the manager path never bypasses lock-on-play
    confirmedUnfillable: body.confirmedUnfillable,
  });
  if (error) return releaseErrorResult(error);

  const out = await deps.store.releaseRoster(g.managerId, body.dropIds, {
    now: deps.now,
    periodId: ctx.currentPeriodId,
    allowLocked: false,
  });
  return { status: 200, body: { ok: true, releasedSlots: out.releasedSlots } };
}
