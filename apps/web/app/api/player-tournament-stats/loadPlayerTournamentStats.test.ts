/**
 * Focused loader test (Prompt 54, Part B). With Prisma mocked, it proves the two contracts the
 * Stats tab depends on:
 *   1. COMPLETED-only filtering — both reads carry `match: { status: "completed" }`.
 *   2. The opponent + flag come from the OTHER fifa_team on the same match row (not player.country),
 *      and points join by matchId.
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
});
