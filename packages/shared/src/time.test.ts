import { describe, it, expect } from "vitest";
import {
  formatInLeagueTz,
  formatInLeagueTzTime,
  formatInLeagueTzShort,
  formatInLeagueTzDate,
} from "./time";

describe("formatInLeagueTz — wall clock in the league's IANA zone", () => {
  // 17:00Z = 1:00 PM in America/New_York (EDT, UTC−4 in June) — a deliberately non-UTC zone so the
  // formatted wall clock differs from the stored UTC instant, proving the Intl conversion happens.
  const INSTANT = new Date("2026-06-11T17:00:00.000Z");

  it("renders the local wall clock with the zone abbreviation (not the UTC instant)", () => {
    const s = formatInLeagueTz(INSTANT, "America/New_York");
    expect(s).toContain("1:00 PM"); // 17:00Z → 1:00 PM EDT, NOT 5:00 PM
    expect(s).toContain("EDT"); // surfaces ET/EDT, not the raw IANA id
    expect(s).toContain("Jun"); // includes the date, not just the time
    expect(s).toContain("11");
  });

  it("formats the SAME instant differently per zone (UTC sees 5:00 PM)", () => {
    const s = formatInLeagueTz(INSTANT, "UTC");
    expect(s).toContain("5:00 PM");
    expect(s).toContain("UTC");
  });
});

describe("formatInLeagueTzTime — time-only variant", () => {
  const INSTANT = new Date("2026-06-11T17:00:00.000Z");

  it("renders the local wall-clock time with the zone abbreviation, no date", () => {
    const s = formatInLeagueTzTime(INSTANT, "America/New_York");
    expect(s).toBe("1:00 PM EDT"); // 17:00Z → 1:00 PM EDT
  });

  it("UTC control: same instant renders the UTC wall clock", () => {
    const s = formatInLeagueTzTime(INSTANT, "UTC");
    expect(s).toBe("5:00 PM UTC");
  });
});

describe("formatInLeagueTzShort — compact date+time variant (no weekday)", () => {
  const INSTANT = new Date("2026-06-12T17:00:00.000Z");

  it("renders month/day + local wall clock + zone, without the weekday", () => {
    const s = formatInLeagueTzShort(INSTANT, "America/New_York");
    expect(s).toBe("Jun 12, 1:00 PM EDT");
    expect(s).not.toContain("Fri"); // the weekday is the full formatter's job
  });

  it("UTC control: same instant renders the UTC wall clock and date", () => {
    const s = formatInLeagueTzShort(INSTANT, "UTC");
    expect(s).toBe("Jun 12, 5:00 PM UTC");
  });
});

describe("formatInLeagueTzDate — date-only variant (tz decides WHICH date)", () => {
  // 01:30Z on Jul 2 = 9:30 PM ET on Jul 1 — the exact frozenSince UTC-slice bug shape: the ET
  // calendar date is the PREVIOUS day, so a bare `iso.slice(0, 10)` shows Jul 2 when ET says Jul 1.
  const EVENING_ET_INSTANT = new Date("2026-07-02T01:30:00.000Z");

  it("an evening-ET instant falls on the ET day, not the next UTC day", () => {
    const s = formatInLeagueTzDate(EVENING_ET_INSTANT, "America/New_York");
    expect(s).toBe("Jul 1, 2026");
  });

  it("UTC control: the same instant is the UTC calendar date", () => {
    const s = formatInLeagueTzDate(EVENING_ET_INSTANT, "UTC");
    expect(s).toBe("Jul 2, 2026");
  });
});
