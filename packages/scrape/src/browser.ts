/**
 * Injected browser transport — fetches the rendered HTML for a Sofascore match page. The worker loop
 * catches any throw (block / timeout) per-target: a miss leaves no scrape row and the resolver falls
 * back to `balldontlie`. The Playwright-backed implementation lives in `apps/scraper` (the IO edge);
 * tests pass a fake that returns saved HTML fixtures.
 */
export interface BrowserTransport {
  fetchMatchHtml(sofascoreMatchId: number): Promise<string>;
  close(): Promise<void>;
}
