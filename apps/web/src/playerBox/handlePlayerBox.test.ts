import { describe, it, expect, vi } from "vitest";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import type { PlayerBoxView } from "@app/player-box";
import { handlePlayerBox, type PlayerBoxHandlerDeps } from "./handlePlayerBox";

const alice: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

const VIEW: PlayerBoxView = {
  header: {
    displayName: "Player One",
    shortName: "P. One",
    position: "FWD",
    nation: "Brazil",
    fixture: null,
    periodTotal: 14,
  },
  state: "played",
  sections: [],
  trackedStats: [],
  season: null,
};

function deps(
  outcome: SessionManagerOutcome,
  load: (
    viewerManagerId: string,
    periodId: string,
    playerId: string,
  ) => Promise<PlayerBoxView | null> = async () => VIEW,
): { deps: PlayerBoxHandlerDeps; loadSpy: ReturnType<typeof vi.fn> } {
  const loadSpy = vi.fn(load);
  return { deps: { resolveManager: () => Promise.resolve(outcome), load: loadSpy }, loadSpy };
}

const okOutcome: SessionManagerOutcome = { kind: "ok", manager: alice, isCommissioner: false };

describe("handlePlayerBox — league-scoped read gate (401, no 403-not-your-manager)", () => {
  it("401 + no load when there is no session", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-session" });
    const res = await handlePlayerBox(d, "md1", "p1");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "no_session" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the email is not allowlisted (not a league member)", async () => {
    const { deps: d, loadSpy } = deps({ kind: "not-allowlisted", email: "x@example.com" });
    const res = await handlePlayerBox(d, "md1", "p1");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_allowlisted" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the user has no linked manager (not a league member)", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-manager", userId: "uid-x" });
    const res = await handlePlayerBox(d, "md1", "p1");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "no_manager" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("200 + the player snapshot for an authenticated league member regardless of ownership", async () => {
    const { deps: d, loadSpy } = deps(okOutcome);
    // Player "p99" is owned by a different manager — league-scoped read, no ownership check.
    const res = await handlePlayerBox(d, "md1", "p99");
    expect(res.status).toBe(200);
    expect(res.body).toBe(VIEW);
    expect(loadSpy).toHaveBeenCalledWith("mgr-alice", "md1", "p99");
  });

  it("never returns 403-not-your-manager for a valid member viewing another manager's player", async () => {
    const { deps: d } = deps(okOutcome);
    const res = await handlePlayerBox(d, "md1", "p99");
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("400 when periodId is missing", async () => {
    const { deps: d } = deps(okOutcome);
    const res = await handlePlayerBox(d, null, "p1");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing_params" });
  });

  it("400 when playerId is missing", async () => {
    const { deps: d } = deps(okOutcome);
    const res = await handlePlayerBox(d, "md1", null);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing_params" });
  });

  it("404 when the player has no score data for the period", async () => {
    const { deps: d } = deps(okOutcome, async () => null);
    const res = await handlePlayerBox(d, "md1", "p1");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
