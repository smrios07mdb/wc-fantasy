/**
 * The testable orchestration behind `POST /api/lineup` (framework-agnostic — returns a plain
 * `{ status, body }`, no NextResponse, no Supabase, no Prisma). It adds ONLY identity on top of the
 * pure `@app/lineup` controller, mirroring `handleDraftPick`:
 *
 *   1. resolve the session → manager (injected; the edge reads Supabase + Prisma);
 *   2. reject 401 (no session) / 403 (not allowlisted / no manager / not your manager) — BEFORE the
 *      controller (and therefore before any lock read or write) is ever touched;
 *   3. only then call `setLineup(...)` — which re-reads the AUTHORITATIVE lock state and validates the XI
 *      server-side, so a locked-slot edit is rejected even if the client UI was bypassed.
 *
 * Setting a lineup is a strict self-op: `scope: "self"`, so a commissioner may NOT set another manager's
 * lineup (a manual-correction `admin` scope is a later, deliberate decision — see TODO(prompt-NN)).
 */
import { setLineup, type LineupError, type LineupStore } from "@app/lineup";
import { canActAsManager, type SessionManagerOutcome } from "@app/auth";

export interface LineupRequestBody {
  managerId: string;
  periodId: string;
  /** The player ids chosen to START; the rest of the squad is the bench. */
  starterIds: string[];
  /** Player ids the manager has confirmed forfeiting (benching after play). Optional; defaults to none. */
  forfeitConfirmedPlayerIds?: string[];
}

export interface LineupHandlerResult {
  status: number;
  body: unknown;
}

export interface LineupHandlerDeps {
  /** Reads the request's Supabase session → the league manager outcome (the edge's IO). */
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: LineupStore;
  now: Date;
}

/** Map a validator/controller rejection to a status. Identity is already verified — these are domain
 *  rejections: an unknown period is "not found" (404); everything else is a conflict with the rules (409). */
function lineupErrorStatus(error: LineupError): number {
  if (error.code === "wrong-period" && error.reason === "unknown") return 404;
  // 409 for every other rule conflict: illegal-formation / incomplete-xi / not-your-player / a closed
  // window / and the forfeit-model codes (forfeit-requires-confirm / voided-player-started /
  // played-player-started / the write-time locked-player-moved race).
  return 409;
}

export async function handleSetLineup(
  deps: LineupHandlerDeps,
  body: LineupRequestBody,
): Promise<LineupHandlerResult> {
  // (1) Identity, resolved at the edge. Reject 401/403 BEFORE the controller is touched.
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind === "not-allowlisted")
    return { status: 403, body: { error: "not_allowlisted" } };
  if (outcome.kind === "no-manager") return { status: 403, body: { error: "no_manager" } };

  // (2) Authz: setting a lineup is a strict self op (scope "self") — no commissioner override.
  if (
    !canActAsManager({
      sessionManagerId: outcome.manager.id,
      targetManagerId: body.managerId,
      isCommissioner: outcome.isCommissioner,
      scope: "self",
    })
  ) {
    return { status: 403, body: { error: "not_your_manager" } };
  }

  // (3) Identity verified — hand off to the controller, which is server-authoritative on the lock.
  const result = await setLineup(
    deps.store,
    {
      managerId: body.managerId,
      periodId: body.periodId,
      starterIds: body.starterIds,
      forfeitConfirmedPlayerIds: body.forfeitConfirmedPlayerIds,
    },
    deps.now,
  );
  if (result.ok) return { status: 200, body: { ok: true } };
  return {
    status: lineupErrorStatus(result.error),
    body: { error: result.error.code, message: result.error.message },
  };
}
