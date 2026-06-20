import { describe, it, expect, vi } from "vitest";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import type { StandingsView } from "@app/recompute";
import { handleStandings, type StandingsHandlerDeps } from "./handleStandings";

const alice: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

// A whole-league standings snapshot (the field, not just the viewer). Minimal but type-faithful.
const VIEW: StandingsView = {
  meId: "mgr-alice",
  fieldSize: 8,
  periods: [{ id: "md1", label: "MD1", name: "MD1", live: true }],
  defaultMatchdayPeriodId: "md1",
  matchday: {
    md1: [
      {
        managerId: "mgr-alice",
        displayName: "Alice",
        isMe: true,
        rank: 1,
        tiedAtRank: false,
        qualified: false,
        w: 1,
        l: 0,
        d: 0,
        points: 20,
        seed: null,
        winPct: 1,
      },
    ],
  },
  cumulative: [
    {
      managerId: "mgr-alice",
      displayName: "Alice",
      isMe: true,
      rank: 1,
      tiedAtRank: false,
      qualified: true,
      w: 1,
      l: 0,
      d: 0,
      points: 20,
      seed: 1,
      winPct: 1,
      tiedWins: false,
      perPeriod: [],
      move: 0,
    },
  ],
};

function deps(
  outcome: SessionManagerOutcome,
  load: (id: string) => Promise<StandingsView | null> = async () => VIEW,
): { deps: StandingsHandlerDeps; loadSpy: ReturnType<typeof vi.fn> } {
  const loadSpy = vi.fn(load);
  return { deps: { resolveManager: () => Promise.resolve(outcome), load: loadSpy }, loadSpy };
}

const okOutcome: SessionManagerOutcome = { kind: "ok", manager: alice, isCommissioner: false };

describe("handleStandings — league-scoped read gate (401, no 403-not-your-manager)", () => {
  it("401 + no load when there is no session", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-session" });
    const res = await handleStandings(d);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "no_session" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the email is not allowlisted (not a league member)", async () => {
    const { deps: d, loadSpy } = deps({ kind: "not-allowlisted", email: "x@example.com" });
    const res = await handleStandings(d);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_allowlisted" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the user has no linked manager (not a league member)", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-manager", userId: "uid-x" });
    const res = await handleStandings(d);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "no_manager" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("200 + the WHOLE-FIELD snapshot for an authenticated league member (me resolved from the session)", async () => {
    const { deps: d, loadSpy } = deps(okOutcome);
    const res = await handleStandings(d);
    expect(res.status).toBe(200);
    expect(res.body).toBe(VIEW);
    expect(loadSpy).toHaveBeenCalledWith("mgr-alice");
    expect((res.body as StandingsView).cumulative).toHaveLength(1);
    expect((res.body as StandingsView).meId).toBe("mgr-alice");
  });

  it("never returns 403-not-your-manager for a valid member (there is no own-manager target)", async () => {
    const { deps: d } = deps(okOutcome);
    const res = await handleStandings(d);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("404 when the manager is gone (load returns null)", async () => {
    const { deps: d } = deps(okOutcome, async () => null);
    const res = await handleStandings(d);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "no_standings" });
  });
});
