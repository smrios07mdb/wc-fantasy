/**
 * The testable orchestration behind `POST/GET /api/pool/pick` (framework-agnostic — returns a plain
 * `{ status, body }`, no NextResponse / Supabase / Prisma). It is the `/api/faab/bid` template:
 *
 *   1. resolve the session → manager (injected; the edge reads Supabase + Prisma);
 *   2. reject 401 (no session) / 403 (not allowlisted / no manager / not your manager) — BEFORE any DB
 *      write — submitting a pick is a strict SELF op (scope "self"), so a commissioner may NOT pick for
 *      another manager;
 *   3. only then validate (the pure @app/pool guard: locked? DRAW-on-knockout?) + upsert.
 *
 * Server time (`deps.now`) is authoritative for the lock, exactly like the draft `pick_deadline_at`.
 * The READ path enforces anti-copying — others' picks are visible only after kickoff — in the store
 * query (§3), not in RLS (no clock in RLS).
 */
import { validatePickSubmission, type PoolPickError } from "@app/pool";
import { canActAsManager, type SessionManagerOutcome } from "@app/auth";
import type { PoolPrediction } from "@app/shared";
import type { PoolPickStore } from "./store";

export interface PoolPickDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: PoolPickStore;
  now: Date;
}

export interface PoolHandlerResult {
  status: number;
  body: unknown;
}

export interface SubmitPickBody {
  managerId: string;
  matchId: string;
  prediction: PoolPrediction;
}

/** A submission rejection is a domain conflict with the rules (identity already verified) → 409. */
function pickErrorResult(error: PoolPickError): PoolHandlerResult {
  return { status: 409, body: { error: error.code, message: error.message } };
}

function fail(status: number, error: string): { ok: false; result: PoolHandlerResult } {
  return { ok: false, result: { status, body: { error } } };
}

type SelfResult = { ok: true; managerId: string } | { ok: false; result: PoolHandlerResult };

/** Resolve the session manager, mapping the non-ok outcomes to 401/403 BEFORE any store access. */
async function resolveSelf(deps: PoolPickDeps): Promise<SelfResult> {
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return fail(401, "no_session");
  if (outcome.kind === "not-allowlisted") return fail(403, "not_allowlisted");
  if (outcome.kind === "no-manager") return fail(403, "no_manager");
  return { ok: true, managerId: outcome.manager.id };
}

/** resolveSelf + a strict self-match on the target manager (no commissioner override — scope "self"). */
async function gateSelf(deps: PoolPickDeps, targetManagerId: string): Promise<SelfResult> {
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return fail(401, "no_session");
  if (outcome.kind === "not-allowlisted") return fail(403, "not_allowlisted");
  if (outcome.kind === "no-manager") return fail(403, "no_manager");
  if (
    !canActAsManager({
      sessionManagerId: outcome.manager.id,
      targetManagerId,
      isCommissioner: outcome.isCommissioner,
      scope: "self",
    })
  ) {
    return fail(403, "not_your_manager");
  }
  return { ok: true, managerId: outcome.manager.id };
}

export async function handleSubmitPick(
  deps: PoolPickDeps,
  body: SubmitPickBody,
): Promise<PoolHandlerResult> {
  const g = await gateSelf(deps, body.managerId);
  if (!g.ok) return g.result;

  const leagueId = await deps.store.getManagerLeagueId(g.managerId);
  if (!leagueId) return { status: 404, body: { error: "no_manager" } };

  const facts = await deps.store.getMatchFacts(body.matchId);
  if (!facts) return { status: 404, body: { error: "unknown_match", matchId: body.matchId } };

  const error = validatePickSubmission(body.prediction, facts, deps.now);
  if (error) return pickErrorResult(error);

  // Write with the SESSION manager id (gate proved it equals body.managerId) — defence in depth.
  const pick = await deps.store.upsertPick({
    leagueId,
    managerId: g.managerId,
    matchId: body.matchId,
    prediction: body.prediction,
    now: deps.now,
  });
  return { status: 200, body: { ok: true, pick } };
}

export async function handleReadPicks(deps: PoolPickDeps): Promise<PoolHandlerResult> {
  const g = await resolveSelf(deps);
  if (!g.ok) return g.result;

  const leagueId = await deps.store.getManagerLeagueId(g.managerId);
  if (!leagueId) return { status: 404, body: { error: "no_manager" } };

  const picks = await deps.store.readVisiblePicks({
    leagueId,
    managerId: g.managerId,
    now: deps.now,
  });
  return { status: 200, body: { ok: true, picks } };
}
