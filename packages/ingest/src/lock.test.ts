import { describe, it, expect } from "vitest";
import {
  lockInstantsFromLineup,
  lockInstantFromSub,
  lockInstantsFromAppearances,
  isLockWriteAuthorized,
  type LineupAppearance,
} from "./lock";

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

describe("lockInstantsFromAppearances (coverage reconciliation)", () => {
  it("locks EVERY appeared player at kickoff once the match has kicked off", () => {
    // The authoritative appearance set (score_player_match): a starter the XI-pull missed AND a sub the
    // live event missed both reconcile to a kickoff lock — closing the under-stamping coverage gap.
    expect(lockInstantsFromAppearances([4, 5, 9], kickoff, afterKickoff)).toEqual([
      { playerBdlId: 4, lockedAt: kickoff },
      { playerBdlId: 5, lockedAt: kickoff },
      { playerBdlId: 9, lockedAt: kickoff },
    ]);
  });

  it("locks AT kickoff (>= boundary inclusive)", () => {
    expect(lockInstantsFromAppearances([4], kickoff, kickoff)).toEqual([
      { playerBdlId: 4, lockedAt: kickoff },
    ]);
  });

  it("stamps NOTHING before kickoff — preserves the write-boundary invariant", () => {
    expect(lockInstantsFromAppearances([4, 5], kickoff, beforeKickoff)).toEqual([]);
  });

  it("is empty for an empty appearance set (no players → no locks)", () => {
    expect(lockInstantsFromAppearances([], kickoff, afterKickoff)).toEqual([]);
  });
});

describe("isLockWriteAuthorized (the lock-write invariant)", () => {
  // A fully-authorising baseline: in-play source match, player on the home side, instant arrived.
  const ok = {
    periodId: "md1",
    matchStatus: "in_progress",
    homeTeamId: "team-A",
    awayTeamId: "team-B",
    playerTeamId: "team-A",
    lockedAtMs: kickoff.getTime(),
    nowMs: afterKickoff.getTime(),
  };

  it("authorises a participant of an in-play match once the instant has arrived", () => {
    expect(isLockWriteAuthorized(ok)).toEqual({ ok: true });
    expect(isLockWriteAuthorized({ ...ok, playerTeamId: "team-B" })).toEqual({ ok: true }); // away side
    expect(isLockWriteAuthorized({ ...ok, matchStatus: "completed" })).toEqual({ ok: true });
  });

  it("REFUSES a player whose team is neither side of the source match (the 2026-06-12 leak)", () => {
    // A pooled WC player (France) whose substitution event leaked in from another fixture: his team is
    // not in the live (Canada–Bosnia) match → the categorical kill, independent of timing/mapping bugs.
    expect(isLockWriteAuthorized({ ...ok, playerTeamId: "team-FRANCE" })).toEqual({
      ok: false,
      reason: "player-not-in-match",
    });
    expect(isLockWriteAuthorized({ ...ok, playerTeamId: null })).toEqual({
      ok: false,
      reason: "player-not-in-match",
    });
  });

  it("REFUSES while the source match is not in-play-or-later (scheduled/postponed/abandoned)", () => {
    for (const matchStatus of ["scheduled", "postponed", "abandoned", null]) {
      expect(isLockWriteAuthorized({ ...ok, matchStatus })).toEqual({
        ok: false,
        reason: "match-not-in-play",
      });
    }
  });

  it("REFUSES before the lock instant has arrived (now-gate, re-checked at the boundary)", () => {
    expect(isLockWriteAuthorized({ ...ok, nowMs: beforeKickoff.getTime() })).toEqual({
      ok: false,
      reason: "before-instant",
    });
  });

  it("REFUSES when the source match has no period to scope the slot", () => {
    expect(isLockWriteAuthorized({ ...ok, periodId: null })).toEqual({
      ok: false,
      reason: "no-period",
    });
  });

  it("checks reasons in precedence order: period → instant → status → team", () => {
    // All four wrong at once → the first failed check (no-period) is the reported reason.
    expect(
      isLockWriteAuthorized({
        periodId: null,
        matchStatus: "scheduled",
        homeTeamId: "team-A",
        awayTeamId: "team-B",
        playerTeamId: "team-X",
        lockedAtMs: afterKickoff.getTime(),
        nowMs: beforeKickoff.getTime(),
      }),
    ).toEqual({ ok: false, reason: "no-period" });
  });
});
