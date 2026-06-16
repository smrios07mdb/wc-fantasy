/**
 * Re-fetch the server-computed playoff snapshot (`GET /api/playoffs` — a Prisma owner read that runs
 * `loadPlayoffs` over the whole league). The live screen calls this on a Realtime change-nudge and on the
 * visibility-gated polling-fallback tick; the browser never reads playoff/lineup/match/player rows itself,
 * only this snapshot (Theme F). `fetch` is injected so it is unit-testable without a network; it returns
 * null on any failure so a slow/failed response never throws into the subscription handler (the caller
 * keeps prior state). Mirrors `fetchVsField`.
 */
import type { PlayoffsView } from "@/app/playoffs/loadPlayoffs";

export async function fetchPlayoffs(deps: { fetch: typeof fetch }): Promise<PlayoffsView | null> {
  let res: Response;
  try {
    res = await deps.fetch("/api/playoffs", { method: "GET" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const raw: unknown = await res.json().catch(() => null);
  return raw && typeof raw === "object" ? (raw as PlayoffsView) : null;
}
