/**
 * Server-side data loader for the live "vs the field" screen — the THIN owner-bypass Prisma edge that
 * assembles the whole-league snapshot via the pure `buildVsField` (@app/vsfield). It is LEAGUE-SCOPED:
 * given the viewing manager it derives the league, then reads EVERY manager's current-period score +
 * starters + the period's fixtures + the season `standing` rows — the all-play-all field. Match status
 * (not the browser) decides "still to come", so the per-opponent lineups + match statuses are computed
 * here and never reach the browser directly (consistent with Theme F: the browser reads only
 * score_manager_period + standing over Realtime).
 *
 * Like the lineup/draft loaders this IO edge has no unit test (it needs a live DB); `tsc` + the pure
 * `buildVsField` suite cover the shapes it produces. It is shared by the SSR page AND `GET /api/vsfield`.
 */
import { prisma } from "@app/db";
import {
  buildVsField,
  type BuildVsFieldInput,
  type ManagerLineupInput,
  type ManagerPeriodPoints,
  type PeriodMatchInput,
  type PeriodScores,
  type VsFieldView,
} from "@app/vsfield";

/** Build the whole-league vs-the-field snapshot for the league `viewerManagerId` belongs to. */
export async function loadVsField(viewerManagerId: string): Promise<VsFieldView | null> {
  const viewer = await prisma.manager.findUnique({
    where: { id: viewerManagerId },
    select: { id: true, leagueId: true },
  });
  if (!viewer) return null;
  const leagueId = viewer.leagueId;

  const [managerRows, periodRows, standingRows] = await Promise.all([
    prisma.manager.findMany({
      where: { leagueId },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.period.findMany({
      where: { leagueId },
      select: { id: true, label: true, kind: true, status: true, opensAt: true },
      orderBy: [{ opensAt: "asc" }, { label: "asc" }],
    }),
    prisma.standing.findMany({
      where: { leagueId, scope: "group_stage" },
      select: {
        managerId: true,
        allPlayAllW: true,
        allPlayAllL: true,
        totalPoints: true,
        seed: true,
      },
    }),
  ]);

  // TODO(confirm): current-period selection for the live board under the staggered group calendar —
  // the OPEN period, else the soonest PENDING (by opens_at). Revisit when 2+ group waves overlap
  // (which wave is "the field"?). `period.status` is set to `open` when the wave's first match nears
  // kickoff and `closed` when its last match finishes (the close job, ARCHITECTURE §4).
  // Between waves (nothing open, next wave pending) we point at the soonest PENDING — NOT
  // `periodRows[0]` (which, ordered by opens_at, is the FIRST/finished matchday and would show stale
  // FT scores + bind Realtime to the wrong period). All `closed` and nothing pending → null (no live
  // board; the Season tab still renders from `standing`).
  const currentPeriodRow =
    periodRows.find((p) => p.status === "open") ??
    periodRows.find((p) => p.status === "pending") ??
    null;
  const currentPeriod = currentPeriodRow
    ? { id: currentPeriodRow.id, label: currentPeriodRow.label }
    : null;

  // group_md periods feed the season "by period" chips (display enrichment over the standing headline).
  const groupMdPeriodIds = periodRows.filter((p) => p.kind === "group_md").map((p) => p.id);
  const scorePeriodIds = currentPeriod
    ? Array.from(new Set([currentPeriod.id, ...groupMdPeriodIds]))
    : groupMdPeriodIds;

  const [scoreRows, lineupRows, matchRows] = await Promise.all([
    scorePeriodIds.length
      ? prisma.scoreManagerPeriod.findMany({
          where: { periodId: { in: scorePeriodIds } },
          select: { managerId: true, periodId: true, points: true },
        })
      : Promise.resolve([]),
    currentPeriod
      ? prisma.lineupSlot.findMany({
          where: { periodId: currentPeriod.id, isStarter: true },
          select: {
            managerId: true,
            playerId: true,
            role: true,
            lockedAt: true,
            player: { select: { teamId: true } },
          },
        })
      : Promise.resolve([]),
    currentPeriod
      ? prisma.fifaMatch.findMany({
          where: { periodId: currentPeriod.id },
          select: {
            id: true,
            homeTeamId: true,
            awayTeamId: true,
            status: true,
            kickoffAt: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const currentPeriodScores: ManagerPeriodPoints[] = currentPeriod
    ? scoreRows
        .filter((r) => r.periodId === currentPeriod.id)
        .map((r) => ({ managerId: r.managerId, points: r.points }))
    : [];

  // Group the current period's starters per manager.
  const lineupsByManager = new Map<string, ManagerLineupInput>();
  for (const s of lineupRows) {
    let entry = lineupsByManager.get(s.managerId);
    if (!entry) {
      entry = { managerId: s.managerId, starters: [] };
      lineupsByManager.set(s.managerId, entry);
    }
    entry.starters.push({
      playerId: s.playerId,
      role: s.role,
      teamId: s.player.teamId,
      locked: s.lockedAt !== null,
    });
  }

  const matchStatuses: PeriodMatchInput[] = matchRows.map((m) => ({
    matchId: m.id,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeTeamName: m.homeTeam?.name ?? null,
    awayTeamName: m.awayTeam?.name ?? null,
    status: m.status,
    kickoffAt: m.kickoffAt,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
  }));

  // Per group_md period scores for the season chips.
  const perPeriodScores: PeriodScores[] = groupMdPeriodIds.map((pid) => ({
    periodId: pid,
    scores: scoreRows
      .filter((r) => r.periodId === pid)
      .map((r) => ({ managerId: r.managerId, points: r.points })),
  }));

  const input: BuildVsFieldInput = {
    leagueId,
    viewerManagerId,
    managers: managerRows.map((m) => ({ managerId: m.id, displayName: m.displayName })),
    currentPeriod,
    currentPeriodScores,
    lineupsForPeriod: [...lineupsByManager.values()],
    matchStatuses,
    standings: standingRows.map((s) => ({
      managerId: s.managerId,
      allPlayAllW: s.allPlayAllW,
      allPlayAllL: s.allPlayAllL,
      totalPoints: s.totalPoints,
      seed: s.seed,
    })),
    perPeriodScores,
    now: new Date(),
  };

  return buildVsField(input);
}
