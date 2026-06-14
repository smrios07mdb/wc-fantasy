/**
 * Unit tests for the PURE loader adapter (Prompt 54, Part B). Proves the load-bearing invariant:
 * the opponent (name + flag) comes from the OTHER fifa_team on the same match — the away team when
 * the player is home, the home team when the player is away — never from a `player.country` field
 * (which ingestion never populates). Also covers the points-by-match left-join and period ordering.
 */
import { describe, it, expect } from "vitest";
import { toTournamentRows, type AdapterStatRow } from "./toTournamentRows";

function statRow(over: Partial<AdapterStatRow> = {}): AdapterStatRow {
  return {
    matchId: "m1",
    minutesPlayed: 90,
    goals: 1,
    assists: 0,
    keyPasses: 2,
    tacklesWon: 3,
    dribblesCompleted: 1,
    saves: 0,
    shotsOnTarget: 2,
    match: {
      id: "m1",
      kickoffAt: new Date("2026-06-11T18:00:00Z"),
      homeTeamId: "t-home",
      awayTeamId: "t-away",
      homeScore: 2,
      awayScore: 1,
      homeTeam: { name: "France" },
      awayTeam: { name: "Mexico" },
      period: { label: "MD1" },
    },
    ...over,
  };
}

describe("toTournamentRows — opponent comes from the OTHER team on the same match", () => {
  it("player is home → opponent is the AWAY team", () => {
    const r = toTournamentRows({
      playerTeamId: "t-home",
      statRows: [statRow()],
      pointsByMatch: new Map([["m1", 7]]),
    })[0]!;
    expect(r.isHome).toBe(true);
    expect(r.opponentTeamName).toBe("Mexico");
    expect(r.points).toBe(7);
  });

  it("player is away → opponent is the HOME team", () => {
    const r = toTournamentRows({
      playerTeamId: "t-away",
      statRows: [statRow()],
      pointsByMatch: new Map([["m1", 4]]),
    })[0]!;
    expect(r.isHome).toBe(false);
    expect(r.opponentTeamName).toBe("France");
  });

  it("points absent from the map → 0 (score row not yet landed)", () => {
    const r = toTournamentRows({
      playerTeamId: "t-home",
      statRows: [statRow()],
      pointsByMatch: new Map(),
    })[0]!;
    expect(r.points).toBe(0);
  });

  it("derives periodOrder from the period label and threads scores through", () => {
    const r = toTournamentRows({
      playerTeamId: "t-home",
      statRows: [statRow({ match: { ...statRow().match, period: { label: "MD2" } } })],
      pointsByMatch: new Map(),
    })[0]!;
    expect(r.periodLabel).toBe("MD2");
    expect(r.periodOrder).toBe(2);
    expect(r.homeScore).toBe(2);
    expect(r.awayScore).toBe(1);
  });
});
