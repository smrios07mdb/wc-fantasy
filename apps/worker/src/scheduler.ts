import { config } from "./config";
import { log } from "./logger";
import { feed, ingestStore } from "./wiring";
import { runRecomputeSweep } from "./recompute";
import {
  decideMatchModes,
  pollerSilentMatches,
  ingestSchedule,
  ingestLineups,
  ingestLive,
  ingestSettle,
  type ModeMatch,
  type MatchCtx,
} from "@app/ingest";

export interface SchedulerHandle {
  stop: () => void;
}

/**
 * The ingestion scheduler (ARCHITECTURE.md §3). Each tick: read `fifa_match`, choose per-match modes
 * via the PURE `decideMatchModes(matches, now)`, run the matching ingestion (schedule-sync / pre-match
 * lineup lock / live ~60s poll / settle), then drive the existing recompute `sweep`. The poller-silent
 * alert (§8) fires when a live match has had no successful live poll inside its window. The tick is
 * re-entrancy-guarded so a slow ingestion never overlaps the next interval.
 *
 * @param onDrained called once after `WORKER_MAX_TICKS` ticks (smoke-test / CI exit path).
 */
export function startScheduler(onDrained?: () => void): SchedulerHandle {
  log.info("scheduler.start", {
    tickMs: config.tickMs,
    maxTicks: config.maxTicks,
    rpm: config.balldontlieRpm,
  });

  const lastLivePoll = new Map<number, number>();
  const pulledLineups = new Set<number>();
  let ticks = 0;
  let running = false;
  let stopped = false;

  async function tick(): Promise<void> {
    if (running) {
      log.debug("scheduler.skip", { reason: "overlap" });
      return;
    }
    running = true;
    try {
      // Schedule-sync (global fixture pull) on a slow cadence — and always on the first tick to bootstrap.
      if (ticks === 0 || ticks % config.scheduleSyncEveryTicks === 0) {
        try {
          await ingestSchedule(feed, ingestStore);
        } catch (err) {
          log.error("ingest.schedule.error", { message: (err as Error).message });
        }
      }

      const rows = await ingestStore.listSchedulableMatches();
      const now = new Date();
      const matches: ModeMatch[] = rows.map((r) => ({
        bdlId: r.bdlId,
        status: r.status as ModeMatch["status"],
        kickoffMs: r.kickoffMs,
        hasRating: r.hasRating,
        lineupPulled: r.lineupPulled || pulledLineups.has(r.bdlId),
      }));

      // Poller-silent alert (§8): a live match with no recent successful live poll → operator flips fallback.
      for (const a of pollerSilentMatches(matches, lastLivePoll, now, config.pollerSilentGraceMs)) {
        log.warn("poller.silent", { matchBdlId: a.bdlId });
      }

      const ctxByBdl = new Map<number, MatchCtx>(
        rows.map((r) => [
          r.bdlId,
          {
            bdlId: r.bdlId,
            kickoffAt: new Date(r.kickoffMs),
            kickoffLockFallback: r.kickoffLockFallback,
          },
        ]),
      );

      for (const action of decideMatchModes(matches, now)) {
        const ctx = ctxByBdl.get(action.bdlId);
        if (!ctx) continue;
        try {
          if (action.mode === "pre_match") {
            await ingestLineups(feed, ingestStore, ctx);
            pulledLineups.add(action.bdlId);
          } else if (action.mode === "live") {
            await ingestLive(feed, ingestStore, ctx);
            lastLivePoll.set(action.bdlId, now.getTime());
          } else if (action.mode === "settle") {
            await ingestSettle(feed, ingestStore, ctx);
          }
        } catch (err) {
          log.error("ingest.error", {
            matchBdlId: action.bdlId,
            mode: action.mode,
            message: (err as Error).message,
          });
        }
      }

      const result = await runRecomputeSweep();
      log.debug("scheduler.swept", { ...result });
    } catch (err) {
      log.error("scheduler.tick.error", { message: (err as Error).message });
    } finally {
      running = false;
      ticks += 1;
      if (config.maxTicks !== null && ticks >= config.maxTicks) {
        stopped = true;
        clearInterval(timer);
        log.info("scheduler.drained", { ticks });
        onDrained?.();
      }
    }
  }

  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    void tick();
  }, config.tickMs);

  return {
    stop: () => {
      if (!stopped) clearInterval(timer);
      log.info("scheduler.stop", { ticks });
    },
  };
}
