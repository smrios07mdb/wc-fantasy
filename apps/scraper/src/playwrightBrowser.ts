/**
 * The Playwright-backed {@link BrowserTransport}. Playwright is INJECTED as a structural `ChromiumLauncher`
 * (no compile-time dependency on the `playwright` package — a go-live add: `pnpm add playwright && npx
 * playwright install chromium`). One browser is launched lazily + reused across fetches; pages are
 * per-fetch + always closed. Tests pass a fake launcher, so this orchestration runs with no real browser.
 *
 * TODO(confirm): the real Sofascore match URL pattern lives in `MATCH_URL` — confirm on the first live page.
 */
import type { BrowserTransport } from "@app/scrape";

interface ChromiumPageLike {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  content(): Promise<string>;
  close(): Promise<void>;
}
interface ChromiumBrowserLike {
  newPage(): Promise<ChromiumPageLike>;
  close(): Promise<void>;
}
export type ChromiumLauncher = (opts?: { headless?: boolean }) => Promise<ChromiumBrowserLike>;

const MATCH_URL = (sofascoreMatchId: number): string =>
  `https://www.sofascore.com/event/${sofascoreMatchId}`; // TODO(confirm): exact path

export function createSofascoreBrowser(
  launch: ChromiumLauncher,
  opts: { headless?: boolean } = {},
): BrowserTransport {
  let browser: ChromiumBrowserLike | null = null;
  const ensure = async (): Promise<ChromiumBrowserLike> => (browser ??= await launch(opts));
  return {
    async fetchMatchHtml(sofascoreMatchId): Promise<string> {
      const b = await ensure();
      const page = await b.newPage();
      try {
        await page.goto(MATCH_URL(sofascoreMatchId), {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        return await page.content();
      } finally {
        await page.close();
      }
    },
    async close(): Promise<void> {
      if (browser) await browser.close();
      browser = null;
    },
  };
}
