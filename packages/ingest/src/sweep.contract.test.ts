/**
 * Contract test for the ingestion → recompute seam (Prompt 05a). An ingestion pass marks (match,player)
 * dirty and the worker calls the existing recompute `sweep`. Here we seed the recompute MemoryStore the
 * way an ingest write leaves the DB — a dirty player-match + the manager's lineup + a group_md period —
 * then assert the chain walks raw → score_player_match → score_manager_period → standing, and that a
 * later write into a FROZEN period is NOT restated (consistent with Prompt 03). The dirty mechanism and
 * the frozen gate are owned by @app/recompute; this guards the 05a integration claim end-to-end.
 */
import { describe, it, expect } from "vitest";
import { MemoryStore, sweep, type ScoreInputBundle, type StatRow } from "@app/recompute";

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

function bundle(playerId: string, stat: Partial<StatRow>, rating: number): ScoreInputBundle {
  return {
    playerId,
    role: "FWD",
    rating,
    ratingSource: "balldontlie", // 05a writes the balldontlie rating (the fallback source)
    stat: { ...zeroStat(), ...stat },
    manual: null,
    events: [],
    shots: [],
    team: {
      playerTeamId: "A",
      homeTeamId: "A",
      awayTeamId: "B",
      homeScore: 1,
      awayScore: 0,
      teamByPlayerId: {},
    },
  };
}

/** Seed the store to mirror an ingest write: a dirty player-match in manager M's starting lineup for period P. */
function seedIngestWrite(store: MemoryStore): void {
  store.seedManagerLeague("M", "L");
  store.seedPeriod("P", { leagueId: "L", kind: "group_md" });
  store.seedPlayerMatch("m1", "starter1", bundle("starter1", { minutesPlayed: 90, goals: 1 }, 7.6));
  store.seedSlot("M", "P", "starter1", true);
  store.seedPlaysIn("starter1", "P", "m1");
}

describe("ingestion → recompute contract", () => {
  it("a dirtied (match,player) sweeps through to a standing", async () => {
    const store = new MemoryStore();
    seedIngestWrite(store);

    const result = await sweep(store);

    expect(result.playerMatches).toBe(1);
    expect(result.managerPeriods).toBe(1);
    expect(result.standings).toBe(1);
    const standing = store.writtenStanding("L", "M");
    expect(standing).toMatchObject({ scope: "group_stage", seed: 1 });
    expect(standing?.totalPoints).toBeGreaterThan(0);
  });

  it("a late write into a FROZEN period is not restated (no commissioner override)", async () => {
    const store = new MemoryStore();
    seedIngestWrite(store);
    await sweep(store); // settle the standing once

    const frozenTotal = store.writtenStanding("L", "M")?.totalPoints;
    store.freezePeriod("P");

    // A late ingest correction re-dirties the player-match (more goals), then re-sweeps.
    store.seedPlayerMatch(
      "m1",
      "starter1",
      bundle("starter1", { minutesPlayed: 90, goals: 3 }, 9.0),
    );
    const result = await sweep(store);

    expect(result.skippedFrozen).toBe(1); // the manager-period was skipped
    expect(store.writtenStanding("L", "M")?.totalPoints).toBe(frozenTotal); // standing unchanged
  });
});
