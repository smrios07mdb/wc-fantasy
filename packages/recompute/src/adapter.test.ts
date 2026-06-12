import { describe, it, expect } from "vitest";
import { scorePlayerMatch, SCORE_CATEGORIES as C, type ScoreBreakdown } from "@app/scoring";
import {
  buildScoreInput,
  playerAppearedInMatch,
  type ScoreInputBundle,
  type EventRow,
  type ShotRow,
} from "./adapter";

// A team-A (home) player who did nothing; tests switch on the fields they exercise.
function bundle(overrides: Partial<ScoreInputBundle> = {}): ScoreInputBundle {
  return {
    playerId: "p1",
    role: "MID",
    rating: null,
    ratingSource: null,
    stat: null,
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
    ...overrides,
  };
}

const goal = (over: Partial<EventRow>): EventRow => ({
  incidentType: "goal",
  incidentClass: null,
  timeMinute: 0,
  addedTime: null,
  playerId: null,
  assistPlayerId: null,
  playerInId: null,
  playerOutId: null,
  rescinded: false,
  ...over,
});
const card = (over: Partial<EventRow>): EventRow => goal({ incidentType: "card", ...over });
const sub = (over: Partial<EventRow>): EventRow => goal({ incidentType: "substitution", ...over });
const shot = (over: Partial<ShotRow>): ShotRow => ({
  playerId: null,
  shotType: null,
  situation: null,
  isPenalty: false,
  minute: null,
  ...over,
});
const pointsFor = (b: ScoreBreakdown, cat: string): number =>
  b.lines.filter((l) => l.category === cat).reduce((s, l) => s + l.points, 0);
const has = (b: ScoreBreakdown, cat: string): boolean => b.lines.some((l) => l.category === cat);

describe("adapter — passthrough & null safety", () => {
  it("a null stat row yields a clean did-not-play ScoreInput (all zeros)", () => {
    const i = buildScoreInput(bundle());
    expect(i.minutesPlayed).toBe(0);
    expect(i.goals).toBe(0);
    expect(i.rating).toBeNull();
    expect(scorePlayerMatch(i).total).toBe(0);
  });

  it("passes role, resolved rating, and source straight through", () => {
    const i = buildScoreInput(bundle({ role: "GK", rating: 7.3, ratingSource: "scrape" }));
    expect(i.role).toBe("GK");
    expect(i.rating).toBe(7.3);
    expect(i.ratingSource).toBe("scrape");
  });
});

describe("adapter — §7 save-outside-box (engine derives from saves − savesInsideBox)", () => {
  it("supplies saves + savesInsideBox; the engine scores the +1/3 outside-box line", () => {
    const i = buildScoreInput(
      bundle({ role: "GK", stat: { ...zeroStat(), saves: 9, savesInsideBox: 6 } }),
    );
    expect(i.saves).toBe(9);
    expect(i.savesInsideBox).toBe(6);
    expect(pointsFor(scorePlayerMatch(i), C.saveOutsideBox)).toBe(1); // floor((9-6)/3)
  });
});

describe("adapter — clean-sheet inputs are TWO distinct values from distinct sources (§7)", () => {
  it("teamGoalsAgainst = whole-match opponent score; goalsConcededWhileOn = goals while on pitch", () => {
    // Player (team A, home) subbed off at 60'; team B scores at 70' and 80'.
    const i = buildScoreInput(
      bundle({
        role: "DEF",
        team: { ...teamCtx(), homeScore: 0, awayScore: 2, teamByPlayerId: { gB: "B" } },
        events: [
          sub({ playerOutId: "p1", timeMinute: 60 }),
          goal({ playerId: "gB", timeMinute: 70 }),
          goal({ playerId: "gB", timeMinute: 80 }),
        ],
      }),
    );
    expect(i.teamGoalsAgainst).toBe(2); // whole match
    expect(i.goalsConcededWhileOn).toBe(0); // none while he was on (off at 60')
  });

  it("counts only opponent goals while on; an own goal by the player's own team counts as conceded", () => {
    const i = buildScoreInput(
      bundle({
        role: "GK",
        team: { ...teamCtx(), homeScore: 0, awayScore: 1, teamByPlayerId: { ownA: "A", gB: "B" } },
        events: [
          goal({ playerId: "gB", timeMinute: 30 }), // opponent goal while on → conceded
          goal({ playerId: "ownA", incidentClass: "ownGoal", timeMinute: 50 }), // own team OG → conceded
        ],
      }),
    );
    expect(i.goalsConcededWhileOn).toBe(2);
  });
});

describe("adapter — only match participants are charged (live MD1 non-participant incident)", () => {
  // The reported bug: a player whose team contested NEITHER side of the fixture was charged a
  // conceded goal for every goal in the match. The team-in-match guard must zero that out.
  it("a player whose team is NOT in the match concedes nothing (team-in-match guard)", () => {
    const i = buildScoreInput(
      bundle({
        role: "DEF",
        // team C — neither home (A) nor away (B): an uninvolved team.
        team: {
          ...teamCtx(),
          playerTeamId: "C",
          homeScore: 0,
          awayScore: 2,
          teamByPlayerId: { gB: "B" },
        },
        events: [
          goal({ playerId: "gB", timeMinute: 30 }),
          goal({ playerId: "gB", timeMinute: 80 }),
        ],
      }),
    );
    expect(i.goalsConcededWhileOn).toBe(0);
    expect(i.teamGoalsAgainst).toBe(0);
    expect(scorePlayerMatch(i).total).toBe(0);
  });

  it("a REAL away-team participant is still charged a conceded goal (no over-correction)", () => {
    const i = buildScoreInput(
      bundle({
        role: "DEF",
        // away-team (B) defender; home (A) scores while he is on the pitch → a legitimate −1.
        team: {
          playerTeamId: "B",
          homeTeamId: "A",
          awayTeamId: "B",
          homeScore: 1,
          awayScore: 0,
          teamByPlayerId: { gA: "A" },
        },
        stat: { ...zeroStat(), minutesPlayed: 90 },
        events: [goal({ playerId: "gA", timeMinute: 30 })],
      }),
    );
    expect(i.goalsConcededWhileOn).toBe(1);
    expect(pointsFor(scorePlayerMatch(i), C.goalsConceded)).toBe(-1);
  });
});

describe("adapter — playerAppearedInMatch participant gate", () => {
  it("true: team-in-match WITH a real stat line", () => {
    expect(playerAppearedInMatch(bundle({ stat: { ...zeroStat(), minutesPlayed: 64 } }))).toBe(
      true,
    );
  });
  it("true: team-in-match named in a substitution event (came on)", () => {
    expect(
      playerAppearedInMatch(bundle({ events: [sub({ playerInId: "p1", timeMinute: 70 })] })),
    ).toBe(true);
  });
  it("false: a bare dirty stub — team-in-match but NO stat line and NO events", () => {
    expect(playerAppearedInMatch(bundle())).toBe(false); // stat: null, events: []
  });
  it("false: team NOT in the match, even WITH a full stat line (cross-team contamination)", () => {
    expect(
      playerAppearedInMatch(
        bundle({
          team: { ...teamCtx(), playerTeamId: "C" },
          stat: { ...zeroStat(), minutesPlayed: 90 },
        }),
      ),
    ).toBe(false);
  });
  it("false: player.team_id is unknown (null) — cannot confirm participation", () => {
    expect(
      playerAppearedInMatch(
        bundle({
          team: { ...teamCtx(), playerTeamId: null },
          stat: { ...zeroStat(), minutesPlayed: 90 },
        }),
      ),
    ).toBe(false);
  });
});

describe("adapter — penalties from shot rows (§7)", () => {
  it("penalty missed (−3 input): a penalty by this player that did not score (incl. saved)", () => {
    expect(buildScoreInput(bundle({ shots: [pen("p1", "miss")] })).penaltyMissed).toBe(1);
    expect(buildScoreInput(bundle({ shots: [pen("p1", "save")] })).penaltyMissed).toBe(1);
    expect(buildScoreInput(bundle({ shots: [pen("p1", "goal")] })).penaltyMissed).toBe(0);
  });

  it("penalty saved (+5 input): a saved opponent penalty while this GK was on the pitch", () => {
    const ctx = { ...teamCtx(), teamByPlayerId: { takerB: "B" } };
    const saved = pen("takerB", "save", 55);
    expect(buildScoreInput(bundle({ role: "GK", team: ctx, shots: [saved] })).penaltySaved).toBe(1);
    // Not a keeper → not attributed.
    expect(buildScoreInput(bundle({ role: "DEF", team: ctx, shots: [saved] })).penaltySaved).toBe(
      0,
    );
    // Own-team taker → not a save against us.
    const ownTaker = { ...teamCtx(), teamByPlayerId: { takerA: "A" } };
    expect(
      buildScoreInput(bundle({ role: "GK", team: ownTaker, shots: [pen("takerA", "save", 55)] }))
        .penaltySaved,
    ).toBe(0);
    // Keeper already subbed off before the penalty → not on the pitch → not attributed.
    expect(
      buildScoreInput(
        bundle({
          role: "GK",
          team: ctx,
          shots: [saved],
          events: [sub({ playerOutId: "p1", timeMinute: 40 })],
        }),
      ).penaltySaved,
    ).toBe(0);
  });
});

describe("adapter — own goal from event rows (§7)", () => {
  it("charges the own-goal scorer (−2 input)", () => {
    const i = buildScoreInput(
      bundle({ events: [goal({ playerId: "p1", incidentClass: "ownGoal", timeMinute: 40 })] }),
    );
    expect(i.ownGoals).toBe(1);
  });
});

describe("adapter — card input-shape feeds the engine's stacked result (Prompt-02a matrix)", () => {
  it("a two-yellow dismissal (one 2nd-yellow event) → yellow −1 + 2nd-yellow bucket, NO red line", () => {
    // The feed emits only the second-yellow incident; the adapter must still set the first yellow.
    const i = buildScoreInput(
      bundle({ events: [card({ playerId: "p1", incidentClass: "yellowRed", timeMinute: 70 })] }),
    );
    expect(i.yellowCard).toBe(true);
    expect(i.secondYellowMinute).toBe(70);
    expect(i.redCardMinute).toBeNull();
    const b = scorePlayerMatch(i);
    expect(pointsFor(b, C.yellowCard)).toBe(-1);
    expect(pointsFor(b, C.secondYellow)).toBe(-1); // ≥60
    expect(has(b, C.redCard)).toBe(false);
    expect(b.total).toBe(-2);
  });

  it("a straight red (no prior yellow) → red bucket only, no yellow line", () => {
    const i = buildScoreInput(
      bundle({ events: [card({ playerId: "p1", incidentClass: "redCard", timeMinute: 20 })] }),
    );
    expect(i.redCardMinute).toBe(20);
    expect(i.yellowCard).toBe(false);
    const b = scorePlayerMatch(i);
    expect(pointsFor(b, C.redCard)).toBe(-4);
    expect(has(b, C.yellowCard)).toBe(false);
  });

  it("buckets on the EFFECTIVE minute (time + added time): a 90+4 second yellow lands in ≥60", () => {
    const i = buildScoreInput(
      bundle({
        events: [
          card({ playerId: "p1", incidentClass: "secondYellow", timeMinute: 90, addedTime: 4 }),
        ],
      }),
    );
    expect(i.secondYellowMinute).toBe(94);
    expect(pointsFor(scorePlayerMatch(i), C.secondYellow)).toBe(-1);
  });

  it("a rescinded card is ignored", () => {
    const i = buildScoreInput(
      bundle({
        events: [
          card({ playerId: "p1", incidentClass: "yellow", timeMinute: 30, rescinded: true }),
        ],
      }),
    );
    expect(i.yellowCard).toBe(false);
  });
});

// ── local helpers ──────────────────────────────────────────────────────────────────────────────
function zeroStat() {
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
function teamCtx() {
  return {
    playerTeamId: "A",
    homeTeamId: "A",
    awayTeamId: "B",
    homeScore: 0,
    awayScore: 0,
    teamByPlayerId: {},
  };
}
function pen(playerId: string, shotType: string, minute: number | null = null): ShotRow {
  return shot({ playerId, isPenalty: true, situation: "penalty", shotType, minute });
}
