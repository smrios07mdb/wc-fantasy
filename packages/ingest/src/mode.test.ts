import { describe, it, expect } from "vitest";
import { decideMatchModes, pollerSilentMatches, type ModeMatch } from "./mode";

const T = (iso: string) => new Date(iso).getTime();
const base = { hasRating: false, lineupPulled: false };

describe("decideMatchModes", () => {
  const now = new Date("2026-06-10T19:00:00Z");

  it("a match in_progress → live", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 10,
      status: "in_progress",
      kickoffMs: T("2026-06-10T18:00:00Z"),
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 10)?.mode).toBe("live");
  });

  it("a scheduled match past kickoff with no lineup yet → pre_match", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 11,
      status: "scheduled",
      kickoffMs: T("2026-06-10T18:59:00Z"),
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 11)?.mode).toBe("pre_match");
  });

  it("a completed match with no rating yet → settle", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 12,
      status: "completed",
      kickoffMs: T("2026-06-10T17:00:00Z"),
      lineupPulled: true,
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 12)?.mode).toBe("settle");
  });

  it("a completed match with a rating → idle (dropped)", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 13,
      status: "completed",
      kickoffMs: T("2026-06-10T17:00:00Z"),
      hasRating: true,
      lineupPulled: true,
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 13)).toBeUndefined();
  });

  it("a far-future scheduled match → idle (dropped)", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 14,
      status: "scheduled",
      kickoffMs: T("2026-06-12T18:00:00Z"),
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 14)).toBeUndefined();
  });

  it("an already-pulled scheduled match does NOT re-fire pre_match", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 15,
      status: "scheduled",
      kickoffMs: T("2026-06-10T18:59:00Z"),
      lineupPulled: true,
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 15)).toBeUndefined();
  });
});

describe("pollerSilentMatches", () => {
  it("flags an in_progress match whose last successful live poll is older than the grace window", () => {
    const now = new Date("2026-06-10T19:10:00Z");
    const m: ModeMatch = {
      ...base,
      bdlId: 20,
      status: "in_progress",
      kickoffMs: T("2026-06-10T18:00:00Z"),
      lineupPulled: true,
    };
    const last = new Map<number, number>([[20, T("2026-06-10T19:00:00Z")]]); // 10 min ago
    expect(pollerSilentMatches([m], last, now, 5 * 60_000).map((x) => x.bdlId)).toEqual([20]);
  });

  it("does not flag when a recent poll succeeded", () => {
    const now = new Date("2026-06-10T19:10:00Z");
    const m: ModeMatch = {
      ...base,
      bdlId: 21,
      status: "in_progress",
      kickoffMs: T("2026-06-10T18:00:00Z"),
      lineupPulled: true,
    };
    const last = new Map<number, number>([[21, T("2026-06-10T19:08:00Z")]]);
    expect(pollerSilentMatches([m], last, now, 5 * 60_000)).toEqual([]);
  });
});
