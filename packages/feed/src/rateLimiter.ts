/**
 * Min-interval throttle for the BALLDONTLIE rate limit (GOAT 600/min; the 48h dev trial is 5/min).
 * Deliberately simple (no token bucket): at most one acquire per `60000 / requestsPerMinute` ms. The
 * clock + sleep are INJECTED so this is testable with fake timers — no real waiting, no `Date.now`.
 */
export interface RateLimiterDeps {
  requestsPerMinute: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface RateLimiter {
  /** Resolve when it's safe to issue the next request (sleeping if needed). */
  acquire(): Promise<void>;
}

export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  const minIntervalMs = deps.requestsPerMinute > 0 ? 60_000 / deps.requestsPerMinute : 0;
  let nextAllowedAt = -Infinity;
  return {
    async acquire(): Promise<void> {
      const t = deps.now();
      const wait = Math.max(0, nextAllowedAt - t);
      if (wait > 0) await deps.sleep(wait);
      nextAllowedAt = deps.now() + minIntervalMs;
    },
  };
}
