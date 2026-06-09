/**
 * Framework-agnostic handler for POST /api/draft/queue — replaces the manager's full queue atomically.
 * The thin Next route wires real Prisma/Supabase deps; tests inject plain vi.fn() mocks.
 *
 *   1. resolve the session → manager (401 / 403 before any DB access);
 *   2. reject if the draft is already complete (cannot queue into a finished draft);
 *   3. validate that every supplied playerId exists in the Player table;
 *   4. atomically delete + re-insert the queue rows (replace-whole semantics).
 */
import type { SessionManagerOutcome } from "@app/auth";

export interface QueueRequestBody {
  playerIds: string[];
}

export interface QueueHandlerResult {
  status: number;
  body: unknown;
}

export interface QueueHandlerDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  /** Returns the current draft status string, or null when no draft exists. */
  getDraftStatus: () => Promise<string | null>;
  /** Returns true iff every id in the list resolves to a real Player row. */
  playerIdsExist: (ids: string[]) => Promise<boolean>;
  /** Atomically replaces all draft_queue rows for the manager with the new ordered list. */
  replaceQueue: (managerId: string, playerIds: string[]) => Promise<void>;
}

export async function handleQueue(
  deps: QueueHandlerDeps,
  body: QueueRequestBody,
): Promise<QueueHandlerResult> {
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind !== "ok") return { status: 403, body: { error: "forbidden" } };

  const draftStatus = await deps.getDraftStatus();
  if (draftStatus === "complete") return { status: 400, body: { error: "DRAFT_COMPLETE" } };

  if (body.playerIds.length > 0) {
    const allExist = await deps.playerIdsExist(body.playerIds);
    if (!allExist) return { status: 400, body: { error: "INVALID_PLAYER" } };
  }

  await deps.replaceQueue(outcome.manager.id, body.playerIds);
  return { status: 200, body: { queue: body.playerIds } };
}
