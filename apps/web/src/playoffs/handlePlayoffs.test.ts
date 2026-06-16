import { describe, it, expect, vi } from "vitest";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import type { PlayoffsView } from "@/app/playoffs/loadPlayoffs";
import { handlePlayoffs, type PlayoffsHandlerDeps } from "./handlePlayoffs";

const alice: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

// A whole-league guillotine snapshot (the field, not just the viewer). Minimal but type-faithful.
const VIEW: PlayoffsView = {
  totalRounds: 1,
  currentRoundIdx: 0,
  seeds: [{ managerId: "mgr-alice", seed: 1, gW: 2, gL: 0, gPts: 30 }],
  seedOf: { "mgr-alice": 1 },
  rounds: [
    {
      idx: 0,
      round: "R32",
      status: "live",
      fieldCount: 2,
      cutCount: 1,
      survives: 1,
      ranked: [
        { managerId: "mgr-alice", seed: 1, points: 20, rank: 1, state: "safe" },
        { managerId: "mgr-bob", seed: 2, points: 10, rank: 2, state: "zone" },
      ],
      survivors: ["mgr-alice"],
      eliminatedIds: ["mgr-bob"],
    },
  ],
  aliveNow: 2,
  survivesNow: 1,
  me: { managerId: "mgr-alice", seed: 1, points: 20, rank: 1, state: "safe" },
  champion: null,
  complete: false,
  managerId: "mgr-alice",
  reducedLineup: null,
  reinforcement: null,
  managerNames: { "mgr-alice": "Alice", "mgr-bob": "Bob" },
};

function deps(
  outcome: SessionManagerOutcome,
  load: (id: string) => Promise<PlayoffsView | null> = async () => VIEW,
): { deps: PlayoffsHandlerDeps; loadSpy: ReturnType<typeof vi.fn> } {
  const loadSpy = vi.fn(load);
  return { deps: { resolveManager: () => Promise.resolve(outcome), load: loadSpy }, loadSpy };
}

const okOutcome: SessionManagerOutcome = { kind: "ok", manager: alice, isCommissioner: false };

describe("handlePlayoffs — league-scoped read gate (401, no 403-not-your-manager)", () => {
  it("401 + no load when there is no session", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-session" });
    const res = await handlePlayoffs(d);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "no_session" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the email is not allowlisted (not a league member)", async () => {
    const { deps: d, loadSpy } = deps({ kind: "not-allowlisted", email: "x@example.com" });
    const res = await handlePlayoffs(d);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_allowlisted" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the user has no linked manager (not a league member)", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-manager", userId: "uid-x" });
    const res = await handlePlayoffs(d);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "no_manager" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("200 + the WHOLE-FIELD snapshot for an authenticated league member (me resolved from the session)", async () => {
    const { deps: d, loadSpy } = deps(okOutcome);
    const res = await handlePlayoffs(d);
    expect(res.status).toBe(200);
    expect(res.body).toBe(VIEW);
    // Loaded league-scoped for the viewer; the snapshot carries the whole field + `me`.
    expect(loadSpy).toHaveBeenCalledWith("mgr-alice");
    expect((res.body as PlayoffsView).rounds[0]!.ranked).toHaveLength(2);
    expect((res.body as PlayoffsView).me!.managerId).toBe("mgr-alice");
  });

  it("never returns 403-not-your-manager for a valid member (there is no own-manager target)", async () => {
    const { deps: d } = deps(okOutcome);
    const res = await handlePlayoffs(d);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("404 when there is no playoff field yet (pre-playoff — the page renders the pre-playoff state)", async () => {
    const { deps: d } = deps(okOutcome, async () => null);
    const res = await handlePlayoffs(d);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "no_playoffs" });
  });
});
