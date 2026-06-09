/**
 * Tests for the PURE ranking core (rankGenerate.ts). No IO — every case is built from literals.
 * The CLI fetcher (cli.ts `rank:generate`) is the IO edge and is verified live against the GOAT API,
 * not here. Arithmetic in the comments is hand-computed so the expected values are auditable.
 *
 * Scoring weights replicated from SCORING.md (NOT imported — the ranking is a standalone projection):
 *   GOAL_WEIGHT   = { GK: 6, DEF: 6, MID: 5, FWD: 4 }
 *   ASSIST_WEIGHT = { GK: 4, DEF: 4, MID: 3, FWD: 3 }
 */
import { describe, it, expect } from "vitest";
import {
  computeRanking,
  americanOddsToProb,
  expectedMatchesFromOdds,
  toRankingCsv,
  parseRankingCsvIds,
  type RankingInput,
  type SquadPlayer,
  type MatchProps,
  type RankingCsvRow,
} from "./rankGenerate";

// ── Builders ──────────────────────────────────────────────────────────────────

function player(over: Partial<SquadPlayer> & { balldontlieId: number }): SquadPlayer {
  return {
    name: `Player ${over.balldontlieId}`,
    position: "FWD",
    teamId: 1,
    ...over,
  };
}

function goalProp(
  playerId: number,
  matchId: number,
  lineValue: number,
  impliedProb: number,
): MatchProps {
  return { matchId, playerId, propType: "anytime_goal", lineValue, impliedProb };
}

function assistProp(
  playerId: number,
  matchId: number,
  lineValue: number,
  impliedProb: number,
): MatchProps {
  return { matchId, playerId, propType: "assists", lineValue, impliedProb };
}

/** Assemble a RankingInput, deriving playerTeam from the squad and defaulting empty odds/props. */
function input(over: Partial<RankingInput> & { players: SquadPlayer[] }): RankingInput {
  const playerTeam =
    over.playerTeam ?? Object.fromEntries(over.players.map((p) => [p.balldontlieId, p.teamId]));
  return {
    props: [],
    teamWinOdds: {},
    playerTeam,
    ...over,
  };
}

const byId = <T extends { balldontlieId: number }>(rows: T[], id: number): T =>
  rows.find((r) => r.balldontlieId === id)!;

// ── americanOddsToProb ──────────────────────────────────────────────────────────

describe("americanOddsToProb", () => {
  it("positive odds: +600 → 100/700 ≈ 0.1429", () => {
    expect(americanOddsToProb(600)).toBeCloseTo(100 / 700, 6);
  });
  it("negative odds: -150 → 150/250 = 0.60", () => {
    expect(americanOddsToProb(-150)).toBeCloseTo(0.6, 6);
  });
  it("+100 → 0.50", () => {
    expect(americanOddsToProb(100)).toBeCloseTo(0.5, 6);
  });
  it("-100 → 0.50", () => {
    expect(americanOddsToProb(-100)).toBeCloseTo(0.5, 6);
  });
});

// ── expectedMatchesFromOdds ─────────────────────────────────────────────────────

describe("expectedMatchesFromOdds", () => {
  it("+450 → 6.5 (≤ +600 tier)", () => expect(expectedMatchesFromOdds(450)).toBe(6.5));
  it("+800 → 5.5 (+601..+1200)", () => expect(expectedMatchesFromOdds(800)).toBe(5.5));
  it("+1400 → 4.5 (+1201..+2500)", () => expect(expectedMatchesFromOdds(1400)).toBe(4.5));
  it("+3500 → 3.8 (+2501..+5000)", () => expect(expectedMatchesFromOdds(3500)).toBe(3.8));
  it("+8000 → 3.3 (+5001..+10000)", () => expect(expectedMatchesFromOdds(8000)).toBe(3.3));
  it("+20000 → 3.0 (> +10000)", () => expect(expectedMatchesFromOdds(20000)).toBe(3.0));
  it("undefined → 3.0 (no futures data)", () =>
    expect(expectedMatchesFromOdds(undefined)).toBe(3.0));
  it("boundary +600 → 6.5 (inclusive upper edge)", () =>
    expect(expectedMatchesFromOdds(600)).toBe(6.5));
  it("boundary +601 → 5.5 (next tier starts)", () =>
    expect(expectedMatchesFromOdds(601)).toBe(5.5));
});

// ── computeRanking ──────────────────────────────────────────────────────────────

describe("computeRanking", () => {
  it("player with goal props across 3 matches scores above a no-props player on the same team", () => {
    // Team 1, no futures → expectedMatches 3.0 for both. A (FWD) has anytime_goal line 1 @0.5 in 3 matches:
    //   E[pts/match] = 0.5*4 (FWD goal) + 0 + 2.0 = 4.0 → groupStage 12.0 → ×(3/3) = 12.0.
    // B (FWD) no props → baseline 3.5 × 3.0 = 10.5.
    const players = [player({ balldontlieId: 1 }), player({ balldontlieId: 2 })];
    const props = [101, 102, 103].map((m) => goalProp(1, m, 1, 0.5));
    const out = computeRanking(input({ players, props }));

    const a = byId(out, 1);
    const b = byId(out, 2);
    expect(a.projectedPts).toBeCloseTo(12.0, 6);
    expect(b.projectedPts).toBeCloseTo(10.5, 6);
    expect(a.projectedPts).toBeGreaterThan(b.projectedPts);
  });

  it("E[goals] = P(≥1) + P(≥2) + P(≥3) summed across the line values", () => {
    // One FWD, one match, anytime_goal lines 1/2/3 @ 0.6/0.2/0.05 → E[goals]=0.85.
    //   E[pts/match] = 0.85*4 + 0 + 2.0 = 5.4 → one match → ×(3/3) = 5.4.
    const players = [player({ balldontlieId: 1 })];
    const props = [goalProp(1, 101, 1, 0.6), goalProp(1, 101, 2, 0.2), goalProp(1, 101, 3, 0.05)];
    const out = computeRanking(input({ players, props }));
    expect(byId(out, 1).projectedPts).toBeCloseTo(5.4, 6);
  });

  it("includes the 2.0 appearance baseline for every match a prop-covered player has", () => {
    // anytime_goal line 1 @ 0 in a single match → E[goals]=0, E[assists]=0 → E[pts/match] = 2.0.
    const players = [player({ balldontlieId: 1 })];
    const props = [goalProp(1, 101, 1, 0)];
    const out = computeRanking(input({ players, props }));
    expect(byId(out, 1).projectedPts).toBeCloseTo(2.0, 6);
    expect(byId(out, 1).hasProps).toBe(true);
  });

  it("folds assists into E[pts/match] with the position assist weight", () => {
    // FWD, one match: anytime_goal line 1 @0.4, assists lines 1/2 @0.3/0.1 → E[assists]=0.4.
    //   E[pts/match] = 0.4*4 (goal) + 0.4*3 (FWD assist) + 2.0 = 1.6 + 1.2 + 2.0 = 4.8.
    const players = [player({ balldontlieId: 1 })];
    const props = [
      goalProp(1, 101, 1, 0.4),
      assistProp(1, 101, 1, 0.3),
      assistProp(1, 101, 2, 0.1),
    ];
    const out = computeRanking(input({ players, props }));
    expect(byId(out, 1).projectedPts).toBeCloseTo(4.8, 6);
  });

  it("a strong-team player outranks an equal-output player on a weak team", () => {
    // Identical props; team 1 strong (+450 → 6.5), team 2 weak (no futures → 3.0).
    const players = [
      player({ balldontlieId: 1, teamId: 1 }),
      player({ balldontlieId: 2, teamId: 2 }),
    ];
    const props = [
      ...[101, 102, 103].map((m) => goalProp(1, m, 1, 0.5)),
      ...[201, 202, 203].map((m) => goalProp(2, m, 1, 0.5)),
    ];
    const out = computeRanking(input({ players, props, teamWinOdds: { 1: 450 } }));
    const strong = byId(out, 1);
    const weak = byId(out, 2);
    // strong: 12.0 × (6.5/3) = 26.0 ; weak: 12.0 × (3/3) = 12.0
    expect(strong.projectedPts).toBeCloseTo(26.0, 6);
    expect(weak.projectedPts).toBeCloseTo(12.0, 6);
    expect(strong.projectedPts).toBeGreaterThan(weak.projectedPts);
    expect(strong.expectedMatches).toBe(6.5);
  });

  it("a no-props player uses the position baseline × expectedMatches", () => {
    // GK, team with no futures → baseline 5.0 × 3.0 = 15.0.
    const players = [player({ balldontlieId: 1, position: "GK" })];
    const out = computeRanking(input({ players }));
    const gk = byId(out, 1);
    expect(gk.projectedPts).toBeCloseTo(15.0, 6);
    expect(gk.hasProps).toBe(false);
    expect(gk.expectedMatches).toBe(3.0);
  });

  it("a strong-team GK outranks a weak-team GK (no props either side)", () => {
    // GK baseline 5.0; strong (+450 → 6.5) ⇒ 32.5, weak (none → 3.0) ⇒ 15.0.
    const players = [
      player({ balldontlieId: 1, position: "GK", teamId: 1 }),
      player({ balldontlieId: 2, position: "GK", teamId: 2 }),
    ];
    const out = computeRanking(input({ players, teamWinOdds: { 1: 450 } }));
    expect(byId(out, 1).projectedPts).toBeGreaterThan(byId(out, 2).projectedPts);
  });

  it("keeps every input player exactly once — no drops, no dupes", () => {
    const players = Array.from({ length: 50 }, (_, i) =>
      player({ balldontlieId: i + 1, position: (["GK", "DEF", "MID", "FWD"] as const)[i % 4] }),
    );
    const out = computeRanking(input({ players }));
    expect(out).toHaveLength(50);
    expect(new Set(out.map((r) => r.balldontlieId)).size).toBe(50);
    expect(new Set(out.map((r) => r.balldontlieId))).toEqual(
      new Set(players.map((p) => p.balldontlieId)),
    );
  });

  it("sorts descending by projectedPts", () => {
    const players = [
      player({ balldontlieId: 1, position: "MID" }), // baseline 3.0 → 9.0
      player({ balldontlieId: 2, position: "GK" }), //  baseline 5.0 → 15.0
      player({ balldontlieId: 3, position: "FWD" }), // baseline 3.5 → 10.5
    ];
    const out = computeRanking(input({ players }));
    const pts = out.map((r) => r.projectedPts);
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
    expect(out[0]?.balldontlieId).toBe(2); // GK, highest baseline
  });

  it("breaks ties by position FWD > MID > DEF > GK, then alphabetical name", () => {
    // All on a no-futures team. DEF + FWD share baseline 3.5 → identical projectedPts 10.5.
    const players = [
      player({ balldontlieId: 1, position: "DEF", name: "Maldini" }), // 10.5
      player({ balldontlieId: 2, position: "FWD", name: "Zidane" }), //  10.5
      player({ balldontlieId: 3, position: "FWD", name: "Aguero" }), //  10.5
    ];
    const out = computeRanking(input({ players }));
    // FWD before DEF; within FWD, Aguero before Zidane.
    expect(out.map((r) => r.balldontlieId)).toEqual([3, 2, 1]);
  });

  it("flags hasProps true only when the player has an anytime_goal entry", () => {
    // Player 1 has only an assists prop (no anytime_goal) → treated as baseline, hasProps false.
    const players = [player({ balldontlieId: 1 }), player({ balldontlieId: 2 })];
    const props = [assistProp(1, 101, 1, 0.5), goalProp(2, 201, 1, 0.5)];
    const out = computeRanking(input({ players, props }));
    expect(byId(out, 1).hasProps).toBe(false);
    expect(byId(out, 2).hasProps).toBe(true);
  });

  it("carries name and position through to the ranked output", () => {
    const players = [player({ balldontlieId: 7, name: "Mbappé", position: "FWD" })];
    const out = computeRanking(input({ players }));
    expect(out[0]).toMatchObject({ balldontlieId: 7, name: "Mbappé", position: "FWD" });
  });
});

// ── CSV serialization ──────────────────────────────────────────────────────────

const csvRow = (
  over: Partial<RankingCsvRow> & { rank: number; balldontlieId: number },
): RankingCsvRow => ({
  name: `Player ${over.balldontlieId}`,
  position: "FWD",
  team: "France",
  projectedPts: 12.345,
  expectedMatches: 6.5,
  hasProps: true,
  ...over,
});

describe("toRankingCsv", () => {
  it("emits the documented header row", () => {
    const csv = toRankingCsv([csvRow({ rank: 1, balldontlieId: 1 })]);
    expect(csv.split("\n")[0]).toBe(
      "rank,balldontlieId,name,position,team,projectedPts,expectedMatches,hasProps",
    );
  });

  it("formats projectedPts to two decimals and writes one row per player", () => {
    const csv = toRankingCsv([
      csvRow({ rank: 1, balldontlieId: 10, projectedPts: 12.345 }),
      csvRow({ rank: 2, balldontlieId: 20, projectedPts: 9 }),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain("12.35");
    expect(lines[2]).toContain("9.00");
  });

  it("quotes fields containing a comma so the column count is preserved", () => {
    const csv = toRankingCsv([csvRow({ rank: 1, balldontlieId: 1, name: "Doe, John" })]);
    expect(csv.split("\n")[1]).toContain('"Doe, John"');
    expect(parseRankingCsvIds(csv)).toEqual([1]);
  });
});

describe("parseRankingCsvIds", () => {
  it("extracts the balldontlieId column in row order, skipping the header", () => {
    const csv = toRankingCsv([
      csvRow({ rank: 1, balldontlieId: 101 }),
      csvRow({ rank: 2, balldontlieId: 202 }),
      csvRow({ rank: 3, balldontlieId: 303 }),
    ]);
    expect(parseRankingCsvIds(csv)).toEqual([101, 202, 303]);
  });

  it("ignores blank trailing lines", () => {
    const csv =
      "rank,balldontlieId,name,position,team,projectedPts,expectedMatches,hasProps\n" +
      "1,5,Foo,FWD,France,1.00,6.5,false\n\n";
    expect(parseRankingCsvIds(csv)).toEqual([5]);
  });

  it("round-trips through toRankingCsv even with quoted names", () => {
    const rows = [
      csvRow({ rank: 1, balldontlieId: 1, name: 'Quote"Man' }),
      csvRow({ rank: 2, balldontlieId: 2, name: "Comma, Guy" }),
    ];
    expect(parseRankingCsvIds(toRankingCsv(rows))).toEqual([1, 2]);
  });
});
