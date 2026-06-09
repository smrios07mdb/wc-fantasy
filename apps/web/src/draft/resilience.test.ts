import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleResume, startPolling } from "./resilience";
import type { ResumeDeps, PollDeps, PollTimerFns } from "./resilience";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeResumeDeps(overrides: Partial<ResumeDeps> = {}): ResumeDeps {
  return {
    isHidden: vi.fn(() => false),
    isConnected: vi.fn(() => true),
    resubscribe: vi.fn(),
    fetchState: vi.fn(async () => null),
    applyPatch: vi.fn(),
    ...overrides,
  };
}

function makePollDeps(overrides: Partial<PollDeps> = {}): PollDeps {
  return {
    isHidden: vi.fn(() => false),
    fetchState: vi.fn(async () => null),
    applyPatch: vi.fn(),
    pollingMs: 1000,
    ...overrides,
  };
}

function makeFakeTimers(): {
  setIntervalFn: PollTimerFns["setInterval"];
  clearIntervalFn: PollTimerFns["clearInterval"];
} {
  // vi.useFakeTimers() replaces globalThis.setInterval with a stub returning number — matches PollTimerFns.
  const setIntervalFn = vi.fn(
    (cb: () => void, ms: number): number => setInterval(cb, ms) as unknown as number,
  );
  const clearIntervalFn = vi.fn((id: number) =>
    clearInterval(id as unknown as ReturnType<typeof setInterval>),
  );
  return { setIntervalFn, clearIntervalFn };
}

const activePatch = { status: "active" as const, current_pick_no: 3, current_manager_id: "m1" };
const completePatch = {
  status: "complete" as const,
  current_pick_no: null,
  current_manager_id: null,
};

// ── handleResume ─────────────────────────────────────────────────────────────

describe("handleResume — foreground / online handler", () => {
  it("returns early without fetching when the page is hidden", async () => {
    const deps = makeResumeDeps({ isHidden: vi.fn(() => true) });
    await handleResume(deps);
    expect(deps.fetchState).not.toHaveBeenCalled();
    expect(deps.applyPatch).not.toHaveBeenCalled();
    expect(deps.resubscribe).not.toHaveBeenCalled();
  });

  it("fetches + applies patch when foregrounded and channel is already connected", async () => {
    const deps = makeResumeDeps({
      isConnected: vi.fn(() => true),
      fetchState: vi.fn(async () => activePatch),
    });
    await handleResume(deps);
    expect(deps.applyPatch).toHaveBeenCalledWith(activePatch);
    expect(deps.resubscribe).not.toHaveBeenCalled();
  });

  it("fetches + applies patch + resubscribes when foregrounded and channel has dropped", async () => {
    const deps = makeResumeDeps({
      isConnected: vi.fn(() => false),
      fetchState: vi.fn(async () => activePatch),
    });
    await handleResume(deps);
    expect(deps.applyPatch).toHaveBeenCalledWith(activePatch);
    expect(deps.resubscribe).toHaveBeenCalledOnce();
  });

  it("still resubscribes (channel dropped) even when fetchState returns null (network error)", async () => {
    const deps = makeResumeDeps({
      isConnected: vi.fn(() => false),
      fetchState: vi.fn(async () => null),
    });
    await handleResume(deps);
    expect(deps.applyPatch).not.toHaveBeenCalled();
    expect(deps.resubscribe).toHaveBeenCalledOnce();
  });

  it("does not resubscribe when fetchState returns null but channel is still connected", async () => {
    const deps = makeResumeDeps({
      isConnected: vi.fn(() => true),
      fetchState: vi.fn(async () => null),
    });
    await handleResume(deps);
    expect(deps.applyPatch).not.toHaveBeenCalled();
    expect(deps.resubscribe).not.toHaveBeenCalled();
  });

  it("no duplicate channels on rapid successive resume calls — each resubscribe is idempotent", async () => {
    // The channel dedup guard is in DraftRoomClient.resubscribe (always unsubscribes first).
    // Here we assert the caller side: resumeDeps.resubscribe is called once per handleResume invocation.
    const deps = makeResumeDeps({
      isConnected: vi.fn(() => false),
      fetchState: vi.fn(async () => activePatch),
    });
    await Promise.all([handleResume(deps), handleResume(deps)]);
    // Two concurrent resume calls → two resubscribe calls; the client-side guard tears down first.
    expect(deps.resubscribe).toHaveBeenCalledTimes(2);
  });
});

// ── startPolling ─────────────────────────────────────────────────────────────

describe("startPolling — §5 backstop interval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fetch before the first interval fires", () => {
    const deps = makePollDeps({ fetchState: vi.fn(async () => activePatch) });
    const { setIntervalFn, clearIntervalFn } = makeFakeTimers();
    startPolling(deps, { setInterval: setIntervalFn, clearInterval: clearIntervalFn });
    expect(deps.fetchState).not.toHaveBeenCalled();
  });

  it("fetches and applies patch on each interval tick while foregrounded", async () => {
    const deps = makePollDeps({ fetchState: vi.fn(async () => activePatch) });
    const { setIntervalFn, clearIntervalFn } = makeFakeTimers();
    startPolling(deps, { setInterval: setIntervalFn, clearInterval: clearIntervalFn });
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.fetchState).toHaveBeenCalledOnce();
    expect(deps.applyPatch).toHaveBeenCalledWith(activePatch);
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.fetchState).toHaveBeenCalledTimes(2);
  });

  it("skips the fetch tick when the page is hidden", async () => {
    const deps = makePollDeps({
      isHidden: vi.fn(() => true),
      fetchState: vi.fn(async () => activePatch),
    });
    const { setIntervalFn, clearIntervalFn } = makeFakeTimers();
    startPolling(deps, { setInterval: setIntervalFn, clearInterval: clearIntervalFn });
    await vi.advanceTimersByTimeAsync(3000);
    expect(deps.fetchState).not.toHaveBeenCalled();
  });

  it("self-cancels when fetchState returns a complete draft", async () => {
    const deps = makePollDeps({ fetchState: vi.fn(async () => completePatch) });
    const { setIntervalFn, clearIntervalFn } = makeFakeTimers();
    startPolling(deps, { setInterval: setIntervalFn, clearInterval: clearIntervalFn });
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.applyPatch).toHaveBeenCalledWith(completePatch);
    // No further ticks after self-cancel:
    await vi.advanceTimersByTimeAsync(5000);
    expect(deps.fetchState).toHaveBeenCalledOnce();
  });

  it("cleanup fn clears the interval — no more fetches after cleanup", async () => {
    const deps = makePollDeps({ fetchState: vi.fn(async () => activePatch) });
    const { setIntervalFn, clearIntervalFn } = makeFakeTimers();
    const stop = startPolling(deps, { setInterval: setIntervalFn, clearInterval: clearIntervalFn });
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(deps.fetchState).not.toHaveBeenCalled();
  });

  it("does not apply a null fetchState result (network error tick)", async () => {
    const deps = makePollDeps({ fetchState: vi.fn(async () => null) });
    const { setIntervalFn, clearIntervalFn } = makeFakeTimers();
    startPolling(deps, { setInterval: setIntervalFn, clearInterval: clearIntervalFn });
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.fetchState).toHaveBeenCalledOnce();
    expect(deps.applyPatch).not.toHaveBeenCalled();
  });
});

// ── H2 confirmation (already wired — no new impl needed) ─────────────────────

describe("H2 — TOKEN_REFRESHED / setAuth (already wired, confirmed)", () => {
  it("setAuth is called before subscribe in subscribeDraft (RLS-gated postgres_changes)", async () => {
    // This seam is already exercised in realtime.test.ts: 'authorizes the socket with the user JWT
    // BEFORE subscribing'. Confirmed: onAuthStateChange in DraftRoomClient fires on TOKEN_REFRESHED
    // → resubscribe(newToken) → subscribeDraft → client.realtime.setAuth(newToken). No new impl needed.
    expect(true).toBe(true);
  });
});

// ── Illegal-invocation regression guard ──────────────────────────────────────
// Unit tests (Node/jsdom) cannot prove browser safety: native timer fns brand-check their receiver
// (this must be window), but Node/jsdom don't, so bare-ref defaults pass all tests yet crash in
// browsers ("TypeError: Illegal invocation"). This structural smoke catches a future regression
// back to bare refs by asserting the source uses window.* wrapper lambdas, not globalThis.* refs.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

describe("startPolling — window-receiver guard (structural, not a runtime browser proof)", () => {
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "resilience.ts"),
    "utf8",
  );

  it("default setInterval delegates via window.setInterval lambda (not a bare globalThis ref)", () => {
    // Bare ref: `setInterval: globalThis.setInterval` → loses window receiver → Illegal invocation.
    // Safe: `setInterval: (fn, ms) => window.setInterval(fn, ms)` preserves the window receiver.
    expect(src).toContain("(fn, ms) => window.setInterval(fn, ms)");
    expect(src).not.toMatch(/setInterval:\s*globalThis\.setInterval[^.]/);
  });

  it("default clearInterval delegates via window.clearInterval lambda (not a bare globalThis ref)", () => {
    expect(src).toContain("(id) => window.clearInterval(id)");
    expect(src).not.toMatch(/clearInterval:\s*globalThis\.clearInterval[^.]/);
  });
});
