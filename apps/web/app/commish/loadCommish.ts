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
import { POSITIONS, type Position } from "@app/shared";
import { loadStandings } from "@/app/standings/loadStandings";
import {
  toAuditView,
  toInspector,
  type CommishConsoleView,
  type CommishManagerOption,
  type CommishRosterPlayer,
} from "@/src/commish/commishView";

/** How many recent audit rows the console renders (empty until later write slices populate the ledger). */
const AUDIT_LIMIT = 50;

export async function loadCommish(
  commishManagerId: string,
  selectedManagerId?: string | null,
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
  };
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
