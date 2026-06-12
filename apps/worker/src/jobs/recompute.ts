/**
 * Commissioner FORCED-recompute entrypoint (Render-Shell / cron runnable).
 *
 * Unlike the dirty-driven `runRecomputeSweep`, this performs a FORCED restatement from CURRENT state:
 * `recomputeManagerPeriod` for EVERY manager × period, then `recomputeStanding(leagueId)`. It does NOT
 * read the dirty markers — it is the operator's "rebuild the scores now" lever after a scoring rule or
 * data fix.
 *
 *   pnpm --filter @app/worker job:recompute [--period "Group MD1"] [--allow-frozen]
 *
 * `--period` scopes the restatement to one period by label (case-insensitive); default is ALL periods.
 * Frozen periods are skipped unless `--allow-frozen` (mirrors `runRecomputeSweep` / `sweep`'s
 * `allowFrozen`). Shape mirrors `job:period-close`: the pure decision (`planForcedRestate`) lives in
 * @app/recompute; this file is the thin Prisma-backed body — read managers + periods, build the store,
 * execute, and log structured counts.
 */
import { prisma } from "@app/db";
import { planForcedRestate, forcedRestate } from "@app/recompute";
import { createPrismaStore } from "@app/recompute/prisma";
import { log } from "../logger";

/** Tiny argv parse: `--period <label>` (value) + `--allow-frozen` (bool). Mirrors the job conventions. */
function parseArgs(argv: string[]): { periodLabel: string | null; allowFrozen: boolean } {
  let periodLabel: string | null = null;
  let allowFrozen = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--allow-frozen") {
      allowFrozen = true;
    } else if (a === "--period") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        periodLabel = next;
        i++;
      }
    }
  }
  return { periodLabel, allowFrozen };
}

/** @returns true on success / nothing-to-do, false when an explicit `--period` matched no period. */
async function main(): Promise<boolean> {
  const { periodLabel, allowFrozen } = parseArgs(process.argv.slice(2));
  const now = new Date();

  // Single-league deployment (ARCHITECTURE.md §4) — operate on the one league, like job:period-close.
  const league = await prisma.league.findFirst({ select: { id: true } });
  if (!league) {
    log.info("job.recompute.skip", { reason: "no league found" });
    return true;
  }

  const managers = await prisma.manager.findMany({
    where: { leagueId: league.id },
    select: { id: true },
  });
  const periods = await prisma.period.findMany({
    where: { leagueId: league.id },
    select: { id: true, label: true, frozenAt: true },
  });

  const managerIds = managers.map((m) => m.id);
  const plan = planForcedRestate(managerIds, periods, { periodLabel, allowFrozen });

  // A typo'd `--period` should fail loudly, not silently no-op the whole restatement.
  if (plan.periodFilterMatchedNothing) {
    log.error("job.recompute.no_match", {
      periodLabel,
      knownLabels: periods.map((p) => p.label),
    });
    return false;
  }

  log.info("job.recompute.start", {
    leagueId: league.id,
    managers: managerIds.length,
    periodsToRecompute: plan.periodsToRecompute.length,
    skippedFrozenPeriods: plan.skippedFrozenPeriods.length,
    managerPeriods: plan.pairs.length,
    periodLabel: periodLabel ?? "(all)",
    allowFrozen,
    at: now.toISOString(),
  });

  const store = createPrismaStore(prisma);
  const summary = await forcedRestate(store, league.id, plan, { allowFrozen });

  log.info("job.recompute.done", {
    leagueId: league.id,
    managers: managerIds.length,
    periods: plan.periodsToRecompute.length,
    skippedFrozenPeriods: plan.skippedFrozenPeriods.length,
    managerPeriods: summary.managerPeriods,
    standingRows: summary.standingRows,
  });
  return true;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    log.error("job.recompute.error", { message: (err as Error).message });
    process.exit(1);
  });
