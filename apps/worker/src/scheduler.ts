import { config } from "./config";
import { log } from "./logger";
import { feed, prisma } from "./wiring";

export interface SchedulerHandle {
  stop: () => void;
}

/**
 * The ingestion scheduler. Today: a no-op tick that just proves the loop runs and the DB + feed
 * are wired. Later prompts read `fifa_match` each tick to choose a mode (schedule-sync / pre-match
 * lineup pull / live ~60s poll / settle) and run the recompute sweeper (ARCHITECTURE.md §3).
 *
 * @param onDrained called once after `WORKER_MAX_TICKS` ticks (smoke-test / CI exit path).
 */
export function startScheduler(onDrained?: () => void): SchedulerHandle {
  log.info("scheduler.start", { tickMs: config.tickMs, maxTicks: config.maxTicks });
  // Readiness check: both dependencies are constructed (no I/O performed here).
  log.debug("scheduler.wiring", {
    db: prisma ? "ready" : "missing",
    feed: feed ? "ready" : "missing",
  });

  let ticks = 0;
  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    ticks += 1;
    // No-op. TODO(prompt-NN): pick a cadence mode from fixtures, then poll + recompute, e.g.
    //   const due = await prisma.fifaMatch.findMany({ where: { status: "in_progress" } });
    //   const events = await feed.matchEvents({ matchId });
    log.debug("scheduler.tick", { tick: ticks });

    if (config.maxTicks !== null && ticks >= config.maxTicks) {
      clearInterval(timer);
      log.info("scheduler.drained", { ticks });
      onDrained?.();
    }
  }, config.tickMs);

  return {
    stop: () => {
      clearInterval(timer);
      log.info("scheduler.stop", { ticks });
    },
  };
}
