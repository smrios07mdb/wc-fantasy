import { config } from "./config";
import { sentryCapture } from "./sentry";

type Level = "debug" | "info" | "warn" | "error";

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function emit(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (RANK[level] < RANK[config.logLevel]) return;
  // Structured single-line JSON logs (ARCHITECTURE.md §8 observability).
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error" || level === "warn") {
    console.error(line);
    // HARD-1 F-A01: ship warn/error to Sentry (a no-op when SENTRY_DSN is unset). AFTER the console
    // write, and `sentryCapture` never throws — the log-of-record can never be lost to the shipper.
    sentryCapture(level, event, fields);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
