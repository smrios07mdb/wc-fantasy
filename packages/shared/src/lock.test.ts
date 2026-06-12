import { describe, it, expect } from "vitest";
import { isLockedNow } from "./lock";

const now = new Date("2026-06-11T20:00:00Z");

describe("isLockedNow", () => {
  it("is NOT locked when locked_at is null (never stamped)", () => {
    expect(isLockedNow(null, now)).toBe(false);
  });

  it("is NOT locked when locked_at is in the FUTURE (stamped but not yet reached)", () => {
    expect(isLockedNow(new Date("2026-06-18T02:00:00Z"), now)).toBe(false);
  });

  it("is locked when locked_at is in the PAST", () => {
    expect(isLockedNow(new Date("2026-06-11T19:00:00Z"), now)).toBe(true);
  });

  it("is locked exactly AT now (>= boundary is inclusive — kickoff has arrived)", () => {
    expect(isLockedNow(new Date("2026-06-11T20:00:00Z"), now)).toBe(true);
  });
});
