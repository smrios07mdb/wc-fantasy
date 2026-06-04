import { describe, it, expect } from "vitest";
import type { Position } from "@app/shared";
import { scorePlayerMatch } from "./index";
import { SCORE_CATEGORIES as C, type ScoreInput, type ScoreBreakdown } from "./types";

// ---------------------------------------------------------------------------------------------
// Test kit: a fully-zeroed, did-not-play baseline (minutes 0 + rating null => no lines at all),
// so every test can switch on exactly the fields it exercises and read a single-line breakdown.
// ---------------------------------------------------------------------------------------------
function base(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    role: "MID",
    minutesPlayed: 0,
    rating: null,
    ratingSource: null,
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
    possessionLost: 0,
    saves: 0,
    savesInsideBox: 0,
    punches: 0,
    highClaims: 0,
    teamGoalsAgainst: 0,
    goalsConcededWhileOn: 0,
    penaltyWon: 0,
    penaltyCommitted: 0,
    penaltyMissed: 0,
    penaltySaved: 0,
    yellowCard: false,
    secondYellowMinute: null,
    redCardMinute: null,
    ownGoals: 0,
    ...overrides,
  };
}

/** Sum of the points booked under a category (0 when the category is absent). */
function pointsFor(b: ScoreBreakdown, category: string): number {
  return b.lines.filter((l) => l.category === category).reduce((s, l) => s + l.points, 0);
}

/** Convenience: score a single line in isolation and read its points. */
function only(category: string, overrides: Partial<ScoreInput>): number {
  return pointsFor(scorePlayerMatch(base(overrides)), category);
}

const OUTFIELD: Position[] = ["DEF", "MID", "FWD"];

describe("invariants", () => {
  it("total always equals the sum of the line points", () => {
    const b = scorePlayerMatch(
      base({
        role: "DEF",
        minutesPlayed: 90,
        rating: 8.2,
        goals: 1,
        assists: 1,
        clearances: 7,
        tacklesWon: 4,
        teamGoalsAgainst: 0,
        yellowCard: true,
        possessionLost: 4,
      }),
    );
    const summed = b.lines.reduce((s, l) => s + l.points, 0);
    expect(b.total).toBe(summed);
  });

  it("is pure: does not mutate its input and is deterministic", () => {
    const input = Object.freeze(
      base({ role: "FWD", minutesPlayed: 77, rating: 7.6, goals: 2, wasFouled: 3 }),
    );
    // A frozen input would throw on any write in module strict mode.
    const a = scorePlayerMatch(input);
    const b = scorePlayerMatch(input);
    expect(a).toEqual(b);
  });

  it("a did-not-play player (0 min, null rating) scores nothing", () => {
    const b = scorePlayerMatch(base({ minutesPlayed: 0, rating: null }));
    expect(b.total).toBe(0);
    expect(b.lines).toEqual([]);
  });
});

describe("§1 Performance rating ladder (only when rating is non-null)", () => {
  it("emits no rating line when rating is null", () => {
    const b = scorePlayerMatch(base({ minutesPlayed: 70, rating: null }));
    expect(pointsFor(b, C.rating)).toBe(0);
    expect(b.lines.some((l) => l.category === C.rating)).toBe(false);
  });

  // [rating, expected band points] — lower-bound inclusive per the overlapping-endpoint table.
  it.each<[number, number]>([
    [0, -2],
    [5.9, -2],
    [6.0, -1],
    [6.4, -1],
    [6.5, 0],
    [6.9, 0],
    [7.0, 1],
    [7.4, 1],
    [7.5, 2],
    [7.9, 2],
    [8.0, 3],
    [8.4, 3],
    [8.5, 4],
    [8.9, 4],
    [9.0, 5],
    [10, 5],
  ])("rating %s scores %s", (rating, expected) => {
    // minutes 0 keeps appearance out so the rating line is the only contributor.
    expect(only(C.rating, { rating })).toBe(expected);
  });

  it("includes the resolver source in the line detail", () => {
    const b = scorePlayerMatch(base({ rating: 7.3, ratingSource: "scrape" }));
    const line = b.lines.find((l) => l.category === C.rating);
    expect(line?.detail).toMatch(/scrape/);
  });
});

describe("§2 Appearance (minutes)", () => {
  it.each<[number, number]>([
    [1, 1],
    [30, 1],
    [59, 1],
    [60, 2],
    [90, 2],
  ])("%s min scores %s", (minutesPlayed, expected) => {
    expect(only(C.appearance, { minutesPlayed })).toBe(expected);
  });

  it("0 minutes scores no appearance", () => {
    expect(only(C.appearance, { minutesPlayed: 0 })).toBe(0);
  });

  it("a played sub with a rating scores BOTH appearance and rating", () => {
    const b = scorePlayerMatch(base({ minutesPlayed: 30, rating: 7.2, ratingSource: "scrape" }));
    expect(pointsFor(b, C.appearance)).toBe(1);
    expect(pointsFor(b, C.rating)).toBe(1);
    expect(b.total).toBe(2);
  });
});

describe("§3 Attacking — position-weighted by role played", () => {
  it.each<[Position, number]>([
    ["GK", 6],
    ["DEF", 6],
    ["MID", 5],
    ["FWD", 4],
  ])("a %s goal is worth %s", (role, weight) => {
    expect(only(C.goals, { role, goals: 1 })).toBe(weight);
    expect(only(C.goals, { role, goals: 2 })).toBe(weight * 2);
  });

  it.each<[Position, number]>([
    ["GK", 4],
    ["DEF", 4],
    ["MID", 3],
    ["FWD", 3],
  ])("a %s assist is worth %s", (role, weight) => {
    expect(only(C.assists, { role, assists: 1 })).toBe(weight);
    expect(only(C.assists, { role, assists: 2 })).toBe(weight * 2);
  });

  it("a forward hat-trick is 3 × 4 = 12", () => {
    expect(only(C.goals, { role: "FWD", goals: 3 })).toBe(12);
  });
});

describe("§4 Universal accumulators — per-N buckets (round down)", () => {
  it.each<[number, number]>([
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 1],
    [4, 2],
  ])("key passes %s -> %s (+1/2)", (keyPasses, expected) => {
    expect(only(C.keyPasses, { keyPasses })).toBe(expected);
  });

  it.each<[number, number]>([
    [2, 0],
    [3, 1],
    [5, 1],
    [6, 2],
  ])("was fouled %s -> %s (+1/3)", (wasFouled, expected) => {
    expect(only(C.wasFouled, { wasFouled })).toBe(expected);
  });

  it.each<[number, number]>([
    [1, 0],
    [4, 0],
    [5, 1],
    [10, 2],
  ])("clearances %s -> %s (+1/5, outfield)", (clearances, expected) => {
    expect(only(C.clearances, { role: "DEF", clearances })).toBe(expected);
  });

  it.each<[number, number]>([
    [1, 0],
    [2, 1],
    [5, 2],
  ])("blocked shots %s -> %s (+1/2, outfield)", (blockedShots, expected) => {
    expect(only(C.blockedShots, { role: "DEF", blockedShots })).toBe(expected);
  });

  it.each<[number, number]>([
    [2, 0],
    [3, 1],
    [6, 2],
  ])("interceptions %s -> %s (+1/3, outfield)", (interceptions, expected) => {
    expect(only(C.interceptions, { role: "DEF", interceptions })).toBe(expected);
  });

  it.each<[number, number]>([
    [2, 0],
    [3, 1],
    [5, 1],
    [6, 2],
  ])("tackles won %s -> %s (+1/3, outfield)", (tacklesWon, expected) => {
    expect(only(C.tacklesWon, { role: "MID", tacklesWon })).toBe(expected);
  });

  it("outfield defensive buckets do NOT score for a role-played GK", () => {
    const b = scorePlayerMatch(
      base({ role: "GK", clearances: 10, blockedShots: 10, interceptions: 9, tacklesWon: 9 }),
    );
    expect(pointsFor(b, C.clearances)).toBe(0);
    expect(pointsFor(b, C.blockedShots)).toBe(0);
    expect(pointsFor(b, C.interceptions)).toBe(0);
    expect(pointsFor(b, C.tacklesWon)).toBe(0);
  });

  it("defensive buckets are FLAT across DEF/MID/FWD (not inverse-weighted)", () => {
    for (const role of OUTFIELD) {
      expect(only(C.tacklesWon, { role, tacklesWon: 6 })).toBe(2);
    }
  });
});

describe("§4 Universal accumulators — threshold-gated flat +1 (all-or-nothing)", () => {
  it.each<[number, number, number]>([
    [2, 2, 0], // < 3 completed -> fails count gate (100% ratio is irrelevant)
    [3, 5, 1], // 3 completed, 60% exactly -> pass
    [3, 6, 0], // 3 completed, 50% -> fail ratio
    [6, 10, 1], // 60% exactly, larger sample -> pass
    [5, 9, 0], // ~55.6% -> fail
  ])("dribbles %s/%s -> %s", (dribblesCompleted, dribblesAttempted, expected) => {
    expect(only(C.dribbles, { dribblesCompleted, dribblesAttempted })).toBe(expected);
  });

  it.each<[number, number, number]>([
    [2, 0, 0], // < 3 won -> fail count
    [3, 3, 1], // 3 won, 50% exactly -> pass
    [3, 4, 0], // 3 won, ~43% -> fail
    [5, 2, 1], // comfortably > 50% -> pass
  ])("duels won %s / lost %s -> %s", (duelsWon, duelsLost, expected) => {
    expect(only(C.duels, { duelsWon, duelsLost })).toBe(expected);
  });

  it.each<[number, number, number]>([
    [39, 37, 0], // 94.8% but < 40 passes -> fail count
    [40, 36, 1], // 40 passes, 90% exactly -> pass
    [40, 35, 0], // 87.5% -> fail ratio
    [50, 44, 0], // 88% -> fail ratio
  ])("passing %s/%s -> %s", (passesTotal, passesAccurate, expected) => {
    expect(only(C.passing, { passesTotal, passesAccurate })).toBe(expected);
  });

  it.each<[number, number, number]>([
    [2, 2, 0], // < 3 accurate -> fail count
    [3, 5, 1], // 3 accurate, 60% exactly -> pass
    [3, 6, 0], // 3 accurate, 50% -> fail
    [6, 10, 1], // 60% -> pass
  ])("long balls %s acc / %s total -> %s", (longBallsAccurate, longBallsTotal, expected) => {
    expect(only(C.longBalls, { longBallsAccurate, longBallsTotal })).toBe(expected);
  });

  it("threshold gates score for any position", () => {
    for (const role of ["GK", ...OUTFIELD] as Position[]) {
      expect(only(C.duels, { role, duelsWon: 4, duelsLost: 1 })).toBe(1);
    }
  });
});

describe("§5 Goalkeeping (role played === GK)", () => {
  it.each<[number, number]>([
    [1, 0],
    [5, 2],
    [6, 3],
    [8, 4],
  ])("saves inside box %s -> %s (+1/2)", (savesInsideBox, expected) => {
    expect(only(C.saveInsideBox, { role: "GK", savesInsideBox })).toBe(expected);
  });

  it.each<[number, number, number]>([
    [9, 6, 1], // outside = 3 -> +1
    [5, 3, 0], // outside = 2 -> 0
    [12, 6, 2], // outside = 6 -> +2
    [4, 6, 0], // bad input (inside > total) clamps outside to 0
  ])("save outside box from saves %s, inside %s -> %s (+1/3)", (saves, savesInsideBox, exp) => {
    expect(only(C.saveOutsideBox, { role: "GK", saves, savesInsideBox })).toBe(exp);
  });

  it.each<[number, number]>([
    [1, 5],
    [2, 10],
  ])("penalty saved x%s -> +%s", (penaltySaved, expected) => {
    expect(only(C.penaltySaved, { role: "GK", penaltySaved })).toBe(expected);
  });

  it.each<[number, number, number]>([
    [1, 0, 0], // total 1 -> 0
    [2, 2, 2], // total 4 -> +2
    [3, 4, 3], // total 7 -> +3
  ])("punches %s + high claims %s -> %s (+1/2)", (punches, highClaims, expected) => {
    expect(only(C.punchesHighClaims, { role: "GK", punches, highClaims })).toBe(expected);
  });

  it("keeping stats do NOT score for a keeper played outfield (role DEF)", () => {
    const b = scorePlayerMatch(
      base({
        role: "DEF",
        saves: 9,
        savesInsideBox: 6,
        penaltySaved: 1,
        punches: 4,
        highClaims: 4,
      }),
    );
    expect(pointsFor(b, C.saveInsideBox)).toBe(0);
    expect(pointsFor(b, C.saveOutsideBox)).toBe(0);
    expect(pointsFor(b, C.penaltySaved)).toBe(0);
    expect(pointsFor(b, C.punchesHighClaims)).toBe(0);
  });
});

describe("§6 Role outcomes — clean sheet & goals conceded (role played ∈ {GK, DEF})", () => {
  it.each<Position>(["GK", "DEF"])(
    "%s with 60+ min and 0 team goals against -> clean sheet +4",
    (role) => {
      expect(only(C.cleanSheet, { role, minutesPlayed: 90, teamGoalsAgainst: 0 })).toBe(4);
      expect(only(C.cleanSheet, { role, minutesPlayed: 60, teamGoalsAgainst: 0 })).toBe(4);
    },
  );

  it("59 minutes earns no clean sheet (the 60+ gate)", () => {
    expect(only(C.cleanSheet, { role: "DEF", minutesPlayed: 59, teamGoalsAgainst: 0 })).toBe(0);
  });

  it("a team goal conceded over the whole match breaks the clean sheet", () => {
    expect(only(C.cleanSheet, { role: "GK", minutesPlayed: 90, teamGoalsAgainst: 1 })).toBe(0);
  });

  it.each<Position>(["MID", "FWD"])("a %s never earns a clean sheet", (role) => {
    expect(only(C.cleanSheet, { role, minutesPlayed: 90, teamGoalsAgainst: 0 })).toBe(0);
  });

  it.each<[number, number]>([
    [1, 0],
    [2, -1],
    [3, -1],
    [4, -2],
  ])("goals conceded while on %s -> %s (−1/2)", (goalsConcededWhileOn, expected) => {
    expect(only(C.goalsConceded, { role: "GK", minutesPlayed: 90, goalsConcededWhileOn })).toBe(
      expected,
    );
  });

  it("DEF takes the goals-conceded penalty; MID/FWD do not", () => {
    expect(only(C.goalsConceded, { role: "DEF", goalsConcededWhileOn: 4 })).toBe(-2);
    expect(only(C.goalsConceded, { role: "MID", goalsConcededWhileOn: 4 })).toBe(0);
    expect(only(C.goalsConceded, { role: "FWD", goalsConcededWhileOn: 4 })).toBe(0);
  });
});

describe("role played, not draft position — the goalie-emergency case", () => {
  it("an outfielder forced into goal (role GK) scores keeping stats + clean sheet like a keeper", () => {
    const b = scorePlayerMatch(
      base({
        role: "GK",
        minutesPlayed: 90,
        saves: 9,
        savesInsideBox: 6,
        penaltySaved: 1,
        punches: 2,
        highClaims: 2,
        teamGoalsAgainst: 0,
        // these outfield stats must NOT score under a GK role:
        clearances: 10,
        tacklesWon: 9,
      }),
    );
    expect(pointsFor(b, C.saveInsideBox)).toBe(3);
    expect(pointsFor(b, C.saveOutsideBox)).toBe(1);
    expect(pointsFor(b, C.penaltySaved)).toBe(5);
    expect(pointsFor(b, C.punchesHighClaims)).toBe(2);
    expect(pointsFor(b, C.cleanSheet)).toBe(4);
    expect(pointsFor(b, C.clearances)).toBe(0);
    expect(pointsFor(b, C.tacklesWon)).toBe(0);
  });

  it("a keeper played outfield (role DEF) gets outfield buckets + clean sheet, not keeping stats", () => {
    const b = scorePlayerMatch(
      base({
        role: "DEF",
        minutesPlayed: 90,
        clearances: 5,
        teamGoalsAgainst: 0,
        saves: 9,
        savesInsideBox: 6,
        penaltySaved: 1,
      }),
    );
    expect(pointsFor(b, C.clearances)).toBe(1);
    expect(pointsFor(b, C.cleanSheet)).toBe(4);
    expect(pointsFor(b, C.saveInsideBox)).toBe(0);
    expect(pointsFor(b, C.penaltySaved)).toBe(0);
  });
});

describe("§7 Penalties (all positions)", () => {
  it.each<[number, number]>([
    [1, 2],
    [2, 4],
  ])("penalty won (manual) x%s -> +%s", (penaltyWon, expected) => {
    expect(only(C.penaltyWon, { penaltyWon })).toBe(expected);
  });

  it.each<[number, number]>([
    [1, -2],
    [2, -4],
  ])("penalty committed (manual) x%s -> %s", (penaltyCommitted, expected) => {
    expect(only(C.penaltyCommitted, { penaltyCommitted })).toBe(expected);
  });

  it.each<[number, number]>([
    [1, -3],
    [2, -6],
  ])("penalty missed x%s -> %s", (penaltyMissed, expected) => {
    expect(only(C.penaltyMissed, { penaltyMissed })).toBe(expected);
  });
});

describe("§8 Discipline & negatives", () => {
  it("a yellow card is −1, none is 0", () => {
    expect(only(C.yellowCard, { yellowCard: true })).toBe(-1);
    expect(only(C.yellowCard, { yellowCard: false })).toBe(0);
  });

  it.each<[number, number]>([
    [0, -3],
    [15, -3],
    [29, -3],
    [30, -2],
    [45, -2],
    [59, -2],
    [60, -1],
    [90, -1],
    [95, -1],
  ])("second yellow at minute %s -> %s", (secondYellowMinute, expected) => {
    expect(only(C.secondYellow, { secondYellowMinute })).toBe(expected);
  });

  it("no second yellow -> 0", () => {
    expect(only(C.secondYellow, { secondYellowMinute: null })).toBe(0);
  });

  it.each<[number, number]>([
    [0, -4],
    [29, -4],
    [30, -3],
    [59, -3],
    [60, -2],
    [90, -2],
    [95, -2],
  ])("straight red at minute %s -> %s", (redCardMinute, expected) => {
    expect(only(C.redCard, { redCardMinute })).toBe(expected);
  });

  it.each<[number, number]>([
    [1, -2],
    [2, -4],
  ])("own goals x%s -> %s", (ownGoals, expected) => {
    expect(only(C.ownGoal, { ownGoals })).toBe(expected);
  });

  it.each<[number, number]>([
    [2, 0],
    [3, -1],
    [7, -2],
    [9, -3],
  ])("possession lost %s -> %s (−1/3, the dispossessed remap)", (possessionLost, expected) => {
    expect(only(C.possessionLost, { possessionLost })).toBe(expected);
  });

  it("a two-yellow dismissal equals a straight red at the same minute (design symmetry)", () => {
    for (const m of [10, 45, 80]) {
      const twoYellow = scorePlayerMatch(base({ yellowCard: true, secondYellowMinute: m }));
      const straightRed = scorePlayerMatch(base({ redCardMinute: m }));
      expect(twoYellow.total).toBe(straightRed.total);
    }
  });
});

// CODE_PROMPT_02 card-handling clarification: card penalties are ADDITIVE across distinct
// bookings — score each event by its own §8 row, suppress nothing. Minute bands are lower-bound
// inclusive with a ≥60 catch-all (so a stoppage-time dismissal lands at the 60+ value, not 0).
describe("§8 card handling — additive stacking matrix (CODE_PROMPT_02 clarification)", () => {
  const has = (b: ScoreBreakdown, category: string): boolean =>
    b.lines.some((l) => l.category === category);
  // base() sets only the card fields under test, so `total` IS the card subtotal here.

  it("1. second-yellow dismissal stacks: first yellow −1 + second-yellow bucket, and no red line", () => {
    const b = scorePlayerMatch(base({ yellowCard: true, secondYellowMinute: 70 }));
    expect(pointsFor(b, C.yellowCard)).toBe(-1);
    expect(pointsFor(b, C.secondYellow)).toBe(-1); // minute ≥ 60
    expect(has(b, C.redCard)).toBe(false); // a 2nd yellow is NOT also a straight red
    expect(b.total).toBe(-2);
  });

  it("2. straight red with no prior yellow: red bucket only, no yellow line", () => {
    const b = scorePlayerMatch(base({ redCardMinute: 20 }));
    expect(pointsFor(b, C.redCard)).toBe(-4);
    expect(has(b, C.yellowCard)).toBe(false); // no caution preceded it
    expect(b.total).toBe(-4);
  });

  it("3. yellow + a SEPARATE straight red: both lines present and summed", () => {
    const b = scorePlayerMatch(base({ yellowCard: true, redCardMinute: 50 }));
    expect(pointsFor(b, C.yellowCard)).toBe(-1);
    expect(pointsFor(b, C.redCard)).toBe(-3); // 30–59
    expect(has(b, C.yellowCard)).toBe(true);
    expect(has(b, C.redCard)).toBe(true);
    expect(b.total).toBe(-4);
  });

  it("4. stoppage-time catch-all: a 90+N dismissal lands at the ≥60 value, never 0", () => {
    expect(only(C.redCard, { redCardMinute: 93 })).toBe(-2);
    expect(only(C.secondYellow, { secondYellowMinute: 93 })).toBe(-1);
  });

  it("5. baseline single yellow (regression guard): −1, no dismissal lines", () => {
    const b = scorePlayerMatch(base({ yellowCard: true }));
    expect(pointsFor(b, C.yellowCard)).toBe(-1);
    expect(has(b, C.secondYellow)).toBe(false);
    expect(has(b, C.redCard)).toBe(false);
    expect(b.total).toBe(-1);
  });

  it.each<[number, number]>([
    [29, -4],
    [30, -3],
    [59, -3],
    [60, -2],
  ])("6. lower-bound-inclusive boundary: straight red @ %s′ -> %s", (redCardMinute, expected) => {
    expect(only(C.redCard, { redCardMinute })).toBe(expected);
  });
});

describe("locked amendments (SCORING.md amendment block / Theme A)", () => {
  it("the three DROPPED lines are never emitted — no input field exists for them", () => {
    // Max out everything the engine knows about; the dropped categories must still never appear.
    const b = scorePlayerMatch(
      base({
        role: "GK",
        minutesPlayed: 90,
        rating: 9.5,
        goals: 3,
        assists: 3,
        keyPasses: 10,
        dribblesCompleted: 9,
        dribblesAttempted: 10,
        duelsWon: 9,
        duelsLost: 1,
        passesTotal: 80,
        passesAccurate: 78,
        longBallsAccurate: 9,
        longBallsTotal: 10,
        wasFouled: 9,
        saves: 12,
        savesInsideBox: 8,
        punches: 5,
        highClaims: 5,
        penaltySaved: 2,
        penaltyWon: 1,
        teamGoalsAgainst: 0,
      }),
    );
    const emitted = new Set(b.lines.map((l) => l.category));
    expect(emitted.has("clearance_off_line")).toBe(false);
    expect(emitted.has("run_out")).toBe(false);
    expect(emitted.has("offsides")).toBe(false);
  });

  it("KEEP-via-manual: penalty won / committed are scored from the manual fields", () => {
    expect(only(C.penaltyWon, { penaltyWon: 1 })).toBe(2);
    expect(only(C.penaltyCommitted, { penaltyCommitted: 1 })).toBe(-2);
  });

  it("REMAP: dispossessed is scored as possession_lost at −1/3", () => {
    expect(only(C.possessionLost, { possessionLost: 6 })).toBe(-2);
  });
});

// ---------------------------------------------------------------------------------------------
// Balance reference (SCORING.md "Balance reference"): monster games ~23–26 across positions
// (forward hat-trick edges highest); GK/DEF reliable floor ~14. Range assertions, not brittle
// equals — the ladder is locked and tuned only via the rating lever.
// ---------------------------------------------------------------------------------------------
describe("balance reference", () => {
  const inBand = (total: number, lo: number, hi: number) => {
    expect(total).toBeGreaterThanOrEqual(lo);
    expect(total).toBeLessThanOrEqual(hi);
  };

  it("FWD monster lands in the ~23–26 band (hat-trick edges highest)", () => {
    const b = scorePlayerMatch(
      base({
        role: "FWD",
        minutesPlayed: 90,
        rating: 9.1, // +5
        goals: 3, // +12
        assists: 1, // +3
        dribblesCompleted: 4,
        dribblesAttempted: 6, // +1
        duelsWon: 4,
        duelsLost: 2, // +1
        wasFouled: 3, // +1  -> 25
      }),
    );
    inBand(b.total, 23, 26);
  });

  it("MID monster lands in the ~23–26 band", () => {
    const b = scorePlayerMatch(
      base({
        role: "MID",
        minutesPlayed: 90,
        rating: 9.0, // +5
        goals: 2, // +10
        assists: 1, // +3
        keyPasses: 4, // +2
        dribblesCompleted: 4,
        dribblesAttempted: 6, // +1
        duelsWon: 4,
        duelsLost: 2, // +1 -> 24
      }),
    );
    inBand(b.total, 23, 26);
  });

  it("DEF monster lands in the ~23–26 band", () => {
    const b = scorePlayerMatch(
      base({
        role: "DEF",
        minutesPlayed: 90,
        rating: 8.6, // +4
        goals: 1, // +6
        assists: 1, // +4
        teamGoalsAgainst: 0, // clean sheet +4
        clearances: 5, // +1
        interceptions: 3, // +1
        tacklesWon: 3, // +1
        blockedShots: 2, // +1 -> 24
      }),
    );
    inBand(b.total, 23, 26);
  });

  it("GK monster lands in the ~23–26 band", () => {
    const b = scorePlayerMatch(
      base({
        role: "GK",
        minutesPlayed: 90,
        rating: 8.7, // +4
        teamGoalsAgainst: 0, // clean sheet +4
        penaltySaved: 1, // +5
        savesInsideBox: 8, // +4
        saves: 11, // outside = 3 -> +1
        punches: 4,
        highClaims: 4, // +4 -> 24
      }),
    );
    inBand(b.total, 23, 26);
  });

  it("DEF floor (solid, unspectacular) is reliable ~14", () => {
    const b = scorePlayerMatch(
      base({
        role: "DEF",
        minutesPlayed: 90,
        rating: 7.0, // +1
        teamGoalsAgainst: 0, // clean sheet +4
        clearances: 5, // +1
        interceptions: 3, // +1
        tacklesWon: 3, // +1
        blockedShots: 2, // +1
        wasFouled: 3, // +1
        duelsWon: 3,
        duelsLost: 1, // +1
        passesTotal: 40,
        passesAccurate: 36, // +1 -> 14
      }),
    );
    inBand(b.total, 13, 16);
  });

  it("GK floor (clean sheet keeper) is reliable ~14", () => {
    const b = scorePlayerMatch(
      base({
        role: "GK",
        minutesPlayed: 90,
        rating: 7.0, // +1
        teamGoalsAgainst: 0, // clean sheet +4
        savesInsideBox: 8, // +4
        saves: 11, // outside 3 -> +1
        punches: 4,
        highClaims: 0, // +2 -> 14
      }),
    );
    inBand(b.total, 13, 16);
  });
});
