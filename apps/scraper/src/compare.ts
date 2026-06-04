/**
 * One-time BALLDONTLIE-vs-Sofascore fallback-quality report (Prompt 05b piece 5 / ARCHITECTURE §3
 * "Action for Code"). Reads the player-matches where BOTH a `scrape` and a `balldontlie` rating exist
 * and prints the pure summary (mean / mean-abs / max diff, correlation, abs-diff distribution). It does
 * NOT change the resolver or gate anything — it only gauges how good the `balldontlie` fallback is.
 * Sofascore stays primary regardless. Run once both sources have accumulated live data.
 */
import { prisma } from "@app/db";
import { createPrismaScrapeStore } from "@app/scrape/prisma";
import { compareRatings } from "@app/scrape";
import { log } from "./logger";

async function main(): Promise<void> {
  const store = createPrismaScrapeStore(prisma);
  const summary = compareRatings(await store.listRatingPairs());
  log.info("compare.report", { ...summary, distribution: JSON.stringify(summary.distribution) });
  await prisma.$disconnect();
}

void main();
