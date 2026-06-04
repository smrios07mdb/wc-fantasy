import { describe, it, expect } from "vitest";
import { scorePlayerMatch } from "@app/scoring";
import { buildScoreInput, type ScoreInputBundle, type StatRow } from "./adapter";
import { MemoryStore } from "./memoryStore";
import { recomputePlayerMatch, recomputeManagerPeriod, sweep } from "./recompute";

function zeroStat(): StatRow {
  return {
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    keyPasses: 0,
    dribblesAttempted: 0,
    dribblesCompleted: 0,
    duelsWon: 0,
    duelsLost: 0,
    passesTotal: 0,
    passesAccurate: 0,
    longBallsTotal: 0,
    longBallsAccurate: 0,
    wasFouled: 0,
    clearances: 0,
    blockedShots: 0,
    interceptions: 0,
    tacklesWon: 0,
    saves: 0,
    savesInsideBox: 0,
    punches: 0,
    highClaims: 0,
    possessionLost: 0,
  };
}

function makeBundle(
  playerId: string,
  role: ScoreInputBundle["role"],
  stat: Partial<StatRow>,
  rating: number | null = null,
): ScoreInputBundle {
  return {
    playerId,
    role,
    rating,
    ratingSource: rating != null ? "scrape" : null,
    stat: { ...zeroStat(), ...stat },
    manual: null,
    events: [],
    shots: [],
    team: {
      playerTeamId: "A",
      homeTeamId: "A",
      awayTeamId: "B",
      homeScore: 0,
      awayScore: 0,
      teamByPlayerId: {},
    },
  };
}

describe("recomputePlayerMatch", () => {
  it("writes points == scorePlayerMatch(...).total and the exact breakdown (no adapter drift)", async () => {
    const store = new MemoryStore();
    const b = makeBundle("p1", "FWD", { minutesPlayed: 90, goals: 2 }, 8.1);
    store.seedPlayerMatch("m1", "p1", b);

    const result = await recomputePlayerMatch(store, "m1", "p1");
    const expected = scorePlayerMatch(buildScoreInput(b));

    expect(result?.points).toBe(expected.total);
    expect(store.writtenPlayerScore("m1", "p1")).toEqual(expected);
    expect(store.isRawDirty("m1", "p1")).toBe(false); // dirty cleared last
  });

  it("returns null when the (match, player) has no input rows", async () => {
    expect(await recomputePlayerMatch(new MemoryStore(), "mX", "pX")).toBeNull();
  });
});

/** Seed a manager M, period P, match m1 lineup where every listed player played m1 in P. */
function seedLineup(store: MemoryStore): void {
  store.seedManagerLeague("M", "L");
  store.seedPlayerMatch(
    "m1",
    "starter1",
    makeBundle("starter1", "FWD", { minutesPlayed: 90, goals: 1 }, 7.6),
  );
  store.seedPlayerMatch(
    "m1",
    "starter2",
    makeBundle("starter2", "MID", { minutesPlayed: 90 }, 7.1),
  );
  store.seedPlayerMatch(
    "m1",
    "bench1",
    makeBundle("bench1", "FWD", { minutesPlayed: 90, goals: 3 }, 9.2),
  );
  store.seedSlot("M", "P", "starter1", true);
  store.seedSlot("M", "P", "starter2", true);
  store.seedSlot("M", "P", "bench1", false); // bench — excluded
  store.seedSlot("M", "P", "starter3", true); // unplayed starter — contributes 0
  for (const p of ["starter1", "starter2", "bench1"]) store.seedPlaysIn(p, "P", "m1");
}

describe("recomputeManagerPeriod (via sweep) — starters only", () => {
  it("sums STARTER scores, excludes the bench, and counts an unplayed starter as 0", async () => {
    const store = new MemoryStore();
    seedLineup(store);

    await sweep(store);

    const s1 = store.writtenPlayerScore("m1", "starter1")!.total;
    const s2 = store.writtenPlayerScore("m1", "starter2")!.total;
    const bench = store.writtenPlayerScore("m1", "bench1")!.total;

    expect(store.writtenManagerScore("M", "P")).toBe(s1 + s2); // starter3 = 0, bench1 excluded
    expect(bench).toBeGreaterThan(0); // proves it was scored yet deliberately left out
  });
});

describe("dirty-flag propagation + idempotency", () => {
  it("walks (match,player) → (manager,period) → standing, clears flags, and a 2nd sweep is a no-op", async () => {
    const store = new MemoryStore();
    seedLineup(store);

    const first = await sweep(store);
    expect(first.playerMatches).toBe(3);
    expect(first.managerPeriods).toBe(1);

    // player scores cleared dirty; manager score written; standing MARKED (not computed).
    expect(store.isRawDirty("m1", "starter1")).toBe(false);
    expect(store.writtenManagerScore("M", "P")).toBeDefined();
    expect(store.standingMarkers()).toEqual([{ leagueId: "L", managerId: "M" }]);
    expect(store.pendingManagerPeriods()).toEqual([]);

    const second = await sweep(store);
    expect(second).toEqual({ playerMatches: 0, managerPeriods: 0, skippedFrozen: 0 });
    expect(store.standingMarkers()).toHaveLength(1); // no duplicate standing marker
  });

  it("recomputes ONLY dirty player-matches", async () => {
    const store = new MemoryStore();
    store.seedPlayerMatch("m1", "dirtyP", makeBundle("dirtyP", "MID", { minutesPlayed: 90 }, 7.0), {
      dirty: true,
    });
    store.seedPlayerMatch("m1", "cleanP", makeBundle("cleanP", "MID", { minutesPlayed: 90 }, 7.0), {
      dirty: false,
    });

    const r = await sweep(store);

    expect(r.playerMatches).toBe(1);
    expect(store.writtenPlayerScore("m1", "dirtyP")).toBeDefined();
    expect(store.writtenPlayerScore("m1", "cleanP")).toBeUndefined();
  });
});

describe("frozen-period gate (DECISIONS → Theme C)", () => {
  it("a late correction does NOT restate a frozen period — until a commissioner override is passed", async () => {
    const store = new MemoryStore();
    seedLineup(store);
    store.freezePeriod("P");

    // Default sweep: player score recomputes, but the frozen manager-period is skipped.
    const frozenSweep = await sweep(store);
    expect(frozenSweep.skippedFrozen).toBe(1);
    expect(frozenSweep.managerPeriods).toBe(0);
    expect(store.writtenManagerScore("M", "P")).toBeUndefined(); // not restated
    expect(store.standingMarkers()).toEqual([]); // not propagated
    expect(store.pendingManagerPeriods()).toHaveLength(1); // marker left for an override pass

    // Commissioner override: now it restates.
    const overrideSweep = await sweep(store, { allowFrozen: true });
    expect(overrideSweep.managerPeriods).toBe(1);
    expect(store.writtenManagerScore("M", "P")).toBeDefined();
    expect(store.standingMarkers()).toEqual([{ leagueId: "L", managerId: "M" }]);
  });

  it("recomputeManagerPeriod reports skipped for a frozen period without override", async () => {
    const store = new MemoryStore();
    store.seedManagerLeague("M", "L");
    store.freezePeriod("P");
    const r = await recomputeManagerPeriod(store, "M", "P");
    expect(r.skipped).toBe(true);
    expect(store.writtenManagerScore("M", "P")).toBeUndefined();
  });
});
