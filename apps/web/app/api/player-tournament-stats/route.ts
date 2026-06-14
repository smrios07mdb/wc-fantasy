/**
 * GET /api/player-tournament-stats?playerId=
 *
 * Returns the player-scoped tournament stats ({ totals, tiles, games }) for the player card's
 * Stats tab. Auth posture mirrors /api/player-box (league-scoped read): 401 no-session,
 * 403 not-a-league-member, NO 403-not-your-manager. Any league member can view any player's stats.
 *
 * Player-scoped only — NO periodId (tournament stats are period-independent), so this route reuses
 * cleanly on the period-less Free Agents / Waivers surfaces later.
 *
 * SERVER-ONLY: the Prisma owner-bypass means the browser never gains direct read of
 * score_player_match or stat_player_match. No new RLS migration needed.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionManager } from "@/lib/auth/manager";
import { handlePlayerTournamentStats } from "@/src/playerTournamentStats/handlePlayerTournamentStats";
import { loadPlayerTournamentStats } from "./loadPlayerTournamentStats";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get("playerId");

  const result = await handlePlayerTournamentStats(
    { resolveManager: getSessionManager, load: loadPlayerTournamentStats },
    playerId,
  );
  return NextResponse.json(result.body, { status: result.status });
}
