/**
 * GET /api/standings — authenticated, server-computed standings snapshot, read-only. This is the
 * endpoint the live screen REFETCHES on a Realtime change-nudge (and on the visibility-gated polling-
 * fallback tick), so the browser never reads period/score rows directly — only this server-computed
 * whole-field snapshot (Theme F). Recomputed on EVERY call (force-dynamic, no cache): both tabs are
 * re-derived from `score_manager_period` per refetch.
 *
 * Identity is the Prompt-07 resolve gate (401 no-session / 403 not-a-league-member); it is a LEAGUE-
 * SCOPED read, so NO 403-not-your-manager (you see the whole field). The gate lives in the framework-
 * agnostic `handleStandings` (unit-tested); this wrapper just maps NextResponse. The read itself
 * (loadStandings) is a Prisma owner read (RLS-bypassing). Mirrors `GET /api/vsfield`.
 */
import { NextResponse } from "next/server";
import { getSessionManager } from "@/lib/auth/manager";
import { handleStandings } from "@/src/standings/handleStandings";
import { loadStandings } from "@/app/standings/loadStandings";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await handleStandings({ resolveManager: getSessionManager, load: loadStandings });
  return NextResponse.json(result.body, { status: result.status });
}
