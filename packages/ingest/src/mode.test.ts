import { describe, it, expect } from "vitest";
import {
  decideMatchModes,
  pollerSilentMatches,
  anyMatchInLiveWindow,
  matchesNeedingLineupPeek,
  type ModeMatch,
} from "./mode";

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

describe("anyMatchInLiveWindow", () => {
  const PRE = 15 * 60_000;
  const POST = 3 * 60 * 60_000;

  it("is true when a fixture's kickoff is within [now - post, now + pre]", () => {
    const now = new Date("2026-06-10T19:00:00Z");
    const m: ModeMatch = {
      ...base,
      bdlId: 30,
      status: "scheduled",
      kickoffMs: T("2026-06-10T18:30:00Z"),
    };
    expect(anyMatchInLiveWindow([m], now, PRE, POST)).toBe(true);
  });

  it("is false when every fixture is far from now", () => {
    const now = new Date("2026-06-10T19:00:00Z");
    const m: ModeMatch = {
      ...base,
      bdlId: 31,
      status: "scheduled",
      kickoffMs: T("2026-06-12T18:00:00Z"),
    };
    expect(anyMatchInLiveWindow([m], now, PRE, POST)).toBe(false);
  });
});

describe("matchesNeedingLineupPeek (T-75 availability peek)", () => {
  const LEAD = 75 * 60_000;
  const kickoff = T("2026-06-10T18:00:00Z");
  const scheduled = (over: Partial<ModeMatch> = {}): ModeMatch => ({
    ...base,
    bdlId: 40,
    status: "scheduled",
    kickoffMs: kickoff,
    ...over,
  });

  it("fires for a scheduled, un-peeked match inside [kickoff - lead, kickoff)", () => {
    // 60 min before kickoff — well inside the 75-min window.
    expect(matchesNeedingLineupPeek([scheduled()], new Date("2026-06-10T17:00:00Z"), LEAD)).toEqual(
      [40],
    );
  });

  it("fires at the exact lower bound (kickoff - lead is inclusive)", () => {
    expect(matchesNeedingLineupPeek([scheduled()], new Date("2026-06-10T16:45:00Z"), LEAD)).toEqual(
      [40],
    );
  });

  it("does NOT fire before the lead window opens", () => {
    // 90 min before kickoff — earlier than the 75-min lead.
    expect(matchesNeedingLineupPeek([scheduled()], new Date("2026-06-10T16:30:00Z"), LEAD)).toEqual(
      [],
    );
  });

  it("does NOT fire AT kickoff or after (that is pre_match's job, the kickoff lock path)", () => {
    expect(matchesNeedingLineupPeek([scheduled()], new Date("2026-06-10T18:00:00Z"), LEAD)).toEqual(
      [],
    );
    expect(matchesNeedingLineupPeek([scheduled()], new Date("2026-06-10T18:05:00Z"), LEAD)).toEqual(
      [],
    );
  });

  it("does NOT fire once the match has been peeked", () => {
    expect(
      matchesNeedingLineupPeek(
        [scheduled({ lineupPeeked: true })],
        new Date("2026-06-10T17:00:00Z"),
        LEAD,
      ),
    ).toEqual([]);
  });

  it("does NOT fire for a non-scheduled match (in_progress / completed)", () => {
    const now = new Date("2026-06-10T17:00:00Z");
    expect(matchesNeedingLineupPeek([scheduled({ status: "in_progress" })], now, LEAD)).toEqual([]);
    expect(matchesNeedingLineupPeek([scheduled({ status: "completed" })], now, LEAD)).toEqual([]);
  });

  it("GUARD: the peek window and the pre_match (lock) arm are disjoint — neither perturbs the other", () => {
    const m = scheduled();
    // During the peek window (before kickoff): the peek fires; decideMatchModes emits NO pre_match.
    const preKickoff = new Date("2026-06-10T17:00:00Z");
    expect(matchesNeedingLineupPeek([m], preKickoff, LEAD)).toEqual([40]);
    expect(decideMatchModes([m], preKickoff)).toEqual([]);
    // At kickoff: the kickoff lock path (pre_match) fires; the peek does NOT.
    const atKickoff = new Date("2026-06-10T18:00:00Z");
    expect(decideMatchModes([m], atKickoff)).toEqual([{ bdlId: 40, mode: "pre_match" }]);
    expect(matchesNeedingLineupPeek([m], atKickoff, LEAD)).toEqual([]);
  });
});
