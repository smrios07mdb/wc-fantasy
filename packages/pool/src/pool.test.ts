import { describe, it, expect } from "vitest";
import {
  derivePoolResult,
  scorePick,
  weightForPeriod,
  buildPoolLeaderboard,
  isPickLocked,
  isPlaceholderTeamName,
  isTeamNameResolved,
  validatePickSubmission,
  type PoolMatch,
  type LeaderboardMatch,
  type PoolPick,
  type PoolPickFacts,
} from "./pool";

// ── fixtures ───────────────────────────────────────────────────────────────────
const KICKOFF = new Date("2026-06-12T16:00:00.000Z");

/** A fully-defaulted completed match; override per case. */
function match(over: Partial<PoolMatch> = {}): PoolMatch {
  return {
    status: "completed",
    periodKind: "group_md",
    kickoffAt: KICKOFF,
    homeScore: null,
    awayScore: null,
    homeScoreEt: null,
    awayScoreEt: null,
    homeScorePens: null,
    awayScorePens: null,
    ...over,
  };
}

describe("derivePoolResult", () => {
  it("group: home win → HOME", () => {
    expect(derivePoolResult(match({ homeScore: 2, awayScore: 1 }))).toBe("HOME");
  });
  it("group: level → DRAW", () => {
    expect(derivePoolResult(match({ homeScore: 1, awayScore: 1 }))).toBe("DRAW");
  });
  it("group: away win → AWAY", () => {
    expect(derivePoolResult(match({ homeScore: 0, awayScore: 2 }))).toBe("AWAY");
  });

  it("pending: status scheduled → null", () => {
    expect(derivePoolResult(match({ status: "scheduled", homeScore: 2, awayScore: 1 }))).toBeNull();
  });
  it("pending: status in_progress → null", () => {
    expect(
      derivePoolResult(match({ status: "in_progress", homeScore: 2, awayScore: 1 })),
    ).toBeNull();
  });

  it("knockout: decided in full time → advancer, never DRAW", () => {
    const m = match({ periodKind: "knockout_round", homeScore: 2, awayScore: 1 });
    expect(derivePoolResult(m)).toBe("HOME");
  });
  it("knockout: level at FT, decided in extra time → ET advancer", () => {
    const m = match({
      periodKind: "knockout_round",
      homeScore: 1,
      awayScore: 1,
      homeScoreEt: 2,
      awayScoreEt: 1,
    });
    expect(derivePoolResult(m)).toBe("HOME");
  });
  it("knockout: level after ET, decided on penalties → pens advancer", () => {
    const m = match({
      periodKind: "knockout_round",
      homeScore: 1,
      awayScore: 1,
      homeScoreEt: 1,
      awayScoreEt: 1,
      homeScorePens: 2,
      awayScorePens: 4,
    });
    expect(derivePoolResult(m)).toBe("AWAY");
  });
  it("knockout: never returns DRAW even when FT is level (falls through to a decider)", () => {
    const m = match({
      periodKind: "knockout_round",
      homeScore: 0,
      awayScore: 0,
      homeScoreEt: 0,
      awayScoreEt: 0,
      homeScorePens: 5,
      awayScorePens: 4,
    });
    expect(derivePoolResult(m)).toBe("HOME");
  });
  it("knockout: completed with no decider → defensive null", () => {
    const m = match({
      periodKind: "knockout_round",
      homeScore: 1,
      awayScore: 1,
      homeScoreEt: 1,
      awayScoreEt: 1,
    });
    expect(derivePoolResult(m)).toBeNull();
  });

  it("periodKind null (unseeded): completed → null (honest unscored, no round-regex guess)", () => {
    expect(derivePoolResult(match({ periodKind: null, homeScore: 2, awayScore: 1 }))).toBeNull();
  });
  it("group: completed but score missing → defensive null", () => {
    expect(derivePoolResult(match({ homeScore: null, awayScore: 1 }))).toBeNull();
  });
});

describe("scorePick", () => {
  it("hit → weight", () => {
    expect(scorePick("HOME", "HOME", 1)).toBe(1);
  });
  it("miss → 0", () => {
    expect(scorePick("HOME", "AWAY", 1)).toBe(0);
  });
  it("pending (result null) → 0", () => {
    expect(scorePick("HOME", null, 1)).toBe(0);
  });
  it("DRAW vs a knockout result (never DRAW) → 0", () => {
    expect(scorePick("DRAW", "HOME", 1)).toBe(0);
  });
  it("respects the weight", () => {
    expect(scorePick("AWAY", "AWAY", 3)).toBe(3);
  });
});

describe("weightForPeriod", () => {
  it("flat 1 for a group matchday", () => {
    expect(weightForPeriod("group_md", "MD1")).toBe(1);
  });
  it("flat 1 for a knockout round (escalating weights are a future seam)", () => {
    expect(weightForPeriod("knockout_round", "Final")).toBe(1);
  });
  it("flat 1 even for an unseeded period", () => {
    expect(weightForPeriod(null, null)).toBe(1);
  });
});

describe("buildPoolLeaderboard", () => {
  const lbMatch = (over: Partial<LeaderboardMatch>): LeaderboardMatch => ({
    matchId: "x",
    periodLabel: "MD1",
    ...match(),
    ...over,
  });

  it("ranks by points desc, then managerId asc; counts played + correct", () => {
    const matches: LeaderboardMatch[] = [
      lbMatch({ matchId: "g1", homeScore: 2, awayScore: 0 }), // HOME
      lbMatch({ matchId: "g2", homeScore: 1, awayScore: 1 }), // DRAW
    ];
    const picks: PoolPick[] = [
      { managerId: "b", matchId: "g1", prediction: "HOME" }, // hit
      { managerId: "b", matchId: "g2", prediction: "DRAW" }, // hit  → b: 2pts
      { managerId: "a", matchId: "g1", prediction: "HOME" }, // hit
      { managerId: "a", matchId: "g2", prediction: "AWAY" }, // miss → a: 1pt
      { managerId: "c", matchId: "g1", prediction: "HOME" }, // hit  → c: 1pt
    ];
    const rows = buildPoolLeaderboard(picks, matches, weightForPeriod);
    expect(rows.map((r) => r.managerId)).toEqual(["b", "a", "c"]);
    expect(rows.find((r) => r.managerId === "b")).toEqual({
      managerId: "b",
      played: 2,
      correct: 2,
      points: 2,
    });
    // a and c tie on 1 point → deterministic managerId asc (a before c)
    expect(rows.find((r) => r.managerId === "a")).toEqual({
      managerId: "a",
      played: 2,
      correct: 1,
      points: 1,
    });
    expect(rows.find((r) => r.managerId === "c")).toEqual({
      managerId: "c",
      played: 1,
      correct: 1,
      points: 1,
    });
  });

  it("a manager with only unresolved picks still appears with zeros (played excludes pending)", () => {
    const matches: LeaderboardMatch[] = [
      lbMatch({ matchId: "g1", status: "scheduled", homeScore: null, awayScore: null }),
    ];
    const picks: PoolPick[] = [{ managerId: "a", matchId: "g1", prediction: "HOME" }];
    const rows = buildPoolLeaderboard(picks, matches, weightForPeriod);
    expect(rows).toEqual([{ managerId: "a", played: 0, correct: 0, points: 0 }]);
  });

  it("an orphan pick (no matching match) is skipped but the manager still appears", () => {
    const rows = buildPoolLeaderboard(
      [{ managerId: "a", matchId: "missing", prediction: "HOME" }],
      [],
      weightForPeriod,
    );
    expect(rows).toEqual([{ managerId: "a", played: 0, correct: 0, points: 0 }]);
  });

  it("applies the weight function (knockout weighted higher under a custom weightFn)", () => {
    const matches: LeaderboardMatch[] = [
      lbMatch({
        matchId: "k1",
        periodKind: "knockout_round",
        periodLabel: "Final",
        homeScore: 2,
        awayScore: 1,
      }),
    ];
    const heavy = (kind: PoolMatch["periodKind"]) => (kind === "knockout_round" ? 8 : 1);
    const rows = buildPoolLeaderboard(
      [{ managerId: "a", matchId: "k1", prediction: "HOME" }],
      matches,
      heavy,
    );
    expect(rows).toEqual([{ managerId: "a", played: 1, correct: 1, points: 8 }]);
  });
});

describe("isPickLocked", () => {
  const before = new Date(KICKOFF.getTime() - 1);
  const at = new Date(KICKOFF.getTime());
  const after = new Date(KICKOFF.getTime() + 1);

  it("scheduled + before kickoff → open", () => {
    expect(isPickLocked({ status: "scheduled", kickoffAt: KICKOFF }, before)).toBe(false);
  });
  it("scheduled + exactly at kickoff → locked", () => {
    expect(isPickLocked({ status: "scheduled", kickoffAt: KICKOFF }, at)).toBe(true);
  });
  it("scheduled + after kickoff → locked", () => {
    expect(isPickLocked({ status: "scheduled", kickoffAt: KICKOFF }, after)).toBe(true);
  });
  it("non-scheduled status locks even before kickoff", () => {
    expect(isPickLocked({ status: "in_progress", kickoffAt: KICKOFF }, before)).toBe(true);
    expect(isPickLocked({ status: "completed", kickoffAt: KICKOFF }, before)).toBe(true);
  });
});

describe("validatePickSubmission", () => {
  const open = new Date(KICKOFF.getTime() - 1);
  // A fully-defaulted OPEN fixture with BOTH sides resolved (real nation names); override per case.
  const facts = (over: Partial<PoolPickFacts> = {}): PoolPickFacts => ({
    status: "scheduled",
    kickoffAt: KICKOFF,
    periodKind: "group_md",
    homeTeamName: "Brazil",
    awayTeamName: "Argentina",
    ...over,
  });

  it("rejects a pick once the match is locked", () => {
    const err = validatePickSubmission("HOME", facts(), new Date(KICKOFF.getTime()));
    expect(err?.code).toBe("pick-locked");
  });
  it("rejects DRAW on a (resolved) knockout match", () => {
    const err = validatePickSubmission("DRAW", facts({ periodKind: "knockout_round" }), open);
    expect(err?.code).toBe("draw-not-allowed-knockout");
  });
  it("allows DRAW on a group match", () => {
    expect(validatePickSubmission("DRAW", facts(), open)).toBeNull();
  });
  it("allows DRAW when the period is unseeded (permissive write, honest-null score)", () => {
    expect(validatePickSubmission("DRAW", facts({ periodKind: null }), open)).toBeNull();
  });
  it("allows a valid HOME pick on an open group match", () => {
    expect(validatePickSubmission("HOME", facts(), open)).toBeNull();
  });

  // ── SEC-P4: reject a pick on an UNDECIDED knockout fixture (placeholder name or null FK) ──
  it("rejects a pick on a knockout match with a placeholder HOME side", () => {
    const err = validatePickSubmission(
      "HOME",
      facts({ periodKind: "knockout_round", homeTeamName: "Team 273" }),
      open,
    );
    expect(err?.code).toBe("pick-on-undecided-match");
  });
  it("rejects a pick on a knockout match with a placeholder AWAY side", () => {
    const err = validatePickSubmission(
      "AWAY",
      facts({ periodKind: "knockout_round", awayTeamName: "Team 9" }),
      open,
    );
    expect(err?.code).toBe("pick-on-undecided-match");
  });
  it("rejects a pick on a knockout match with a null (unset FK) side", () => {
    const err = validatePickSubmission(
      "HOME",
      facts({ periodKind: "knockout_round", awayTeamName: null }),
      open,
    );
    expect(err?.code).toBe("pick-on-undecided-match");
  });
  it("undecided takes precedence over the DRAW rule (an undecided knockout rejects ANY prediction)", () => {
    const err = validatePickSubmission(
      "DRAW",
      facts({ periodKind: "knockout_round", homeTeamName: "Team 1", awayTeamName: "Team 2" }),
      open,
    );
    expect(err?.code).toBe("pick-on-undecided-match");
  });
  it("allows a HOME pick on a RESOLVED knockout match (no over-rejection)", () => {
    expect(
      validatePickSubmission("HOME", facts({ periodKind: "knockout_round" }), open),
    ).toBeNull();
  });
  it("does NOT apply the undecided guard to a GROUP fixture (knockout-only; group always has both teams)", () => {
    // Even with a placeholder-shaped name, a group_md fixture is never rejected by the undecided guard.
    expect(
      validatePickSubmission(
        "HOME",
        facts({ periodKind: "group_md", homeTeamName: "Team 5" }),
        open,
      ),
    ).toBeNull();
  });
});

describe("isPlaceholderTeamName / isTeamNameResolved (the shared resolved-team predicate)", () => {
  it("flags `Team {id}` placeholder names (trimmed)", () => {
    expect(isPlaceholderTeamName("Team 273")).toBe(true);
    expect(isPlaceholderTeamName("  Team 42  ")).toBe(true);
  });
  it("does not flag real nation names (only the exact `Team \\d+` shape is a placeholder)", () => {
    expect(isPlaceholderTeamName("Brazil")).toBe(false);
    expect(isPlaceholderTeamName("Team USA")).toBe(false);
    expect(isPlaceholderTeamName("Team")).toBe(false);
  });
  it("isTeamNameResolved: a real name resolves; a placeholder or null does not", () => {
    expect(isTeamNameResolved("Brazil")).toBe(true);
    expect(isTeamNameResolved("Team 7")).toBe(false);
    expect(isTeamNameResolved(null)).toBe(false);
  });
});
