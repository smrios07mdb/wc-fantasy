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

describe("setLineup — server-authoritative lock (the latch the client can't be trusted to honor)", () => {
  it("rejects benching a locked starter, even though the client proposed it", async () => {
    const store = seedStore();
    // d1 has played: a LOCKED starter slot already exists for md1.
    store.seedSlot("mgr-1", "md1", "d1", "DEF", { isStarter: true, locked: true });
    // Client (compromised UI) sends a proposal that benches d1 (starts d5 instead) — legal shape.
    const sneaky = ["gk1", "d5", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"];
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md1", starterIds: sneaky },
      NOW,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("locked-player-moved");
    // The locked slot is untouched: d1 is still a starter.
    expect(store.slotsOf("mgr-1", "md1").find((s) => s.playerId === "d1")?.isStarter).toBe(true);
  });

  it("accepts a save that keeps every locked player in his frozen role", async () => {
    const store = seedStore();
    store.seedSlot("mgr-1", "md1", "d1", "DEF", { isStarter: true, locked: true }); // locked starter, stays
    const res = await setLineup(
      store,
      { managerId: "mgr-1", periodId: "md1", starterIds: XI },
      NOW,
    );
    expect(res.ok).toBe(true);
    expect(store.slotsOf("mgr-1", "md1").find((s) => s.playerId === "d1")?.isStarter).toBe(true);
  });
});

describe("MemoryLineupStore.saveLineup — the write-time latch (mirrors the DB trigger)", () => {
  it("refuses to change a locked slot and reports the conflict (write-time re-check)", async () => {
    const store = seedStore();
    store.seedSlot("mgr-1", "md1", "d1", "DEF", { isStarter: true, locked: true });
    // A commit that would FLIP the locked d1 to the bench — the store must refuse it.
    const desired = SQUAD.map(([playerId, role]) => ({
      playerId,
      role,
      isStarter: playerId !== "d1" && XI.includes(playerId), // d1 forced to bench
    }));
    const outcome = await store.saveLineup({ managerId: "mgr-1", periodId: "md1", desired });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected a conflict");
    expect(outcome.conflict.playerId).toBe("d1");
    expect(store.slotsOf("mgr-1", "md1").find((s) => s.playerId === "d1")?.isStarter).toBe(true);
  });
});
