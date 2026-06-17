/**
 * Rating-resolver contract — RELOCATED from the deleted `packages/scrape` (CODE_PROMPT_57). The
 * Sofascore scrape arm was removed (it was structurally inert — AUDIT F-P2-03), so `balldontlie` is
 * now the canonical rating source of record and the resolver priority is `[manual, balldontlie]`.
 * We assert that 2-source order directly AND that the resolved rating flows through scoring via the
 * recompute `sweep` (a resolved 8.5 scores higher than a resolved 3.0). Imports stay within
 * @app/recompute's own surface — the scoring engine is exercised THROUGH the pipeline (`sweep`),
 * never imported directly — so this file adds no new package dependency.
 */
import { describe, it, expect } from "vitest";
import { pickRating } from "./resolver";
import { sweep } from "./recompute";
import { MemoryStore } from "./memoryStore";
import type { ScoreInputBundle, StatRow } from "./adapter";

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
    shotsOnTarget: 0,
    ballRecoveries: 0,
    bigChancesCreated: 0,
    crossesAccurate: 0,
    touches: 0,
  };
}

const withRating = (rating: number, source: "manual" | "balldontlie"): ScoreInputBundle => ({
  playerId: "p1",
  role: "FWD",
  rating,
  ratingSource: source,
  stat: { ...zeroStat(), minutesPlayed: 90 },
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
});

function seedAndSweep(bundle: ScoreInputBundle): Promise<number> {
  const store = new MemoryStore();
  store.seedManagerLeague("M", "L");
  store.seedPeriod("P", { leagueId: "L", kind: "group_md" });
  store.seedPlayerMatch("m1", "p1", bundle);
  store.seedSlot("M", "P", "p1", true);
  store.seedPlaysIn("p1", "P", "m1");
  return sweep(store).then(() => store.writtenPlayerScore("m1", "p1")!.total);
}

describe("rating resolver contract — priority [manual, balldontlie] (Sofascore scrape removed)", () => {
  it("manual overrides the balldontlie canonical rating when both are present", () => {
    expect(
      pickRating([
        { source: "balldontlie", rating: 6.0 },
        { source: "manual", rating: 8.5 },
      ]),
    ).toEqual({ rating: 8.5, source: "manual" });
  });

  it("balldontlie is canonical when there is no manual override", () => {
    expect(pickRating([{ source: "balldontlie", rating: 6.4 }])).toEqual({
      rating: 6.4,
      source: "balldontlie",
    });
  });

  it("the chosen rating flows through scoring: a resolved 8.5 scores higher than a resolved 3.0", async () => {
    const hi = await seedAndSweep(withRating(8.5, "balldontlie"));
    const lo = await seedAndSweep(withRating(3.0, "balldontlie"));
    expect(hi).toBeGreaterThan(lo);
  });
});
