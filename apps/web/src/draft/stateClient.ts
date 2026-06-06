/**
 * Re-fetch the AUTHORITATIVE draft pointer/status from the server (`GET /api/draft/state` — a Prisma
 * owner read, RLS-bypassing). The draft room normally folds the Realtime broadcast row in place; this is
 * the fallback for when a `draft` broadcast payload is PARTIAL (re-syncs the pointer but drops `status`),
 * so the lobby↔active view always re-derives from the authoritative `draft.status` rather than stalling.
 * `fetch` is injected so it is unit-testable without a network; the response is snake_case, reducer-shaped.
 */
import type { DraftRowChange } from "./reducer";

export async function fetchDraftState(deps: {
  fetch: typeof fetch;
}): Promise<DraftRowChange | null> {
  let res: Response;
  try {
    res = await deps.fetch("/api/draft/state", { method: "GET" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const raw: unknown = await res.json().catch(() => null);
  return raw && typeof raw === "object" ? (raw as DraftRowChange) : null;
}
