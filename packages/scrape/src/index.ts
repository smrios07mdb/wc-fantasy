/**
 * @app/scrape — the isolated Sofascore rating scraper's PURE core (ARCHITECTURE.md §2/§3; Prompt 05b).
 *
 * Extraction, stored-id identity resolution, the population keyMatch, settle target-selection, and the
 * fallback-comparison math all live here with NO IO. The Playwright transport + the worker loop + the
 * CLIs live in `apps/scraper`. The Prisma-backed store is imported separately via `@app/scrape/prisma`
 * so this entrypoint stays IO-free. This package does NOT import `@app/ingest` (physical isolation).
 */
export * from "./extract";
