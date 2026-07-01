/**
 * Thin owner-bypass loader for the commissioner console (`/commish`). It reads through the RLS-bypassing
 * Prisma owner client (like every web loader) and shapes the render props via the pure helpers in
 * apps/web/src/commish/commishView.ts.
 *
 * Everything here is READ-ONLY. The view-as inspector is a read-only inspector, NOT session impersonation:
 * it reuses EXISTING league-scoped reads (loadStandings for record+seed, manager.faabBudget, a contained
 * rosterPlayer read) for a selected manager, and the `managers.find` guard confines it to the commissioner's
 * OWN league — an out-of-league managerId simply yields no inspector.
 */
import { prisma } from "@app/db";
import { POSITIONS, type Position, type RatingSource } from "@app/shared";
import { pickRating } from "@app/recompute";
import { loadStandings } from "@/app/standings/loadStandings";
import {
  toAuditView,
  toInspector,
  type CommishConsoleView,
  type CommishManagerOption,
  type CommishRosterPlayer,
  type CommishStatCorrectionsView,
  type CommishStatPlayerOption,
} from "@/src/commish/commishView";

/** How many recent audit rows the console renders (empty until later write slices populate the ledger). */
const AUDIT_LIMIT = 50;

/** An empty Stat-corrections view (used while inspecting a manager via `?as=`, where the tabs are hidden). */
const EMPTY_STAT_CORRECTIONS: CommishStatCorrectionsView = {
  matches: [],
  selectedMatchId: null,
  selectedPlayerId: null,
  players: [],
  current: null,
};

export async function loadCommish(
  commishManagerId: string,
  selectedManagerId?: string | null,
  statSel?: { matchId?: string | null; playerId?: string | null },
  now: Date = new Date(),
): Promise<CommishConsoleView | null> {
  const me = await prisma.manager.findUnique({
    where: { id: commishManagerId },
    select: { id: true, leagueId: true, displayName: true },
  });
  if (!me) return null;
  const leagueId = me.leagueId;

  const [league, managerRows, periodCount, frozenPeriodCount, auditEntryCount, auditRows] =
    await Promise.all([
      prisma.league.findUnique({ where: { id: leagueId }, select: { name: true } }),
      prisma.manager.findMany({
        where: { leagueId },
        select: { id: true, displayName: true, isCommissioner: true, faabBudget: true },
        orderBy: { displayName: "asc" },
      }),
      prisma.period.count({ where: { leagueId } }),
      prisma.period.count({ where: { leagueId, frozenAt: { not: null } } }),
      prisma.commishAudit.count({ where: { leagueId } }),
      prisma.commishAudit.findMany({
        where: { leagueId },
        orderBy: { createdAt: "desc" },
        take: AUDIT_LIMIT,
        select: {
          id: true,
          actionType: true,
          summary: true,
          detail: true,
          reason: true,
          delta: true,
          reversible: true,
          reversedAt: true,
          createdAt: true,
          actor: { select: { displayName: true, email: true } },
        },
      }),
    ]);

  const managers: CommishManagerOption[] = managerRows.map((m) => ({
    managerId: m.id,
    displayName: m.displayName,
    isCommissioner: m.isCommissioner,
    isViewer: m.id === commishManagerId,
  }));

  const audit = auditRows.map((r) => toAuditView(r, now));

  const inspector = selectedManagerId
    ? await buildInspector(commishManagerId, selectedManagerId, managers, managerRows)
    : null;

  // Stat-corrections tab data is built only when NOT inspecting a manager (the `?as=` view hides the tabs).
  const statCorrections = selectedManagerId
    ? EMPTY_STAT_CORRECTIONS
    : await buildStatCorrections(statSel?.matchId ?? null, statSel?.playerId ?? null);

  return {
    leagueId,
    leagueName: league?.name ?? "League",
    commissionerName: me.displayName,
    status: {
      managerCount: managerRows.length,
      periodCount,
      frozenPeriodCount,
      auditEntryCount,
    },
    audit,
    managers,
    inspector,
    statCorrections,
  };
}

/**
 * Assemble the Stat-corrections tab (Thread 2): the match picker (all scoreable fixtures), the selected match's
 * two squads, and the current stored correction state for the selected (match, player). All owner-bypass reads;
 * the resolved rating reuses the SAME pure `pickRating` the scoring pipeline uses (manual override wins). An
 * out-of-match selection is silently narrowed to "none" (the write endpoints validate again server-side).
 */
async function buildStatCorrections(
  matchId: string | null,
  playerId: string | null,
): Promise<CommishStatCorrectionsView> {
  const matchRows = await prisma.fifaMatch.findMany({
    select: {
      id: true,
      kickoffAt: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      period: { select: { label: true, frozenAt: true } },
    },
    orderBy: { kickoffAt: "asc" },
  });
  const matches = matchRows.map((m) => ({
    matchId: m.id,
    label: `${m.homeTeam?.name ?? "TBD"} vs ${m.awayTeam?.name ?? "TBD"}`,
    periodLabel: m.period?.label ?? null,
    periodFrozen: m.period?.frozenAt != null,
    kickoffIso: m.kickoffAt.toISOString(),
  }));

  if (!matchId) {
    return { matches, selectedMatchId: null, selectedPlayerId: null, players: [], current: null };
  }

  const match = await prisma.fifaMatch.findUnique({
    where: { id: matchId },
    select: { homeTeamId: true, awayTeamId: true, period: { select: { frozenAt: true } } },
  });
  if (!match) {
    return { matches, selectedMatchId: null, selectedPlayerId: null, players: [], current: null };
  }

  const teamIds = [match.homeTeamId, match.awayTeamId].filter((x): x is string => x != null);
  const playerRows = teamIds.length
    ? await prisma.player.findMany({
        where: { teamId: { in: teamIds } },
        select: {
          id: true,
          displayName: true,
          position: true,
          team: { select: { name: true } },
        },
      })
    : [];
  const players: CommishStatPlayerOption[] = playerRows
    .map((p) => ({
      playerId: p.id,
      name: p.displayName,
      position: p.position as Position,
      teamName: p.team?.name ?? null,
    }))
    .sort(
      (a, b) =>
        POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) ||
        a.name.localeCompare(b.name),
    );

  const selectedPlayerId =
    playerId && players.some((p) => p.playerId === playerId) ? playerId : null;

  let current: CommishStatCorrectionsView["current"] = null;
  if (selectedPlayerId) {
    const [manual, ratings] = await Promise.all([
      prisma.manualStatPlayerMatch.findUnique({
        where: { matchId_playerId: { matchId, playerId: selectedPlayerId } },
      }),
      prisma.ratingPlayerMatch.findMany({
        where: { matchId, playerId: selectedPlayerId },
        select: { source: true, rating: true },
      }),
    ]);
    const { rating, source } = pickRating(
      ratings.map((r) => ({ source: r.source as RatingSource, rating: r.rating })),
    );
    current = {
      penaltyWon: manual?.penaltyWon ?? 0,
      penaltyCommitted: manual?.penaltyCommitted ?? 0,
      penaltyReason: manual?.reason ?? null,
      resolvedRating: rating,
      resolvedRatingSource: source,
      hasManualRating: ratings.some((r) => r.source === "manual"),
      periodFrozen: match.period?.frozenAt != null,
    };
  }

  return { matches, selectedMatchId: matchId, selectedPlayerId, players, current };
}

/** Assemble the read-only inspector for a selected manager — SAME-LEAGUE ONLY (guarded by `managers.find`). */
async function buildInspector(
  commishManagerId: string,
  selectedManagerId: string,
  managers: CommishManagerOption[],
  managerRows: { id: string; faabBudget: number }[],
): Promise<CommishConsoleView["inspector"]> {
  const option = managers.find((m) => m.managerId === selectedManagerId);
  const row = managerRows.find((m) => m.id === selectedManagerId);
  if (!option || !row) return null; // out-of-league target → no inspector (read boundary)

  // Record + seed come whole-league from loadStandings; pick the target's row (identical data regardless of
  // which league member is the "viewer"). Roster is a contained read of the target's active (undropped) squad.
  const [standings, rosterRows] = await Promise.all([
    loadStandings(commishManagerId),
    prisma.rosterPlayer.findMany({
      where: { managerId: selectedManagerId, droppedAt: null },
      select: {
        player: {
          select: {
            id: true,
            displayName: true,
            position: true,
            country: true,
            team: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const sRow = standings?.cumulative.find((r) => r.managerId === selectedManagerId) ?? null;

  const roster: CommishRosterPlayer[] = rosterRows
    .map((r) => ({
      playerId: r.player.id,
      name: r.player.displayName,
      position: r.player.position as Position,
      country: r.player.country,
      teamName: r.player.team?.name ?? null,
    }))
    .sort(
      (a, b) =>
        POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) ||
        a.name.localeCompare(b.name),
    );

  return toInspector(
    option,
    sRow
      ? {
          w: sRow.w,
          l: sRow.l,
          d: sRow.d,
          points: sRow.points,
          seed: sRow.seed,
          rank: sRow.rank,
          qualified: sRow.qualified,
        }
      : null,
    row.faabBudget,
    roster,
  );
}
