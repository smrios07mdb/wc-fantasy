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
 * The same hourly run ALSO advances `period.status` (the pending → open → closed lifecycle): it
 * closes a wave once every fixture is `completed` and promotes the next wave to `open`, keeping
 * exactly one open period. This is DECOUPLED from freeze — status-close keys on "all fixtures
 * completed", not on `frozen_at` / `result_freeze_hours` — and is what `findLockedSlotPlayerIds`
 * gates on, so without it a finished matchday's played players stay locked forever (waiver drops
 * freeze). The pure decision fn is `selectPeriodStatusTransitions`.
 *
 * Shape mirrors the FAAB batch split: the pure decision fns (`selectPeriodsToFreeze`,
 * `selectPeriodStatusTransitions`) in @app/recompute carry no IO; this file is the thin
 * Prisma-backed cron body.
 */
import {
  selectPeriodsToFreeze,
  selectAnomalyPeriods,
  selectPeriodStatusTransitions,
} from "@app/recompute";
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

  // ── Status lifecycle (DECOUPLED from freeze) ──
  // Close a wave once its last fixture is completed and promote the next to open, keeping exactly one
  // open period. Loads ALL periods (not just unfrozen) so the earliest-current computation sees the
  // already-closed waves; the pure fn keys on "every fixture completed", never on frozen_at.
  const lifecyclePeriods = await prisma.period.findMany({
    where: { leagueId: league.id },
    select: {
      id: true,
      label: true,
      status: true,
      frozenAt: true,
      matches: { select: { kickoffAt: true, status: true } },
    },
  });
  const lifecycleFixturesByPeriod = Object.fromEntries(
    lifecyclePeriods.map((p) => [p.id, p.matches]),
  );

  const { toClose, toOpen } = selectPeriodStatusTransitions(
    lifecyclePeriods,
    lifecycleFixturesByPeriod,
  );

  if (toClose.length > 0 || toOpen.length > 0) {
    // One atomic transaction. Each update is guarded by the expected PRIOR status so an hourly
    // re-run (or a concurrent worker) is a clean no-op rather than a clobber: closing only matches a
    // not-yet-closed row; opening only matches a still-pending row.
    await prisma.$transaction([
      ...toClose.map((periodId) =>
        prisma.period.updateMany({
          where: { id: periodId, status: { not: "closed" } },
          data: { status: "closed" },
        }),
      ),
      ...toOpen.map((periodId) =>
        prisma.period.updateMany({
          where: { id: periodId, status: "pending" },
          data: { status: "open" },
        }),
      ),
    ]);

    for (const periodId of toClose) {
      log.info("job.periodClose.statusAdvanced", { periodId, to: "closed" });
    }
    for (const periodId of toOpen) {
      log.info("job.periodClose.statusAdvanced", { periodId, to: "open" });
    }
  }

  log.info("job.periodClose.done", {
    frozen: toFreeze.length,
    anomalies: anomalyIds.length,
    closed: toClose.length,
    opened: toOpen.length,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("job.periodClose.error", { message: (err as Error).message });
    process.exit(1);
  });
