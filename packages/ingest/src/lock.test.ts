import { describe, it, expect } from "vitest";
import { lockInstantsFromLineup, lockInstantFromSub, type LineupAppearance } from "./lock";

const kickoff = new Date("2026-06-10T18:00:00Z");
const afterKickoff = new Date("2026-06-10T18:05:00Z"); // match has kicked off
const beforeKickoff = new Date("2026-06-10T17:30:00Z"); // 30 min pre-kickoff

describe("lockInstantsFromLineup", () => {
  it("locks every official-XI starter at kickoff once the match has kicked off; bench is absent", () => {
    const xi: LineupAppearance[] = [
      { playerBdlId: 1, isStarter: true },
      { playerBdlId: 2, isStarter: true },
      { playerBdlId: 3, isStarter: false },
    ];
    const locks = lockInstantsFromLineup(xi, kickoff, afterKickoff);
    expect(locks).toEqual([
      { playerBdlId: 1, lockedAt: kickoff },
      { playerBdlId: 2, lockedAt: kickoff },
    ]);
    expect(locks.find((l) => l.playerBdlId === 3)).toBeUndefined(); // bench (not in XI) stays unlocked
  });

  it("locks the starters exactly AT kickoff (>= boundary is inclusive)", () => {
    const xi: LineupAppearance[] = [{ playerBdlId: 1, isStarter: true }];
    expect(lockInstantsFromLineup(xi, kickoff, kickoff)).toEqual([
      { playerBdlId: 1, lockedAt: kickoff },
    ]);
  });

  it("stamps NOTHING before kickoff — a not-yet-kicked-off match never locks a starter", () => {
    const xi: LineupAppearance[] = [
      { playerBdlId: 1, isStarter: true },
      { playerBdlId: 2, isStarter: true },
    ];
    expect(lockInstantsFromLineup(xi, kickoff, beforeKickoff)).toEqual([]);
  });
});

describe("lockInstantFromSub", () => {
  it("locks a substitute at his effective entry minute (incl. added_time) once it has passed", () => {
    // entry = kickoff + 63 min = 19:03; now is later in the match.
    const lock = lockInstantFromSub(
      { playerInBdlId: 7, timeMinute: 61, addedTime: 2 },
      kickoff,
      afterKickoff,
    );
    expect(lock).toBeNull(); // afterKickoff (18:05) is BEFORE the 19:03 entry → not yet locked
  });
  it("locks the sub once his entry instant has actually arrived", () => {
    const now = new Date("2026-06-10T19:10:00Z"); // past the 19:03 entry
    const lock = lockInstantFromSub(
      { playerInBdlId: 7, timeMinute: 61, addedTime: 2 },
      kickoff,
      now,
    );
    expect(lock).toEqual({ playerBdlId: 7, lockedAt: new Date("2026-06-10T19:03:00Z") }); // +63 min
  });
  it("treats a missing added_time as 0", () => {
    const now = new Date("2026-06-10T19:10:00Z");
    const lock = lockInstantFromSub(
      { playerInBdlId: 7, timeMinute: 61, addedTime: null },
      kickoff,
      now,
    );
    expect(lock?.lockedAt).toEqual(new Date("2026-06-10T19:01:00Z"));
  });
  it("returns null for an event with no player_in", () => {
    const now = new Date("2026-06-10T19:10:00Z");
    expect(
      lockInstantFromSub({ playerInBdlId: null, timeMinute: 61, addedTime: null }, kickoff, now),
    ).toBeNull();
  });
});
