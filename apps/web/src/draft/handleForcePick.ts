/**
 * Testable orchestration behind `POST /api/draft/force-pick` (framework-agnostic — returns a plain
 * `{ status, body }`, no NextResponse, no Supabase, no Prisma). Commissioner-only gate before
 * `forceAutopick`, which bypasses all deadline checks.
 *
 *   1. resolve session → manager outcome;
 *   2. reject 401 (no session) / 403 (not allowlisted / no manager / not commissioner);
 *   3. find the active draft row — 409 if none;
 *   4. call `forceAutopick(store, draft.id, now)` unchanged.
 *
 * The thin Next route (`app/api/draft/force-pick/route.ts`) wires real deps and maps to NextResponse.
 */
import { forceAutopick, type DraftStore } from "@app/draft";
import type { SessionManagerOutcome } from "@app/auth";

export interface ForcePickHandlerDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: DraftStore;
  findActiveDraft: () => Promise<{ id: string } | null>;
  now: Date;
}

export interface ForcePickHandlerResult {
  status: number;
  body: unknown;
}

export async function handleForcePick(deps: ForcePickHandlerDeps): Promise<ForcePickHandlerResult> {
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind !== "ok") return { status: 403, body: { error: "forbidden" } };
  if (!outcome.isCommissioner) return { status: 403, body: { error: "forbidden" } };

  const draft = await deps.findActiveDraft();
  if (!draft) return { status: 409, body: { error: "no_active_draft" } };

  const result = await forceAutopick(deps.store, draft.id, deps.now);
  return { status: 200, body: { acted: result.acted, reason: result.reason } };
}
