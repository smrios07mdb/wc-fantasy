/**
 * Server-side data loader for GET /api/player-box — the THIN Prisma edge that reads
 * score_player_match + stat_player_match + player identity + fixture for a given (periodId, playerId)
 * and feeds buildPlayerBox. The viewer's leagueId is used only for the season aggregate; the
 * score/stat/fixture queries are period-scoped (periods are league-scoped).
 *
 * NO RLS migration needed: this route is SERVER-ONLY (Prisma owner bypass, same as loadVsField).
 * The browser never gains direct read of score_player_match or stat_player_match.
 */
import "server-only";
import { prisma } from "@app/db";
import { buildPlayerBox } from "@app/player-box";
import type { PlayerBoxView } from "@app/player-box";

export async function loadPlayerBox(
  viewerManagerId: string,
  periodId: string,
  playerId: string,
): Promise<PlayerBoxView | null> {
  // Resolve the viewer's leagueId for the season aggregate.
  const manager = await prisma.manager.findUnique({
    where: { id: viewerManagerId },
    select: { leagueId: true },
  });
  if (!manager) return null;

  // Player identity — name, position, and nation from the fifa_team join.
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      displayName: true,
      firstName: true,
      lastName: true,
      position: true,
      teamId: true,
      // player.country is never populated by ingestion; nation comes from the fifa_team name
      // (the P34 pattern reused in loadLineup.ts: team.name → player.country on the client).
      team: { select: { name: true } },
    },
  });
  if (!player) return null;

  const now = new Date();

  const [scoreRow, statRow, fixtureRow, seasonAgg] = await Promise.all([
    // score_player_match for this player's match in the period
    prisma.scorePlayerMatch.findFirst({
      where: { playerId, match: { periodId } },
      select: {
        points: true,
        breakdownJson: true,
        match: {
          select: {
            status: true,
            kickoffAt: true,
            homeTeamId: true,
            awayTeamId: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    }),
    // stat_player_match for the same match
    prisma.statPlayerMatch.findFirst({
      where: { playerId, match: { periodId } },
      select: {
        minutesPlayed: true,
        goals: true,
        assists: true,
        keyPasses: true,
        dribblesAttempted: true,
        dribblesCompleted: true,
        duelsWon: true,
        duelsLost: true,
        passesTotal: true,
        passesAccurate: true,
        longBallsTotal: true,
        longBallsAccurate: true,
        wasFouled: true,
        clearances: true,
        interceptions: true,
        tacklesWon: true,
        blockedShots: true,
        saves: true,
        savesInsideBox: true,
        punches: true,
        highClaims: true,
        possessionLost: true,
      },
    }),
    // Fixture context: if no score row yet, we still need the fixture to show match status.
    prisma.fifaMatch.findFirst({
      where: {
        periodId,
        OR: [{ homeTeamId: player.teamId ?? "" }, { awayTeamId: player.teamId ?? "" }],
      },
      select: {
        status: true,
        kickoffAt: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    }),
    // Season total: cheap aggregate across all this player's scored periods in the league.
    prisma.scorePlayerMatch.aggregate({
      where: { playerId, match: { period: { leagueId: manager.leagueId } } },
      _sum: { points: true },
    }),
  ]);

  // Prefer the match from the score row (confirmed the player appeared); fall back to the fixture
  // lookup (so the modal still shows the fixture context for not-yet-played players).
  const fixture = scoreRow?.match ?? fixtureRow;

  const view = buildPlayerBox({
    player: {
      id: player.id,
      displayName: player.displayName,
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      nation: player.team?.name ?? null,
      teamId: player.teamId,
    },
    fixture: fixture
      ? {
          kickoffAt: fixture.kickoffAt,
          status: fixture.status,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          homeTeamName: fixture.homeTeam?.name ?? "",
          awayTeamName: fixture.awayTeam?.name ?? "",
        }
      : null,
    score: scoreRow
      ? {
          points: scoreRow.points,
          breakdown: scoreRow.breakdownJson as {
            total: number;
            lines: Array<{ category: string; points: number; detail?: string }>;
          },
        }
      : null,
    stats: statRow
      ? {
          minutesPlayed: statRow.minutesPlayed,
          goals: statRow.goals,
          assists: statRow.assists,
          keyPasses: statRow.keyPasses,
          dribblesAttempted: statRow.dribblesAttempted,
          dribblesCompleted: statRow.dribblesCompleted,
          duelsWon: statRow.duelsWon,
          duelsLost: statRow.duelsLost,
          passesTotal: statRow.passesTotal,
          passesAccurate: statRow.passesAccurate,
          longBallsTotal: statRow.longBallsTotal,
          longBallsAccurate: statRow.longBallsAccurate,
          wasFouled: statRow.wasFouled,
          clearances: statRow.clearances,
          interceptions: statRow.interceptions,
          tacklesWon: statRow.tacklesWon,
          blockedShots: statRow.blockedShots,
          saves: statRow.saves,
          savesInsideBox: statRow.savesInsideBox,
          punches: statRow.punches,
          highClaims: statRow.highClaims,
          possessionLost: statRow.possessionLost,
        }
      : null,
    now,
  });

  // Inject season total — cheap aggregate already computed above.
  const seasonTotal = seasonAgg._sum.points;
  return {
    ...view,
    season: seasonTotal !== null ? { total: seasonTotal } : null,
  };
}
