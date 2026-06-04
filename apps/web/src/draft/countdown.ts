/**
 * PURE countdown derivation (ARCHITECTURE.md §5). The on-screen draft clock is PRESENTATION ONLY: it is
 * always a function of the server `pick_deadline_at` and an injected `now`, NEVER an independent
 * client-side counter. The component samples `now` each animation frame (`Date.now()`) and re-syncs the
 * `deadline` from every Realtime broadcast — but the truth is the server deadline + the worker tick that
 * enforces it. Keeping the math here (numbers in, view out) makes that contract unit-testable with an
 * injected `now`, with no DOM and no wall clock.
 */

/** Below this much time remaining, the clock reads "urgent" (red) — matches the design's ≤10s rule. */
export const URGENT_THRESHOLD_MS = 10_000;

export interface CountdownView {
  /** Milliseconds left until the server deadline (never negative). */
  remainingMs: number;
  /** `remainingMs` as whole seconds (ceil — so 00:00 shows only at true expiry). */
  remainingSeconds: number;
  /** "mm:ss". */
  label: string;
  /** Inside the urgent threshold (or expired). */
  isUrgent: boolean;
  /** At or past the deadline (the worker autopick is imminent / just fired). */
  isExpired: boolean;
}

/** Clamped server delta: `max(0, deadline - now)`. */
export function remainingMs(deadlineMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - nowMs);
}

/** Format milliseconds as "mm:ss" (ceil-seconds, clamped at zero). */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Derive the full countdown view from the server `deadlineMs` (or null when there is no live pick) and
 * the injected `nowMs`. This is the only place the clock is computed — the React shell just calls it
 * with a fresh `now` and a freshly-synced `deadline`.
 */
export function countdownView(deadlineMs: number | null, nowMs: number): CountdownView {
  if (deadlineMs === null) {
    return {
      remainingMs: 0,
      remainingSeconds: 0,
      label: "00:00",
      isUrgent: false,
      isExpired: true,
    };
  }
  const ms = remainingMs(deadlineMs, nowMs);
  return {
    remainingMs: ms,
    remainingSeconds: Math.ceil(ms / 1000),
    label: formatCountdown(ms),
    isUrgent: ms <= URGENT_THRESHOLD_MS,
    isExpired: ms <= 0,
  };
}
