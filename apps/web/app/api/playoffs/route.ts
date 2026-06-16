/**
 * GET /api/playoffs — the authenticated, server-computed guillotine snapshot, read-only. This is the
 * endpoint the live screen REFETCHES on a Realtime change-nudge (and on the visibility-gated polling-
 * fallback tick), so the browser never reads playoff/lineup/match/player rows directly — only the
 * server-computed whole-field snapshot (Theme F). Recomputed on EVERY call (force-dynamic, no cache): the
 * reduced-pitch live lock+pts and the manager-names map are recomposed per refetch.
 *
 * Identity is the Prompt-07 resolve gate (401 no-session / 403 not-a-league-member); it is a LEAGUE-SCOPED
 * read, so there is NO 403-not-your-manager (you see the whole field). The gate lives in the
 * framework-agnostic `handlePlayoffs` (unit-tested); this wrapper just maps to a NextResponse. The read
 * itself (loadPlayoffs) is the Prisma owner (RLS-bypassing). Mirrors `GET /api/vsfield`.
 */
import { NextResponse } from "next/server";
import { getSessionManager } from "@/lib/auth/manager";
import { handlePlayoffs } from "@/src/playoffs/handlePlayoffs";
import { loadPlayoffs } from "@/app/playoffs/loadPlayoffs";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await handlePlayoffs({ resolveManager: getSessionManager, load: loadPlayoffs });
  return NextResponse.json(result.body, { status: result.status });
}
