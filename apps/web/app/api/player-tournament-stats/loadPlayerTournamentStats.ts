/**
 * Server-side data loader for GET /api/player-tournament-stats — THIN Prisma edge that reads a
 * player's COMPLETED-match appearances (stat_player_match joined to fifa_match + period) plus the
 * matching score_player_match points, maps them through the pure `toTournamentRows` adapter, and
 * feeds `buildPlayerTournamentStats`. Returns the position-aware `{ totals, tiles, games }`.
 *
 * Player-scoped only — NO periodId. Tournament stats are period-independent (one private league per
 * tournament, ARCHITECTURE §4), so this loader reuses cleanly on the period-less Free Agents /
 * Waivers surfaces later. The opponent + every flag come from the OTHER fifa_team on each match
 * (the P34 nation-from-team pattern); `player.country` is never read.
 *
 * SERVER-ONLY: the Prisma owner-bypass means the browser never gains direct read of
 * score_player_match or stat_player_match. No new RLS migration needed (same posture as
 * /api/player-box and /api/vsfield).
 */
import "server-only";
import { prisma } from "@app/db";
import {
  buildPlayerTournamentStats,
  type PlayerTournamentStats,
} from "@/src/playerTournamentStats/buildPlayerTournamentStats";
import { toTournamentRows } from "@/src/playerTournamentStats/toTournamentRows";

export async function loadPlayerTournamentStats(
  playerId: string,
): Promise<PlayerTournamentStats | null> {
  // Player identity — position + own team (used only to orient home/away per match).
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, position: true, teamId: true },
  });
  if (!player) return null;

  // Resolve the player's national team once — it both orients home/away AND gates the read below.
  const teamId = player.teamId;

  const [statRows, scoreRows] = await Promise.all([
    // Completed matches the player actually appeared in (has a stat_player_match row), AND that the
    // player's TEAM actually played in. The team gate is defense-in-depth: a WC player belongs to
    // exactly one national team and can only appear in that team's matches, so it never hides
    // legitimate data — but it rejects phantom stub stat_player_match rows written for matches the
    // player's team isn't on (the one-off 06-13 backfill incident). Null team (shouldn't happen)
    // → `{ in: [] }` yields zero matches without throwing.
    prisma.statPlayerMatch.findMany({
      where: {
        playerId,
        match: {
          status: "completed",
          ...(teamId
            ? { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] }
            : { id: { in: [] } }),
        },
      },
      select: {
        matchId: true,
        minutesPlayed: true,
        goals: true,
        assists: true,
        keyPasses: true,
        tacklesWon: true,
        dribblesCompleted: true,
        saves: true,
        shotsOnTarget: true,
        match: {
          select: {
            id: true,
            kickoffAt: true,
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            period: { select: { label: true } },
          },
        },
      },
    }),
    // Points for the same completed matches (left-joined in JS by matchId; absent → 0).
    prisma.scorePlayerMatch.findMany({
      where: { playerId, match: { status: "completed" } },
      select: { matchId: true, points: true },
    }),
  ]);

  const pointsByMatch = new Map(scoreRows.map((s) => [s.matchId, s.points]));

  const rows = toTournamentRows({
    playerTeamId: teamId,
    statRows,
    pointsByMatch,
  });

  return buildPlayerTournamentStats({ position: player.position, rows });
}
