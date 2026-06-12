import { describe, it, expect } from "vitest";
import type { Position } from "@app/shared";
import { MemoryLineupStore } from "./memoryStore";
import { setLineup } from "./controller";

const NOW = new Date("2026-06-12T10:00:00.000Z");
const CLOSES = new Date("2026-06-12T18:00:00.000Z");

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

// A legal 4-4-2. Bench: gk2, d5, m5, f3.
const XI = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"];

/** A manager with the full 15-man squad and one OPEN period `md1`. */
function seedStore(): MemoryLineupStore {
  const store = new MemoryLineupStore();
  store.seedManager("mgr-1", "L1");
  store.seedPeriod("L1", { id: "md1", status: "open", closesAt: CLOSES });
  for (const [playerId, position] of SQUAD) store.seedRoster("L1", "mgr-1", playerId, position);
  return store;
}

describe("setLineup — persistence", () => {
  it("persists a legal XI as 15 lineup_slot rows (11 starters + 4 bench)", async () => {
    const store = seedStore();
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md1", starterIds: XI },
      NOW,
    );
    expect(res.ok).toBe(true);
    expect(new Set(store.starterIdsOf("mgr-1", "md1"))).toEqual(new Set(XI));
    expect(store.benchIdsOf("mgr-1", "md1").sort()).toEqual(["d5", "f3", "gk2", "m5"]);
    expect(store.slotsOf("mgr-1", "md1")).toHaveLength(15);
  });

  it("re-saving updates which players are starters (idempotent overwrite of unlocked slots)", async () => {
    const store = seedStore();
    await setLineup(store, { managerId: "mgr-1", periodId: "md1", starterIds: XI }, NOW);
    // Swap m4 (starter) ↔ m5 (bench): still a legal 4-4-2.
    const next = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m5", "f1", "f2"];
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md1", starterIds: next },
      NOW,
    );
    expect(res.ok).toBe(true);
    expect(new Set(store.starterIdsOf("mgr-1", "md1"))).toEqual(new Set(next));
  });

  it("pre-sets a future (pending) window in advance", async () => {
    const store = seedStore();
    store.seedPeriod("L1", {
      id: "md3",
      status: "pending",
      closesAt: new Date("2026-06-20T18:00:00.000Z"),
    });
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md3", starterIds: XI },
      NOW,
    );
    expect(res.ok).toBe(true);
    expect(new Set(store.starterIdsOf("mgr-1", "md3"))).toEqual(new Set(XI));
  });
});

describe("setLineup — typed rejections (nothing persisted)", () => {
  it("rejects an illegal formation (2 DEF) with illegal-formation", async () => {
    const store = seedStore();
    const bad = ["gk1", "d1", "d2", "m1", "m2", "m3", "m4", "m5", "f1", "f2", "f3"]; // 2 DEF
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md1", starterIds: bad },
      NOW,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("illegal-formation");
    expect(store.slotsOf("mgr-1", "md1")).toHaveLength(0); // nothing written
  });

  it("rejects an unknown period with wrong-period", async () => {
    const store = seedStore();
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "nope", starterIds: XI },
      NOW,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("wrong-period");
  });

  it("rejects editing a closed period with wrong-period", async () => {
    const store = seedStore();
    store.seedPeriod("L1", { id: "md0", status: "closed", closesAt: null });
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md0", starterIds: XI },
      NOW,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("wrong-period");
  });
});

describe("setLineup — the forfeit model (server-authoritative; the client can't be trusted)", () => {
  it("rejects benching a PLAYED starter WITHOUT a confirm (forfeit-requires-confirm), nothing voided", async () => {
    const store = seedStore();
    // d1 has played: a played (locked) starter slot already exists for md1.
    store.seedSlot("mgr-1", "md1", "d1", "DEF", { isStarter: true, hasPlayed: true });
    // Client (compromised UI) sends a proposal that benches d1 (starts d5 instead) — legal shape, no confirm.
    const sneaky = ["gk1", "d5", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"];
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md1", starterIds: sneaky },
      NOW,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("forfeit-requires-confirm");
    // d1 is still a starter and NOT voided — no destructive write happened.
    expect(store.slotsOf("mgr-1", "md1").find((s) => s.playerId === "d1")?.isStarter).toBe(true);
    expect(store.voidedIdsOf("mgr-1", "md1")).toEqual([]);
    expect(store.enqueuedRecomputes()).toEqual([]);
  });

  it("benches + VOIDS a played starter when the forfeit is confirmed, and enqueues a recompute", async () => {
    const store = seedStore();
    store.seedSlot("mgr-1", "md1", "d1", "DEF", { isStarter: true, hasPlayed: true });
    const benched = ["gk1", "d5", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"]; // d5 starts for d1
    const res = await setLineup(
      store,
      {
        managerId: "mgr-1",
        periodId: "md1",
        starterIds: benched,
        forfeitConfirmedPlayerIds: ["d1"],
      },
      NOW,
    );
    expect(res.ok).toBe(true);
    const d1 = store.slotsOf("mgr-1", "md1").find((s) => s.playerId === "d1");
    expect(d1?.isStarter).toBe(false); // benched
    expect(store.voidedIdsOf("mgr-1", "md1")).toEqual(["d1"]); // one-way forfeit stamped
    expect(store.enqueuedRecomputes()).toEqual([{ managerId: "mgr-1", periodId: "md1" }]);
  });

  it("rejects returning a VOIDED player to the XI even with a confirm (voided-player-started)", async () => {
    const store = seedStore();
    // d1 was forfeited earlier: voided + benched. He can never start again this period.
    store.seedSlot("mgr-1", "md1", "d1", "DEF", {
      isStarter: false,
      hasPlayed: true,
      voided: true,
    });
    const back = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"]; // d1 back in
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md1", starterIds: back, forfeitConfirmedPlayerIds: ["d1"] },
      NOW,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("voided-player-started");
  });

  it("accepts a save that keeps every played player in his current role (no transition)", async () => {
    const store = seedStore();
    store.seedSlot("mgr-1", "md1", "d1", "DEF", { isStarter: true, hasPlayed: true }); // played starter, stays
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md1", starterIds: XI },
      NOW,
    );
    expect(res.ok).toBe(true);
    expect(store.slotsOf("mgr-1", "md1").find((s) => s.playerId === "d1")?.isStarter).toBe(true);
    expect(store.enqueuedRecomputes()).toEqual([]); // no forfeit → no recompute
  });
});

describe("MemoryLineupStore.saveLineup — the write-time latch (mirrors the DB trigger)", () => {
  it("refuses a NON-forfeit flip of a locked slot and reports the conflict (write-time re-check)", async () => {
    const store = seedStore();
    store.seedSlot("mgr-1", "md1", "d1", "DEF", { isStarter: true, locked: true });
    // A commit that would FLIP the locked d1 to the bench WITHOUT voiding it — the store must refuse it.
    const desired = SQUAD.map(([playerId, role]) => ({
      playerId,
      role,
      isStarter: playerId !== "d1" && XI.includes(playerId), // d1 forced to bench
    }));
    const outcome = await store.saveLineup({
      managerId: "mgr-1",
      periodId: "md1",
      desired,
      voidPlayerIds: [], // NOT a forfeit
      now: NOW,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected a conflict");
    expect(outcome.conflict.playerId).toBe("d1");
    expect(store.slotsOf("mgr-1", "md1").find((s) => s.playerId === "d1")?.isStarter).toBe(true);
  });

  it("permits the forfeit transition on a locked slot (benched + voided) and enqueues a recompute", async () => {
    const store = seedStore();
    store.seedSlot("mgr-1", "md1", "d1", "DEF", { isStarter: true, locked: true });
    const desired = SQUAD.map(([playerId, role]) => ({
      playerId,
      role,
      isStarter: playerId !== "d1" && XI.includes(playerId),
    }));
    const outcome = await store.saveLineup({
      managerId: "mgr-1",
      periodId: "md1",
      desired,
      voidPlayerIds: ["d1"], // the sanctioned forfeit
      now: NOW,
    });
    expect(outcome.ok).toBe(true);
    expect(store.voidedIdsOf("mgr-1", "md1")).toEqual(["d1"]);
    expect(store.enqueuedRecomputes()).toEqual([{ managerId: "mgr-1", periodId: "md1" }]);
  });
});
