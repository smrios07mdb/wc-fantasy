import { describe, it, expect } from "vitest";
import { lockInstantsFromLineup, lockInstantFromSub, type LineupAppearance } from "./lock";

const kickoff = new Date("2026-06-10T18:00:00Z");

describe("lockInstantsFromLineup", () => {
  it("locks every official-XI starter at kickoff; benched-by-real-team players are absent", () => {
    const xi: LineupAppearance[] = [
      { playerBdlId: 1, isStarter: true },
      { playerBdlId: 2, isStarter: true },
      { playerBdlId: 3, isStarter: false },
    ];
    const locks = lockInstantsFromLineup(xi, kickoff);
    expect(locks).toEqual([
      { playerBdlId: 1, lockedAt: kickoff },
      { playerBdlId: 2, lockedAt: kickoff },
    ]);
    expect(locks.find((l) => l.playerBdlId === 3)).toBeUndefined(); // bench (not in XI) stays unlocked
  });
});

describe("lockInstantFromSub", () => {
  it("locks a substitute at his effective entry minute (incl. added_time)", () => {
    const lock = lockInstantFromSub({ playerInBdlId: 7, timeMinute: 61, addedTime: 2 }, kickoff);
    expect(lock).toEqual({ playerBdlId: 7, lockedAt: new Date("2026-06-10T19:03:00Z") }); // +63 min
  });
  it("treats a missing added_time as 0", () => {
    const lock = lockInstantFromSub({ playerInBdlId: 7, timeMinute: 61, addedTime: null }, kickoff);
    expect(lock?.lockedAt).toEqual(new Date("2026-06-10T19:01:00Z"));
  });
  it("returns null for an event with no player_in", () => {
    expect(
      lockInstantFromSub({ playerInBdlId: null, timeMinute: 61, addedTime: null }, kickoff),
    ).toBeNull();
  });
});
