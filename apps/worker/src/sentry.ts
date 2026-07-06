/**
 * Env-gated Sentry wiring for the worker runtime (HARD-1 F-A01). OBSERVATIONAL ONLY — the same
 * safety invariant as jobs/heartbeat.ts: nothing here may throw into, slow down, or change the
 * behavior of the tick/ingest/recompute path. SENTRY_DSN unset ⇒ init is skipped and every capture
 * below is a Sentry SDK no-op, so local / test / pre-provisioning environments are behaviorally
 * byte-identical.
 *
 * Three capture channels, one sink:
 *   • the structured logger (logger.ts) forwards its warn/error emissions here (`sentryCapture`) —
 *     events grouped by the log event name, fields attached as extras;
 *   • `captureConsoleIntegration` picks up raw console.warn/console.error from packages the worker
 *     drives but this thread does not touch (e.g. @app/ingest's `[ingest.live.foreign_skipped]` and
 *     malformed-item console signals — HARD-1 F-A04);
 *   • index.ts captures the fatal uncaughtException explicitly (with its stack) and flushes before
 *     the process exits.
 *
 * Sentry's OWN global crash handlers (OnUncaughtException / OnUnhandledRejection) are REMOVED from
 * the default integrations: merely registering an unhandledRejection listener suppresses Node's
 * default throw-on-unhandled-rejection, which would silently change the worker's crash-and-restart
 * semantics. The existing uncaughtException handler in index.ts stays the one and only crash path.
 */
import * as Sentry from "@sentry/node";
import { config } from "./config";

/**
 * The structured logger's console lines (single-line JSON, always starting `{"ts":`) are already
 * captured STRUCTURED via `sentryCapture` — drop the console-integration duplicate of the same
 * line so each log event reaches Sentry exactly once. Exported for tests.
 */
export function dropLoggerConsoleDupes<T extends { logger?: string; message?: string }>(
  event: T,
): T | null {
  if (event.logger === "console" && (event.message ?? "").startsWith('{"ts":')) return null;
  return event;
}

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    integrations: (defaults) => [
      ...defaults.filter(
        (i) => i.name !== "OnUncaughtException" && i.name !== "OnUnhandledRejection",
      ),
      Sentry.captureConsoleIntegration({ levels: ["warn", "error"] }),
    ],
    beforeSend: (event) => dropLoggerConsoleDupes(event),
  });
}

/**
 * Forward one structured log emission to Sentry. NEVER throws (the heartbeat.ts safety invariant) —
 * a Sentry/SDK failure must never break the log write it rides on. A `fields.error` carrying a real
 * Error is promoted to `captureException` so the event keeps its stack trace.
 */
export function sentryCapture(
  level: "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  try {
    const severity = level === "warn" ? "warning" : "error";
    const err = fields.error;
    if (err instanceof Error) {
      Sentry.captureException(err, { level: severity, tags: { event }, extra: fields });
    } else {
      Sentry.captureMessage(event, { level: severity, extra: fields });
    }
  } catch {
    // Observational only — swallowing is the contract (see module doc).
  }
}

/** Explicit exception capture for the fatal crash path (index.ts). Same never-throws contract. */
export function sentryCaptureException(err: unknown, context?: Record<string, unknown>): void {
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // Observational only.
  }
}

/**
 * Drain buffered events before process.exit (shutdown/crash path). Resolves within ~timeoutMs and
 * never rejects; an uninitialized SDK (SENTRY_DSN unset) resolves immediately, so shutdown timing
 * is unchanged wherever Sentry is off.
 */
export async function sentryFlush(timeoutMs = 2_000): Promise<void> {
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Observational only.
  }
}
