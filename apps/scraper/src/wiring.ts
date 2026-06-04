/**
 * Wires the scraper to its dependencies (DB store + browser transport). Playwright is NOT a compile-time
 * dependency here (a go-live add); the default launcher THROWS, which the loop catches + logs — so until
 * Playwright is wired, every fetch is a contained miss and the resolver simply falls back to balldontlie
 * (graceful degradation by design). The scraper imports `@app/scrape` (+ `@app/db`), NOT `@app/ingest`.
 *
 * Go-live: `pnpm add playwright && npx playwright install chromium`, then replace `notWiredLauncher` with
 *   `async (o) => (await import("playwright")).chromium.launch(o)`.
 */
import { prisma } from "@app/db";
import { createPrismaScrapeStore } from "@app/scrape/prisma";
import type { ScrapeStore } from "@app/scrape";
import { createSofascoreBrowser, type ChromiumLauncher } from "./playwrightBrowser";

const notWiredLauncher: ChromiumLauncher = () => {
  throw new Error(
    "playwright not wired — go-live: `pnpm add playwright && npx playwright install chromium`",
  );
};

export const store: ScrapeStore = createPrismaScrapeStore(prisma);
export const browser = createSofascoreBrowser(notWiredLauncher, { headless: true });
export { prisma };
