import { describe, it, expect, vi } from "vitest";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import type { VsFieldView } from "@app/vsfield";
import { handleVsField, type VsFieldHandlerDeps } from "./handleVsField";

const alice: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

// A whole-league snapshot (multiple managers) — the league member sees the entire field.
const VIEW: VsFieldView = {
  asOf: "2026-06-12T12:00:00.000Z",
  leagueId: "lg1",
  viewerManagerId: "mgr-alice",
  currentPeriod: { id: "md1", label: "MD1" },
  field: [
    {
      managerId: "mgr-alice",
      displayName: "Alice",
      isMe: true,
      rank: 1,
      points: 20,
      record: { w: 2, l: 0, d: 0 },
      starters: [],
      counts: { yetToPlay: 0, playing: 0, played: 0, noMatch: 0 },
      h2hVsViewer: null,
    },
    {
      managerId: "mgr-bob",
      displayName: "Bob",
      isMe: false,
      rank: 2,
      points: 10,
      record: { w: 0, l: 2, d: 0 },
      starters: [],
      counts: { yetToPlay: 0, playing: 0, played: 0, noMatch: 0 },
      h2hVsViewer: { result: "win", points: 20, opponentPoints: 10, margin: 10 },
    },
  ],
  season: [],
  matches: [],
};

function deps(
  outcome: SessionManagerOutcome,
  load: (id: string) => Promise<VsFieldView | null> = async () => VIEW,
): { deps: VsFieldHandlerDeps; loadSpy: ReturnType<typeof vi.fn> } {
  const loadSpy = vi.fn(load);
  return { deps: { resolveManager: () => Promise.resolve(outcome), load: loadSpy }, loadSpy };
}

const okOutcome: SessionManagerOutcome = { kind: "ok", manager: alice, isCommissioner: false };

describe("handleVsField — league-scoped read gate (401, no 403-not-your-manager)", () => {
  it("401 + no load when there is no session", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-session" });
    const res = await handleVsField(d);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "no_session" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the email is not allowlisted (not a league member)", async () => {
    const { deps: d, loadSpy } = deps({ kind: "not-allowlisted", email: "x@example.com" });
    const res = await handleVsField(d);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_allowlisted" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no load when the user has no linked manager (not a league member)", async () => {
    const { deps: d, loadSpy } = deps({ kind: "no-manager", userId: "uid-x" });
    const res = await handleVsField(d);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "no_manager" });
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("200 + the WHOLE-FIELD snapshot for an authenticated league member (no own-manager scoping)", async () => {
    const { deps: d, loadSpy } = deps(okOutcome);
    const res = await handleVsField(d);
    expect(res.status).toBe(200);
    expect(res.body).toBe(VIEW);
    // Loaded league-scoped for the viewer; the snapshot carries the whole field, not just the viewer.
    expect(loadSpy).toHaveBeenCalledWith("mgr-alice");
    expect((res.body as VsFieldView).field).toHaveLength(2);
  });

  it("never returns 403-not-your-manager for a valid member (there is no own-manager target)", async () => {
    // Even a non-commissioner member viewing other managers' rows is allowed — no canActAsManager gate.
    const { deps: d } = deps(okOutcome);
    const res = await handleVsField(d);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("404 when there is no field to show (e.g. manager/league not resolvable)", async () => {
    const { deps: d } = deps(okOutcome, async () => null);
    const res = await handleVsField(d);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "no_field" });
  });
});
