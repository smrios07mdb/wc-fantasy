/**
 * The testable orchestration behind `POST /api/draft/pick` (framework-agnostic — returns a plain
 * `{ status, body }`, no NextResponse, no Supabase, no Prisma). This is the FIRST authenticated entry
 * point: it adds ONLY identity on top of the unchanged Prompt-06 controller.
 *
 *   1. resolve the session → manager (injected; the edge reads Supabase + Prisma);
 *   2. reject 401 (no session) / 403 (not allowlisted / no manager / not your manager) — BEFORE the
 *      controller is ever touched;
 *   3. only then call `submitPick(...)` UNCHANGED — turn/ownership/legality remain its job.
 *
 * The thin Next route (`app/api/draft/pick/route.ts`) wires the real deps and maps the result to a
 * NextResponse. Keeping the IO injected makes this unit-testable with a mocked session + a memory store.
 */
import {
  submitPick,
  DraftError,
  DraftNotFoundError,
  UnknownPlayerError,
  type DraftStore,
  type PickResult,
} from "@app/draft";
import { canActAsManager, type SessionManagerOutcome } from "@app/auth";

export interface PickRequestBody {
  draftId: string;
  managerId: string;
  playerId: string;
}

export interface PickHandlerResult {
  status: number;
  body: unknown;
}

export interface PickHandlerDeps {
  /** Reads the request's Supabase session → the league manager outcome (the edge's IO). */
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: DraftStore;
  now: Date;
}

/** Map a controller-domain rejection to a status. These are NOT auth failures — the caller's identity
 *  was verified; the controller rejected on its own rules (turn/availability/legality/conflict). */
function draftErrorStatus(error: DraftError): number {
  if (error instanceof DraftNotFoundError || error instanceof UnknownPlayerError) return 404;
  return 409; // not-your-turn / unavailable / position-full / not-active / conflict / not-ready
}

export async function handleDraftPick(
  deps: PickHandlerDeps,
  body: PickRequestBody,
): Promise<PickHandlerResult> {
  // (1) Identity, resolved at the edge. Reject 401/403 BEFORE the controller is touched.
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind === "not-allowlisted")
    return { status: 403, body: { error: "not_allowlisted" } };
  if (outcome.kind === "no-manager") return { status: 403, body: { error: "no_manager" } };

  // (2) Authz: a draft pick is a strict self op (scope "self") — a commissioner may NOT pick for others.
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

  // (3) Identity verified — hand off to the UNCHANGED Prompt-06 controller.
  try {
    const result: PickResult = await submitPick(
      deps.store,
      body.draftId,
      body.managerId,
      body.playerId,
      deps.now,
    );
    return { status: 200, body: result };
  } catch (error) {
    if (error instanceof DraftError) {
      return {
        status: draftErrorStatus(error),
        body: { error: error.name, message: error.message },
      };
    }
    throw error;
  }
}
