import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SDK BEFORE importing the module under test: these tests exercise OUR contracts (the
// never-throw invariant + the dedup filter), not Sentry's transport.
vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  captureConsoleIntegration: vi.fn(() => ({ name: "CaptureConsole" })),
  flush: vi.fn(async () => true),
}));

import * as Sentry from "@sentry/node";
import {
  dropLoggerConsoleDupes,
  sentryCapture,
  sentryCaptureException,
  sentryFlush,
} from "./sentry";

/**
 * HARD-1 F-A01 wiring. The LOAD-BEARING property is the heartbeat.ts safety invariant carried over:
 * every export is purely observational and NEVER throws — a Sentry/SDK failure must never break the
 * log write, the tick, or the shutdown path it rides on.
 */

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dropLoggerConsoleDupes — console-integration dedup of structured logger lines", () => {
  it("drops a console-integration event that is the logger's own JSON line", () => {
    const event = { logger: "console", message: '{"ts":"2026-07-06T00:00:00Z","level":"warn"}' };
    expect(dropLoggerConsoleDupes(event)).toBeNull();
  });

  it("keeps a console-integration event from a package's raw console signal (F-A04)", () => {
    const event = { logger: "console", message: "[ingest.live.foreign_skipped] bdlId=7 …" };
    expect(dropLoggerConsoleDupes(event)).toBe(event);
  });

  it("keeps a non-console event even when its message looks like a logger line", () => {
    const event = { logger: "app", message: '{"ts":"2026-07-06T00:00:00Z"}' };
    expect(dropLoggerConsoleDupes(event)).toBe(event);
  });

  it("keeps a console event with no message at all", () => {
    const event = { logger: "console" };
    expect(dropLoggerConsoleDupes(event)).toBe(event);
  });
});

describe("sentryCapture — the structured-logger hook", () => {
  it("ships a plain warn as captureMessage at 'warning' with the fields as extras", () => {
    sentryCapture("warn", "poller.silent", { matchBdlId: 7 });

    expect(Sentry.captureMessage).toHaveBeenCalledWith("poller.silent", {
      level: "warning",
      extra: { matchBdlId: 7 },
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("ships a plain error as captureMessage at 'error'", () => {
    sentryCapture("error", "scheduler.tick.error", { message: "boom" });

    expect(Sentry.captureMessage).toHaveBeenCalledWith("scheduler.tick.error", {
      level: "error",
      extra: { message: "boom" },
    });
  });

  it("promotes a real Error in fields.error to captureException (keeps the stack)", () => {
    const err = new Error("db down");
    sentryCapture("error", "worker.uncaughtException", { error: err });

    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      level: "error",
      tags: { event: "worker.uncaughtException" },
      extra: { error: err },
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("NEVER throws, even when the SDK itself throws (the log write must survive)", () => {
    vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => {
      throw new Error("sdk exploded");
    });

    expect(() => sentryCapture("error", "any.event", {})).not.toThrow();
  });
});

describe("sentryCaptureException — the fatal-crash capture (index.ts)", () => {
  it("forwards the error, with optional context as extras", () => {
    const err = new Error("fatal");
    sentryCaptureException(err, { reason: "uncaughtException" });

    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      extra: { reason: "uncaughtException" },
    });
  });

  it("NEVER throws when the SDK throws (the crash path must still shut down)", () => {
    vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
      throw new Error("sdk exploded");
    });

    expect(() => sentryCaptureException(new Error("fatal"))).not.toThrow();
  });
});

describe("sentryFlush — the pre-exit drain", () => {
  it("resolves normally when the SDK flushes", async () => {
    await expect(sentryFlush(10)).resolves.toBeUndefined();
    expect(Sentry.flush).toHaveBeenCalledWith(10);
  });

  it("NEVER rejects when the SDK flush rejects (exit code must pass through untouched)", async () => {
    vi.mocked(Sentry.flush).mockRejectedValueOnce(new Error("transport gone"));

    await expect(sentryFlush(10)).resolves.toBeUndefined();
  });
});
