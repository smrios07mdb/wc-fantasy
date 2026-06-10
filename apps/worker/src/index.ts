/**
 * @app/worker — long-running ingestion / FAAB-batch / period-close / scraper host.
 *
 * Skeleton only: boots, logs structured startup, runs an empty scheduler loop, and shuts down
 * cleanly on SIGINT/SIGTERM. No polling, cron, or feature behavior yet (ARCHITECTURE.md §3).
 */
import { config } from "./config";
import { log } from "./logger";
import { startScheduler } from "./scheduler";
import { startDraftTicker } from "./draft";
import { notifyStore, draftStore } from "./wiring";
import { dispatchDraftTurns } from "./notify/triggers";

function main(): void {
  log.info("worker.boot", {
    nodeEnv: config.nodeEnv,
    pid: process.pid,
    tickMs: config.tickMs,
    draftTickMs: config.draftTickMs,
  });

  const scheduler = startScheduler(() => shutdown("drained", 0));

  // The draft clock runs on its OWN short cadence (ARCHITECTURE.md §5) — not coupled to the coarse
  // ingestion tick. An expired `pick_deadline_at` autopicks within seconds; a completed draft drops
  // out of the loop. The decision stays inside the unchanged `@app/draft` controller.
  const draftTicker = startDraftTicker({
    store: draftStore,
    intervalMs: config.draftTickMs,
    maxTicks: config.draftMaxTicks,
    onTick: (results) => {
      const autopicks = results.filter((r) => r.acted).length;
      if (results.length > 0) {
        log.debug("draft.ticked", { drafts: results.length, autopicks });
      }
    },
    // draft_turn (41b): after each tick, notify the on-the-clock manager of every active draft. The
    // SAME store the ticker drove is reused so the dispatch sees the post-autopick pointer; the
    // ${draftId}:${pickNo} ledger key makes the 2s re-fire a no-op until the turn advances.
    afterTick: (store) => dispatchDraftTurns(notifyStore, store).then(() => undefined),
    onError: (err) => log.error("draft.tick.error", { message: (err as Error).message }),
  });

  let shuttingDown = false;
  function shutdown(reason: string, code: number): void {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("worker.shutdown", { reason });
    scheduler.stop();
    draftTicker.stop();
    process.exit(code);
  }

  process.on("SIGINT", () => shutdown("SIGINT", 0));
  process.on("SIGTERM", () => shutdown("SIGTERM", 0));
  process.on("uncaughtException", (err) => {
    log.error("worker.uncaughtException", { message: err.message });
    shutdown("uncaughtException", 1);
  });

  log.info("worker.ready", {});
}

main();
