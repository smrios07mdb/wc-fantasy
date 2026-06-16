/**
 * The SINGLE canonical cumulative-tournament-total derivation — Σ each manager's
 * `score_manager_period.points` over ALL the league's periods (scoped via the period relation, since
 * `score_manager_period` carries no `leagueId`). This is the boundary tiebreak `selectGuillotineCuts`
 * consumes when a live playoff round sits on a cut boundary.
 *
 * Single-sourced ON PURPOSE: both the WRITE path (`advanceStore.loadRoundContext` → `applyRoundCut`) and the
 * READ path (`loadPlayoffs` → `buildPlayoffsView`) call THIS, so the §21 invariant — "what the live screen
 * shows facing the blade == what `commish:advance` eventually cuts" — holds BY CONSTRUCTION, not because two
 * separate queries happen to agree. The drift-prone bit — WHICH periods count — lives here exactly once. Each
 * caller passes its own `managerIds` (the round's alive field vs all playoff participants); the per-manager Σ
 * is identical for any manager in either set, so only the period scoping is shared.
 *
 * Prisma-behind-the-subpath: reached only via `@app/recompute/prisma` (re-exported from `prismaStore.ts`), so
 * the package index stays IO-free. The pure reduce `sumByManager` carries no runtime DB dependency (the
 * `PrismaClient` import is type-only) and is unit-tested directly; the IO query is covered by both callers'
 * gated Postgres suites. On the fly — no stored column.
 */
import type { PrismaClient } from "@app/db";

/**
 * Σ points per manager across the given `score_manager_period` rows. A manager absent from a period
 * contributes no row, so its total is the sum of the rows it DOES have; a manager with no rows at all is
 * simply absent from the map (callers default it to 0). Pure — the same reduce both inline call sites used.
 */
export function sumByManager(
  rows: readonly { managerId: string; points: number }[],
): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.managerId, (totals.get(r.managerId) ?? 0) + r.points);
  return totals;
}

/**
 * Load each manager's cumulative tournament total: Σ `score_manager_period.points` over ALL the league's
 * periods, via the period relation. Returns a per-manager map; managers with no scored period are absent (the
 * caller defaults them to 0). An empty `managerIds` skips the query and yields an empty map.
 */
export async function loadCumulativeTournamentTotals(
  prisma: PrismaClient,
  leagueId: string,
  managerIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (managerIds.length === 0) return new Map();
  const rows = await prisma.scoreManagerPeriod.findMany({
    where: { managerId: { in: [...managerIds] }, period: { leagueId } },
    select: { managerId: true, points: true },
  });
  return sumByManager(rows);
}
