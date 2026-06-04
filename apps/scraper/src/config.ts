import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load the repo-root `.env` (apps/scraper/src -> ../../../.env). A missing file is fine: in production
// the host injects real env vars. UTC everywhere (ARCHITECTURE.md §8).
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
  /** Scraper settle-loop tick interval (ms). The loop is slow + polite (rating lands near/after FT). */
  tickMs: intEnv("SCRAPER_TICK_MS", 300_000),
  /** When set, stop + exit cleanly after this many ticks (smoke tests / CI). */
  maxTicks: process.env.SCRAPER_MAX_TICKS ? intEnv("SCRAPER_MAX_TICKS", 0) : null,
  /** Polite gap between match-page fetches (ms) — gentle on Sofascore. */
  politeGapMs: intEnv("SCRAPER_POLITE_GAP_MS", 4_000),
} as const;
