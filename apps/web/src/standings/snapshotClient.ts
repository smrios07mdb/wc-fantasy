/**
 * Re-fetch the server-computed standings snapshot (`GET /api/standings` — a Prisma owner read that runs
 * `loadStandings` over the whole league). The live screen calls this on a Realtime change-nudge and on
 * the visibility-gated polling-fallback tick; the browser never reads period/score rows itself, only
 * this snapshot (Theme F). `fetch` is injected so it is unit-testable without a network; it returns null
 * on any failure so a slow/failed response never throws into the subscription handler (the caller keeps
 * prior state). Mirrors `fetchPlayoffs` / `fetchVsField`.
 */
import type { StandingsView } from "@app/recompute";

export async function fetchStandings(deps: { fetch: typeof fetch }): Promise<StandingsView | null> {
  let res: Response;
  try {
    res = await deps.fetch("/api/standings", { method: "GET" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const raw: unknown = await res.json().catch(() => null);
  return raw && typeof raw === "object" ? (raw as StandingsView) : null;
}
