import { describe, it, expect } from "vitest";
import type { ScoreInputBundle } from "@app/recompute";
import { selectRoundDataComplete, type FixtureCompleteness } from "./completeness";

/**
 * The PURE data-completeness gate (feat/autofire-round-cut FIX 1). It fails CLOSED: a round is complete
 * only when every fixture is completed + populated + fully rated + swept, and the round's aggregation is
 * drained. Reuses `playerAppearedInMatch` (not reinvented) to decide who must be rated. No DB.
 */

const NULL_STAT: NonNullable<ScoreInputBundle["stat"]> = {
  minutesPlayed: null,
  goals: null,
  assists: null,
  keyPasses: null,
  dribblesAttempted: null,
  dribblesCompleted: null,
  duelsWon: null,
  duelsLost: null,
  passesTotal: null,
  passesAccurate: null,
  longBallsTotal: null,
  longBallsAccurate: null,
  wasFouled: null,
  clearances: null,
  blockedShots: null,
  interceptions: null,
  tacklesWon: null,
  saves: null,
  savesInsideBox: null,
  punches: null,
  highClaims: null,
  possessionLost: null,
  shotsOnTarget: null,
  ballRecoveries: null,
  bigChancesCreated: null,
  crossesAccurate: null,
  touches: null,
};

/** A player who APPEARED: team-in-match + a real (non-stub) stat line (minutesPlayed set). */
function appeared(playerId: string): ScoreInputBundle {
  return {
    playerId,
    role: "MID",
    rating: null,
    ratingSource: null,
    stat: { ...NULL_STAT, minutesPlayed: 90 },
    manual: null,
    events: [],
    shots: [],
    team: {
      playerTeamId: "home",
      homeTeamId: "home",
      awayTeamId: "away",
      homeScore: 1,
      awayScore: 0,
      teamByPlayerId: {},
    },
  };
}

/** A candidate row that does NOT count as appeared: an off-match team (teamInMatch === false). */
function ghost(playerId: string): ScoreInputBundle {
  return {
    ...appeared(playerId),
    team: { ...appeared(playerId).team, playerTeamId: "other-team" },
  };
}

function fixture(over: Partial<FixtureCompleteness> = {}): FixtureCompleteness {
  const bundles = over.bundles ?? [appeared("p1"), appeared("p2")];
  return {
    matchId: "m1",
    status: "completed",
    bundles,
    ratedPlayerIds: over.ratedPlayerIds ?? new Set(bundles.map((b) => b.playerId)),
    hasDirtyInput: false,
    ...over,
  };
}

function call(
  over: Partial<{ fixtures: FixtureCompleteness[]; pendingManagerPeriodDirty: number }>,
) {
  return selectRoundDataComplete({
    fixtures: over.fixtures ?? [fixture()],
    pendingManagerPeriodDirty: over.pendingManagerPeriodDirty ?? 0,
  });
}

describe("selectRoundDataComplete — the data-completeness gate", () => {
  it("complete: every fixture completed, populated, fully rated, swept, aggregation drained", () => {
    expect(call({})).toEqual({ complete: true });
  });

  it("holds a round with no fixtures (cannot positively confirm)", () => {
    expect(call({ fixtures: [] })).toMatchObject({ complete: false });
  });

  it("holds while a manager-period recompute is pending for the round", () => {
    expect(call({ pendingManagerPeriodDirty: 1 })).toMatchObject({ complete: false });
  });

  it("holds while any fixture is not completed", () => {
    expect(call({ fixtures: [fixture({ status: "in_progress" })] })).toMatchObject({
      complete: false,
    });
  });

  it("holds a completed fixture with NO appeared players — data not yet ingested", () => {
    // Candidate rows exist but none pass the participant gate (off-match team).
    expect(call({ fixtures: [fixture({ bundles: [ghost("p1"), ghost("p2")] })] })).toMatchObject({
      complete: false,
    });
  });

  it("holds while a fixture has dirty (unswept) inputs", () => {
    expect(call({ fixtures: [fixture({ hasDirtyInput: true })] })).toMatchObject({
      complete: false,
    });
  });

  it("holds when an appeared player is unrated (ratings are the last-arriving input)", () => {
    // p2 appeared but has no rating.
    expect(call({ fixtures: [fixture({ ratedPlayerIds: new Set(["p1"]) })] })).toMatchObject({
      complete: false,
    });
  });

  it("names the unrated appeared players in the hold reason (actionable, not silent)", () => {
    const res = call({ fixtures: [fixture({ ratedPlayerIds: new Set(["p1"]) })] });
    expect(res.complete).toBe(false);
    if (!res.complete) expect(res.reason).toContain("p2");
  });

  it("does NOT require ratings for NON-appeared candidates (only appeared players must be rated)", () => {
    // p1 appeared + rated; g1 is a ghost (off-match) with no rating → still complete.
    expect(
      call({
        fixtures: [
          fixture({ bundles: [appeared("p1"), ghost("g1")], ratedPlayerIds: new Set(["p1"]) }),
        ],
      }),
    ).toEqual({ complete: true });
  });

  it("multi-fixture: complete only when EVERY fixture is complete", () => {
    const ok = fixture({ matchId: "m1" });
    const bad = fixture({ matchId: "m2", status: "in_progress" });
    expect(call({ fixtures: [ok, bad] })).toMatchObject({ complete: false });
    expect(call({ fixtures: [ok, fixture({ matchId: "m2" })] })).toEqual({ complete: true });
  });
});
