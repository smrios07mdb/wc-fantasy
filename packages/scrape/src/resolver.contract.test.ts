/**
 * Contract test for the 05b claim: writing a `source='scrape'` rating makes the resolver prefer it over
 * the `balldontlie` fallback — with ZERO resolver change. The resolver (`pickRating`, priority
 * [manual, scrape, balldontlie]) + the sweep are owned by @app/recompute; here we assert the preference
 * directly and that the chosen rating flows through scoring (a scrape-resolved 8.5 scores higher than a
 * balldontlie-resolved 3.0). The scraper's job is just to write the row + dirty-mark.
 */
import { describe, it, expect } from "vitest";
import {
  MemoryStore,
  sweep,
  pickRating,
  type ScoreInputBundle,
  type StatRow,
} from "@app/recompute";

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

const withRating = (rating: number, source: "scrape" | "balldontlie"): ScoreInputBundle => ({
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

describe("resolver prefers scrape over the balldontlie fallback (NO resolver change)", () => {
  it("pickRating returns the scrape value when both sources are present", () => {
    expect(
      pickRating([
        { source: "balldontlie", rating: 6.0 },
        { source: "scrape", rating: 8.5 },
      ]),
    ).toEqual({ rating: 8.5, source: "scrape" });
  });

  it("the chosen rating flows through scoring: a scrape 8.5 scores higher than a balldontlie 3.0", async () => {
    const scrapeScore = await seedAndSweep(withRating(8.5, "scrape"));
    const bdlScore = await seedAndSweep(withRating(3.0, "balldontlie"));
    expect(scrapeScore).toBeGreaterThan(bdlScore);
  });
});
