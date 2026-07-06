/**
 * Best-effort observational signals for the `wc-fantasy-period-close` cron — the A-lite
 * cron-resilience DETECTION layer (DECISIONS.md "A-lite cron detection"; closes BACKLOG P1a liveness +
 * P1b anomaly). The dual-writer status-advance (P1a) and the runbook leave two detection gaps; these
 * env-gated, fire-and-forget HTTP pings close them WITHOUT any in-repo monitor (the monitor is
 * operator-configured, out-of-repo — see the period-close cron block in render.yaml + the RUNBOOK).
 *
 * ── THE LOAD-BEARING SAFETY INVARIANT ──
 * A ping is PURELY OBSERVATIONAL. It must NEVER affect the job's real work, its result, its
 * logs-of-record, or its exit code. Every failure mode — a throw, a timeout, a DNS failure, a
 * non-2xx response — is swallowed HERE; `ping` never rejects and never rethrows, so a caller can
 * `await` it on the success OR the failure path with zero risk of perturbing the job. An unset URL
 * is a silent no-op, so the job is behaviorally byte-identical in local / test / pre-monitor-setup
 * environments (an unset env var simply = the signal is off). The wrappers add a SECOND layer
 * ({@link safePing}) so even a hypothetical contract-violating throw can neither escape into the job
 * path nor suppress a sibling signal.
 *
 * ── WHY TWO SIGNALS, NOT ONE (they catch DIFFERENT failures) ──
 *   • LIVENESS (heartbeat): a dead-man's-switch. The success ping says "the cron ran"; it is the
 *     ABSENCE of a ping that the external monitor alerts on (P1a — a stalled / crashed cron). The
 *     `/fail` ping on the crash path turns a slow grace-window timeout into an immediate crash alert.
 *   • ATTENTION: fired only when a run reports anomalies (> 0). A HEALTHY cron that hits an anomaly
 *     still completes and pings liveness — so liveness CANNOT see P1b. The attention ping is the only
 *     thing that surfaces "a postponed/abandoned fixture may be blocking the next round's open; go run
 *     the runbook pre-flight." We report every run truthfully and do NOT dedupe persistent anomalies
 *     in code — dedup is the external monitor's job (keeps this boring).
 */
import { log } from "../logger";

/**
 * Minimal structural fetch — the subset of the Node ≥20 global `fetch` we use. Accessed via a
 * `globalThis` cast (the same pattern as `@app/feed`'s client) so we avoid the DOM lib and don't
 * couple to the full `Response` signature; tests inject a stub.
 */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number }>;

const globalFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;

const DEFAULT_TIMEOUT_MS = 5_000;

export interface PingOptions {
  /** Tiny JSON payload POSTed as the body. Omitted → empty body, no content-type header. */
  body?: unknown;
  /** Hard timeout (ms) before the request is aborted. Default 5000. Bounds the job's worst-case wait. */
  timeoutMs?: number;
  /** Short label for the diagnostic log line. NEVER the URL — a Healthchecks.io ping URL is a secret token. */
  label?: string;
  /** Injectable transport; defaults to the Node global fetch. Tests pass a stub. */
  fetchImpl?: FetchLike;
}

/**
 * Best-effort POST to a monitoring endpoint. Returns immediately (no-op) for an undefined/empty URL.
 * NEVER throws and NEVER returns a rejected promise — every error is caught and logged at warn
 * (`heartbeat.skipped`, carrying the label + a coarse reason, but NOT the secret URL).
 */
export async function ping(url: string | undefined, opts: PingOptions = {}): Promise<void> {
  if (!url) return; // unset / empty env var → silent skip; the job is behaviorally unchanged
  const fetchImpl = opts.fetchImpl ?? globalFetch;
  if (!fetchImpl) {
    // No transport at all (a runtime without global fetch). Stay observational — never throw.
    log.warn("heartbeat.skipped", { label: opts.label, reason: "no fetch transport available" });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: opts.body === undefined ? undefined : { "content-type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn("heartbeat.skipped", { label: opts.label, reason: `non-2xx status ${res.status}` });
    }
  } catch (err) {
    log.warn("heartbeat.skipped", {
      label: opts.label,
      reason: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Injectable for tests; defaults to the real {@link ping}. */
type PingFn = typeof ping;

/**
 * Defense-in-depth wrapper. `ping` is contracted never to throw, so this catch should never fire in
 * practice; it exists so a hypothetical contract violation can neither escape into the job path nor
 * suppress a sibling signal. Normal network failures are caught and logged INSIDE `ping` and never
 * reach here, so this does not double-log them.
 *
 * Exported for the scheduler's per-tick dead-man switch (HARD-1 F-A02), which reuses this exact
 * double-wrapped, swallow-all contract so the liveness ping is provably incapable of perturbing or
 * failing the tick.
 */
export async function safePing(
  pingImpl: PingFn,
  url: string | undefined,
  opts: PingOptions,
): Promise<void> {
  try {
    await pingImpl(url, opts);
  } catch (err) {
    log.warn("heartbeat.skipped", {
      label: opts.label,
      reason: `ping threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/** The monitor URLs for the period-close cron. Read from env at the call site; unset → that signal is off. */
export interface PeriodCloseSignalUrls {
  /** Healthchecks.io-style liveness ping URL; `/fail` is appended on the crash path. Unset → off. */
  heartbeatUrl?: string;
  /** Attention webhook URL, pinged only when a run reports anomalies. Unset → off. */
  attentionUrl?: string;
}

/**
 * SUCCESS path: fire the liveness heartbeat ("it ran"), and — only when the run reported anomalies —
 * the attention signal. Liveness fires FIRST and each ping is isolated, so a failure of one can never
 * suppress the other and neither can perturb the job.
 */
export async function reportPeriodCloseSuccess(
  urls: PeriodCloseSignalUrls,
  outcome: { anomalies: number; leagueId: string },
  pingImpl: PingFn = ping,
): Promise<void> {
  await safePing(pingImpl, urls.heartbeatUrl, { label: "period-close.liveness" });
  if (outcome.anomalies > 0) {
    await safePing(pingImpl, urls.attentionUrl, {
      label: "period-close.attention",
      body: { anomalies: outcome.anomalies, leagueId: outcome.leagueId },
    });
  }
}

/**
 * FAILURE path: fire the liveness `/fail` ping so the monitor alerts immediately rather than waiting
 * out the dead-man's-switch grace window (Healthchecks.io `/fail` convention). No-op when the
 * heartbeat URL is unset — and crucially it does NOT synthesize an `undefined/fail` URL.
 */
export async function reportPeriodCloseFailure(
  urls: PeriodCloseSignalUrls,
  pingImpl: PingFn = ping,
): Promise<void> {
  const failUrl = urls.heartbeatUrl ? `${urls.heartbeatUrl}/fail` : undefined;
  await safePing(pingImpl, failUrl, { label: "period-close.liveness-fail" });
}
