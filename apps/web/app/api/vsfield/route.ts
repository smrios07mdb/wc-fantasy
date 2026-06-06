/**
 * GET /api/vsfield — the authenticated, server-computed "vs the field" snapshot, read-only. This is the
 * endpoint the live screen REFETCHES on a Realtime change-nudge (and on the polling-fallback tick), so
 * the browser never reads lineup/match/player rows directly — only the server-computed whole-field
 * snapshot. Identity is the Prompt-07 resolve gate (401 no-session / 403 not-a-league-member); it is a
 * LEAGUE-SCOPED read, so there is NO 403-not-your-manager (you see the whole field). The gate + status
 * mapping live in the framework-agnostic `handleVsField` (unit-tested); this wrapper just maps to a
 * NextResponse. The read itself (loadVsField) is the Prisma owner (RLS-bypassing).
 */
import { NextResponse } from "next/server";
import { getSessionManager } from "@/lib/auth/manager";
import { handleVsField } from "@/src/vsfield/handleVsField";
import { loadVsField } from "@/app/vsfield/loadVsField";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await handleVsField({ resolveManager: getSessionManager, load: loadVsField });
  return NextResponse.json(result.body, { status: result.status });
}
