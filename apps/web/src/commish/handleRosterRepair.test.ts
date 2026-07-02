/**
 * Thread 3a — SAFE roster/lineup repair handlers (RED-first spine, B5).
 *
 * These tests pin the enforced-invariants-KEPT-under-bypass contract of the web repair surface BEFORE the
 * handlers exist. The handlers reuse the `@app/commish-core` runners VERBATIM (never re-derive validation),
 * so what is asserted here is the WEB layer's own obligations:
 *   • gate ordering (401 no-session strictly before 403 non-commissioner, both before any store read);
 *   • reason-required + shape rejection BEFORE any DB read;
 *   • the SAFE hardcodes — `allowPostKickoff:false` / `allowLockedSlot:false` / `allowLocked:false` are NOT
 *     reachable from the request body (a smuggled flag is ignored);
 *   • invariants KEPT under the deliberate bypasses (cap, ownership-unique, valid-drop, formation/XI,
 *     lock-on-play latch, kickoff guard default-block);
 *   • locked-slot attempts fail CLOSED: 409-class error, zero writes, no audit row, and the message states
 *     the move needs the deferred dangerous path (3b / CLI);
 *   • exactly ONE audit row per APPLIED action (none for planned/skipped/refused);
 *   • post-mutation audit failure → 200 `audit_pending` carrying the COMPLETE would-be audit payload;
 *   • post-commit restate failure → 200 `restate_pending` (mutation + audit durable, never a bare 500).
 */
import { describe, it, expect, vi } from "vitest";
import { MemoryFaGrantStore, MemoryFaabReleaseStore, type PeriodWindowView } from "@app/faab";
import { MemoryLineupStore } from "@app/lineup";
import type { SessionManagerOutcome } from "@app/auth";
import type { RecordCommishAuditInput } from "./recordCommishAudit";
import {
  handleCommishRosterRepair,
  handleCommishLineupRepair,
  type CommishRepairDeps,
  type CommishRepairStore,
  type RosterRepairBody,
  type LineupRepairBody,
} from "./handleRosterRepair";

const NOW = new Date("2026-06-11T20:00:00Z");
const FULL = { GK: 2, DEF: 5, MID: 5, FWD: 3 } as const;
const FA_WINDOW: PeriodWindowView = {
  batchClearedAt: new Date("2026-06-11T06:00:00Z"),
  firstKickoffAt: new Date("2026-06-12T16:00:00Z"),
};

// ── session outcomes ────────────────────────────────────────────────────────────────
const COMMISH_OUTCOME: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "commish-mgr",
    userId: "user-1",
    email: "smrios07@gmail.com",
    isCommissioner: true,
    displayName: "Commish",
  },
  isCommissioner: true,
};
const MEMBER_OUTCOME: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "member-mgr",
    userId: "user-2",
    email: "member@example.com",
    isCommissioner: false,
    displayName: "Member",
  },
  isCommissioner: false,
};
const NO_SESSION: SessionManagerOutcome = { kind: "no-session" };
const NOT_ALLOWED: SessionManagerOutcome = { kind: "not-allowlisted", email: "x@example.com" };

// ── fixture stores (REAL @app/faab / @app/lineup memory doubles — the runner's engines) ──

function grantStore(over: { owned?: string[]; squadSize?: number; leagueOwned?: string[] } = {}) {
  return new MemoryFaGrantStore({
    managers: [
      {
        managerId: "m1",
        leagueId: "L",
        faabBudget: 100,
        counts: { ...FULL },
        squadSize: over.squadSize ?? 15,
        owned: new Set(over.owned ?? ["DROP"]),
      },
    ],
    players: {
      ADD: { position: "MID", window: FA_WINDOW, faEligible: true },
      DROP: { position: "MID", window: FA_WINDOW, faEligible: false },
    },
    leagueOwned: over.leagueOwned ?? [],
    // the pinned-period grant path resolves the snapshot from the NAMED period (commish --period semantics)
    periods: { md1: FA_WINDOW },
  });
}

function releaseStore(over: { lockedPlayerIds?: string[]; isPlayoffPhase?: boolean } = {}) {
  return new MemoryFaabReleaseStore({
    managers: [
      {
        managerId: "m1",
        leagueId: "L",
        rosterCap: 9,
        // 11 players: 2 over the playoff cap of 9.
        roster: [
          { playerId: "gk1", position: "GK" },
          { playerId: "gk2", position: "GK" },
          { playerId: "d1", position: "DEF" },
          { playerId: "d2", position: "DEF" },
          { playerId: "d3", position: "DEF" },
          { playerId: "m1p", position: "MID" },
          { playerId: "m2p", position: "MID" },
          { playerId: "m3p", position: "MID" },
          { playerId: "f1", position: "FWD" },
          { playerId: "f2", position: "FWD" },
          { playerId: "f3", position: "FWD" },
        ],
        lockedPlayerIds: over.lockedPlayerIds ?? [],
        isPlayoffPhase: over.isPlayoffPhase ?? true,
        currentPeriodId: "r32",
      },
    ],
  });
}

const CLOSED_PERIOD = {
  id: "md1",
  status: "closed" as const,
  closesAt: new Date("2026-06-10T00:00:00Z"),
};
const SQUAD: Array<[string, "GK" | "DEF" | "MID" | "FWD"]> = [
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
const LEGAL_XI = ["gk1", "d1", "d2", "d3", "m1p", "m2p", "m3p", "m4p", "f1", "f2", "f3"];
const ILLEGAL_XI = ["gk1", "gk2", "d1", "d2", "d3", "m1p", "m2p", "m3p", "m4p", "f1", "f2"];
// d1→d4 swap (still legal 1-3-4-3) — moves d1, used against a LOCKED d1.
const SWAP_XI = ["gk1", "d4", "d2", "d3", "m1p", "m2p", "m3p", "m4p", "f1", "f2", "f3"];

function lineupStore(opts: { lockD1?: boolean; startersSeeded?: boolean } = {}) {
  const s = new MemoryLineupStore();
  s.seedManager("m1", "L");
  s.seedPeriod("L", CLOSED_PERIOD);
  for (const [id, pos] of SQUAD) s.seedRoster("L", "m1", id, pos);
  if (opts.startersSeeded ?? true) {
    for (const [id, pos] of SQUAD) {
      s.seedSlot("m1", "md1", id, pos, {
        isStarter: LEGAL_XI.includes(id),
        locked: opts.lockD1 === true && id === "d1",
      });
    }
  }
  return s;
}

// ── deps harness ────────────────────────────────────────────────────────────────────

const NAMES: Record<string, string> = {
  ADD: "Add Guy",
  DROP: "Drop Guy",
  gk1: "Keeper One",
  gk2: "Keeper Two",
  d1: "Def One",
  d2: "Def Two",
  d3: "Def Three",
  d4: "Def Four",
  d5: "Def Five",
  m1p: "Mid One",
  m2p: "Mid Two",
  m3p: "Mid Three",
  m4p: "Mid Four",
  m5p: "Mid Five",
  f1: "Fwd One",
  f2: "Fwd Two",
  f3: "Fwd Three",
};

interface Harness {
  deps: CommishRepairDeps;
  audits: RecordCommishAuditInput[];
  restates: Array<{ managerId: string; periodIds: readonly string[] }>;
  grant: MemoryFaGrantStore;
  release: MemoryFaabReleaseStore;
  lineup: MemoryLineupStore;
}

function harness(
  over: {
    outcome?: SessionManagerOutcome;
    grant?: MemoryFaGrantStore;
    release?: MemoryFaabReleaseStore;
    lineup?: MemoryLineupStore;
    recordAudit?: (input: RecordCommishAuditInput) => Promise<{ id: string }>;
    restate?: (managerId: string, periodIds: readonly string[]) => Promise<void>;
    addMatchKickoffAt?: Date | null;
    notClosedPeriodIds?: string[];
    storeOverrides?: Partial<CommishRepairStore>;
  } = {},
): Harness {
  const audits: RecordCommishAuditInput[] = [];
  const restates: Array<{ managerId: string; periodIds: readonly string[] }> = [];
  const grant = over.grant ?? grantStore();
  const release = over.release ?? releaseStore();
  const lineup = over.lineup ?? lineupStore();
  const store: CommishRepairStore = {
    async getManagerRef(managerId) {
      return managerId === "m1" ? { leagueId: "L", displayName: "Los Dragones" } : null;
    },
    async getPlayerNames(ids) {
      const out: Record<string, string> = {};
      for (const id of ids) if (NAMES[id]) out[id] = NAMES[id];
      return out;
    },
    async getPeriodRef(periodId) {
      return periodId === "md1" ? { id: "md1", label: "MD1" } : null;
    },
    faGrant: grant,
    faabRelease: release,
    lineup,
    async getAddMatch() {
      const kickoffAt =
        over.addMatchKickoffAt === undefined ? FA_WINDOW.firstKickoffAt! : over.addMatchKickoffAt;
      return kickoffAt === null ? null : { label: "FRA v ESP", kickoffAt };
    },
    async recordAudit(input) {
      if (over.recordAudit) return over.recordAudit(input);
      audits.push(input);
      return { id: `audit-${audits.length}` };
    },
    async getNotClosedPeriodIds() {
      return over.notClosedPeriodIds ?? ["md3", "md4"];
    },
    ...over.storeOverrides,
  };
  return {
    audits,
    restates,
    grant,
    release,
    lineup,
    deps: {
      resolveManager: async () => over.outcome ?? COMMISH_OUTCOME,
      now: () => NOW,
      store,
      restate: async (managerId, periodIds) => {
        if (over.restate) return over.restate(managerId, periodIds);
        restates.push({ managerId, periodIds });
      },
    },
  };
}

function addBody(over: Partial<Extract<RosterRepairBody, { kind: "add" }>> = {}): RosterRepairBody {
  return {
    kind: "add",
    managerId: "m1",
    addPlayerId: "ADD",
    dropPlayerId: "DROP",
    periodId: null,
    reason: "FA UI blocked the move",
    apply: true,
    ...over,
  };
}

function trimBody(
  over: Partial<Extract<RosterRepairBody, { kind: "trim" }>> = {},
): RosterRepairBody {
  return {
    kind: "trim",
    managerId: "m1",
    dropPlayerIds: ["f2", "f3"],
    reason: "never trimmed to the playoff cap",
    apply: true,
    ...over,
  };
}

function lineupBody(over: Partial<LineupRepairBody> = {}): LineupRepairBody {
  return {
    managerId: "m1",
    periodId: "md1",
    starterIds: SWAP_XI,
    reason: "lineup lock hit before they could save",
    apply: true,
    ...over,
  };
}

// ── gate ordering (401 before 403 before any read) ───────────────────────────────────

describe("repair gate", () => {
  it("401 no_session before any store read (roster + lineup)", async () => {
    const h = harness({ outcome: NO_SESSION });
    const touched = vi.fn();
    h.deps.store.getManagerRef = async (...a) => {
      touched(...a);
      return null;
    };
    const r1 = await handleCommishRosterRepair(h.deps, addBody());
    const r2 = await handleCommishLineupRepair(h.deps, lineupBody());
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect((r1.body as { error: string }).error).toBe("no_session");
    expect(touched).not.toHaveBeenCalled();
  });

  it("403 forbidden for a non-commissioner manager", async () => {
    const h = harness({ outcome: MEMBER_OUTCOME });
    const r1 = await handleCommishRosterRepair(h.deps, addBody());
    const r2 = await handleCommishLineupRepair(h.deps, lineupBody());
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
    expect(h.audits).toHaveLength(0);
  });

  it("403 forbidden for a not-allowlisted session", async () => {
    const h = harness({ outcome: NOT_ALLOWED });
    const r = await handleCommishRosterRepair(h.deps, addBody());
    expect(r.status).toBe(403);
  });
});

// ── validation before any DB read ────────────────────────────────────────────────────

describe("repair validation", () => {
  it("400 reason_required on an empty/whitespace reason (all three ops)", async () => {
    const h = harness();
    for (const res of [
      await handleCommishRosterRepair(h.deps, addBody({ reason: "  " })),
      await handleCommishRosterRepair(h.deps, trimBody({ reason: "" })),
      await handleCommishLineupRepair(h.deps, lineupBody({ reason: " " })),
    ]) {
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe("reason_required");
    }
    expect(h.audits).toHaveLength(0);
    expect(h.grant.grants).toHaveLength(0);
  });

  it("404 unknown_manager for a manager outside the league", async () => {
    const h = harness();
    const r = await handleCommishRosterRepair(h.deps, addBody({ managerId: "ghost" }));
    expect(r.status).toBe(404);
    expect((r.body as { error: string }).error).toBe("unknown_manager");
  });

  it("404 invalid_player for an unknown add target", async () => {
    const h = harness();
    const r = await handleCommishRosterRepair(h.deps, addBody({ addPlayerId: "nope" }));
    expect(r.status).toBe(404);
    expect((r.body as { error: string }).error).toBe("invalid_player");
  });

  it("404 invalid_period for an unknown pinned period", async () => {
    const h = harness();
    const r = await handleCommishRosterRepair(h.deps, addBody({ periodId: "ghost-period" }));
    expect(r.status).toBe(404);
    expect((r.body as { error: string }).error).toBe("invalid_period");
  });

  it("400 bad_request on an empty trim drop set", async () => {
    const h = harness();
    const r = await handleCommishRosterRepair(h.deps, trimBody({ dropPlayerIds: [] }));
    expect(r.status).toBe(400);
  });
});

// ── roster add: invariants KEPT under the window/eligibility bypass ───────────────────

describe("roster repair — add", () => {
  it("applies an add/drop via the REAL claimFreeAgent and writes exactly ONE roster_repair audit", async () => {
    const h = harness();
    const r = await handleCommishRosterRepair(h.deps, addBody());
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.status).toBe("applied");
    expect(body.auditId).toBe("audit-1");
    // the mutation went through the reused primitive
    expect(h.grant.grants).toEqual([{ managerId: "m1", playerAddId: "ADD", playerDropId: "DROP" }]);
    expect(h.grant.ownedBy("m1")).toContain("ADD");
    // exactly one audit row, with the design-locked fields
    expect(h.audits).toHaveLength(1);
    const audit = h.audits[0]!;
    expect(audit.actionType).toBe("roster_repair");
    expect(audit.leagueId).toBe("L");
    expect(audit.actorUserId).toBe("user-1");
    expect(audit.targetRef).toEqual({ managerId: "m1" });
    expect(audit.reversible).toBe(true);
    expect(audit.detail).toContain("bypass");
    expect(audit.delta).toContain("+Add Guy");
    expect(audit.delta).toContain("−Drop Guy");
    // restate fired with the conservative not-closed period set
    expect(h.restates).toEqual([{ managerId: "m1", periodIds: ["md3", "md4"] }]);
  });

  it("KEEPS the roster cap under the window bypass: full squad + no drop → 409, zero writes, no audit", async () => {
    const h = harness();
    const r = await handleCommishRosterRepair(h.deps, addBody({ dropPlayerId: null }));
    expect(r.status).toBe(409);
    expect((r.body as { error: string }).error).toBe("repair_refused");
    expect(h.grant.grants).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
    expect(h.restates).toHaveLength(0);
  });

  it("KEEPS ownership-unique: an add already actively owned league-wide → 409 conflict, no audit", async () => {
    const h = harness({ grant: grantStore({ leagueOwned: ["ADD"] }) });
    const r = await handleCommishRosterRepair(h.deps, addBody());
    expect(r.status).toBe(409);
    expect((r.body as { error: string }).error).toBe("conflict");
    expect(h.audits).toHaveLength(0);
  });

  it("kickoff guard BLOCKS an already-played add by default — 409, zero writes, message names the deferred path", async () => {
    const h = harness({ addMatchKickoffAt: new Date("2026-06-11T16:00:00Z") }); // before NOW
    const r = await handleCommishRosterRepair(h.deps, addBody());
    expect(r.status).toBe(409);
    const body = r.body as { error: string; message: string };
    expect(body.error).toBe("kickoff_blocked");
    expect(body.message).toMatch(/deferred|dangerous|CLI/i);
    expect(h.grant.grants).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
    expect(h.restates).toHaveLength(0);
  });

  it("a smuggled allowPostKickoff flag in the body is IGNORED (the SAFE hardcode)", async () => {
    const h = harness({ addMatchKickoffAt: new Date("2026-06-11T16:00:00Z") });
    const smuggled = { ...addBody(), allowPostKickoff: true } as unknown as RosterRepairBody;
    const r = await handleCommishRosterRepair(h.deps, smuggled);
    expect(r.status).toBe(409);
    expect((r.body as { error: string }).error).toBe("kickoff_blocked");
    expect(h.grant.grants).toHaveLength(0);
  });

  it("idempotent skip: end state already holds → 200 skipped, NO audit row, NO restate", async () => {
    const h = harness({ grant: grantStore({ owned: ["ADD"] }) }); // ADD held, DROP already gone
    const r = await handleCommishRosterRepair(h.deps, addBody());
    expect(r.status).toBe(200);
    expect((r.body as { status: string }).status).toBe("skipped");
    expect(h.audits).toHaveLength(0);
    expect(h.restates).toHaveLength(0);
  });

  it("dry-run (apply:false) plans without mutating, auditing, or restating", async () => {
    const h = harness();
    const r = await handleCommishRosterRepair(h.deps, addBody({ apply: false }));
    expect(r.status).toBe(200);
    const body = r.body as { status: string; plan: { add: string } };
    expect(body.status).toBe("planned");
    expect(body.plan.add).toBe("Add Guy");
    expect(h.grant.grants).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
    expect(h.restates).toHaveLength(0);
  });
});

// ── roster trim: unlocked-only release ────────────────────────────────────────────────

describe("roster repair — trim", () => {
  it("applies an unlocked multi-drop via the REAL releaseRoster; ONE audit marked trim; restate fires", async () => {
    const h = harness();
    const r = await handleCommishRosterRepair(h.deps, trimBody());
    expect(r.status).toBe(200);
    expect((r.body as { status: string }).status).toBe("applied");
    expect(h.release.rosterOf("m1")).not.toContain("f2");
    expect(h.release.rosterOf("m1")).not.toContain("f3");
    expect(h.audits).toHaveLength(1);
    const audit = h.audits[0]!;
    expect(audit.actionType).toBe("roster_repair"); // reuse — NO union edit
    expect(audit.detail).toContain("trim");
    expect(audit.targetRef).toEqual({ managerId: "m1" });
    expect(audit.delta).toContain("−Fwd Two");
    expect(audit.delta).toContain("−Fwd Three");
    expect(h.restates).toHaveLength(1);
  });

  it("a LOCKED player in the drop set → 409 fail-closed, zero writes, no audit, message names the deferred path", async () => {
    const h = harness({ release: releaseStore({ lockedPlayerIds: ["f2"] }) });
    const before = h.release.rosterOf("m1");
    const r = await handleCommishRosterRepair(h.deps, trimBody({ dropPlayerIds: ["f2", "f3"] }));
    expect(r.status).toBe(409);
    const body = r.body as { error: string; message: string };
    expect(body.error).toBe("repair_refused");
    expect(body.message).toContain("release-locked");
    expect(body.message).toMatch(/deferred|dangerous|CLI/i);
    expect(h.release.rosterOf("m1")).toEqual(before); // NOTHING released — not even the unlocked f3
    expect(h.audits).toHaveLength(0);
    expect(h.restates).toHaveLength(0);
  });

  it("a smuggled allowLocked flag in the body is IGNORED (locked drop still refuses)", async () => {
    const h = harness({ release: releaseStore({ lockedPlayerIds: ["f2"] }) });
    const smuggled = {
      ...trimBody({ dropPlayerIds: ["f2"] }),
      allowLocked: true,
      allowLockedSlot: true,
    } as unknown as RosterRepairBody;
    const r = await handleCommishRosterRepair(h.deps, smuggled);
    expect(r.status).toBe(409);
    expect(h.release.rosterOf("m1")).toContain("f2");
  });

  it("KEEPS the 7-starter floor: dropping below it refuses, no audit", async () => {
    const h = harness();
    const r = await handleCommishRosterRepair(
      h.deps,
      trimBody({ dropPlayerIds: ["gk2", "d3", "m2p", "m3p", "f2", "f3"] }), // 11 − 6 = 5 < 7
    );
    expect(r.status).toBe(409);
    expect(h.audits).toHaveLength(0);
  });

  it("refuses outside the playoff phase (the runner's own gate, surfaced)", async () => {
    const h = harness({ release: releaseStore({ isPlayoffPhase: false }) });
    const r = await handleCommishRosterRepair(h.deps, trimBody());
    expect(r.status).toBe(409);
    expect(h.audits).toHaveLength(0);
  });
});

// ── lineup repair: edit-window bypass ONLY (allowLockedSlot is hardcoded false) ───────

describe("lineup repair", () => {
  it("applies a legal XI into a CLOSED period (edit-window bypass) and writes ONE lineup_repair audit", async () => {
    const h = harness();
    const r = await handleCommishLineupRepair(h.deps, lineupBody());
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.status).toBe("applied");
    // the store now holds the new XI (d1 benched, d4 started)
    expect(h.lineup.starterIdsOf("m1", "md1").sort()).toEqual([...SWAP_XI].sort());
    expect(h.audits).toHaveLength(1);
    const audit = h.audits[0]!;
    expect(audit.actionType).toBe("lineup_repair");
    expect(audit.targetRef).toEqual({ managerId: "m1", periodId: "md1" });
    expect(audit.detail).toContain("edit-window bypass");
    expect(audit.reversible).toBe(true);
    expect(audit.delta).toContain("+Def Four");
    expect(audit.delta).toContain("−Def One");
    // restate fires for EXACTLY the edited period
    expect(h.restates).toEqual([{ managerId: "m1", periodIds: ["md1"] }]);
  });

  it("KEEPS formation legality under the bypass: a 2-GK XI → 409, no write, no audit", async () => {
    const h = harness();
    const r = await handleCommishLineupRepair(h.deps, lineupBody({ starterIds: ILLEGAL_XI }));
    expect(r.status).toBe(409);
    expect((r.body as { error: string }).error).toBe("repair_refused");
    expect(h.lineup.starterIdsOf("m1", "md1").sort()).toEqual([...LEGAL_XI].sort());
    expect(h.audits).toHaveLength(0);
  });

  it("the lock-on-play latch is NOT relaxed: benching a played starter → 409 fail-closed, zero writes, 3b-note message", async () => {
    const h = harness({ lineup: lineupStore({ lockD1: true }) });
    const r = await handleCommishLineupRepair(h.deps, lineupBody({ starterIds: SWAP_XI }));
    expect(r.status).toBe(409);
    const body = r.body as { error: string; message: string };
    expect(body.error).toBe("repair_refused");
    // the runner surfaces the engine's own code (the forfeit model owns "benching a played starter")
    expect(body.message).toContain("forfeit-requires-confirm");
    expect(body.message).toMatch(/deferred|dangerous|CLI/i);
    // zero writes — the locked starter is untouched, the XI unchanged
    expect(h.lineup.starterIdsOf("m1", "md1").sort()).toEqual([...LEGAL_XI].sort());
    expect(h.audits).toHaveLength(0);
    expect(h.restates).toHaveLength(0);
  });

  it("a smuggled allowLockedSlot flag in the body is IGNORED (latch still holds)", async () => {
    const h = harness({ lineup: lineupStore({ lockD1: true }) });
    const smuggled = { ...lineupBody(), allowLockedSlot: true } as unknown as LineupRepairBody;
    const r = await handleCommishLineupRepair(h.deps, smuggled);
    expect(r.status).toBe(409);
    expect(h.lineup.starterIdsOf("m1", "md1").sort()).toEqual([...LEGAL_XI].sort());
  });

  it("idempotent skip: the desired XI already set → 200 skipped, NO audit", async () => {
    const h = harness();
    const r = await handleCommishLineupRepair(h.deps, lineupBody({ starterIds: LEGAL_XI }));
    expect(r.status).toBe(200);
    expect((r.body as { status: string }).status).toBe("skipped");
    expect(h.audits).toHaveLength(0);
    expect(h.restates).toHaveLength(0);
  });

  it("dry-run (apply:false) plans the XI change without writing", async () => {
    const h = harness();
    const r = await handleCommishLineupRepair(h.deps, lineupBody({ apply: false }));
    expect(r.status).toBe(200);
    expect((r.body as { status: string }).status).toBe("planned");
    expect(h.lineup.starterIdsOf("m1", "md1").sort()).toEqual([...LEGAL_XI].sort());
    expect(h.audits).toHaveLength(0);
  });
});

// ── post-mutation audit failure → audit_pending with the COMPLETE payload ─────────────

describe("audit_pending (post-mutation audit write fails)", () => {
  it("roster add: mutation durable, 200 audit_pending carrying the full would-be audit payload; restate still fires", async () => {
    const h = harness({
      recordAudit: async () => {
        throw new Error("db down");
      },
    });
    const r = await handleCommishRosterRepair(h.deps, addBody());
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.status).toBe("applied");
    expect(body.auditPending).toBe(true);
    expect(body.warning).toBe("audit_pending");
    expect(body.auditId).toBeNull();
    // the COMPLETE would-be payload for manual recovery
    const audit = body.audit as RecordCommishAuditInput;
    expect(audit.actionType).toBe("roster_repair");
    expect(audit.targetRef).toEqual({ managerId: "m1" });
    expect(audit.detail).toContain("bypass");
    expect(audit.delta).toContain("+Add Guy");
    expect(audit.reversible).toBe(true);
    expect(audit.reason).toBe("FA UI blocked the move");
    // the mutation itself committed
    expect(h.grant.ownedBy("m1")).toContain("ADD");
    // and the restate still ran
    expect(h.restates).toHaveLength(1);
  });

  it("lineup: 200 audit_pending with the lineup_repair payload", async () => {
    const h = harness({
      recordAudit: async () => {
        throw new Error("db down");
      },
    });
    const r = await handleCommishLineupRepair(h.deps, lineupBody());
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.auditPending).toBe(true);
    const audit = body.audit as RecordCommishAuditInput;
    expect(audit.actionType).toBe("lineup_repair");
    expect(audit.targetRef).toEqual({ managerId: "m1", periodId: "md1" });
  });
});

// ── post-commit restate failure → restate_pending, never a bare 500 ───────────────────

describe("restate_pending (post-commit restate throws)", () => {
  it("roster add: 200 with restatePending:true; the audit row is still written", async () => {
    const h = harness({
      restate: async () => {
        throw new Error("recompute down");
      },
    });
    const r = await handleCommishRosterRepair(h.deps, addBody());
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.status).toBe("applied");
    expect(body.restatePending).toBe(true);
    expect(h.audits).toHaveLength(1);
  });

  it("lineup: 200 with restatePending:true", async () => {
    const h = harness({
      restate: async () => {
        throw new Error("recompute down");
      },
    });
    const r = await handleCommishLineupRepair(h.deps, lineupBody());
    expect(r.status).toBe(200);
    expect((r.body as Record<string, unknown>).restatePending).toBe(true);
  });
});

// ── roster restate scope: pinned period unioned into the not-closed set ───────────────

describe("roster restate scope", () => {
  it("a pinned period is unioned into the restate set", async () => {
    const h = harness({ notClosedPeriodIds: ["md3"] });
    const r = await handleCommishRosterRepair(h.deps, addBody({ periodId: "md1" }));
    expect(r.status).toBe(200);
    expect(h.restates).toHaveLength(1);
    expect([...h.restates[0]!.periodIds].sort()).toEqual(["md1", "md3"]);
  });
});
