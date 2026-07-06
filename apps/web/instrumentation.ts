/**
 * Next.js instrumentation hook — server-side Sentry for the web runtime (HARD-1 F-A01).
 *
 * Env-gated on SENTRY_DSN (sync:false, set in the Render dashboard): unset ⇒ no client is
 * initialized and every capture below is a no-op, so local / test / pre-provisioning environments
 * are behaviorally byte-identical. Server-side ONLY by design — no `withSentryConfig` build
 * wrapper, no client bundle, no source-map upload; the build output is untouched.
 *
 * Coverage:
 *   • `onRequestError` — blanket capture for every server loader / RSC render / route handler
 *     error that bubbles to the Next runtime (the F-A01 "server loaders" requirement, without
 *     touching each loader).
 *   • The three write routes (faab/bid, lineup, draft/pick) ALSO capture explicitly with route
 *     tags and rethrow; Sentry marks a captured Error, so `onRequestError` does not double-report.
 *   • `captureConsoleIntegration` — raw `console.error` lines (db-check's operator diagnostics,
 *     the commish handlers' swallowed-restate logs — F-A05) reach Sentry too; those modules stay
 *     framework-agnostic (no Sentry import) by design.
 */
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  // The middleware edge runtime also loads instrumentation — init only the Node server runtime.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      integrations: (defaults) => [
        ...defaults,
        Sentry.captureConsoleIntegration({ levels: ["error"] }),
      ],
    });
  }
}

/** No-op until `register()` has initialized a client (i.e. whenever SENTRY_DSN is unset). */
export const onRequestError = Sentry.captureRequestError;
