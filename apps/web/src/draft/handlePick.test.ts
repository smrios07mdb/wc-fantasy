import { describe, it, expect, vi } from "vitest";
import { MemoryDraftStore } from "@app/draft";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import { handleDraftPick, type PickHandlerDeps, type PickRequestBody } from "./handlePick";

const NOW = new Date("2026-06-04T00:01:00Z");

const aliceManager: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

/** An active 2-manager draft, on pick 1 (Alice on the clock), with player p1 (FWD) available. */
function activeDraftStore(): MemoryDraftStore {
  const store = new MemoryDraftStore();
  store.seedDraft({
    draftId: "d1",
    leagueId: "L1",
    orderedManagerIds: ["mgr-alice", "mgr-bob"],
    draftPickSeconds: 90,
    status: "active",
    currentPickNo: 1,
    currentManagerId: "mgr-alice",
    pickDeadlineAt: new Date("2026-06-04T00:02:00Z"),
  });
  store.seedPlayer("p1", "FWD");
  return store;
}

function deps(
  store: MemoryDraftStore,
  outcome: SessionManagerOutcome,
): { deps: PickHandlerDeps; loadSpy: ReturnType<typeof vi.spyOn> } {
  const loadSpy = vi.spyOn(store, "loadDraft");
  return {
    deps: { resolveManager: () => Promise.resolve(outcome), store, now: NOW },
    loadSpy,
  };
}

const body: PickRequestBody = { draftId: "d1", managerId: "mgr-alice", playerId: "p1" };

describe("handleDraftPick — identity gate BEFORE the controller", () => {
  it("401 + no controller call when there is no session", async () => {
    const store = activeDraftStore();
    const { deps: d, loadSpy } = deps(store, { kind: "no-session" });
    const res = await handleDraftPick(d, body);
    expect(res.status).toBe(401);
    expect(loadSpy).not.toHaveBeenCalled();
    expect(store.pickRows("d1")).toHaveLength(0);
  });

  it("403 + no controller call when the email is not allowlisted", async () => {
    const store = activeDraftStore();
    const { deps: d, loadSpy } = deps(store, { kind: "not-allowlisted", email: "x@y.com" });
    const res = await handleDraftPick(d, body);
    expect(res.status).toBe(403);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no controller call when no manager is linked", async () => {
    const store = activeDraftStore();
    const { deps: d, loadSpy } = deps(store, { kind: "no-manager", userId: "uid-alice" });
    const res = await handleDraftPick(d, body);
    expect(res.status).toBe(403);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no controller call when the session manager ≠ the body managerId", async () => {
    const store = activeDraftStore();
    const { deps: d, loadSpy } = deps(store, {
      kind: "ok",
      manager: aliceManager,
      isCommissioner: false,
    });
    const res = await handleDraftPick(d, { ...body, managerId: "mgr-bob" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "not_your_manager" });
    expect(loadSpy).not.toHaveBeenCalled();
    expect(store.pickRows("d1")).toHaveLength(0);
  });

  it("200 + calls submitPick ONCE when the session manager matches", async () => {
    const store = activeDraftStore();
    const { deps: d, loadSpy } = deps(store, {
      kind: "ok",
      manager: aliceManager,
      isCommissioner: false,
    });
    const res = await handleDraftPick(d, body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      pickNo: 1,
      managerId: "mgr-alice",
      playerId: "p1",
      isAuto: false,
    });
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(store.pickRows("d1")).toHaveLength(1);
  });

  it("surfaces a controller rejection (not your turn) as 409 — auth passed, the controller decided", async () => {
    const store = activeDraftStore(); // Alice is on the clock, not Bob
    const bobManager: ManagerRecord = { ...aliceManager, id: "mgr-bob", userId: "uid-bob" };
    const { deps: d, loadSpy } = deps(store, {
      kind: "ok",
      manager: bobManager,
      isCommissioner: false,
    });
    const res = await handleDraftPick(d, { ...body, managerId: "mgr-bob" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "NotYourTurnError" });
    expect(loadSpy).toHaveBeenCalled(); // controller WAS reached
    expect(store.pickRows("d1")).toHaveLength(0);
  });

  it("surfaces an unknown draft as 404", async () => {
    const store = activeDraftStore();
    const { deps: d } = deps(store, { kind: "ok", manager: aliceManager, isCommissioner: false });
    const res = await handleDraftPick(d, { ...body, draftId: "missing", managerId: "mgr-alice" });
    expect(res.status).toBe(404);
  });
});
