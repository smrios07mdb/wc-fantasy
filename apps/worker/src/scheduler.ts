import { config } from "./config";
import { log } from "./logger";
import { feed, ingestStore, notifyStore, notifyTriggerStore } from "./wiring";
import { dispatchPlayersNotStarting, dispatchMatchStarting } from "./notify/triggers";
import { runRecomputeSweep } from "./recompute";
import {
  decideMatchModes,
  pollerSilentMatches,
  anyMatchInLiveWindow,
  ingestSchedule,
  ingestRosters,
  ingestLineups,
  ingestLive,
  ingestSettle,
  type ModeMatch,
  type MatchCtx,
  type SchedulableMatch,
} from "@app/ingest";

export interface SchedulerHandle {
  stop: () => void;
}

/** How early before kickoff and how long after to keep schedule-sync on the tight (every-tick) cadence. */
const LIVE_WINDOW_PRE_MS = 15 * 60_000;
const LIVE_WINDOW_POST_MS = 3 * 60 * 60_000;

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
      // Squad bootstrap (player + fifa_team): boot tick + a SLOW cadence (≈daily). Squads are static,
      // so this never runs on the ordinary 60s tick. Its own try/catch keeps a rosters failure from
      // starving the rest of the tick (ARCHITECTURE.md §3).
      if (ticks === 0 || ticks % config.rostersSyncEveryTicks === 0) {
        try {
          await ingestRosters(feed, ingestStore);
        } catch (err) {
          log.error("ingest.rosters.error", { message: (err as Error).message });
        }
      }

      const toModeMatch = (r: SchedulableMatch): ModeMatch => ({
        bdlId: r.bdlId,
        status: r.status as ModeMatch["status"],
        kickoffMs: r.kickoffMs,
        hasRating: r.hasRating,
        lineupPulled: r.lineupPulled || pulledLineups.has(r.bdlId),
      });

      let rows = await ingestStore.listSchedulableMatches();
      const now = new Date();

      // Schedule-sync (global fixture pull): the slow cadence (and the bootstrap first tick), PLUS every
      // tick while any fixture is in its match window — so a kicked-off match flips to in_progress (and
      // its subs start locking) promptly instead of waiting up to an hour (ARCHITECTURE.md §8).
      const onSlowCadence = ticks === 0 || ticks % config.scheduleSyncEveryTicks === 0;
      const inWindow = anyMatchInLiveWindow(
        rows.map(toModeMatch),
        now,
        LIVE_WINDOW_PRE_MS,
        LIVE_WINDOW_POST_MS,
      );
      if (onSlowCadence || inWindow) {
        try {
          await ingestSchedule(feed, ingestStore);
          rows = await ingestStore.listSchedulableMatches();
        } catch (err) {
          log.error("ingest.schedule.error", { message: (err as Error).message });
        }
      }

      const matches: ModeMatch[] = rows.map(toModeMatch);

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
            const { officialStarterBdlIds } = await ingestLineups(feed, ingestStore, ctx);
            pulledLineups.add(action.bdlId);
            // Player-not-starting (41b): the official XI just landed → alert owners of any unlocked
            // fantasy starter who is NOT in it. Isolated so a notify failure never breaks the lineup
            // lock that just succeeded; the ledger makes the next pre_match pull's re-fire a no-op.
            try {
              const r = await dispatchPlayersNotStarting(
                notifyStore,
                notifyTriggerStore,
                action.bdlId,
                officialStarterBdlIds,
              );
              if (r.attempts > 0) {
                log.debug("notify.player_not_starting", { matchBdlId: action.bdlId, ...r });
              }
            } catch (err) {
              log.error("notify.player_not_starting.error", {
                matchBdlId: action.bdlId,
                message: (err as Error).message,
              });
            }
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

      // Match-starting (41b, owners-only): alert managers who own ≥1 rostered player on either team of a
      // fixture kicking off within NOTIFY_MATCH_LEAD_MIN. Isolated from the ingestion/recompute work;
      // the lead window + the notification_sent ledger collapse the 60s re-fires to one alert per owner.
      try {
        const r = await dispatchMatchStarting(
          notifyStore,
          notifyTriggerStore,
          now,
          config.notifyMatchLeadMs,
        );
        if (r.attempts > 0) log.debug("notify.match_starting", { ...r });
      } catch (err) {
        log.error("notify.match_starting.error", { message: (err as Error).message });
      }

      // NOTE: the draft timer is NOT ticked here. A draft's per-pick clock needs a far tighter cadence
      // than this ~60s ingestion tick, so it runs on its own dedicated loop — `startDraftTicker`
      // (src/draft.ts), started from index.ts (ARCHITECTURE.md §5).
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
