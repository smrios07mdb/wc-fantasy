import { describe, it, expect } from "vitest";
import { scorePlayerMatch } from "@app/scoring";
import { buildScoreInput, type ScoreInputBundle, type StatRow } from "./adapter";
import { MemoryStore } from "./memoryStore";
import {
  recomputePlayerMatch,
  recomputeManagerPeriod,
  recomputeStanding,
  sweep,
} from "./recompute";
import { computeStandings, type PeriodScores } from "./standing";

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
  store.seedPeriod("P", { leagueId: "L", kind: "group_md" }); // group_md → the standing phase can compute
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
  it("walks (match,player) → (manager,period) → standing end-to-end, clears flags, and a 2nd sweep is a no-op", async () => {
    const store = new MemoryStore();
    seedLineup(store);

    const first = await sweep(store);
    expect(first.playerMatches).toBe(3);
    expect(first.managerPeriods).toBe(1);
    expect(first.standings).toBe(1);

    // Full chain: player scores cleared dirty; manager score written; standing COMPUTED + marker cleared.
    expect(store.isRawDirty("m1", "starter1")).toBe(false);
    const mp = store.writtenManagerScore("M", "P");
    expect(mp).toBeDefined();
    expect(store.writtenStanding("L", "M")).toMatchObject({
      scope: "group_stage",
      allPlayAllW: 0, // lone manager → no opponents
      allPlayAllL: 0,
      totalPoints: mp,
      seed: 1,
    });
    expect(store.standingMarkers()).toEqual([]); // marker cleared last
    expect(store.pendingManagerPeriods()).toEqual([]);

    const second = await sweep(store);
    expect(second).toEqual({ playerMatches: 0, managerPeriods: 0, skippedFrozen: 0, standings: 0 });
    expect(store.standingMarkers()).toEqual([]); // still clean — nothing re-marked
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

    // Default sweep: player score recomputes, but the frozen manager-period is skipped → nothing
    // propagates to standing either (the gate is transitive).
    const frozenSweep = await sweep(store);
    expect(frozenSweep.skippedFrozen).toBe(1);
    expect(frozenSweep.managerPeriods).toBe(0);
    expect(frozenSweep.standings).toBe(0);
    expect(store.writtenManagerScore("M", "P")).toBeUndefined(); // not restated
    expect(store.standingMarkers()).toEqual([]); // not propagated
    expect(store.writtenStanding("L", "M")).toBeUndefined(); // standing never computed
    expect(store.pendingManagerPeriods()).toHaveLength(1); // marker left for an override pass

    // Commissioner override: now it restates AND flows through to standing.
    const overrideSweep = await sweep(store, { allowFrozen: true });
    expect(overrideSweep.managerPeriods).toBe(1);
    expect(overrideSweep.standings).toBe(1);
    expect(store.writtenManagerScore("M", "P")).toBeDefined();
    expect(store.writtenStanding("L", "M")).toMatchObject({ scope: "group_stage", seed: 1 });
    expect(store.standingMarkers()).toEqual([]); // computed → marker cleared
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

describe("recomputeStanding (IO writer) — Theme C all-play-all + seeding", () => {
  it("writes standing rows with NO drift from the pure computation, over group_md periods only", async () => {
    const store = new MemoryStore();
    store.seedPeriod("MD1", { leagueId: "L", kind: "group_md" });
    store.seedPeriod("MD2", { leagueId: "L", kind: "group_md" });
    store.seedPeriod("KO1", { leagueId: "L", kind: "knockout_round", cutCount: 1 }); // ignored

    const md1 = { M1: 30, M2: 20, M3: 10 };
    const md2 = { M1: 5, M2: 25, M3: 15 };
    for (const [m, p] of Object.entries(md1)) store.seedManagerPeriodScore(m, "MD1", p);
    for (const [m, p] of Object.entries(md2)) store.seedManagerPeriodScore(m, "MD2", p);
    store.seedManagerPeriodScore("M1", "KO1", 1000); // a playoff score must NOT leak into group seeding

    const written = await recomputeStanding(store, "L");
    expect(written).toBe(3);

    const expected: PeriodScores[] = [
      {
        periodId: "MD1",
        scores: Object.entries(md1).map(([managerId, points]) => ({ managerId, points })),
      },
      {
        periodId: "MD2",
        scores: Object.entries(md2).map(([managerId, points]) => ({ managerId, points })),
      },
    ];
    for (const row of computeStandings(expected)) {
      expect(store.writtenStanding("L", row.managerId)).toMatchObject({
        scope: "group_stage",
        allPlayAllW: row.allPlayAllW,
        allPlayAllL: row.allPlayAllL,
        totalPoints: row.totalPoints,
        seed: row.seed,
      });
    }
    // The 1000-pt knockout score is excluded → M1's total is 35, not 1035.
    expect(store.writtenStanding("L", "M1")?.totalPoints).toBe(35);
  });
});

describe("standing phase of sweep — end-to-end chain", () => {
  it("a score_manager_period change → standing dirty → sweep upserts standing & clears markers; 2nd sweep no-op", async () => {
    const store = new MemoryStore();
    store.seedPeriod("P", { leagueId: "L", kind: "group_md" });
    store.seedManagerPeriodScore("M1", "P", 30);
    store.seedManagerPeriodScore("M2", "P", 10);
    // Simulate the manager-period phase having marked the league's standing dirty.
    await store.enqueueStandingDirty("L", "M1");
    await store.enqueueStandingDirty("L", "M2");

    const first = await sweep(store);
    expect(first.standings).toBe(1); // one league recomputed
    expect(store.writtenStanding("L", "M1")).toMatchObject({
      allPlayAllW: 1,
      totalPoints: 30,
      seed: 1,
    });
    expect(store.writtenStanding("L", "M2")).toMatchObject({
      allPlayAllW: 0,
      totalPoints: 10,
      seed: 2,
    });
    expect(store.standingMarkers()).toEqual([]); // markers cleared last

    const second = await sweep(store);
    expect(second).toEqual({ playerMatches: 0, managerPeriods: 0, skippedFrozen: 0, standings: 0 });
  });

  it("standings derived from a FROZEN period don't shift when a late correction is attempted", async () => {
    const store = new MemoryStore();
    store.seedManagerLeague("M1", "L");
    store.seedPeriod("P", { leagueId: "L", kind: "group_md" });
    // The frozen period's stable score_manager_period rows.
    store.seedManagerPeriodScore("M1", "P", 30);
    store.seedManagerPeriodScore("M2", "P", 10);
    await recomputeStanding(store, "L");
    const before = store.writtenStanding("L", "M1");
    expect(before).toMatchObject({ allPlayAllW: 1, totalPoints: 30, seed: 1 });

    // Freeze P, then a late correction that WOULD raise M1's period score lands.
    store.freezePeriod("P");
    store.seedPlayerMatch(
      "m1",
      "p1",
      makeBundle("p1", "FWD", { minutesPlayed: 90, goals: 3 }, 9.5),
    );
    store.seedSlot("M1", "P", "p1", true);
    store.seedPlaysIn("p1", "P", "m1");

    const corrected = await sweep(store); // no override
    expect(corrected.skippedFrozen).toBe(1); // manager-period gate held
    expect(store.writtenManagerScore("M1", "P")).toBe(30); // NOT restated
    expect(corrected.standings).toBe(0); // nothing marked standing → standing untouched
    expect(store.writtenStanding("L", "M1")).toEqual(before); // standing unchanged transitively
  });
});
