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
      getAddMatch: async () => ({ label: "FRA v ESP", kickoffAt: FA_WINDOW.firstKickoffAt! }),
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

  it("KEEPS the roster cap even with the window bypassed (3rd GK → roster-illegal)", async () => {
    const store = rosterStore();
    const { deps } = rosterDeps(store);
    const res = await runRosterOverride(
      deps,
      rosterInput({ addId: "GKADD", addName: "GK Add", apply: true }),
    );
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/roster-illegal/);
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
});
