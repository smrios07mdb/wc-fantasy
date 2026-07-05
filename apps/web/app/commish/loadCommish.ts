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
import { POSITIONS, rosterCapForPlayoffPhase, type Position, type RatingSource } from "@app/shared";
import {
  pickRating,
  parseStatOverrides,
  OVERRIDABLE_STAT_KEYS,
  type OverridableStatKey,
} from "@app/recompute";
import { runRoundAdvance } from "@app/commish-core";
import { createPrismaPlayoffAdvanceStore } from "@app/commish-core/advanceStore";
import { loadStandings } from "@/app/standings/loadStandings";
import {
  buildAdvanceLadder,
  toAuditView,
  toInspector,
  type CommishAdvanceView,
  type CommishConsoleView,
  type CommishManagerOption,
  type CommishOpsView,
  type CommishRepairView,
  type CommishRosterPlayer,
  type CommishStatCorrectionsView,
  type CommishStatPlayerOption,
} from "@/src/commish/commishView";
import { ADVANCE_PREVIEW_REASON } from "@/src/commish/handleAdvance";
import { mapAdvanceRefusal } from "@/src/commish/advanceRefusalCopy";
import { periodFreezable, periodLive } from "@/src/commish/handleFreeze";

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

/** An empty Ops view (used while inspecting a manager via `?as=`, where the tabs are hidden). */
const EMPTY_OPS: CommishOpsView = { periods: [] };

/** An empty Advance view (used while inspecting a manager via `?as=`, where the tabs are hidden). */
const EMPTY_ADVANCE: CommishAdvanceView = {
  seeded: false,
  fieldSize: 0,
  aliveCount: 0,
  championName: null,
  rounds: [],
  nextRoundLabel: null,
  preview: null,
};

/** An empty Repair view (used while inspecting a manager via `?as=`, where the tabs are hidden). */
const EMPTY_REPAIR: CommishRepairView = {
  selectedManagerId: null,
  roster: [],
  periods: [],
  pool: [],
  selectedPeriodId: null,
  currentStarterIds: [],
  playoffPhase: false,
  rosterCap: 15,
};

export async function loadCommish(
  commishManagerId: string,
  selectedManagerId?: string | null,
  statSel?: { matchId?: string | null; playerId?: string | null },
  repairSel?: { managerId?: string | null; periodId?: string | null },
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
      // timezone (T15-6): read-only display input for the console's league-local timestamps.
      prisma.league.findUnique({ where: { id: leagueId }, select: { name: true, timezone: true } }),
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

  // Stat-corrections + Repair tab data are built only when NOT inspecting a manager (`?as=` hides the tabs).
  const statCorrections = selectedManagerId
    ? EMPTY_STAT_CORRECTIONS
    : await buildStatCorrections(statSel?.matchId ?? null, statSel?.playerId ?? null);
  const repair = selectedManagerId
    ? EMPTY_REPAIR
    : await buildRepair(
        leagueId,
        managers,
        repairSel?.managerId ?? null,
        repairSel?.periodId ?? null,
      );
  const ops = selectedManagerId ? EMPTY_OPS : await buildOps(leagueId);
  const advance = selectedManagerId ? EMPTY_ADVANCE : await buildAdvance(leagueId, managers, now);

  return {
    leagueId,
    leagueName: league?.name ?? "League",
    timezone: league?.timezone ?? "UTC",
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
    repair,
    ops,
    advance,
  };
}

/**
 * Assemble the Playoff-cuts tab (Thread 5): the knockout cut ladder (pure `buildAdvanceLadder` over the
 * knockout periods + playoff entries), plus an SSR DRY-RUN of the next uncut round through the relocated
 * orchestrator over its VERBATIM Prisma store — `apply: false` mutates nothing, and reusing the real
 * guards means the panel's refusal banner and the write route's refusal can never disagree. READ-ONLY;
 * the write goes through POST /api/commish/advance.
 */
async function buildAdvance(
  leagueId: string,
  managers: CommishManagerOption[],
  now: Date,
): Promise<CommishAdvanceView> {
  const [periodRows, entryRows] = await Promise.all([
    prisma.period.findMany({
      where: { leagueId, kind: "knockout_round" },
      select: { id: true, label: true, cutCount: true, frozenAt: true },
    }),
    prisma.playoffEntry.findMany({
      where: { leagueId },
      select: { managerId: true, status: true, eliminatedRound: true },
    }),
  ]);

  const ladder = buildAdvanceLadder(
    periodRows.map((p) => ({
      periodId: p.id,
      label: p.label,
      cutCount: p.cutCount,
      frozen: p.frozenAt != null,
    })),
    entryRows,
  );

  const nameOf: Record<string, string> = {};
  for (const m of managers) nameOf[m.managerId] = m.displayName;
  const championId = entryRows.find((e) => e.status === "champion")?.managerId ?? null;
  const championName = championId ? (nameOf[championId] ?? championId) : null;

  const base: CommishAdvanceView = { ...ladder, championName, preview: null };
  if (!ladder.seeded || ladder.nextRoundLabel === null) return base;

  const res = await runRoundAdvance(
    { now, store: createPrismaPlayoffAdvanceStore(prisma), log: () => {} },
    {
      // The page gate (resolveCommishAccess) already proved the viewer is the commissioner.
      actor: { email: null, isCommissioner: true },
      leagueId,
      roundLabel: ladder.nextRoundLabel,
      reason: ADVANCE_PREVIEW_REASON,
      breakTie: null,
      allowIncomplete: false,
      apply: false,
      nameOf,
      timestamp: now.toISOString(),
    },
  );
  // A dry-run can only be planned / refused / skipped (apply-only statuses are unreachable).
  const status =
    res.status === "planned" ? "planned" : res.status === "skipped" ? "skipped" : "refused";
  return {
    ...base,
    preview: {
      status,
      reason: "reason" in res ? mapAdvanceRefusal(res.reason) : null,
      plan: res.plan ?? null,
    },
  };
}

/**
 * Assemble the Game-operations freeze panel (Thread 4): every league period with its frozen state, the
 * SAME `freezable`/`live` predicates the write handler enforces (button state and server guard cannot
 * disagree), and the count of unprocessed manager_period dirty markers (what an unfreeze would let the
 * worker's next sweep restate). READ-ONLY; the writes go through POST /api/commish/freeze · /unfreeze.
 */
async function buildOps(leagueId: string): Promise<CommishOpsView> {
  const [periodRows, dirtyGroups] = await Promise.all([
    prisma.period.findMany({
      where: { leagueId },
      select: {
        id: true,
        label: true,
        status: true,
        kind: true,
        frozenAt: true,
        matches: { select: { status: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.recomputeDirty.groupBy({
      by: ["periodId"],
      where: { scope: "manager_period", processedAt: null },
      _count: { _all: true },
    }),
  ]);
  const pendingByPeriod = new Map(dirtyGroups.map((g) => [g.periodId, g._count._all]));
  return {
    periods: periodRows.map((p) => {
      const fixtureStatuses = p.matches.map((m) => m.status);
      return {
        periodId: p.id,
        label: p.label,
        kind: p.kind as "group_md" | "knockout_round",
        status: p.status,
        frozenAtIso: p.frozenAt?.toISOString() ?? null,
        live: periodLive(fixtureStatuses),
        freezable: periodFreezable(p.status, fixtureStatuses),
        pendingDirty: pendingByPeriod.get(p.id) ?? 0,
      };
    }),
  };
}

/**
 * Assemble the Roster/Lineup-repair tab (Thread 3a): the league periods, and — once a manager is picked
 * (`?rmanager=`) — their active roster, the live-unowned add pool, and (with `?rperiod=`) the current
 * starter set for the XI editor. Same-league only (an out-of-league id yields the empty selection). All
 * reads are owner-bypass and READ-ONLY; the writes go through POST /api/commish/roster · /lineup.
 */
async function buildRepair(
  leagueId: string,
  managers: CommishManagerOption[],
  repairManagerId: string | null,
  repairPeriodId: string | null,
): Promise<CommishRepairView> {
  const [periodRows, playoffEntryCount] = await Promise.all([
    prisma.period.findMany({
      where: { leagueId },
      select: { id: true, label: true, status: true, kind: true, frozenAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.playoffEntry.count({ where: { leagueId } }),
  ]);
  const periods = periodRows.map((p) => ({
    periodId: p.id,
    label: p.label,
    status: p.status,
    kind: p.kind as "group_md" | "knockout_round",
    frozen: p.frozenAt != null,
  }));
  const playoffPhase = playoffEntryCount > 0;
  const base: CommishRepairView = {
    selectedManagerId: null,
    roster: [],
    periods,
    pool: [],
    selectedPeriodId: null,
    currentStarterIds: [],
    playoffPhase,
    rosterCap: rosterCapForPlayoffPhase(playoffPhase),
  };

  // Same-league guard (mirrors the inspector): an unknown/out-of-league id → no selection.
  if (!repairManagerId || !managers.some((m) => m.managerId === repairManagerId)) return base;

  const [rosterRows, ownedRows] = await Promise.all([
    prisma.rosterPlayer.findMany({
      where: { managerId: repairManagerId, droppedAt: null },
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
    // Live-unowned pool = every player NOT holding an active roster row in this league right now — the
    // same predicate claimFreeAgent re-checks. Eliminated-team players stay listed (the repair runner
    // passes allowEliminated, the deliberate commissioner bypass).
    prisma.rosterPlayer.findMany({
      where: { leagueId, droppedAt: null },
      distinct: ["playerId"],
      select: { playerId: true },
    }),
  ]);
  const ownedIds = new Set(ownedRows.map((r) => r.playerId));
  const poolRows = await prisma.player.findMany({
    where: { id: { notIn: [...ownedIds] } },
    select: { id: true, displayName: true, position: true, team: { select: { name: true } } },
    orderBy: { displayName: "asc" },
  });

  const byPos = (a: { position: Position }, b: { position: Position }) =>
    POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position);
  const roster: CommishRosterPlayer[] = rosterRows
    .map((r) => ({
      playerId: r.player.id,
      name: r.player.displayName,
      position: r.player.position as Position,
      country: r.player.country,
      teamName: r.player.team?.name ?? null,
    }))
    .sort((a, b) => byPos(a, b) || a.name.localeCompare(b.name));

  const selectedPeriodId =
    repairPeriodId && periods.some((p) => p.periodId === repairPeriodId) ? repairPeriodId : null;
  const currentStarterIds = selectedPeriodId
    ? (
        await prisma.lineupSlot.findMany({
          where: { managerId: repairManagerId, periodId: selectedPeriodId, isStarter: true },
          select: { playerId: true },
        })
      ).map((s) => s.playerId)
    : [];

  return {
    ...base,
    selectedManagerId: repairManagerId,
    roster,
    pool: poolRows.map((p) => ({
      playerId: p.id,
      name: p.displayName,
      position: p.position as Position,
      teamName: p.team?.name ?? null,
    })),
    selectedPeriodId,
    currentStarterIds,
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
    const [manual, ratings, stat] = await Promise.all([
      prisma.manualStatPlayerMatch.findUnique({
        where: { matchId_playerId: { matchId, playerId: selectedPlayerId } },
      }),
      prisma.ratingPlayerMatch.findMany({
        where: { matchId, playerId: selectedPlayerId },
        select: { source: true, rating: true },
      }),
      prisma.statPlayerMatch.findUnique({
        where: { matchId_playerId: { matchId, playerId: selectedPlayerId } },
      }),
    ]);
    const { rating, source } = pickRating(
      ratings.map((r) => ({ source: r.source as RatingSource, rating: r.rating })),
    );
    // 2b — the raw FEED value per overridable field (the editor's "current" baseline), and the current overlay.
    const feedStats: Partial<Record<OverridableStatKey, number | null>> = {};
    if (stat) {
      const row = stat as unknown as Record<string, number | null>;
      for (const key of OVERRIDABLE_STAT_KEYS) feedStats[key] = row[key] ?? null;
    }
    current = {
      penaltyWon: manual?.penaltyWon ?? 0,
      penaltyCommitted: manual?.penaltyCommitted ?? 0,
      penaltyReason: manual?.reason ?? null,
      resolvedRating: rating,
      resolvedRatingSource: source,
      hasManualRating: ratings.some((r) => r.source === "manual"),
      periodFrozen: match.period?.frozenAt != null,
      feedStats,
      statOverrides: parseStatOverrides(manual?.extra) ?? {},
      hasStatRow: stat != null,
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
