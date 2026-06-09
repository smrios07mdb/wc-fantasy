/**
 * Testable orchestration behind `PATCH /api/draft/clock` (framework-agnostic — returns a plain
 * `{ status, body }`, no NextResponse, no Supabase, no Prisma). Commissioner-only gate that
 * updates draft_pick_seconds on the single league row and, when the timer is active, resets the
 * current pick deadline so the new clock takes effect immediately.
 *
 *   1. validate `rawBody.seconds` (integer, 15–600) — 400 on invalid;
 *   2. resolve session → manager outcome;
 *   3. reject 401 (no session) / 403 (not allowlisted / no manager / not commissioner);
 *   4. update the league's draft_pick_seconds;
 *   5. if the draft is active with timer_enabled, reset pick_deadline_at = now + seconds.
 *
 * The thin Next route (`app/api/draft/clock/route.ts`) wires real deps and maps to NextResponse.
 */
import type { SessionManagerOutcome } from "@app/auth";

export interface DraftClockRow {
  id: string;
  status: string;
  timerEnabled: boolean;
}

export interface ClockUpdateHandlerDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  updateLeagueClock: (seconds: number) => Promise<void>;
  findDraft: () => Promise<DraftClockRow | null>;
  updateDraftDeadline: (draftId: string, deadline: Date) => Promise<void>;
  now: Date;
}

export interface ClockUpdateHandlerResult {
  status: number;
  body: unknown;
}

export function parseClockSeconds(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const s = b.seconds;
  if (typeof s !== "number" || !Number.isInteger(s) || s < 15 || s > 600) return null;
  return s;
}

export async function handleClockUpdate(
  rawBody: unknown,
  deps: ClockUpdateHandlerDeps,
): Promise<ClockUpdateHandlerResult> {
  const seconds = parseClockSeconds(rawBody);
  if (seconds === null) return { status: 400, body: { error: "bad_request" } };

  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind !== "ok") return { status: 403, body: { error: "forbidden" } };
  if (!outcome.isCommissioner) return { status: 403, body: { error: "forbidden" } };

  await deps.updateLeagueClock(seconds);

  const draft = await deps.findDraft();
  if (draft?.status === "active" && draft.timerEnabled) {
    const deadline = new Date(deps.now.getTime() + seconds * 1000);
    await deps.updateDraftDeadline(draft.id, deadline);
  }

  return { status: 200, body: { draftPickSeconds: seconds } };
}
