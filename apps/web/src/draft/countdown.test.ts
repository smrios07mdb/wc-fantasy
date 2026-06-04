import { describe, it, expect } from "vitest";
import { remainingMs, formatCountdown, countdownView, URGENT_THRESHOLD_MS } from "./countdown";

describe("remainingMs — clamped server delta", () => {
  it("is the deadline minus now, floored at zero", () => {
    expect(remainingMs(1_000_000 + 90_000, 1_000_000)).toBe(90_000);
    expect(remainingMs(1_000_000, 1_000_000)).toBe(0);
    expect(remainingMs(1_000_000 - 5_000, 1_000_000)).toBe(0); // never negative
  });
});

describe("formatCountdown — mm:ss", () => {
  it("renders ceil-seconds so time only hits 00:00 at expiry", () => {
    expect(formatCountdown(90_000)).toBe("01:30");
    expect(formatCountdown(1_500)).toBe("00:02"); // 1.5s still showing → ceil to 2
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5_000)).toBe("00:00");
  });
});

describe("countdownView — derived from (deadline, injected now), never the wall clock", () => {
  it("computes remaining from the server deadline and the injected now", () => {
    // `now` is intentionally far from the real wall clock — if the view read Date.now() this would break.
    const now = 1_000_000;
    const view = countdownView(now + 90_000, now);
    expect(view).toMatchObject({
      remainingMs: 90_000,
      remainingSeconds: 90,
      label: "01:30",
      isUrgent: false,
      isExpired: false,
    });
  });

  it("flags urgent inside the threshold and expired at/after the deadline", () => {
    const now = 5_000_000;
    expect(countdownView(now + URGENT_THRESHOLD_MS - 1, now)).toMatchObject({
      isUrgent: true,
      isExpired: false,
    });
    expect(countdownView(now + URGENT_THRESHOLD_MS + 5_000, now)).toMatchObject({
      isUrgent: false,
    });
    expect(countdownView(now - 1_000, now)).toMatchObject({ label: "00:00", isExpired: true });
  });

  it("re-syncs: a new deadline (a Realtime broadcast) re-derives the remaining time", () => {
    const before = countdownView(2_000_000 + 90_000, 2_000_000);
    expect(before.label).toBe("01:30");
    // …a broadcast advances the clock: same call, a later `now`, a fresh deadline → new remaining.
    const after = countdownView(2_000_000 + 90_000, 2_000_000 + 85_000);
    expect(after.label).toBe("00:05");
    expect(after.isUrgent).toBe(true);
  });

  it("has no live countdown when there is no deadline (lobby / complete)", () => {
    expect(countdownView(null, 9_999)).toMatchObject({
      remainingMs: 0,
      label: "00:00",
      isExpired: true,
    });
  });
});
