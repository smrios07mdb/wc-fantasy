/**
 * GET /api/player-box?periodId=&playerId=
 *
 * Returns the PlayerBoxView for a given player+period combination. Auth posture mirrors
 * /api/vsfield (league-scoped read): 401 no-session, 403 not-a-league-member, NO 403-not-your-
 * manager. Any league member can view any player's score breakdown (all-play-all visibility).
 *
 * SERVER-ONLY: the Prisma owner-bypass means the browser never gains direct read of
 * score_player_match or stat_player_match. No new RLS migration needed.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionManager } from "@/lib/auth/manager";
import { handlePlayerBox } from "@/src/playerBox/handlePlayerBox";
import { loadPlayerBox } from "./loadPlayerBox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const periodId = searchParams.get("periodId");
  const playerId = searchParams.get("playerId");

  const result = await handlePlayerBox(
    { resolveManager: getSessionManager, load: loadPlayerBox },
    periodId,
    playerId,
  );
  return NextResponse.json(result.body, { status: result.status });
}
