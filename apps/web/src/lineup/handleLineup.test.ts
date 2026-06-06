import { describe, it, expect, vi } from "vitest";
import type { Position } from "@app/shared";
import { MemoryLineupStore } from "@app/lineup";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import { handleSetLineup, type LineupHandlerDeps, type LineupRequestBody } from "./handleLineup";

const NOW = new Date("2026-06-12T10:00:00.000Z");
const CLOSES = new Date("2026-06-12T18:00:00.000Z");

const aliceManager: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

const SQUAD: [string, Position][] = [
  ["gk1", "GK"],
  ["gk2", "GK"],
  ["d1", "DEF"],
  ["d2", "DEF"],
  ["d3", "DEF"],
  ["d4", "DEF"],
  ["d5", "DEF"],
  ["m1", "MID"],
  ["m2", "MID"],
  ["m3", "MID"],
  ["m4", "MID"],
  ["m5", "MID"],
  ["f1", "FWD"],
  ["f2", "FWD"],
  ["f3", "FWD"],
];
const XI = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"];

/** Alice's full squad with one OPEN period `md1`. */
function aliceStore(): MemoryLineupStore {
  const store = new MemoryLineupStore();
  store.seedManager("mgr-alice", "L1");
  store.seedPeriod("L1", { id: "md1", status: "open", closesAt: CLOSES });
  for (const [playerId, position] of SQUAD) store.seedRoster("L1", "mgr-alice", playerId, position);
  return store;
}

function deps(
  store: MemoryLineupStore,
  outcome: SessionManagerOutcome,
): { deps: LineupHandlerDeps; loadSpy: ReturnType<typeof vi.spyOn> } {
  const loadSpy = vi.spyOn(store, "loadLineupContext");
  return {
    deps: { resolveManager: () => Promise.resolve(outcome), store, now: NOW },
    loadSpy,
  };
}

const body: LineupRequestBody = { managerId: "mgr-alice", periodId: "md1", starterIds: XI };

describe("handleSetLineup — identity gate BEFORE the controller", () => {
  it("401 + no controller call when there is no session", async () => {
    const store = aliceStore();
    const { deps: d, loadSpy } = deps(store, { kind: "no-session" });
    const res = await handleSetLineup(d, body);
    expect(res.status).toBe(401);
    expect(loadSpy).not.toHaveBeenCalled();
    expect(store.slotsOf("mgr-alice", "md1")).toHaveLength(0);
  });

  it("403 + no controller call when the email is not allowlisted", async () => {
    const store = aliceStore();
    const { deps: d, loadSpy } = deps(store, { kind: "not-allowlisted", email: "x@y.com" });
    const res = await handleSetLineup(d, body);
    expect(res.status).toBe(403);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 + no controller call when no manager is linked", async () => {
    const store = aliceStore();
    const { deps: d, loadSpy } = deps(store, { kind: "no-manager", userId: "uid-alice" });
    const res = await handleSetLineup(d, body);
    expect(res.status).toBe(403);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("403 not_your_manager + no controller call when session manager ≠ body managerId", async () => {
    const store = aliceStore();
    const { deps: d, loadSpy } = deps(store, {
      kind: "ok",
      manager: aliceManager,
      isCommissioner: false,
    });
    const res = await handleSetLineup(d, { ...body, managerId: "mgr-bob" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "not_your_manager" });
    expect(loadSpy).not.toHaveBeenCalled();
    expect(store.slotsOf("mgr-alice", "md1")).toHaveLength(0);
  });

  it("a commissioner may NOT set another manager's lineup (scope 'self')", async () => {
    const store = aliceStore();
    const { deps: d, loadSpy } = deps(store, {
      kind: "ok",
      manager: { ...aliceManager, isCommissioner: true },
      isCommissioner: true,
    });
    const res = await handleSetLineup(d, { ...body, managerId: "mgr-bob" });
    expect(res.status).toBe(403);
    expect(loadSpy).not.toHaveBeenCalled();
  });
});

describe("handleSetLineup — server-authoritative persistence", () => {
  it("200 + persists a legal XI when the session manager matches (body carries the session id)", async () => {
    const store = aliceStore();
    const { deps: d, loadSpy } = deps(store, {
      kind: "ok",
      manager: aliceManager,
      isCommissioner: false,
    });
    const res = await handleSetLineup(d, body);
    expect(res.status).toBe(200);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith("mgr-alice", "md1"); // the session manager's id
    expect(new Set(store.starterIdsOf("mgr-alice", "md1"))).toEqual(new Set(XI));
  });

  it("409 locked-player-moved when the client sends a benching of a LOCKED starter (rejected server-side)", async () => {
    const store = aliceStore();
    store.seedSlot("mgr-alice", "md1", "d1", "DEF", { isStarter: true, locked: true }); // d1 played
    const { deps: d } = deps(store, { kind: "ok", manager: aliceManager, isCommissioner: false });
    const sneaky = ["gk1", "d5", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"]; // benches d1
    const res = await handleSetLineup(d, { ...body, starterIds: sneaky });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "locked-player-moved" });
    // The locked slot is untouched.
    expect(store.slotsOf("mgr-alice", "md1").find((s) => s.playerId === "d1")?.isStarter).toBe(
      true,
    );
  });

  it("409 illegal-formation surfaces the typed error (auth passed; the validator decided)", async () => {
    const store = aliceStore();
    const { deps: d } = deps(store, { kind: "ok", manager: aliceManager, isCommissioner: false });
    const bad = ["gk1", "d1", "d2", "m1", "m2", "m3", "m4", "m5", "f1", "f2", "f3"]; // 2 DEF
    const res = await handleSetLineup(d, { ...body, starterIds: bad });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "illegal-formation" });
  });

  it("404 when the period is unknown", async () => {
    const store = aliceStore();
    const { deps: d } = deps(store, { kind: "ok", manager: aliceManager, isCommissioner: false });
    const res = await handleSetLineup(d, { ...body, periodId: "nope" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "wrong-period" });
  });
});
