/**
 * @app/worker — long-running ingestion / FAAB-batch / period-close / scraper host.
 *
 * Skeleton only: boots, logs structured startup, runs an empty scheduler loop, and shuts down
 * cleanly on SIGINT/SIGTERM. No polling, cron, or feature behavior yet (ARCHITECTURE.md §3).
 */
import { config } from "./config";
import { log } from "./logger";
import { startScheduler } from "./scheduler";

function main(): void {
  log.info("worker.boot", {
    nodeEnv: config.nodeEnv,
    pid: process.pid,
    tickMs: config.tickMs,
  });

  const scheduler = startScheduler(() => shutdown("drained", 0));

  let shuttingDown = false;
  function shutdown(reason: string, code: number): void {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("worker.shutdown", { reason });
    scheduler.stop();
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
