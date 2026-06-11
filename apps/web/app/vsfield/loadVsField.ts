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
import { selectCurrentPeriod } from "@app/shared";

/** Max wall-clock window to consider a period still live after its last scheduled kickoff. */
const MATCH_DURATION_MS = 120 * 60 * 1000; // covers regulation + extra time
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
  const now = new Date();

  const [managerRows, periodRows, standingRows] = await Promise.all([
    // The FULL league roster (no activity filter) — this is the inactive-0 contract: a manager with
    // no current-period score_manager_period row (and no XI) MUST still appear, so buildVsField pads
    // him to 0 points + empty XI and he is a free win for everyone strictly above (Prompt 04 line 42 /
    // Theme C). Closing this loader-side, NOT via the recompute sweeper writing 0 rows.
    prisma.manager.findMany({
      where: { leagueId },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.period.findMany({
      where: { leagueId },
      select: {
        id: true,
        label: true,
        kind: true,
        status: true,
        matches: { orderBy: { kickoffAt: "asc" }, select: { kickoffAt: true } },
      },
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

  // Current period: the open wave (if any), else the earliest period whose last match has not yet
  // finished (now < lastKickoff + MATCH_DURATION_MS). opensAt is never populated by the provisioning
  // CLI (NULL for all periods), so the DB ORDER BY opensAt falls back to label-alphabetical and would
  // put "Final" before "Group MD1" — selectCurrentPeriod re-sorts by matches[0].kickoffAt in JS.
  // The vsfield latch must be time-based (not batchClearedAt), because batchClearedAt is stamped
  // ~6h BEFORE first kickoff; using it as the latch would drop the live wave while MD1 matches are
  // still being played, binding the Realtime subscription and lineup/score reads to MD2 instead.
  // TODO(confirm): overlapping group waves ("which wave is the field") — sequential periods only.
  const currentPeriodRow = selectCurrentPeriod(periodRows, (p) => {
    const lastKickoffMs = p.matches.at(-1)?.kickoffAt.getTime() ?? 0;
    return now.getTime() < lastKickoffMs + MATCH_DURATION_MS;
  });
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
    now,
  };

  return buildVsField(input);
}
