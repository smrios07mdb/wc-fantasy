import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter } from "./rateLimiter";

afterEach(() => vi.useRealTimers());

describe("createRateLimiter", () => {
  it("spaces calls to the configured rate (5/min ⇒ ≥12s apart)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const now = () => Date.now();
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const limiter = createRateLimiter({ requestsPerMinute: 5, now, sleep });
    const stamps: number[] = [];

    const run = async () => {
      for (let i = 0; i < 3; i++) {
        await limiter.acquire();
        stamps.push(now());
      }
    };
    const p = run();
    await vi.runAllTimersAsync();
    await p;

    expect(stamps[0]).toBe(0);
    expect(stamps[1]).toBe(12_000);
    expect(stamps[2]).toBe(24_000);
  });

  it("does not delay when calls are already spaced out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = createRateLimiter({
      requestsPerMinute: 600, // 100ms apart
      now: () => Date.now(),
      sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    });
    await limiter.acquire(); // t=0
    vi.setSystemTime(5_000); // 5s later — well past the 100ms gap
    const before = Date.now();
    await limiter.acquire();
    expect(Date.now()).toBe(before); // no sleep
  });
});
