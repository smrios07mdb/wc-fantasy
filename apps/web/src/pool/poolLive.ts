/**
 * Live-update orchestration for the /pool pick'em screen (Prompt 43), extracted from the React shell so
 * it is unit-testable in Node with no DOM (mirrors draft `resilience.ts` + vsfield `liveController.ts`).
 * Two mechanisms, BOTH on-read — there is NO Realtime subscription and NO stored score table:
 *
 *   1. CLOCK-REVEAL (`nextRevealInstant` + `startRevealClock`). Others' picks are revealed ONLY once a
 *      match has kicked off (the server's anti-copying query gates on `match.kickoffAt <= now`, NOT RLS —
 *      Prompt 40). So the soonest instant at which a currently-hidden match would reveal is the soonest
 *      STRICTLY-future `kickoffAt`. We schedule ONE timer to that instant; on fire we trigger the existing
 *      gated refetch (`router.refresh()` → re-runs `loadPool`, which re-applies the kickoff gate with
 *      SERVER `now`), then re-derive the next instant. The client clock only decides WHEN to refetch — the
 *      server stays authoritative on WHAT is revealed, so client drift only shifts timing by seconds.
 *
 *   2. LEADERBOARD POLL (`handleLeaderboardVisible` + `startLeaderboardPoll`). While the Leaderboard tab is
 *      active AND the document is visible (Page Visibility API), refetch the on-read leaderboard loader on
 *      a 60s interval, plus immediately on tab-activate and on visibilitychange→visible; paused when the
 *      Picks tab is active (the controller is torn down) or the document is hidden (the gated tick skips).
 *
 * REVEAL-LEAK GUARD (the Prompt 43 headline invariant): these controllers never carry a raw pick payload.
 * The ONLY way they surface another manager's prediction is by asking the page to re-run the gated loader
 * (`onReveal` / `refetch` = `router.refresh()`). No `postgres_changes`, no channel, no `pool_pick` rows —
 * so there is no path by which a pre-kickoff prediction can reach the client ahead of the server gate.
 *
 * Every dependency (timers, the visibility predicate, the clock, the refetch) is injected; the shell
 * passes window's timers + `document` visibility + `router.refresh`, and the tests pass fakes.
 */
import type { PoolFixture, PoolPicksView } from "./types";

/** Leaderboard poll cadence (ms) — the §2 visibility-gated interval. */
export const LEADERBOARD_POLL_MS = 60_000;

/**
 * Minimal timer abstractions, typed with `number` IDs (the browser contract). Using
 * `typeof globalThis.setTimeout` directly collides with @types/node (Node returns `NodeJS.Timeout`,
 * the browser returns `number`); a bespoke interface sidesteps that entirely. The production defaults
 * delegate through `window.*` lambdas — a bare `globalThis.setTimeout` ref loses its window receiver and
 * throws "Illegal invocation" in browsers (which brand-check the receiver), an error Node/jsdom never see.
 */
export interface TimeoutTimerFns {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}
export interface IntervalTimerFns {
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

const DEFAULT_TIMEOUT_TIMERS: TimeoutTimerFns = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};
const DEFAULT_INTERVAL_TIMERS: IntervalTimerFns = {
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
};

// ─── clock-reveal ──────────────────────────────────────────────────────────────────────────

/**
 * The soonest instant at which a currently-hidden match's others' picks would become revealable: the
 * minimum `kickoffAt` STRICTLY greater than `now`. `null` when nothing is hidden+future (so the caller
 * never schedules a past instant). Shared instants coalesce naturally — the minimum is a single value.
 *
 * "Hidden" is purely kickoff-based, mirroring the server gate (`kickoffAt <= now` → revealed): a match at
 * exactly `now` is already revealed and is excluded. The client can't know whether a future match has any
 * OTHER managers' picks (the loader deliberately withholds them), so any future kickoff is a candidate; a
 * refetch that reveals nothing is harmless (the server simply returns the same set).
 */
export function nextRevealInstant(
  fixtures: readonly Pick<PoolFixture, "kickoffAt">[],
  now: Date,
): Date | null {
  const nowMs = now.getTime();
  let soonest: number | null = null;
  for (const f of fixtures) {
    const ms = new Date(f.kickoffAt).getTime();
    if (ms > nowMs && (soonest === null || ms < soonest)) soonest = ms;
  }
  return soonest === null ? null : new Date(soonest);
}

/** Flatten the Picks-tab structure into every real fixture (matchdays + bracket rounds + unscheduled). */
export function flattenPickFixtures(picks: PoolPicksView): PoolFixture[] {
  return [
    ...picks.matchdays.flatMap((s) => s.fixtures),
    ...picks.bracket.flatMap((r) => r.fixtures),
    ...picks.unscheduled,
  ];
}

export interface RevealClockDeps {
  /** The current fixtures (read live so a re-derive after a refetch sees fresh data). */
  getFixtures(): readonly Pick<PoolFixture, "kickoffAt">[];
  /** The client clock in epoch-ms (the shell passes `Date.now`). */
  now(): number;
  /** Trigger the existing gated refetch — `router.refresh()` re-runs `loadPool` under the server gate. */
  onReveal(): void;
}

/**
 * Schedule ONE timer to the next reveal instant; on fire, trigger the gated refetch and re-derive the
 * next instant from the (now-advanced) clock — the just-crossed match falls out, so the timer walks the
 * kickoff schedule one match at a time. Self-rescheduling (not a re-render) owns the cycle, so the shell
 * mounts this once; `getFixtures()`/`now()` read live state. Returns a cleanup fn that clears the pending
 * timer and blocks any further scheduling.
 */
export function startRevealClock(
  deps: RevealClockDeps,
  timers: TimeoutTimerFns = DEFAULT_TIMEOUT_TIMERS,
): () => void {
  let handle: number | null = null;
  let stopped = false;

  const schedule = (): void => {
    if (stopped) return;
    const nowMs = deps.now();
    const instant = nextRevealInstant(deps.getFixtures(), new Date(nowMs));
    if (instant === null) return; // nothing hidden+future → never schedule a past instant
    handle = timers.setTimeout(
      () => {
        handle = null;
        deps.onReveal(); // refetch the gated read (server re-applies the kickoff gate)
        schedule(); // re-derive the next reveal instant
      },
      Math.max(0, instant.getTime() - nowMs),
    );
  };

  schedule();
  return () => {
    stopped = true;
    if (handle !== null) {
      timers.clearTimeout(handle);
      handle = null;
    }
  };
}

// ─── leaderboard poll ──────────────────────────────────────────────────────────────────────

export interface LeaderboardPollDeps {
  /** True when the document is visible (the shell passes `() => !document.hidden`). */
  isVisible(): boolean;
  /** Refetch the on-read leaderboard loader — `router.refresh()` (no new endpoint, no stored table). */
  refetch(): void;
}

/**
 * The visibility-gated refetch primitive, shared by tab-activate, the interval tick, and the
 * visibilitychange→visible handler: refetch ONLY when the document is visible (hidden ⇒ paused).
 */
export function handleLeaderboardVisible(deps: LeaderboardPollDeps): void {
  if (deps.isVisible()) deps.refetch();
}

/**
 * Start the §2 leaderboard poll. Refetches immediately on activate (visibility-gated), then every
 * `intervalMs` while visible; a tick fired while the document is hidden is skipped. Returns a cleanup fn
 * that clears the interval (the shell calls it when the Picks tab re-activates or the screen unmounts).
 */
export function startLeaderboardPoll(
  deps: LeaderboardPollDeps & { intervalMs: number },
  timers: IntervalTimerFns = DEFAULT_INTERVAL_TIMERS,
): () => void {
  handleLeaderboardVisible(deps); // immediate refetch on activate (visibility-gated)
  const id = timers.setInterval(() => handleLeaderboardVisible(deps), deps.intervalMs);
  return () => timers.clearInterval(id);
}
