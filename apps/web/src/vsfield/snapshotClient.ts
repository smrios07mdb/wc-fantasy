/**
 * Re-fetch the server-computed "vs the field" snapshot (`GET /api/vsfield` — a Prisma owner read that
 * runs `buildVsField` over the whole league). The live screen calls this on a Realtime change-nudge and
 * on the polling-fallback tick; the browser never reads lineup/match/player rows itself, only this
 * snapshot. `fetch` is injected so it is unit-testable without a network; it returns null on any failure
 * so a slow/failed response never throws into the subscription handler (the caller keeps prior state).
 */
import type { VsFieldView } from "@app/vsfield";

export async function fetchVsField(deps: { fetch: typeof fetch }): Promise<VsFieldView | null> {
  let res: Response;
  try {
    res = await deps.fetch("/api/vsfield", { method: "GET" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const raw: unknown = await res.json().catch(() => null);
  return raw && typeof raw === "object" ? (raw as VsFieldView) : null;
}
