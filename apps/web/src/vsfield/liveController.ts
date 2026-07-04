/**
 * The live-update orchestration for the "vs the field" screen, extracted from the React shell so it is
 * unit-testable in Node (no DOM): wire the Realtime subscription (primary) + a polling fallback (§5,
 * "15–30s") to ONE seq-guarded snapshot refetch. A change-nudge and a poll tick both call the same
 * refetch; only the latest in-flight response is applied (so a slow earlier response can't clobber newer
 * state). Every dependency (the Realtime client, the fetcher, the timers) is injected; the shell passes
 * the real Supabase client + `fetchVsField` + `window` timers.
 *
 * Stale-feed honesty (F-P2-K3, live-confirmed on resume — T15-CUT): iOS suspends the socket AND the
 * background interval, so on tab resume the old behavior let the LIVE pill sit over a frozen snapshot
 * for up to a poll tick (~20s observed). With the injected `visibility` wiring the controller refetches
 * IMMEDIATELY on resume and reports `onStale(true)` when the last applied snapshot is older than
 * `staleAfterMs` — the shell shows the honest "Delayed" cue until the fresh snapshot lands
 * (`onStale(false)` on every applied snapshot).
 */
import type { VsFieldView } from "@app/vsfield";
import {
  POLLING_FALLBACK_MS,
  subscribeVsField,
  type RealtimeClientLike,
  type SubscribeVsFieldArgs,
} from "./realtime";

/** Snapshot age on resume beyond which the feed reads "Delayed" (> 2× the poll cadence). */
export const STALE_AFTER_MS = 45_000;

export interface VsFieldLiveDeps<V = VsFieldView> {
  client: RealtimeClientLike;
  args: SubscribeVsFieldArgs;
  /** The signed-in user's JWT (gate the call on a real token; re-create on refresh). */
  accessToken: string | null;
  fetchSnapshot: () => Promise<V | null>;
  onSnapshot: (view: V) => void;
  onStatus?: (status: string) => void;
  /** Polling-fallback cadence; defaults to POLLING_FALLBACK_MS. */
  pollMs?: number;
  /** Injected timers (the shell passes window's; tests pass fakes). */
  timers?: {
    setInterval: (cb: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
  };
  /** Page-visibility wiring (K3): the shell passes document/window; tests pass a fake. Optional so
   *  non-DOM callers (and older tests) run unchanged. */
  visibility?: {
    isVisible(): boolean;
    /** Subscribe to visibility changes; returns the unsubscribe. */
    subscribe(onChange: () => void): () => void;
  };
  /** Honest staleness cue (K3): true on a resume with an over-age snapshot; false once fresh applies. */
  onStale?: (stale: boolean) => void;
  /** Age threshold for the resume staleness cue; defaults to STALE_AFTER_MS. */
  staleAfterMs?: number;
  /** Injected clock for staleness (tests pass a fake). */
  now?: () => number;
}

export function startVsFieldLive<V = VsFieldView>(deps: VsFieldLiveDeps<V>): () => void {
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

  const now = deps.now ?? (() => Date.now());
  const staleAfterMs = deps.staleAfterMs ?? STALE_AFTER_MS;
  // The SSR snapshot is current at mount — staleness is measured from the last APPLIED snapshot.
  let lastAppliedAt = now();

  // One seq-guarded refetch, shared by the change-nudge, the poll tick, and the resume kick. Only the
  // latest in-flight response is applied, so a slow earlier response can't clobber newer state.
  const refetch = (): void => {
    const mine = ++seq;
    void deps.fetchSnapshot().then((view) => {
      if (!stopped && view && mine === seq) {
        lastAppliedAt = now();
        deps.onStale?.(false);
        deps.onSnapshot(view);
      }
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

  // K3: tab resume → refetch NOW; flag the honest "Delayed" cue when the snapshot is over-age (the
  // socket + interval were suspended in the background, so waiting for the next tick lies for ~20s).
  const unsubscribeVisibility = deps.visibility
    ? deps.visibility.subscribe(() => {
        if (stopped || !deps.visibility!.isVisible()) return;
        if (now() - lastAppliedAt > staleAfterMs) deps.onStale?.(true);
        refetch();
      })
    : undefined;

  return () => {
    stopped = true;
    timers.clearInterval(interval);
    unsubscribeVisibility?.();
    unsubscribe();
  };
}
