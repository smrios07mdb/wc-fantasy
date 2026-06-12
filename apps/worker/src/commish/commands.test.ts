import { describe, it, expect } from "vitest";
import { MemoryFaGrantStore, type PeriodWindowView } from "@app/faab";
import { MemoryLineupStore } from "@app/lineup";
import { runRosterOverride, type RosterDeps, type RosterInput } from "./roster";
import { runLineupOverride, type LineupDeps, type LineupInput } from "./lineup";

const NOW = new Date("2026-06-11T20:00:00Z");
const TS = "2026-06-11T20:00:00.000Z";
const COMMISH = { email: "smrios07@gmail.com", isCommissioner: true };
const RANDO = { email: "rando@x.com", isCommissioner: false };
const FULL = { GK: 2, DEF: 5, MID: 5, FWD: 3 } as const;
const FA_WINDOW: PeriodWindowView = {
  batchClearedAt: new Date("2026-06-11T06:00:00Z"),
  firstKickoffAt: new Date("2026-06-12T16:00:00Z"),
};
// MD1 already batch-cleared (an OPEN snapshot); MD2 still SEALED (batch_cleared_at null = "window not open").
const MD1_CLEARED: PeriodWindowView = {
  batchClearedAt: new Date("2026-06-11T06:00:00Z"),
  firstKickoffAt: new Date("2026-06-11T16:00:00Z"),
};
const MD2_SEALED: PeriodWindowView = {
  batchClearedAt: null,
  firstKickoffAt: new Date("2026-06-15T16:00:00Z"),
};

// ── roster ──────────────────────────────────────────────────────────────────────

function rosterStore(owned: string[] = ["DROP"], leagueOwned: string[] = []) {
  return new MemoryFaGrantStore({
    managers: [
      {
        managerId: "m1",
        leagueId: "L",
        faabBudget: 100,
        counts: { ...FULL },
        squadSize: 15,
        owned: new Set(owned),
      },
    ],
    players: {
      ADD: { position: "MID", window: FA_WINDOW, faEligible: true },
      DROP: { position: "MID", window: FA_WINDOW, faEligible: false },
      GKADD: { position: "GK", window: FA_WINDOW, faEligible: true },
    },
    leagueOwned,
  });
}

/** A manager whose ADD target already played MD1: his inferred next fixture is MD2 (still SEALED). The
 *  pinned MD1 period IS batch-cleared, so `--period MD1` resolves an open snapshot the unpinned (next-
 *  fixture → MD2) path misses — the live MD1-repair bug, modelled in the double the way the Prisma store
 *  resolves it (the named period's `batch_cleared_at`, not the add's next-fixture-inferred one). */
function playedMd1Store() {
  return new MemoryFaGrantStore({
    managers: [
      {
        managerId: "m1",
        leagueId: "L",
        faabBudget: 100,
        counts: { ...FULL },
        squadSize: 15,
        owned: new Set(["DROP"]),
      },
    ],
    players: {
      ADD: { position: "MID", window: MD2_SEALED, faEligible: false },
      DROP: { position: "MID", window: MD1_CLEARED, faEligible: false },
    },
    periods: { md1: MD1_CLEARED },
  });
}

function rosterDeps(
  store: MemoryFaGrantStore,
  over: Partial<RosterDeps> = {},
): { deps: RosterDeps; logs: string[] } {
  const logs: string[] = [];
  return {
    logs,
    deps: {
      now: NOW,
      store,
      getAddMatch: async (_id: string, _pinnedPeriodId: string | null) => ({
        label: "FRA v ESP",
        kickoffAt: FA_WINDOW.firstKickoffAt!,
      }),
      log: (l) => logs.push(l),
      ...over,
    },
  };
}

function rosterInput(over: Partial<RosterInput> = {}): RosterInput {
  return {
    actor: COMMISH,
    managerId: "m1",
    teamLabel: "Los Dragones",
    addId: "ADD",
    addName: "Add Guy",
    dropId: "DROP",
    dropName: "Drop Guy",
    reason: "missing FA UI blocked the move",
    apply: false,
    allowPostKickoff: false,
    pinnedPeriodId: null,
    pinnedPeriodLabel: null,
    timestamp: TS,
    ...over,
  };
}

describe("commish:roster override", () => {
  it("refuses a non-commissioner — nothing applied", async () => {
    const store = rosterStore();
    const { deps } = rosterDeps(store);
    const res = await runRosterOverride(deps, rosterInput({ actor: RANDO, apply: true }));
    expect(res.status).toBe("refused");
    expect(store.grants).toHaveLength(0);
  });

  it("refuses without a --reason", async () => {
    const store = rosterStore();
    const { deps } = rosterDeps(store);
    const res = await runRosterOverride(deps, rosterInput({ reason: "  ", apply: true }));
    expect(res.status).toBe("refused");
    expect(store.grants).toHaveLength(0);
  });

  it("dry-run applies NOTHING (plan only)", async () => {
    const store = rosterStore();
    const { deps } = rosterDeps(store);
    const res = await runRosterOverride(deps, rosterInput({ apply: false }));
    expect(res.status).toBe("planned");
    expect(store.grants).toHaveLength(0);
  });

  it("--apply performs the atomic add/drop (reusing claimFreeAgent), $0", async () => {
    const store = rosterStore();
    const { deps } = rosterDeps(store);
    const res = await runRosterOverride(deps, rosterInput({ apply: true }));
    expect(res.status).toBe("applied");
    expect(store.ownedBy("m1")).toContain("ADD");
    expect(store.ownedBy("m1")).not.toContain("DROP");
    expect(store.budgetOf("m1")).toBe(100); // $0 — never debited
    if (res.status === "applied") expect(res.audit).toContain("commish-override");
  });

  it("KEEPS the 15-man squad rule even with the window bypassed (no-drop add on a full squad → drop-required)", async () => {
    // The per-position cap is retired (Prompt 44 → @app/faab), but the override still cannot push a full
    // squad past 15 — a full-squad add must name a drop. (The per-position 3rd-GK/4th-FWD shape is now legal.)
    const store = rosterStore();
    const { deps } = rosterDeps(store);
    const res = await runRosterOverride(
      deps,
      rosterInput({ dropId: null, dropName: null, apply: true }),
    );
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/drop-required/);
    expect(store.grants).toHaveLength(0);
  });

  it("kickoff guard BLOCKS an already-played add by default — nothing applied", async () => {
    const store = rosterStore();
    const { deps } = rosterDeps(store, {
      getAddMatch: async () => ({
        label: "FRA v ESP",
        kickoffAt: new Date("2026-06-11T19:00:00Z"),
      }),
    });
    const res = await runRosterOverride(deps, rosterInput({ apply: true }));
    expect(res.status).toBe("blocked");
    expect(store.grants).toHaveLength(0);
  });

  it("--allow-post-kickoff honors the move and logs LOUDLY", async () => {
    const store = rosterStore();
    const { deps, logs } = rosterDeps(store, {
      getAddMatch: async () => ({
        label: "FRA v ESP",
        kickoffAt: new Date("2026-06-11T19:00:00Z"),
      }),
    });
    const res = await runRosterOverride(deps, rosterInput({ apply: true, allowPostKickoff: true }));
    expect(res.status).toBe("applied");
    expect(logs.some((l) => /POST-KICKOFF/i.test(l))).toBe(true);
  });

  it("idempotent: add already owned + drop already gone → skipped", async () => {
    const store = rosterStore(["ADD"]); // ADD owned, DROP not owned
    const { deps } = rosterDeps(store);
    const res = await runRosterOverride(
      deps,
      rosterInput({ dropId: null, dropName: null, apply: true }),
    );
    expect(res.status).toBe("skipped");
    expect(store.grants).toHaveLength(0);
  });

  it("period-pin grant: unpinned resolves the sealed next period (conflict); --period resolves the cleared one (grants)", async () => {
    // unpinned → the add's inferred next fixture is MD2 (still sealed → batch_cleared_at null) → conflict.
    const sealed = playedMd1Store();
    const { deps: d1 } = rosterDeps(sealed);
    const unpinned = await runRosterOverride(
      d1,
      rosterInput({ apply: true, pinnedPeriodId: null }),
    );
    expect(unpinned.status).toBe("conflict");
    expect(sealed.ownedBy("m1")).not.toContain("ADD");

    // --period MD1 → keys off MD1's (cleared) snapshot, not the MD2 next-fixture inference → grants.
    const pinned = playedMd1Store();
    const { deps: d2 } = rosterDeps(pinned);
    const res = await runRosterOverride(d2, rosterInput({ apply: true, pinnedPeriodId: "md1" }));
    expect(res.status).toBe("applied");
    expect(pinned.ownedBy("m1")).toContain("ADD");
  });

  it("period-pin kickoff guard: --period reads that period's (already-played) fixture and blocks; unpinned reads the next (future) one", async () => {
    const getAddMatch = async (_id: string, pinnedPeriodId: string | null) =>
      pinnedPeriodId === "md1"
        ? { label: "FRA v ESP (MD1)", kickoffAt: new Date("2026-06-11T19:00:00Z") } // already kicked off
        : { label: "FRA v ITA (MD2)", kickoffAt: new Date("2026-06-12T16:00:00Z") }; // upcoming

    const s1 = rosterStore();
    const { deps: d1 } = rosterDeps(s1, { getAddMatch });
    const unpinned = await runRosterOverride(
      d1,
      rosterInput({ apply: true, pinnedPeriodId: null }),
    );
    expect(unpinned.status).toBe("applied");

    const s2 = rosterStore();
    const { deps: d2 } = rosterDeps(s2, { getAddMatch });
    const pinned = await runRosterOverride(d2, rosterInput({ apply: true, pinnedPeriodId: "md1" }));
    expect(pinned.status).toBe("blocked");
  });

  it("records the pinned period in the audit trail (the snapshot used is non-default)", async () => {
    const store = playedMd1Store();
    const { deps } = rosterDeps(store);
    const res = await runRosterOverride(
      deps,
      rosterInput({ apply: true, pinnedPeriodId: "md1", pinnedPeriodLabel: "MD1" }),
    );
    expect(res.status).toBe("applied");
    if (res.status === "applied") expect(res.audit).toContain('"period":"MD1"');
  });
});

// ── lineup ──────────────────────────────────────────────────────────────────────

const CLOSED = { id: "md1", status: "closed" as const, closesAt: new Date("2026-06-10T00:00:00Z") };

/** A squad that fields a legal 3-4-3 (1 GK / 3 DEF / 4 MID / 3 FWD starters) out of 15. */
function lineupStore() {
  const s = new MemoryLineupStore();
  s.seedManager("m1", "L");
  s.seedPeriod("L", CLOSED); // window CLOSED → the override must bypass it
  const squad: Array<[string, "GK" | "DEF" | "MID" | "FWD"]> = [
    ["gk1", "GK"],
    ["gk2", "GK"],
    ["d1", "DEF"],
    ["d2", "DEF"],
    ["d3", "DEF"],
    ["d4", "DEF"],
    ["d5", "DEF"],
    ["m1p", "MID"],
    ["m2p", "MID"],
    ["m3p", "MID"],
    ["m4p", "MID"],
    ["m5p", "MID"],
    ["f1", "FWD"],
    ["f2", "FWD"],
    ["f3", "FWD"],
  ];
  for (const [id, pos] of squad) s.seedRoster("L", "m1", id, pos);
  return s;
}

const LEGAL_XI = ["gk1", "d1", "d2", "d3", "m1p", "m2p", "m3p", "m4p", "f1", "f2", "f3"]; // 1-3-4-3
const ILLEGAL_XI = ["gk1", "gk2", "d1", "d2", "d3", "m1p", "m2p", "m3p", "m4p", "f1", "f2"]; // 2 GK
// d1→d4 swap, still a legal 1-3-4-3 — used to MOVE a player who is locked by play (benches d1).
const SWAP_XI = ["gk1", "d4", "d2", "d3", "m1p", "m2p", "m3p", "m4p", "f1", "f2", "f3"];
// 2 GK AND benches d1 — an illegal formation that ALSO moves the locked slot (isolates the flag path).
const ILLEGAL_SWAP_XI = ["gk1", "gk2", "d2", "d3", "d4", "m1p", "m2p", "m3p", "m4p", "f1", "f2"];

function lineupDeps(store: MemoryLineupStore): { deps: LineupDeps; logs: string[] } {
  const logs: string[] = [];
  return { logs, deps: { now: NOW, store, log: (l) => logs.push(l) } };
}

function lineupInput(over: Partial<LineupInput> = {}): LineupInput {
  return {
    actor: COMMISH,
    managerId: "m1",
    teamLabel: "Los Dragones",
    periodId: "md1",
    periodLabel: "MD1",
    starterIds: LEGAL_XI,
    starterNames: LEGAL_XI,
    reason: "fix a lineup we locked them out of",
    apply: false,
    allowLockedSlot: false,
    timestamp: TS,
    ...over,
  };
}

describe("commish:lineup override", () => {
  it("refuses a non-commissioner", async () => {
    const store = lineupStore();
    const { deps } = lineupDeps(store);
    const res = await runLineupOverride(deps, lineupInput({ actor: RANDO, apply: true }));
    expect(res.status).toBe("refused");
    expect(store.starterIdsOf("m1", "md1")).toHaveLength(0);
  });

  it("bypasses the CLOSED window but KEEPS formation legality (2 GK → illegal-formation)", async () => {
    const store = lineupStore();
    const { deps } = lineupDeps(store);
    const res = await runLineupOverride(deps, lineupInput({ starterIds: ILLEGAL_XI, apply: true }));
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/illegal-formation/);
    expect(store.starterIdsOf("m1", "md1")).toHaveLength(0);
  });

  it("dry-run on a CLOSED period plans a LEGAL XI and applies nothing", async () => {
    const store = lineupStore();
    const { deps } = lineupDeps(store);
    const res = await runLineupOverride(deps, lineupInput({ apply: false }));
    expect(res.status).toBe("planned"); // window bypassed: a closed period still plans
    expect(store.slotsOf("m1", "md1")).toHaveLength(0);
  });

  it("--apply writes the lineup slots through the real service", async () => {
    const store = lineupStore();
    const { deps } = lineupDeps(store);
    const res = await runLineupOverride(deps, lineupInput({ apply: true }));
    expect(res.status).toBe("applied");
    expect(store.starterIdsOf("m1", "md1").sort()).toEqual([...LEGAL_XI].sort());
  });

  it("idempotent: the desired XI already set → skipped", async () => {
    const store = lineupStore();
    const { deps } = lineupDeps(store);
    await runLineupOverride(deps, lineupInput({ apply: true })); // first apply sets the XI
    const again = await runLineupOverride(deps, lineupInput({ apply: true }));
    expect(again.status).toBe("skipped");
  });

  it("WITHOUT --allow-locked-slot: a played slot stays frozen (regression — refused, forfeit model)", async () => {
    const store = lineupStore();
    store.seedSlot("m1", "md1", "d1", "DEF", { isStarter: true, hasPlayed: true }); // d1 played → frozen
    const { deps } = lineupDeps(store);
    const res = await runLineupOverride(deps, lineupInput({ starterIds: SWAP_XI, apply: true }));
    expect(res.status).toBe("refused");
    // Forfeit model: benching a played starter without --allow-locked-slot is refused as a forfeit that
    // needs confirming (the commish tool passes none), preserving the "stays frozen" regression guard.
    if (res.status === "refused") expect(res.reason).toMatch(/forfeit-requires-confirm/);
    expect(store.starterIdsOf("m1", "md1")).toEqual(["d1"]); // unchanged
  });

  it("--allow-locked-slot: the commissioner CAN move a slot locked by play (applied)", async () => {
    const store = lineupStore();
    store.seedSlot("m1", "md1", "d1", "DEF", { isStarter: true, locked: true });
    const { deps } = lineupDeps(store);
    const res = await runLineupOverride(
      deps,
      lineupInput({ starterIds: SWAP_XI, apply: true, allowLockedSlot: true }),
    );
    expect(res.status).toBe("applied");
    expect(store.starterIdsOf("m1", "md1").sort()).toEqual([...SWAP_XI].sort());
    expect(store.starterIdsOf("m1", "md1")).not.toContain("d1"); // the locked starter was benched
  });

  it("--allow-locked-slot STILL enforces formation legality (2 GK while moving a locked slot → refused)", async () => {
    const store = lineupStore();
    store.seedSlot("m1", "md1", "d1", "DEF", { isStarter: true, locked: true });
    const { deps } = lineupDeps(store);
    const res = await runLineupOverride(
      deps,
      lineupInput({ starterIds: ILLEGAL_SWAP_XI, apply: true, allowLockedSlot: true }),
    );
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/illegal-formation/);
    expect(store.starterIdsOf("m1", "md1")).toEqual(["d1"]); // nothing written
  });

  it("records the lock override in the audit trail", async () => {
    const store = lineupStore();
    store.seedSlot("m1", "md1", "d1", "DEF", { isStarter: true, locked: true });
    const { deps } = lineupDeps(store);
    const res = await runLineupOverride(
      deps,
      lineupInput({ starterIds: SWAP_XI, apply: true, allowLockedSlot: true }),
    );
    expect(res.status).toBe("applied");
    if (res.status === "applied") expect(res.audit).toContain('"lockOverride":true');
  });
});
