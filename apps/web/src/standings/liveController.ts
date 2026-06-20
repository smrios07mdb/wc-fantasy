/**
 * Live-update orchestration for the `/standings` page, extracted from the React shell so it is unit-
 * testable in Node with no DOM (mirrors playoffs `liveController.ts` + vsfield): wire the Realtime
 * subscription (primary) + a VISIBILITY-GATED polling fallback (§5, "15–30s") to ONE seq-guarded
 * snapshot refetch. A change-nudge and a poll tick both call the same refetch; only the latest in-flight
 * response is applied (a slow earlier response can't clobber newer state). Every dependency — the
 * Realtime client, the fetcher, the timers, the visibility predicate — is injected; the shell passes the
 * real Supabase client + `fetchStandings` + `window` timers + a window-bound `() => !document.hidden`.
 */
import type { StandingsView } from "@app/recompute";
import { POLLING_FALLBACK_MS, subscribeStandings, type RealtimeClientLike } from "./realtime";

export interface StandingsLiveDeps {
  client: RealtimeClientLike;
  /** The signed-in user's JWT (gate the call on a real token; re-create on refresh). */
  accessToken: string | null;
  fetchSnapshot: () => Promise<StandingsView | null>;
  onSnapshot: (view: StandingsView) => void;
  onStatus?: (status: string) => void;
  /** Polling-fallback cadence; defaults to POLLING_FALLBACK_MS. */
  pollMs?: number;
  /** Visibility gate for the poll tick — the shell passes a window-bound `() => !document.hidden`
   *  (a lambda wrapper, never a bare property ref). Defaults to that; a hidden tab skips the tick. */
  isVisible?: () => boolean;
  /** Injected timers (the shell passes window's; tests pass fakes). */
  timers?: {
    setInterval: (cb: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
  };
}

export function startStandingsLive(deps: StandingsLiveDeps): () => void {
  // Gate on a real session: an anon subscription joins but receives no RLS-gated postgres_changes, and
  // there's nothing to authorize a poll against either. The shell re-creates this on TOKEN_REFRESHED.
  if (!deps.accessToken) return () => {};

  const timers = deps.timers ?? {
    setInterval: (cb, ms) => setInterval(cb, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  };
  const isVisible = deps.isVisible ?? (() => !document.hidden);
  const pollMs = deps.pollMs ?? POLLING_FALLBACK_MS;

  let seq = 0;
  let stopped = false;

  // One seq-guarded refetch, shared by the change-nudge and the poll tick. Only the latest in-flight
  // response is applied, so a slow earlier response can't clobber newer state.
  const refetch = (): void => {
    const mine = ++seq;
    void deps.fetchSnapshot().then((view) => {
      if (!stopped && view && mine === seq) deps.onSnapshot(view);
    });
  };

  const unsubscribe = subscribeStandings(
    deps.client,
    { onChange: refetch, onStatus: deps.onStatus },
    deps.accessToken,
  );

  // Visibility-gated polling fallback: the subscription is primary; this guarantees freshness if the
  // socket is silent or dropped, but a backgrounded tab skips the tick (the pool precedent). No
  // immediate tick — the SSR snapshot is already current.
  const interval = timers.setInterval(() => {
    if (isVisible()) refetch();
  }, pollMs);

  return () => {
    stopped = true;
    timers.clearInterval(interval);
    unsubscribe();
  };
}
