import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FAAB_BATCH_LEAD_MIN } from "@app/faab";

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
  /** Run the rosters squad-sync (the player + fifa_team bootstrap) every N ticks. Squads are static, so
   *  this is SLOW: default 1440 (≈daily at a 60s tick), PLUS always on the boot tick. Never the 60s tick. */
  rostersSyncEveryTicks: intEnv("WORKER_ROSTERS_SYNC_EVERY_TICKS", 1440),
  /** Draft-clock tick cadence (ms). SHORT on purpose — the per-pick countdown must autopick within
   *  seconds of `pick_deadline_at`, not wait out the ~60s ingestion tick. Its own loop (src/draft.ts). */
  draftTickMs: intEnv("WORKER_DRAFT_TICK_MS", 2_000),
  /** When set, the draft ticker stops itself after this many ticks (smoke tests / CI exit path). */
  draftMaxTicks: process.env.WORKER_DRAFT_MAX_TICKS ? intEnv("WORKER_DRAFT_MAX_TICKS", 0) : null,
  /** Lead time before kickoff to fire the match-starting notification (minutes; Prompt 41b). The 60s
   *  ingestion tick + the notification_sent ledger collapse repeats to one alert per fixture. Default 15. */
  notifyMatchLeadMs: intEnv("NOTIFY_MATCH_LEAD_MIN", 15) * 60_000,
  /** How far back the completed-match appearance-lock sweep looks (ms). 48h covers the 12h settle ceiling
   *  + overnight gap without scanning the whole tournament. See `sweepCompletedMatchLocks`. */
  lockSweepWindowMs: intEnv("WORKER_LOCK_SWEEP_WINDOW_MS", 48 * 60 * 60_000),
  /** How far BEFORE a period's first kickoff its blind-bid FAAB batch clears, when the commissioner has
   *  not set `period.waiver_batch_at` (DECISIONS.md → Theme D "per-matchday acquisition window"). The
   *  retired daily model cleared 06:00 league-local before a ~12:00 WC first kickoff ≈ 6h, so 360 min
   *  reproduces that pre-kickoff instant and stays comfortably ahead of the period's earliest match.
   *  TODO(confirm): batch lead — the precise lead is a commissioner knob (per-period override wins). */
  faabBatchLeadMs: intEnv("FAAB_BATCH_LEAD_MIN", DEFAULT_FAAB_BATCH_LEAD_MIN) * 60_000,
  /** Lead time before kickoff to pull `match_lineups` for the Set Lineup availability badge (the T-75
   *  peek). National-team sheets publish ~75 min out; the selector re-fires each tick across
   *  [kickoff - this, kickoff) until the snapshot lands. ORTHOGONAL to the kickoff lock path. Default 75m. */
  lineupPeekLeadMs: intEnv("LINEUP_PEEK_LEAD_MS", 75 * 60_000),
} as const;
