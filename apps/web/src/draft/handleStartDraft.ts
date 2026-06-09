/**
 * Testable orchestration behind `POST /api/draft/start` (framework-agnostic — returns a plain
 * `{ status, body }`, no NextResponse, no Supabase, no Prisma). Commissioner-only gate before
 * the unchanged `startDraft` controller.
 *
 *   1. resolve session → manager outcome;
 *   2. reject 401 (no session) / 403 (not allowlisted / no manager / not commissioner);
 *   3. find the single draft row — 409 if none;
 *   4. call `startDraft(store, draft.id, now)` unchanged.
 *
 * The thin Next route (`app/api/draft/start/route.ts`) wires real deps and maps to NextResponse.
 */
import { startDraft, type DraftStore } from "@app/draft";
import type { SessionManagerOutcome } from "@app/auth";

export interface StartHandlerDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: DraftStore;
  findDraft: () => Promise<{ id: string; status: string } | null>;
  now: Date;
}

export interface StartHandlerResult {
  status: number;
  body: unknown;
}

export async function handleStartDraft(deps: StartHandlerDeps): Promise<StartHandlerResult> {
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind !== "ok") return { status: 403, body: { error: "forbidden" } };
  if (!outcome.isCommissioner) return { status: 403, body: { error: "forbidden" } };

  const draft = await deps.findDraft();
  if (!draft) return { status: 409, body: { error: "no_draft" } };

  const result = await startDraft(deps.store, draft.id, deps.now);
  return { status: 200, body: { started: result.started } };
}
