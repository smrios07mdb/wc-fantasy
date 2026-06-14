/**
 * Focused loader test (Prompt 54, Part B + Prompt 55). With Prisma mocked, it proves the contracts
 * the Stats tab depends on:
 *   1. COMPLETED-only filtering — both reads carry `match: { status: "completed" }`.
 *   2. The opponent + flag come from the OTHER fifa_team on the same match row (not player.country),
 *      and points join by matchId.
 *   3. TEAM-PARTICIPATION gate — the stat read is constrained to matches the player's team played
 *      in (home OR away), so phantom stub stat_player_match rows for foreign matches can never
 *      surface. This is the regression guard for the 3-foreign-row bug: the old test mocked only
 *      clean rows, so a missing gate went uncaught. We assert the gate is present in the query
 *      `where` (a mocked Prisma `findMany` returns whatever it's handed, so the gate is unverifiable
 *      via the result — it must be checked on the call args).
 * `server-only` is stubbed so the loader imports cleanly in the Node test environment.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@app/db", () => ({
  prisma: {
    player: { findUnique: vi.fn() },
    statPlayerMatch: { findMany: vi.fn() },
    scorePlayerMatch: { findMany: vi.fn() },
  },
}));

import { prisma } from "@app/db";
import { loadPlayerTournamentStats } from "./loadPlayerTournamentStats";

const playerFind = prisma.player.findUnique as unknown as Mock;
const statFind = prisma.statPlayerMatch.findMany as unknown as Mock;
const scoreFind = prisma.scorePlayerMatch.findMany as unknown as Mock;

const STAT_ROW = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadPlayerTournamentStats", () => {
  it("returns null when the player does not exist", async () => {
    playerFind.mockResolvedValue(null);
    const out = await loadPlayerTournamentStats("nope");
    expect(out).toBeNull();
    expect(statFind).not.toHaveBeenCalled();
  });

  it("reads COMPLETED matches only and builds the opponent from the other team", async () => {
    playerFind.mockResolvedValue({ id: "p1", position: "DEF", teamId: "t-home" });
    statFind.mockResolvedValue([STAT_ROW]);
    scoreFind.mockResolvedValue([{ matchId: "m1", points: 7 }]);

    const out = await loadPlayerTournamentStats("p1");

    // (1) completed-only filter on BOTH reads.
    expect(statFind.mock.calls[0]![0].where.match.status).toBe("completed");
    expect(statFind.mock.calls[0]![0].where.playerId).toBe("p1");
    expect(scoreFind.mock.calls[0]![0].where.match.status).toBe("completed");

    // (1b) team-participation gate — the stat read is constrained to matches the player's TEAM
    // played in (home OR away). This is what excludes phantom stub rows for foreign matches.
    expect(statFind.mock.calls[0]![0].where.match.OR).toEqual([
      { homeTeamId: "t-home" },
      { awayTeamId: "t-home" },
    ]);

    // (2) opponent + flag from the OTHER team (player is home → away team "Mexico"), points joined.
    expect(out).not.toBeNull();
    expect(out!.totals.matches).toBe(1);
    expect(out!.games[0]!.opponentTeamName).toBe("Mexico");
    expect(out!.games[0]!.opponentIso2).toBe("MX");
    expect(out!.games[0]!.isHome).toBe(true);
    expect(out!.games[0]!.points).toBe(7);
    // DEF position → home win 2–1 means a goal conceded, so no clean sheet.
    expect(out!.games[0]!.scoreline).toBe("2–1");
  });

  it("gates the stat read to the player's own team so foreign-team matches are excluded", async () => {
    // The 3-foreign-row bug: phantom stub stat_player_match rows existed for matches the player's
    // team never played in. The gate must constrain the query so those rows can never be read. We
    // prove the constraint is on the call (the mock can't reproduce a real WHERE filter), keyed to
    // the AWAY player's team id this time to show the gate tracks the resolved team.
    playerFind.mockResolvedValue({ id: "p2", position: "FWD", teamId: "t-away" });
    statFind.mockResolvedValue([]);
    scoreFind.mockResolvedValue([]);

    const out = await loadPlayerTournamentStats("p2");

    const where = statFind.mock.calls[0]![0].where;
    expect(where.playerId).toBe("p2");
    expect(where.match.status).toBe("completed");
    expect(where.match.OR).toEqual([{ homeTeamId: "t-away" }, { awayTeamId: "t-away" }]);
    // No legitimate rows here → zero matches, no throw.
    expect(out!.totals.matches).toBe(0);
  });

  it("returns no matches (without throwing) when the player has no team", async () => {
    // Defensive: a null team can't be home or away, so the gate must yield zero matches rather than
    // a clause that matches teamless rows.
    playerFind.mockResolvedValue({ id: "p3", position: "MID", teamId: null });
    statFind.mockResolvedValue([]);
    scoreFind.mockResolvedValue([]);

    const out = await loadPlayerTournamentStats("p3");

    const where = statFind.mock.calls[0]![0].where;
    expect(where.match.OR).toBeUndefined();
    expect(where.match.id).toEqual({ in: [] });
    expect(out!.totals.matches).toBe(0);
  });
});
