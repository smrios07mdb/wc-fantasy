/**
 * Server-side data loader for the set-lineup screen — the THIN Prisma edge that assembles the
 * authoritative {@link SetLineupState} the page hydrates. It reads the session manager's active 15-man
 * squad (roster_player, dropped_at IS NULL), the editable windows (the current OPEN period + upcoming
 * PENDING ones — the "set multiple lineups in advance" surface), and the manager's saved `lineup_slot`
 * rows per period (→ the starting XI + the lock-on-play projection). Like `@app/draft`'s loader this IO
 * edge has no unit test (it needs a live DB); `tsc` + the pure-logic suites cover the shapes it produces.
 */
import { prisma } from "@app/db";
import { sortByPeriodOrder } from "@app/shared";
import {
  defaultStarterIds,
  resolveKickoffByPlayer,
  resolveOpponentByPlayer,
} from "../../src/lineup/view";
import type { LineupPlayer, PeriodLineup, SetLineupState } from "../../src/lineup/types";

/** Load the set-lineup snapshot for `sessionManagerId`, or null if the manager has no squad / windows. */
export async function loadLineup(sessionManagerId: string): Promise<SetLineupState | null> {
  const manager = await prisma.manager.findUnique({
    where: { id: sessionManagerId },
    select: { id: true, leagueId: true, displayName: true, league: { select: { timezone: true } } },
  });
  if (!manager) return null;

  const [rosterRows, periodRows] = await Promise.all([
    prisma.rosterPlayer.findMany({
      where: { managerId: sessionManagerId, droppedAt: null },
      select: {
        player: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            position: true,
            // teamId drives the per-player kickoff resolution (team → this period's fixture).
            teamId: true,
            // player.country DB column is never written by ingestion; country comes from the
            // fifa_team join, matching how loadDraftRoom.toPlayer derives it.
            team: { select: { name: true } },
          },
        },
      },
    }),
    // The editable windows: the current OPEN period + upcoming PENDING ones, soonest first.
    prisma.period.findMany({
      where: { leagueId: manager.leagueId, status: { in: ["open", "pending"] } },
      orderBy: [{ opensAt: "asc" }, { label: "asc" }],
      select: { id: true, label: true, status: true, closesAt: true },
    }),
  ]);

  const squad: LineupPlayer[] = rosterRows.map((r) => ({
    id: r.player.id,
    displayName: r.player.displayName,
    firstName: r.player.firstName,
    lastName: r.player.lastName,
    position: r.player.position,
    country: r.player.team?.name ?? null,
  }));
  // The team link each squad player resolves his fixture through (kept out of the LineupPlayer the client
  // renders — it's only needed here to map player → this period's kickoff + opponent).
  const squadTeams = rosterRows.map((r) => ({ id: r.player.id, teamId: r.player.teamId }));

  const periodIds = periodRows.map((p) => p.id);
  const [slotRows, matchRows] = await Promise.all([
    periodIds.length
      ? prisma.lineupSlot.findMany({
          where: { managerId: sessionManagerId, periodId: { in: periodIds } },
          select: { periodId: true, playerId: true, isStarter: true, lockedAt: true },
        })
      : Promise.resolve([]),
    // Each period's fixtures — drives both the per-player kickoff (= lock/sub deadline) and the
    // per-player opponent label. homeTeam/awayTeam names are the flag-resolver inputs (same source
    // as player.country on the roster side — fifa_team.name). One read, two outputs.
    periodIds.length
      ? prisma.fifaMatch.findMany({
          where: { periodId: { in: periodIds } },
          select: {
            periodId: true,
            homeTeamId: true,
            awayTeamId: true,
            kickoffAt: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const unorderedPeriods: PeriodLineup[] = periodRows.map((p) => {
    const slots = slotRows.filter((s) => s.periodId === p.id);
    const savedStarters = slots.filter((s) => s.isStarter).map((s) => s.playerId);
    const periodMatches = matchRows
      .filter((m) => m.periodId === p.id)
      .map((m) => ({
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        kickoffAt: m.kickoffAt.toISOString(),
        homeTeamName: m.homeTeam?.name ?? null,
        awayTeamName: m.awayTeam?.name ?? null,
      }));
    return {
      periodId: p.id,
      label: p.label,
      status: p.status,
      closesAt: p.closesAt ? p.closesAt.toISOString() : null,
      // A period the manager hasn't set yet starts from a legal default 4-4-2 he can adjust.
      starterIds: savedStarters.length > 0 ? savedStarters : defaultStarterIds(squad),
      locks: slots
        .filter((s) => s.lockedAt !== null)
        .map((s) => ({ playerId: s.playerId, isStarter: s.isStarter })),
      // Per-player kickoff = his team's fixture kickoff in THIS period (ISO), or null when his team
      // isn't playing yet (knockout TBD). The client formats it in the league tz as the lock/sub deadline.
      kickoffByPlayer: resolveKickoffByPlayer(squadTeams, periodMatches),
      // Per-player opponent = the OTHER side of the same match row. Null for TBD/unplaying teams.
      // Resolved from the same periodMatches array — kickoff and opponent always reference the same row.
      opponentByPlayer: resolveOpponentByPlayer(squadTeams, periodMatches),
    };
  });

  // Order the selector by canonical tournament progression (MD1…MD3, R32, R16, QF, SF, Final) — the
  // single source in @app/shared. NOT alphabetical (which mis-sorts Final/QF/R16/R32/SF) and NOT by
  // opens_at (null until fixtures sync → silently falls back to the alphabetical bug).
  const periods = sortByPeriodOrder(unorderedPeriods, (p) => p.label);
  const active = periods.find((p) => p.status === "open") ?? periods[0];
  return {
    sessionManagerId,
    displayName: manager.displayName,
    squad,
    periods,
    activePeriodId: active ? active.periodId : "",
    timezone: manager.league?.timezone ?? "UTC",
  };
}
