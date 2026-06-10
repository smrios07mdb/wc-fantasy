/**
 * Period-close cron entrypoint (runbook B3 / DECISIONS.md §2 — INVARIANT 5).
 *
 * Render's `wc-fantasy-period-close` cron runs this hourly. After a period's last fixture reaches
 * `completed` AND `league.result_freeze_hours` have elapsed since that fixture's kickoff, the
 * period's `frozen_at` is stamped with `now`. After freeze, restatement is commissioner-only
 * (the recompute sweeper gates on `period.frozen_at IS NOT NULL`).
 *
 * Idempotent: periods already carrying `frozen_at` are excluded by the DB query. Anomalies (any
 * `postponed` or `abandoned` fixture) are logged as warnings for manual resolution; their periods
 * are not frozen.
 *
 * Shape mirrors the FAAB batch split: the pure decision fn (`selectPeriodsToFreeze`) in
 * @app/recompute carries no IO; this file is the thin Prisma-backed cron body.
 */
import { selectPeriodsToFreeze, selectAnomalyPeriods } from "@app/recompute";
import { prisma } from "../wiring";
import { log } from "../logger";

async function main(): Promise<void> {
  const now = new Date();

  // Read resultFreezeHours from the runtime league row (NOT from a seed default or env var —
  // DECISIONS.md LEAGUE_SEED_DEFAULTS warning: the DB row wins).
  const league = await prisma.league.findFirst({
    select: { id: true, resultFreezeHours: true },
  });
  if (!league) {
    log.info("job.periodClose.skip", { reason: "no league found" });
    return;
  }

  // Load only unfrozen periods together with their fixtures.
  // The `frozenAt: null` filter at the DB level makes re-runs a clean no-op for already-frozen
  // periods; the pure fn is additionally defensive.
  const periods = await prisma.period.findMany({
    where: { leagueId: league.id, frozenAt: null },
    select: {
      id: true,
      frozenAt: true,
      matches: {
        select: { kickoffAt: true, status: true },
      },
    },
  });

  log.info("job.periodClose.start", {
    leagueId: league.id,
    unfrozenPeriods: periods.length,
    freezeHours: league.resultFreezeHours,
    at: now.toISOString(),
  });

  const fixturesByPeriod = Object.fromEntries(periods.map((p) => [p.id, p.matches]));

  // Log anomaly periods — postponed/abandoned fixtures need manual commissioner intervention.
  const anomalyIds = selectAnomalyPeriods(periods, fixturesByPeriod);
  for (const periodId of anomalyIds) {
    log.warn("job.periodClose.anomaly", {
      periodId,
      reason: "postponed or abandoned fixture — needs manual commissioner override",
    });
  }

  const toFreeze = selectPeriodsToFreeze(periods, fixturesByPeriod, league.resultFreezeHours, now);

  if (toFreeze.length > 0) {
    // Stamp frozen_at = now in one atomic transaction. Each update is separate but all succeed or
    // all roll back, keeping re-runs safe without partial state.
    await prisma.$transaction(
      toFreeze.map((periodId) =>
        prisma.period.update({
          where: { id: periodId },
          data: { frozenAt: now },
        }),
      ),
    );

    for (const periodId of toFreeze) {
      log.info("job.periodClose.froze", { periodId, frozenAt: now.toISOString() });
    }
  }

  log.info("job.periodClose.done", { frozen: toFreeze.length, anomalies: anomalyIds.length });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("job.periodClose.error", { message: (err as Error).message });
    process.exit(1);
  });
