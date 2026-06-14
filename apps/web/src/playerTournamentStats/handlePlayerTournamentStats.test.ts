import { describe, it, expect, vi } from "vitest";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import type { PlayerTournamentStats } from "./buildPlayerTournamentStats";
import {
  handlePlayerTournamentStats,
  type PlayerTournamentStatsHandlerDeps,
} from "./handlePlayerTournamentStats";

const alice: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

const STATS: PlayerTournamentStats = {
  totals: {
    matches: 2,
    goals: 1,
    assists: 0,
    points: 12,
    saves: 0,
    cleanSheets: 1,
    conceded: 1,
    keyPasses: 3,
    shots: 2,
    tackles: 5,
    dribbles: 1,
  },
  tiles: [],
  games: [],
};

function deps(
  outcome: SessionManagerOutcome,
  load: (playerId: string) => Promise<PlayerTournamentStats | null> = async () => STATS,
): { deps: PlayerTournamentStatsHandlerDeps; loadSpy: ReturnType<typeof vi.fn> } {
  const loadSpy = vi.fn(load);
  return { deps: { resolveManager: () => Promise.resolve(outcome), load: loadSpy }, loadSpy };
}

const okOutcome: SessionManagerOutcome = { kind: "ok", manager: alice, isCommissioner: false };

describe("handlePlayerTournamentStats — league-scoped read gate (player-scoped, no periodId)", () => {
  it("401 + no load when there is no session", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-session" });
    const res = await handlePlayerTournamentStats(d, "p1");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "no_session" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the email is not allowlisted", async () => {
    const { deps: d, loadSpy } = deps({ kind: "not-allowlisted", email: "x@example.com" });
    const res = await handlePlayerTournamentStats(d, "p1");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_allowlisted" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the user has no linked manager", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-manager", userId: "uid-x" });
    const res = await handlePlayerTournamentStats(d, "p1");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "no_manager" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("200 + the stats for an authenticated league member regardless of ownership", async () => {
    const { deps: d, loadSpy } = deps(okOutcome);
    const res = await handlePlayerTournamentStats(d, "p99");
    expect(res.status).toBe(200);
    expect(res.body).toBe(STATS);
    expect(loadSpy).toHaveBeenCalledWith("p99");
  });

  it("400 when playerId is missing", async () => {
    const { deps: d, loadSpy } = deps(okOutcome);
    const res = await handlePlayerTournamentStats(d, null);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing_params" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("404 when the player has no row", async () => {
    const { deps: d } = deps(okOutcome, async () => null);
    const res = await handlePlayerTournamentStats(d, "p1");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
