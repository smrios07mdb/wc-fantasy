/**
 * The scraper settle loop (ARCHITECTURE.md §2/§3 — isolated; "writes rating only"). PURE selection +
 * extraction (`@app/scrape`); IO is the injected browser + store. Per-MATCH try/catch is the isolation
 * boundary: a block/parse failure is logged + contained — it NEVER throws into the shared pipeline, and
 * a miss simply leaves no `scrape` row, so the resolver falls back to `balldontlie` (graceful degradation).
 */
import {
  selectScrapeTargets,
  extractRating,
  type BrowserTransport,
  type ScrapeStore,
} from "@app/scrape";
import { log } from "./logger";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One settle pass: select FT targets, fetch each match page once, extract + write each player's rating. */
export async function runScrapeTick(
  transport: BrowserTransport,
  store: ScrapeStore,
  now: Date,
  politeGapMs: number,
): Promise<void> {
  const targets = selectScrapeTargets(await store.listScrapeCandidates(), now);
  for (const target of targets) {
    try {
      const html = await transport.fetchMatchHtml(target.sofascoreMatchId);
      for (const p of target.players) {
        const rating = extractRating(html, p.sofascorePlayerId);
        if (rating == null) continue; // not rated / not found → leave the balldontlie fallback
        await store.writeScrapeRating(p.matchId, p.playerId, rating);
      }
    } catch (err) {
      // Contained: NEVER propagate into the shared pipeline. No row → resolver falls back to balldontlie.
      log.warn("scrape.match.failed", {
        sofascoreMatchId: target.sofascoreMatchId,
        message: (err as Error).message,
      });
    }
    if (politeGapMs > 0) await sleep(politeGapMs);
  }
}
