import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Isolate the logger from the real Sentry wiring — these tests pin the emit contract:
// console line format unchanged, and warn/error (and ONLY warn/error) forwarded to the shipper.
vi.mock("./sentry", () => ({ sentryCapture: vi.fn() }));

import { log } from "./logger";
import { sentryCapture } from "./sentry";

let errSpy: ReturnType<typeof vi.spyOn>;
let outSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  outSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Default test env has no LOG_LEVEL ⇒ the logger runs at info (the prod render.yaml level too). */
describe("logger — structured emit + the F-A01 Sentry hook", () => {
  it("error: writes the single-line JSON to console.error AND forwards to sentryCapture", () => {
    log.error("ingest.error", { matchBdlId: 7, message: "boom" });

    expect(errSpy).toHaveBeenCalledTimes(1);
    const line = errSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      level: "error",
      event: "ingest.error",
      matchBdlId: 7,
      message: "boom",
    });
    expect(typeof parsed.ts).toBe("string");

    expect(sentryCapture).toHaveBeenCalledWith("error", "ingest.error", {
      matchBdlId: 7,
      message: "boom",
    });
  });

  it("warn: same console.error sink, forwarded at warn", () => {
    log.warn("poller.silent", { matchBdlId: 9 });

    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(sentryCapture).toHaveBeenCalledWith("warn", "poller.silent", { matchBdlId: 9 });
  });

  it("info: console.log only — NEVER shipped to Sentry", () => {
    log.info("scheduler.swept", { playerMatches: 3 });

    expect(outSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).not.toHaveBeenCalled();
    expect(sentryCapture).not.toHaveBeenCalled();
  });

  it("debug below the level threshold: no console write AND no Sentry ship (filter gates both)", () => {
    log.debug("scheduler.skip", { reason: "overlap" });

    expect(outSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    expect(sentryCapture).not.toHaveBeenCalled();
  });

  it("writes the console line BEFORE invoking the shipper (log-of-record ordering)", () => {
    const order: string[] = [];
    errSpy.mockImplementation(() => {
      order.push("console");
    });
    vi.mocked(sentryCapture).mockImplementationOnce(() => {
      order.push("sentry");
    });

    log.error("any.event", {});

    expect(order).toEqual(["console", "sentry"]);
  });
});
