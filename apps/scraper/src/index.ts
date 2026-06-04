/**
 * @app/scraper — the ISOLATED Sofascore rating scraper (ARCHITECTURE.md §2/§3). Its ONLY job: write
 * `rating_player_match(source='scrape')`. Sandboxed: a block/parse failure is logged + contained inside
 * `runScrapeTick` and NEVER throws into the app / 05a ingestion / scoring. A re-entrancy guard keeps a
 * slow settle pass from overlapping the next tick; `SCRAPER_MAX_TICKS` is the CI/smoke exit path.
 */
import { config } from "./config";
import { log } from "./logger";
import { browser, store } from "./wiring";
import { runScrapeTick } from "./scraper";

function main(): void {
  log.info("scraper.boot", { nodeEnv: config.nodeEnv, pid: process.pid, tickMs: config.tickMs });
  let ticks = 0;
  let running = false;
  let stopped = false;

  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    if (running) return;
    running = true;
    void runScrapeTick(browser, store, new Date(), config.politeGapMs)
      .catch((err) => log.error("scraper.tick.error", { message: (err as Error).message }))
      .finally(() => {
        running = false;
        ticks += 1;
        if (config.maxTicks !== null && ticks >= config.maxTicks && !stopped) {
          stopped = true;
          clearInterval(timer);
          log.info("scraper.drained", { ticks });
          void browser.close().finally(() => process.exit(0));
        }
      });
  }, config.tickMs);

  const shutdown = (reason: string, code: number): void => {
    if (stopped) return;
    stopped = true;
    log.info("scraper.shutdown", { reason });
    clearInterval(timer);
    void browser.close().finally(() => process.exit(code));
  };
  process.on("SIGINT", () => shutdown("SIGINT", 0));
  process.on("SIGTERM", () => shutdown("SIGTERM", 0));
  process.on("uncaughtException", (err) => {
    log.error("scraper.uncaughtException", { message: err.message });
    shutdown("uncaughtException", 1);
  });

  log.info("scraper.ready", {});
}

main();
