import { describe, it, expect } from "vitest";
import { formatInLeagueTz } from "./time";

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
