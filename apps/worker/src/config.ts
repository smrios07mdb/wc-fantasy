import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load the repo-root `.env` (apps/worker/src -> ../../../.env). A missing file is fine: in
// production the host (Render) injects real env vars. UTC everywhere (ARCHITECTURE.md §8).
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
  /** No-op scheduler tick interval (ms). The live ~60s poll cadence lands in a later prompt. */
  tickMs: intEnv("WORKER_TICK_MS", 60_000),
  /** When set, stop + exit cleanly after this many ticks (used by smoke tests / CI). */
  maxTicks: process.env.WORKER_MAX_TICKS ? intEnv("WORKER_MAX_TICKS", 0) : null,
  balldontlieApiKey: process.env.BALLDONTLIE_API_KEY ?? "",
  balldontlieBaseUrl: process.env.BALLDONTLIE_BASE_URL ?? "https://api.balldontlie.io",
  /** BALLDONTLIE rate cap (req/min). Default 5 = the 48h dev trial; set 600 for a paid GOAT key. */
  balldontlieRpm: intEnv("BALLDONTLIE_RPM", 5),
  /** A live match with no successful live poll within this many ms raises the poller-silent alert (§8). */
  pollerSilentGraceMs: intEnv("POLLER_SILENT_GRACE_MS", 5 * 60_000),
  /** Run schedule-sync (the global fixture pull) every N ticks (≈hourly at a 60s tick). */
  scheduleSyncEveryTicks: intEnv("WORKER_SCHEDULE_SYNC_EVERY_TICKS", 60),
} as const;
