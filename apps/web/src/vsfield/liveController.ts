/**
 * The live-update orchestration for the "vs the field" screen, extracted from the React shell so it is
 * unit-testable in Node (no DOM): wire the Realtime subscription (primary) + a polling fallback (§5,
 * "15–30s") to ONE seq-guarded snapshot refetch. A change-nudge and a poll tick both call the same
 * refetch; only the latest in-flight response is applied (so a slow earlier response can't clobber newer
 * state). Every dependency (the Realtime client, the fetcher, the timers) is injected; the shell passes
 * the real Supabase client + `fetchVsField` + `window` timers.
 */
import type { VsFieldView } from "@app/vsfield";
import {
  POLLING_FALLBACK_MS,
  subscribeVsField,
  type RealtimeClientLike,
  type SubscribeVsFieldArgs,
} from "./realtime";

export interface VsFieldLiveDeps {
  client: RealtimeClientLike;
  args: SubscribeVsFieldArgs;
  /** The signed-in user's JWT (gate the call on a real token; re-create on refresh). */
  accessToken: string | null;
  fetchSnapshot: () => Promise<VsFieldView | null>;
  onSnapshot: (view: VsFieldView) => void;
  onStatus?: (status: string) => void;
  /** Polling-fallback cadence; defaults to POLLING_FALLBACK_MS. */
  pollMs?: number;
  /** Injected timers (the shell passes window's; tests pass fakes). */
  timers?: {
    setInterval: (cb: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
  };
}

export function startVsFieldLive(deps: VsFieldLiveDeps): () => void {
  // Gate on a real session: an anon subscription joins but receives no RLS-gated postgres_changes, and
  // there's nothing to authorize a poll against either. The shell re-creates this on TOKEN_REFRESHED.
  if (!deps.accessToken) return () => {};

  const timers = deps.timers ?? {
    setInterval: (cb, ms) => setInterval(cb, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  };
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

  const unsubscribe = subscribeVsField(
    deps.client,
    deps.args,
    { onChange: refetch, onStatus: deps.onStatus },
    deps.accessToken,
  );

  // Polling fallback (ARCHITECTURE §5): the subscription is primary; this guarantees freshness if the
  // socket is silent or dropped. No immediate tick — the SSR snapshot is already current.
  const interval = timers.setInterval(refetch, pollMs);

  return () => {
    stopped = true;
    timers.clearInterval(interval);
    unsubscribe();
  };
}
