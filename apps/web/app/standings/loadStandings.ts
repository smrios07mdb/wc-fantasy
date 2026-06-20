/**
 * Server-side data loader for the dedicated `/standings` page — the THIN owner-bypass Prisma edge that
 * assembles the whole-league standings snapshot via the pure `buildStandingsView` (@app/recompute),
 * mirroring `loadVsField` / `loadPlayoffs`. It is LEAGUE-SCOPED: given the viewing manager it derives
 * the league, then reads every `group_md` period + that period's `score_manager_period` rows + the
 * manager directory — and hands them to the pure builder, which computes BOTH tabs (Matchday +
 * Cumulative) from that single source.
 *
 * Read-only, no writes, no new schema. The period scores are threaded RAW (unpadded), exactly as the
 * recompute sweeper feeds `computeStandings` in `recomputeStanding`, so the cumulative tab is identical
 * to the persisted `standing` (no drift vs the vsfield season view) and the matchday tab is internally
 * consistent with it.
 *
 * Like the other IO loaders this edge has no unit test (it needs a live DB); `tsc` + the pure
 * `buildStandingsView` suite cover the shapes it produces. It is shared by the SSR page AND
 * `GET /api/standings`.
 */
import { prisma } from "@app/db";
import { buildStandingsView, type StandingsView } from "@app/recompute";
import { sortByPeriodOrder } from "@app/shared";

/** Max wall-clock window to consider a period's matches still underway after the last scheduled kickoff. */
const MATCH_DURATION_MS = 120 * 60 * 1000; // regulation + extra time (mirrors loadVsField)

/** Build the whole-league standings snapshot for the league `viewerManagerId` belongs to. */
export async function loadStandings(viewerManagerId: string): Promise<StandingsView | null> {
  const viewer = await prisma.manager.findUnique({
    where: { id: viewerManagerId },
    select: { id: true, leagueId: true },
  });
  if (!viewer) return null;
  const leagueId = viewer.leagueId;
  const now = new Date();

  const [managerRows, periodRows] = await Promise.all([
    // The FULL league roster (no activity filter) — every manager is listed, even one absent from all
    // periods (a trailing 0–0–0 row in the cumulative tab; the same display policy buildVsField uses).
    prisma.manager.findMany({
      where: { leagueId },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    // Only the regular-season scoring periods feed the power record (knockout rounds are the playoffs).
    prisma.period.findMany({
      where: { leagueId, kind: "group_md" },
      select: {
        id: true,
        label: true,
        matches: { orderBy: { kickoffAt: "asc" }, select: { kickoffAt: true } },
      },
    }),
  ]);

  // Canonical tournament order (MD1, MD2, …). opensAt is never populated by provisioning, so an
  // `ORDER BY opens_at` degrades to alphabetical; sortByPeriodOrder ranks purely on the LABEL.
  const orderedPeriods = sortByPeriodOrder(periodRows, (p) => p.label);
  const periodIds = orderedPeriods.map((p) => p.id);

  const scoreRows = periodIds.length
    ? await prisma.scoreManagerPeriod.findMany({
        where: { periodId: { in: periodIds } },
        select: { managerId: true, periodId: true, points: true },
      })
    : [];

  // periodId → that period's RAW score rows (unpadded). last-write-wins is a no-op here: (manager,
  // period) is unique per the table, so a manager maps to one row per period.
  const pointsByPeriod: Record<string, { managerId: string; points: number }[]> = {};
  for (const id of periodIds) pointsByPeriod[id] = [];
  for (const r of scoreRows) {
    (pointsByPeriod[r.periodId] ??= []).push({ managerId: r.managerId, points: r.points });
  }

  // A period is LIVE when its matches are underway now (first kickoff ≤ now < last kickoff + window).
  // Time-based, not status-based: `period.status` stays "pending" from provision to freeze (the dead
  // open branch documented in selectCurrentPeriod), so it can't signal "live".
  const isLive = (matches: { kickoffAt: Date }[]): boolean => {
    if (matches.length === 0) return false;
    const firstMs = matches[0]!.kickoffAt.getTime();
    const lastMs = matches.at(-1)!.kickoffAt.getTime();
    const nowMs = now.getTime();
    return nowMs >= firstMs && nowMs < lastMs + MATCH_DURATION_MS;
  };

  return buildStandingsView({
    periods: orderedPeriods.map((p) => ({
      id: p.id,
      label: p.label,
      // The schema carries only `label` (no separate long name), so it doubles as the display name.
      // TODO(confirm): a longer human period name (e.g. "Matchday 1") if one is ever sourced.
      name: p.label,
      live: isLive(p.matches),
    })),
    pointsByPeriod,
    managers: managerRows.map((m) => ({ managerId: m.id, displayName: m.displayName })),
    meId: viewerManagerId,
    // fieldSize omitted → the pure builder applies DEFAULT_PLAYOFF_FIELD_SIZE. The real field size is
    // fixed only at the group→playoff transition (Theme C); there is no league column to read yet.
  });
}
