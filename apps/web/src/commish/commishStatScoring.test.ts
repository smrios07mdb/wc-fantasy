/**
 * Commissioner console Thread 2 — proof that the TWO commissioner writes flow through the EXISTING,
 * BYTE-UNTOUCHED scoring plumbing (no engine/adapter/resolver edit). These are pure/in-memory tests that
 * live in the web thread (NOT in packages/recompute or packages/scoring) precisely so the additive-verify
 * DoD — `git diff --stat` on those two packages is empty — stays true.
 *
 *   B1 penalty → `manual_stat_player_match.penalty_won/committed` → the adapter's `ManualRow` → the engine:
 *                +2 per won, −2 per committed; clearing to 0/0 reverts the delta.
 *   B2 rating  → `rating_player_match` source='manual' → the resolver: manual BEATS balldontlie; deleting the
 *                manual row reverts to the balldontlie value.
 *
 * The end-to-end `recomputePlayerMatch` case proves the SYNC trigger the write handlers fire re-scores from
 * exactly these rows (a participant bundle carrying a manual penalty scores +2 through the real orchestration).
 */
import { describe, expect, it } from "vitest";
import { scorePlayerMatch } from "@app/scoring";
import type { Position } from "@app/shared";
import {
  buildScoreInput,
  resolveRating,
  pickRating,
  recomputePlayerMatch,
  MemoryStore,
  type ManualRow,
  type RatingRow,
  type ScoreInputBundle,
  type StatRow,
} from "@app/recompute";

// A real (non-stub) stat line so the participant gate (`playerAppearedInMatch`) passes; every field is a
// fixed constant, so a DELTA between two bundles that differ ONLY in `manual` isolates the penalty term.
function statRow(): StatRow {
  return {
    minutesPlayed: 90,
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

function bundle(manual: ManualRow | null, role: Position = "FWD"): ScoreInputBundle {
  return {
    playerId: "p1",
    role,
    rating: null,
    ratingSource: null,
    stat: statRow(),
    manual,
    events: [],
    shots: [],
    team: {
      playerTeamId: "tA",
      homeTeamId: "tA",
      awayTeamId: "tB",
      homeScore: 0,
      awayScore: 0,
      teamByPlayerId: {},
    },
  };
}

const total = (b: ScoreInputBundle): number => scorePlayerMatch(buildScoreInput(b)).total;

describe("Thread 2 · B1 penalty entry flows through the existing adapter + engine (+2 won / −2 committed)", () => {
  it("the adapter maps ManualRow.penaltyWon/Committed onto ScoreInput (no upstream derivation)", () => {
    const input = buildScoreInput(bundle({ penaltyWon: 1, penaltyCommitted: 0 }));
    expect(input.penaltyWon).toBe(1);
    expect(input.penaltyCommitted).toBe(0);
  });

  it("penalty_won = 1 → +2 pts relative to no manual row", () => {
    expect(total(bundle({ penaltyWon: 1, penaltyCommitted: 0 })) - total(bundle(null))).toBe(2);
  });

  it("penalty_committed = 1 → −2 pts relative to no manual row", () => {
    expect(total(bundle({ penaltyWon: 0, penaltyCommitted: 1 })) - total(bundle(null))).toBe(-2);
  });

  it("won and committed stack independently (+2 − 2 = 0)", () => {
    expect(total(bundle({ penaltyWon: 1, penaltyCommitted: 1 })) - total(bundle(null))).toBe(0);
  });

  it("Clear (0/0) reverts to exactly the no-penalty score", () => {
    expect(total(bundle({ penaltyWon: 0, penaltyCommitted: 0 }))).toBe(total(bundle(null)));
  });
});

describe("Thread 2 · B2 rating override — the resolver prefers manual over balldontlie", () => {
  const bd: RatingRow = { source: "balldontlie", rating: 6.2 };
  const manual: RatingRow = { source: "manual", rating: 9 };

  it("with only balldontlie present, that value resolves", () => {
    expect(resolveRating([bd])).toBe(6.2);
    expect(pickRating([bd]).source).toBe("balldontlie");
  });

  it("a manual row OVERRIDES balldontlie (order-independent in the rows array)", () => {
    expect(resolveRating([bd, manual])).toBe(9);
    expect(resolveRating([manual, bd])).toBe(9);
    expect(pickRating([bd, manual]).source).toBe("manual");
  });

  it("Clear override (delete the manual row) reverts to the balldontlie value", () => {
    // The write path DELETEs the source='manual' row; the resolver then sees only balldontlie again.
    expect(resolveRating([bd])).toBe(6.2);
    expect(pickRating([bd]).source).toBe("balldontlie");
  });

  it("a present-but-null manual rating does NOT win (falls through to balldontlie)", () => {
    expect(resolveRating([{ source: "manual", rating: null }, bd])).toBe(6.2);
  });
});

describe("Thread 2 · the sync re-score trigger (recomputePlayerMatch) picks up a manual penalty", () => {
  async function scoreVia(manual: ManualRow | null): Promise<number> {
    const store = new MemoryStore();
    store.seedPlayerMatch("m1", "p1", bundle(manual));
    const result = await recomputePlayerMatch(store, "m1", "p1");
    expect(result).not.toBeNull(); // participant → a score row is written, not evicted
    return store.writtenPlayerScore("m1", "p1")!.total;
  }

  it("a participant carrying penalty_won = 1 re-scores +2 vs. no manual row, through the real orchestration", async () => {
    expect((await scoreVia({ penaltyWon: 1, penaltyCommitted: 0 })) - (await scoreVia(null))).toBe(
      2,
    );
  });

  it("clearing the penalty (0/0) re-scores back to the baseline", async () => {
    expect(await scoreVia({ penaltyWon: 0, penaltyCommitted: 0 })).toBe(await scoreVia(null));
  });
});
