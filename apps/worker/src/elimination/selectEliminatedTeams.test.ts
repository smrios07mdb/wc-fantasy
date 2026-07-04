import { describe, it, expect } from "vitest";
import {
  deriveKnockoutLoserTeamId,
  selectEliminatedTeamIds,
  type KnockoutMatchResult,
} from "./selectEliminatedTeams";

/**
 * The PURE WC-elimination derivation (feat/auto-team-elimination). A national team is eliminated the
 * MOMENT it LOSES a knockout match; the loser is the NON-advancer under the SAME full-time → extra-time →
 * penalties semantics as `@app/pool`'s `knockoutAdvancer` / `derivePoolResult` (packages/pool/src/pool.ts).
 * These cases MIRROR pool.test.ts's advancer cases (home win / away win / ET decider / pens decider /
 * no-decider) so drift between the two co-located derivations is caught. Everything here is pure.
 */

const HOME = "team-home";
const AWAY = "team-away";

function koMatch(over: Partial<KnockoutMatchResult> = {}): KnockoutMatchResult {
  return {
    status: "completed",
    homeTeamId: HOME,
    awayTeamId: AWAY,
    homeScore: null,
    awayScore: null,
    homeScoreEt: null,
    awayScoreEt: null,
    homeScorePens: null,
    awayScorePens: null,
    ...over,
  };
}

describe("deriveKnockoutLoserTeamId — the loser is the non-advancer (FT → ET → pens)", () => {
  it("home win in full time → the AWAY team is the loser", () => {
    expect(deriveKnockoutLoserTeamId(koMatch({ homeScore: 2, awayScore: 1 }))).toBe(AWAY);
  });

  it("away win in full time → the HOME team is the loser", () => {
    expect(deriveKnockoutLoserTeamId(koMatch({ homeScore: 0, awayScore: 2 }))).toBe(HOME);
  });

  it("level at FT, decided in extra time → the ET loser (away)", () => {
    const loser = deriveKnockoutLoserTeamId(
      koMatch({ homeScore: 1, awayScore: 1, homeScoreEt: 2, awayScoreEt: 1 }),
    );
    expect(loser).toBe(AWAY);
  });

  it("level after ET, decided on penalties → the pens loser (home)", () => {
    const loser = deriveKnockoutLoserTeamId(
      koMatch({
        homeScore: 1,
        awayScore: 1,
        homeScoreEt: 1,
        awayScoreEt: 1,
        homeScorePens: 2,
        awayScorePens: 4,
      }),
    );
    expect(loser).toBe(HOME);
  });

  it("never treats a level FT as a draw — falls through to the pens decider", () => {
    const loser = deriveKnockoutLoserTeamId(
      koMatch({
        homeScore: 0,
        awayScore: 0,
        homeScoreEt: 0,
        awayScoreEt: 0,
        homeScorePens: 5,
        awayScorePens: 4,
      }),
    );
    expect(loser).toBe(AWAY); // home advances on pens → away is out
  });

  it("completed but no decider at any phase → null (skip, never guess)", () => {
    const loser = deriveKnockoutLoserTeamId(
      koMatch({ homeScore: 1, awayScore: 1, homeScoreEt: 1, awayScoreEt: 1 }),
    );
    expect(loser).toBeNull();
  });

  it("not completed (in_progress) → null even with a provisional lead (defense-in-depth)", () => {
    expect(
      deriveKnockoutLoserTeamId(koMatch({ status: "in_progress", homeScore: 2, awayScore: 0 })),
    ).toBeNull();
  });

  it("scheduled → null", () => {
    expect(
      deriveKnockoutLoserTeamId(koMatch({ status: "scheduled", homeScore: 2, awayScore: 0 })),
    ).toBeNull();
  });

  it("decided but the loser side's team FK is null → null (never guess a null team)", () => {
    // Away wins, so the loser is HOME — but homeTeamId is unset.
    expect(
      deriveKnockoutLoserTeamId(koMatch({ homeTeamId: null, homeScore: 0, awayScore: 1 })),
    ).toBeNull();
  });
});

describe("selectEliminatedTeamIds — the union of knockout losers", () => {
  it("unions the losers across matches, deduped and sorted", () => {
    const matches = [
      koMatch({ homeTeamId: "A", awayTeamId: "B", homeScore: 1, awayScore: 0 }), // B out
      koMatch({ homeTeamId: "C", awayTeamId: "D", homeScore: 0, awayScore: 2 }), // C out
    ];
    expect(selectEliminatedTeamIds(matches)).toEqual(["B", "C"]);
  });

  it("skips undecidable / not-completed matches (they contribute no loser)", () => {
    const matches = [
      koMatch({ homeTeamId: "A", awayTeamId: "B", homeScore: 2, awayScore: 1 }), // B out
      koMatch({ homeTeamId: "C", awayTeamId: "D", homeScore: 1, awayScore: 1 }), // no decider
      koMatch({
        homeTeamId: "E",
        awayTeamId: "F",
        status: "in_progress",
        homeScore: 3,
        awayScore: 0,
      }), // live
    ];
    expect(selectEliminatedTeamIds(matches)).toEqual(["B"]);
  });

  it("dedupes a team that appears as a loser more than once (belt-and-suspenders)", () => {
    const matches = [
      koMatch({ homeTeamId: "A", awayTeamId: "B", homeScore: 1, awayScore: 0 }), // B out
      koMatch({ homeTeamId: "B", awayTeamId: "C", homeScore: 0, awayScore: 1 }), // B out again
    ];
    expect(selectEliminatedTeamIds(matches)).toEqual(["B"]);
  });

  it("empty input → empty union", () => {
    expect(selectEliminatedTeamIds([])).toEqual([]);
  });
});
