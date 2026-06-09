/**
 * Realtime resilience for the draft room (ARCHITECTURE §5 — polling seam + resume-on-foreground).
 *
 * Two behaviours, each a pure function with injected deps so they are unit-testable without a DOM:
 *
 * 1. `handleResume` — called from visibilitychange / online / pageshow handlers. Refetches the
 *    authoritative board state once, applies it, then resubscribes if the channel has dropped.
 *
 * 2. `startPolling` — the §5 polling backstop. Fires every `pollingMs` while foregrounded; pauses
 *    when the page is hidden; stops itself when the draft completes. Returns a cleanup fn.
 *
 * Production wiring lives in DraftRoomClient.tsx (event listeners + useEffect cleanup). Tests
 * instantiate the deps with vi.fn() mocks and vi.useFakeTimers() — no real network or DOM needed.
 */

import type { DraftRowChange } from "./reducer";

export interface ResumeDeps {
  /** True when the page is backgrounded (document.hidden in production). */
  isHidden(): boolean;
  /** True when the Realtime channel is currently SUBSCRIBED. */
  isConnected(): boolean;
  /** Re-establish the Realtime channel (tears down the old one first, idempotent). */
  resubscribe(): void;
  /** Fetch the authoritative draft pointer / status row. Returns null on error / 401 / 403. */
  fetchState(): Promise<DraftRowChange | null>;
  /** Apply a DraftRowChange patch to the board view model. */
  applyPatch(patch: DraftRowChange): void;
}

/**
 * On foreground / online: refetch the authoritative board state, then resubscribe if the channel
 * dropped. Guard: does nothing when the page is still hidden (visibilitychange fires on BOTH
 * hide and show; isHidden() = true → early return).
 */
export async function handleResume(deps: ResumeDeps): Promise<void> {
  if (deps.isHidden()) return;
  const patch = await deps.fetchState();
  if (patch !== null) deps.applyPatch(patch);
  if (!deps.isConnected()) deps.resubscribe();
}

export interface PollDeps {
  /** True when the page is backgrounded — poll skips the fetch tick. */
  isHidden(): boolean;
  /** Fetch the authoritative draft pointer / status row. */
  fetchState(): Promise<DraftRowChange | null>;
  /** Apply a DraftRowChange patch to the board view model. */
  applyPatch(patch: DraftRowChange): void;
  /** Interval cadence in ms (POLLING_FALLBACK_MS from realtime.ts). */
  pollingMs: number;
}

/**
 * Minimal timer abstraction — typed with `number` IDs (the browser contract). Using
 * `typeof globalThis.setInterval` directly conflicts when @types/node is also present in the
 * project: Node's overloads return `NodeJS.Timeout`, while `window.setInterval` returns `number`.
 * A bespoke interface avoids the Node/browser type collision entirely.
 */
export interface PollTimerFns {
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

/**
 * Start the §5 polling backstop. Fires every `deps.pollingMs`; skips when page is hidden;
 * self-cancels when the fetch returns a complete draft. Returns a cleanup fn (clears the interval).
 *
 * `timerFns` is injectable so tests can use vi.useFakeTimers() instead of real timers.
 *
 * Production default uses thin wrappers, NOT bare `globalThis.setInterval` refs. Bare refs lose
 * their window receiver when stored as object properties → "TypeError: Illegal invocation" in
 * browsers (which brand-check the receiver). Node/jsdom don't brand-check, so unit tests pass
 * even with bare refs — this is an invisible gap. Wrappers always call window.* directly.
 */
export function startPolling(
  deps: PollDeps,
  timerFns: PollTimerFns = {
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id),
  },
): () => void {
  // Callback fires after `id` is assigned (JS event loop guarantees deferred execution).
  const id = timerFns.setInterval(() => {
    if (deps.isHidden()) return;
    void deps.fetchState().then((patch) => {
      if (patch === null) return;
      deps.applyPatch(patch);
      if (patch.status === "complete") timerFns.clearInterval(id);
    });
  }, deps.pollingMs);
  return () => timerFns.clearInterval(id);
}
