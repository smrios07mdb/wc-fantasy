/**
 * Fake-timer unit suite for the /pool live-update controllers (Prompt 43) — IO-free, no DOM, no Prisma
 * (mirrors the draft `resilience.test.ts` + vsfield `liveController.test.ts` style). Two mechanisms, both
 * on-read (no Realtime, no stored table): the clock-reveal timer (`nextRevealInstant` + `startRevealClock`)
 * and the visibility-gated leaderboard poll (`handleLeaderboardVisible` + `startLeaderboardPoll`). Every
 * dependency — timers, the visibility predicate, the refetch — is injected, so the behaviours are proven
 * here with `vi.useFakeTimers()` and no real network or browser.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LEADERBOARD_POLL_MS,
  nextRevealInstant,
  flattenPickFixtures,
  startRevealClock,
  handleLeaderboardVisible,
  startLeaderboardPoll,
  type RevealClockDeps,
  type LeaderboardPollDeps,
  type TimeoutTimerFns,
  type IntervalTimerFns,
} from "./poolLive";
import type { PoolFixture, PoolPicksView } from "./types";

// ─── helpers ───────────────────────────────────────────────────────────────────

const BASE = "2026-06-20T18:00:00.000Z";
const baseMs = new Date(BASE).getTime();
const at = (offsetMin: number) => new Date(baseMs + offsetMin * 60_000).toISOString();

/** Minimal fixture — only `kickoffAt` matters to the reveal clock. */
function fx(matchId: string, kickoffAt: string): PoolFixture {
  return {
    matchId,
    home: { name: "Home", code: "AA" },
    away: { name: "Away", code: "BB" },
    kickoffAt,
    status: "scheduled",
    periodKind: null,
    periodLabel: null,
    result: null,
    homeScore: null,
    awayScore: null,
    myPick: null,
    others: [],
  };
}

function makeTimeoutTimers(): TimeoutTimerFns & {
  setTimeout: ReturnType<typeof vi.fn>;
  clearTimeout: ReturnType<typeof vi.fn>;
} {
  return {
    setTimeout: vi.fn(
      (cb: () => void, ms: number): number => setTimeout(cb, ms) as unknown as number,
    ),
    clearTimeout: vi.fn((id: number) =>
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    ),
  };
}

function makeIntervalTimers(): IntervalTimerFns & {
  setInterval: ReturnType<typeof vi.fn>;
  clearInterval: ReturnType<typeof vi.fn>;
} {
  return {
    setInterval: vi.fn(
      (cb: () => void, ms: number): number => setInterval(cb, ms) as unknown as number,
    ),
    clearInterval: vi.fn((id: number) =>
      clearInterval(id as unknown as ReturnType<typeof setInterval>),
    ),
  };
}

// ─── nextRevealInstant ───────────────────────────────────────────────────────────

describe("nextRevealInstant — the soonest future kickoff among still-hidden matches", () => {
  const now = new Date(BASE);

  it("returns null for an empty list (nothing to reveal)", () => {
    expect(nextRevealInstant([], now)).toBeNull();
  });

  it("returns the soonest STRICTLY-future kickoff (ignores past + at-now)", () => {
    const result = nextRevealInstant(
      [fx("late", at(10)), fx("soon", at(5)), fx("past", at(-1))],
      now,
    );
    expect(result?.toISOString()).toBe(at(5));
  });

  it("excludes a kickoff exactly at now (already revealed server-side — gate is kickoff <= now)", () => {
    expect(nextRevealInstant([fx("atNow", at(0))], now)).toBeNull();
  });

  it("returns null when every match has already kicked off", () => {
    expect(nextRevealInstant([fx("a", at(-5)), fx("b", at(-1))], now)).toBeNull();
  });

  it("coalesces shared instants — duplicate soonest kickoffs resolve to that single instant", () => {
    const result = nextRevealInstant([fx("a", at(5)), fx("b", at(5)), fx("c", at(9))], now);
    expect(result?.toISOString()).toBe(at(5));
  });
});

// ─── flattenPickFixtures ──────────────────────────────────────────────────────────

describe("flattenPickFixtures — every real fixture across the Picks-tab structure", () => {
  it("includes matchday + bracket-round + unscheduled fixtures (TBD empty rounds contribute none)", () => {
    const picks: PoolPicksView = {
      matchdays: [
        { label: "MD1", fixtures: [fx("g1", at(1)), fx("g2", at(2))] },
        { label: "MD2", fixtures: [fx("g3", at(3))] },
      ],
      bracket: [
        { label: "R32", fixtures: [fx("k1", at(4))] },
        { label: "R16", fixtures: [] }, // honest TBD round — no fixtures
      ],
      unscheduled: [fx("u1", at(5))],
      // Archived completed matches are not part of the reveal-clock flatten (they are ≥24h past kickoff).
      completed: [fx("c1", at(-10))],
    };
    expect(
      flattenPickFixtures(picks)
        .map((f) => f.matchId)
        .sort(),
    ).toEqual(["g1", "g2", "g3", "k1", "u1"]);
  });

  it("returns an empty list when there are no fixtures anywhere", () => {
    const picks: PoolPicksView = { matchdays: [], bracket: [], unscheduled: [], completed: [] };
    expect(flattenPickFixtures(picks)).toEqual([]);
  });
});

// ─── startRevealClock ─────────────────────────────────────────────────────────────

describe("startRevealClock — one timer to the next reveal, refetch + re-derive on fire", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeRevealDeps(
    fixtures: PoolFixture[],
    overrides: Partial<RevealClockDeps> = {},
  ): RevealClockDeps {
    return {
      getFixtures: () => fixtures,
      now: () => Date.now(),
      onReveal: vi.fn(),
      ...overrides,
    };
  }

  it("schedules a SINGLE timer to the soonest future kickoff", () => {
    const deps = makeRevealDeps([fx("soon", at(5)), fx("late", at(10)), fx("past", at(-1))]);
    const timers = makeTimeoutTimers();
    startRevealClock(deps, timers);
    expect(timers.setTimeout).toHaveBeenCalledOnce();
    expect(timers.setTimeout.mock.calls[0]![1]).toBe(5 * 60_000);
  });

  it("coalesces shared instants — two matches at the same kickoff schedule ONE timer", () => {
    const deps = makeRevealDeps([fx("a", at(5)), fx("b", at(5))]);
    const timers = makeTimeoutTimers();
    startRevealClock(deps, timers);
    expect(timers.setTimeout).toHaveBeenCalledOnce();
  });

  it("never schedules when nothing is hidden (all kickoffs past / at-now)", () => {
    const deps = makeRevealDeps([fx("a", at(-1)), fx("b", at(0))]);
    const timers = makeTimeoutTimers();
    startRevealClock(deps, timers);
    expect(timers.setTimeout).not.toHaveBeenCalled();
    expect(deps.onReveal).not.toHaveBeenCalled();
  });

  it("on fire: triggers EXACTLY ONE refetch and re-derives the next timer", () => {
    const deps = makeRevealDeps([fx("soon", at(5)), fx("late", at(10))]);
    const timers = makeTimeoutTimers();
    startRevealClock(deps, timers);

    vi.advanceTimersByTime(5 * 60_000); // cross the "soon" kickoff
    expect(deps.onReveal).toHaveBeenCalledOnce();
    // Re-derived: the "soon" match is now past, so the next timer targets "late" (5 min out).
    expect(timers.setTimeout).toHaveBeenCalledTimes(2);
    expect(timers.setTimeout.mock.calls[1]![1]).toBe(5 * 60_000);

    vi.advanceTimersByTime(5 * 60_000); // cross the "late" kickoff
    expect(deps.onReveal).toHaveBeenCalledTimes(2);
    // Nothing left in the future → no further timer scheduled.
    expect(timers.setTimeout).toHaveBeenCalledTimes(2);
  });

  it("cleanup clears the pending timer — no refetch after unmount", () => {
    const deps = makeRevealDeps([fx("soon", at(5))]);
    const timers = makeTimeoutTimers();
    const stop = startRevealClock(deps, timers);
    stop();
    expect(timers.clearTimeout).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10 * 60_000);
    expect(deps.onReveal).not.toHaveBeenCalled();
  });

  it("cleanup after a fire prevents any further re-derive/refetch", () => {
    const deps = makeRevealDeps([fx("soon", at(5)), fx("late", at(10))]);
    const timers = makeTimeoutTimers();
    const stop = startRevealClock(deps, timers);
    vi.advanceTimersByTime(5 * 60_000);
    expect(deps.onReveal).toHaveBeenCalledOnce();
    stop();
    vi.advanceTimersByTime(10 * 60_000);
    expect(deps.onReveal).toHaveBeenCalledOnce(); // no further fires
  });
});

// ─── handleLeaderboardVisible ─────────────────────────────────────────────────────

describe("handleLeaderboardVisible — the visibilitychange handler (refetch only when visible)", () => {
  it("refetches when the document is visible", () => {
    const deps: LeaderboardPollDeps = { isVisible: () => true, refetch: vi.fn() };
    handleLeaderboardVisible(deps);
    expect(deps.refetch).toHaveBeenCalledOnce();
  });

  it("does NOT refetch when the document is hidden", () => {
    const deps: LeaderboardPollDeps = { isVisible: () => false, refetch: vi.fn() };
    handleLeaderboardVisible(deps);
    expect(deps.refetch).not.toHaveBeenCalled();
  });
});

// ─── startLeaderboardPoll ─────────────────────────────────────────────────────────

describe("startLeaderboardPoll — visibility-gated leaderboard interval", () => {
  it("default cadence is 60s", () => {
    expect(LEADERBOARD_POLL_MS).toBe(60_000);
  });

  it("refetches IMMEDIATELY on activate when visible", () => {
    const deps = { isVisible: () => true, refetch: vi.fn(), intervalMs: LEADERBOARD_POLL_MS };
    const timers = makeIntervalTimers();
    startLeaderboardPoll(deps, timers);
    expect(deps.refetch).toHaveBeenCalledOnce();
    expect(timers.setInterval).toHaveBeenCalledOnce();
  });

  it("does NOT refetch immediately when activated while hidden", () => {
    const deps = { isVisible: () => false, refetch: vi.fn(), intervalMs: LEADERBOARD_POLL_MS };
    const timers = makeIntervalTimers();
    startLeaderboardPoll(deps, timers);
    expect(deps.refetch).not.toHaveBeenCalled();
  });

  it("refetches on each interval tick while visible", () => {
    vi.useFakeTimers();
    try {
      const deps = { isVisible: () => true, refetch: vi.fn(), intervalMs: 60_000 };
      const timers = makeIntervalTimers();
      startLeaderboardPoll(deps, timers);
      expect(deps.refetch).toHaveBeenCalledTimes(1); // immediate
      vi.advanceTimersByTime(60_000);
      expect(deps.refetch).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(60_000);
      expect(deps.refetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the tick when hidden (paused), and never refetches while hidden", () => {
    vi.useFakeTimers();
    try {
      const deps = { isVisible: () => false, refetch: vi.fn(), intervalMs: 60_000 };
      const timers = makeIntervalTimers();
      startLeaderboardPoll(deps, timers);
      vi.advanceTimersByTime(180_000);
      expect(deps.refetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleanup clears the interval — no more refetches after stop", () => {
    vi.useFakeTimers();
    try {
      const deps = { isVisible: () => true, refetch: vi.fn(), intervalMs: 60_000 };
      const timers = makeIntervalTimers();
      const stop = startLeaderboardPoll(deps, timers);
      expect(deps.refetch).toHaveBeenCalledTimes(1); // immediate
      stop();
      expect(timers.clearInterval).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(300_000);
      expect(deps.refetch).toHaveBeenCalledTimes(1); // no further ticks
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── window-receiver guard (structural, mirrors resilience.test.ts) ────────────────
// Native timer fns brand-check their receiver (must be window); Node/jsdom don't, so a bare
// `globalThis.setTimeout` default passes every unit test yet throws "Illegal invocation" in browsers.
// This pins the source to window.* wrapper lambdas.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

describe("poolLive — window-receiver guard (structural, not a runtime browser proof)", () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "poolLive.ts"), "utf8");

  it("reveal-clock default timers delegate via window.setTimeout / window.clearTimeout lambdas", () => {
    expect(src).toContain("(fn, ms) => window.setTimeout(fn, ms)");
    expect(src).toContain("(id) => window.clearTimeout(id)");
    expect(src).not.toMatch(/setTimeout:\s*globalThis\.setTimeout[^.]/);
  });

  it("poll default timers delegate via window.setInterval / window.clearInterval lambdas", () => {
    expect(src).toContain("(fn, ms) => window.setInterval(fn, ms)");
    expect(src).toContain("(id) => window.clearInterval(id)");
    expect(src).not.toMatch(/setInterval:\s*globalThis\.setInterval[^.]/);
  });
});

// ─── reveal-leak guard at the controller layer (Prompt 43 headline invariant) ──────
// A token-grep can't distinguish code from the doc prose that NAMES what's excluded, so the controller
// guard is structural: a pure module whose ONLY import is its own types cannot subscribe to anything —
// it can surface another manager's pick by no means other than the injected gated refetch.

describe("poolLive — no raw pick payloads under any refetch path", () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "poolLive.ts"), "utf8");

  it("imports nothing but its own types — structurally no Realtime/Supabase client", () => {
    const imports = src.match(/^import .*/gm) ?? [];
    expect(imports).toEqual(['import type { PoolFixture, PoolPicksView } from "./types";']);
  });
});
