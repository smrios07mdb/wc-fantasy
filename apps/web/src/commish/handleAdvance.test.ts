/**
 * Thread 5 — unit proof for the `POST /api/commish/advance` orchestration (`handleAdvance.ts`).
 * Drives the REAL relocated orchestrator (`runRoundAdvance`) through the web handler over the
 * commish-core MEMORY store double, with a fake web port that records the audit-builder calls.
 * Pins, per the thread spec:
 *
 *   • gate ordering — 401/403 return BEFORE any store read (a throwing store proves it);
 *   • body shape — parseAdvanceBody accepts/rejects, and NEVER surfaces `allowIncomplete`;
 *   • smuggled `allowIncomplete: true` is IGNORED — the handler hardcodes false (3a precedent),
 *     so an unfrozen round refuses even when the body asks to override;
 *   • dry-run reason synthesis — apply:false with an empty reason still runs (preview reason),
 *     apply:true with an empty reason is a 400 `reason_required`;
 *   • status → HTTP mapping: planned/applied → 200, skipped/needs-commissioner/refused → 409,
 *     every non-2xx body carrying the discriminated `status` (+ plan when present);
 *   • breakTie passthrough — a wrong set/count surfaces the orchestrator's invalid-tiebreak refusal;
 *   • audit payload — exactly ONE `round_advance` builder call per applied cut, reversible:false,
 *     names + counts in the summary, champion + tie-adjudication in the detail, and NO builder call
 *     on skipped/refused/dry-run paths.
 */
import { describe, expect, it } from "vitest";
import type { SessionManagerOutcome } from "@app/auth";
import {
  MemoryPlayoffAdvanceStore,
  type MemoryAdvanceSeed,
  type PlayoffAdvanceStore,
} from "@app/commish-core/advanceStore";
import {
  ADVANCE_PREVIEW_REASON,
  handleAdvance,
  parseAdvanceBody,
  type AdvanceBody,
  type CommishAdvanceStore,
} from "./handleAdvance";
import type { RecordCommishAuditInput } from "./recordCommishAudit";

const NOW = new Date("2026-07-10T12:00:00Z");
const FROZEN = new Date("2026-07-09T22:00:00Z");

const COMMISH: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "mgr_commish",
    userId: "user_commish",
    email: "smrios07@gmail.com",
    isCommissioner: true,
    displayName: "Commish",
  },
  isCommissioner: true,
} as SessionManagerOutcome;

const MEMBER: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "mgr_member",
    userId: "user_member",
    email: "member@example.com",
    isCommissioner: false,
    displayName: "Member",
  },
  isCommissioner: false,
} as SessionManagerOutcome;

const NAMES: Record<string, string> = {
  a: "Alice FC",
  b: "Bravo XI",
  c: "Charlie United",
  d: "Delta Town",
};

/** A fake web port over the commish-core MEMORY double; records every audit-builder invocation. */
function fakeStore(seed: MemoryAdvanceSeed) {
  const mem = new MemoryPlayoffAdvanceStore(seed);
  const auditCalls: RecordCommishAuditInput[] = [];
  const store: CommishAdvanceStore = {
    getManagerLeagueId: async () => "lg_1",
    getLeagueManagerNames: async () => NAMES,
    forAdvance(buildAudit) {
      let id: string | null = null;
      const advStore: PlayoffAdvanceStore = {
        loadRoundContext: (leagueId, roundLabel) => mem.loadRoundContext(leagueId, roundLabel),
        loadActiveRosters: (leagueId, managerIds) => mem.loadActiveRosters(leagueId, managerIds),
        async applyRoundCut(cut) {
          const outcome = await mem.applyRoundCut(cut);
          if (outcome.outcome === "applied") {
            auditCalls.push(buildAudit(cut, outcome.released));
            id = "audit_row_1";
          }
          return outcome;
        },
      };
      return { store: advStore, auditId: () => id };
    },
  };
  return { store, auditCalls, mem };
}

/** A store where EVERY method throws — proves the gate returns before any read. */
const THROWING_STORE: CommishAdvanceStore = {
  getManagerLeagueId: () => {
    throw new Error("store touched before the gate");
  },
  getLeagueManagerNames: () => {
    throw new Error("store touched before the gate");
  },
  forAdvance: () => {
    throw new Error("store touched before the gate");
  },
};

function deps(store: CommishAdvanceStore, outcome: SessionManagerOutcome = COMMISH) {
  return { resolveManager: async () => outcome, now: () => NOW, store };
}

function body(overrides: Partial<AdvanceBody> = {}): AdvanceBody {
  return { roundLabel: "R32", reason: "cut time", breakTie: null, apply: false, ...overrides };
}

/** R32, frozen, cut 2 of 4, clean gaps: a(1) b(2) cut · c(5) d(9) survive. */
function determinedSeed(): MemoryAdvanceSeed {
  return {
    rounds: [{ label: "R32", cutCount: 2, frozenAt: FROZEN }],
    entries: [{ managerId: "a" }, { managerId: "b" }, { managerId: "c" }, { managerId: "d" }],
    roundScores: { R32: { a: 1, b: 2, c: 5, d: 9 } },
    // a & b are the bottom two (cut); their rosters are shed to the wire on apply.
    rosters: { a: ["a1", "a2"], b: ["b1"], c: ["c1"], d: ["d1"] },
  };
}

/** R32, frozen, cut 2 of 4: a(1) cut outright; b(2) c(2) tied for the last slot, equal cumulative. */
function tieSeed(): MemoryAdvanceSeed {
  return {
    rounds: [{ label: "R32", cutCount: 2, frozenAt: FROZEN }],
    entries: [{ managerId: "a" }, { managerId: "b" }, { managerId: "c" }, { managerId: "d" }],
    roundScores: { R32: { a: 1, b: 2, c: 2, d: 9 } },
  };
}

/** Final: only a + b alive, all prior rounds already cut. */
function finalSeed(): MemoryAdvanceSeed {
  return {
    rounds: [{ label: "Final", cutCount: 1, frozenAt: FROZEN }],
    entries: [
      { managerId: "a" },
      { managerId: "b" },
      { managerId: "e32", status: "eliminated", eliminatedRound: "R32" },
      { managerId: "e16", status: "eliminated", eliminatedRound: "R16" },
      { managerId: "eqf", status: "eliminated", eliminatedRound: "QF" },
      { managerId: "esf", status: "eliminated", eliminatedRound: "SF" },
    ],
    roundScores: { Final: { a: 3, b: 9 } },
  };
}

describe("parseAdvanceBody", () => {
  it("accepts the full shape and defaults apply:false / reason:'' / breakTie:null", () => {
    expect(parseAdvanceBody({ roundLabel: "R16" })).toEqual({
      roundLabel: "R16",
      reason: "",
      breakTie: null,
      apply: false,
    });
    expect(
      parseAdvanceBody({ roundLabel: "QF", reason: "r", breakTie: ["a", "b"], apply: true }),
    ).toEqual({ roundLabel: "QF", reason: "r", breakTie: ["a", "b"], apply: true });
  });

  it("rejects malformed shapes", () => {
    expect(parseAdvanceBody(null)).toBeNull();
    expect(parseAdvanceBody("R32")).toBeNull();
    expect(parseAdvanceBody({})).toBeNull(); // roundLabel missing
    expect(parseAdvanceBody({ roundLabel: 32 })).toBeNull();
    expect(parseAdvanceBody({ roundLabel: "R32", apply: "yes" })).toBeNull();
    expect(parseAdvanceBody({ roundLabel: "R32", reason: 7 })).toBeNull();
    expect(parseAdvanceBody({ roundLabel: "R32", breakTie: "a,b" })).toBeNull();
    expect(parseAdvanceBody({ roundLabel: "R32", breakTie: ["a", 3] })).toBeNull();
  });

  it("does NOT surface allowIncomplete — the field is dropped, never parsed", () => {
    const parsed = parseAdvanceBody({ roundLabel: "R32", apply: true, allowIncomplete: true });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("allowIncomplete");
  });
});

describe("handleAdvance — gate ordering", () => {
  it("401 no_session before any store read", async () => {
    const res = await handleAdvance(
      deps(THROWING_STORE, { kind: "no-session" } as SessionManagerOutcome),
      body(),
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "no_session" });
  });

  it("403 forbidden (non-commissioner) before any store read", async () => {
    const res = await handleAdvance(deps(THROWING_STORE, MEMBER), body());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("400 unknown_round before any store read (label validated against KNOCKOUT_ROUNDS)", async () => {
    const res = await handleAdvance(deps(THROWING_STORE), body({ roundLabel: "R64" }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "unknown_round" });
  });

  it("400 reason_required on apply:true with a blank reason, before any store read", async () => {
    const res = await handleAdvance(deps(THROWING_STORE), body({ apply: true, reason: "  " }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "reason_required" });
  });
});

describe("handleAdvance — dry-run (apply:false)", () => {
  it("renders the plan with a 200 'planned' and requires NO reason (preview reason synthesized)", async () => {
    const { store, auditCalls, mem } = fakeStore(determinedSeed());
    const res = await handleAdvance(deps(store), body({ reason: "" }));
    expect(res.status).toBe(200);
    const out = res.body as {
      status: string;
      plan: {
        round: string;
        field: unknown[];
        releasePreview: Record<string, { playerId: string; name: string }[]>;
      };
    };
    expect(out.status).toBe("planned");
    expect(out.plan.round).toBe("R32");
    expect(out.plan.field).toHaveLength(4);
    // The dry-run plan enumerates the players each cut manager WILL lose (the blast radius).
    expect(out.plan.releasePreview.a).toEqual([
      { playerId: "a1", name: "a1" },
      { playerId: "a2", name: "a2" },
    ]);
    expect(out.plan.releasePreview.b).toEqual([{ playerId: "b1", name: "b1" }]);
    expect(auditCalls).toHaveLength(0); // nothing persisted on a dry-run
    expect(mem.rosters.a).toEqual(["a1", "a2"]); // …and nothing released
  });

  it("the synthesized preview reason is a fixed constant (never user input)", () => {
    expect(ADVANCE_PREVIEW_REASON.length).toBeGreaterThan(0);
  });

  it("a boundary tie dry-runs as 200 'planned' with the tied set in the plan resolution", async () => {
    const { store } = fakeStore(tieSeed());
    const res = await handleAdvance(deps(store), body({ reason: "" }));
    expect(res.status).toBe(200);
    const out = res.body as {
      status: string;
      plan: { resolution: { kind: string; tied: string[]; cutsRemaining: number } };
    };
    expect(out.status).toBe("planned");
    expect(out.plan.resolution.kind).toBe("needsCommissioner");
    expect(out.plan.resolution.tied.sort()).toEqual(["b", "c"]);
    expect(out.plan.resolution.cutsRemaining).toBe(1);
  });
});

describe("handleAdvance — smuggled allowIncomplete is pinned to false", () => {
  it("an unfrozen round refuses the apply even when the raw body smuggles allowIncomplete:true", async () => {
    const seed = determinedSeed();
    seed.rounds[0]!.frozenAt = null; // not frozen → the precondition must refuse
    const { store, auditCalls } = fakeStore(seed);
    // Simulate the full route path: raw body carries the override flag; the parser drops it.
    const parsed = parseAdvanceBody({
      roundLabel: "R32",
      reason: "cut now",
      apply: true,
      allowIncomplete: true,
    });
    expect(parsed).not.toBeNull();
    const res = await handleAdvance(deps(store), parsed!);
    expect(res.status).toBe(409);
    const out = res.body as { status: string; reason: string };
    expect(out.status).toBe("refused");
    expect(out.reason).toContain("not frozen");
    expect(auditCalls).toHaveLength(0);
  });
});

describe("handleAdvance — status → HTTP mapping", () => {
  it("applied → 200 with plan + auditId; exactly cutCount managers flipped", async () => {
    const { store, auditCalls, mem } = fakeStore(determinedSeed());
    const res = await handleAdvance(deps(store), body({ apply: true, reason: "R32 settled" }));
    expect(res.status).toBe(200);
    const out = res.body as { status: string; auditId: string; plan: { resolution: unknown } };
    expect(out.status).toBe("applied");
    expect(out.auditId).toBe("audit_row_1");
    expect(auditCalls).toHaveLength(1);
    expect(mem.entries.get("a")!.status).toBe("eliminated");
    expect(mem.entries.get("b")!.status).toBe("eliminated");
    expect(mem.entries.get("c")!.status).toBe("alive");
    expect(mem.entries.get("d")!.status).toBe("alive");
  });

  it("skipped (already cut) → 409 with the discriminated status and NO audit call", async () => {
    const seed = determinedSeed();
    seed.entries = seed.entries.map((e) =>
      e.managerId === "a" ? { ...e, status: "eliminated" as const, eliminatedRound: "R32" } : e,
    );
    const { store, auditCalls } = fakeStore(seed);
    const res = await handleAdvance(deps(store), body({ apply: true, reason: "again" }));
    expect(res.status).toBe(409);
    expect((res.body as { status: string }).status).toBe("skipped");
    expect(auditCalls).toHaveLength(0);
  });

  it("needs-commissioner (apply into a boundary tie without breakTie) → 409 with the tied set", async () => {
    const { store, auditCalls } = fakeStore(tieSeed());
    const res = await handleAdvance(deps(store), body({ apply: true, reason: "cut" }));
    expect(res.status).toBe(409);
    const out = res.body as {
      status: string;
      plan: { resolution: { kind: string; tied: string[]; cutsRemaining: number } };
    };
    expect(out.status).toBe("needs-commissioner");
    expect(out.plan.resolution.tied.sort()).toEqual(["b", "c"]);
    expect(auditCalls).toHaveLength(0);
  });

  it("refused (ordering guard: an uncut earlier round) → 409 refused with the plan", async () => {
    const seed: MemoryAdvanceSeed = {
      rounds: [
        { label: "R32", cutCount: 2, frozenAt: FROZEN },
        { label: "R16", cutCount: 2, frozenAt: FROZEN },
      ],
      entries: [{ managerId: "a" }, { managerId: "b" }, { managerId: "c" }, { managerId: "d" }],
      roundScores: { R16: { a: 1, b: 2, c: 5, d: 9 } },
    };
    const { store } = fakeStore(seed);
    const res = await handleAdvance(deps(store), body({ roundLabel: "R16", apply: true }));
    expect(res.status).toBe(409);
    const out = res.body as { status: string; reason: string };
    expect(out.status).toBe("refused");
    expect(out.reason).toContain("R32");
  });
});

describe("handleAdvance — breakTie passthrough", () => {
  it("a wrong-count breakTie surfaces the orchestrator's invalid-tiebreak refusal (409)", async () => {
    const { store, auditCalls } = fakeStore(tieSeed());
    const res = await handleAdvance(
      deps(store),
      body({ apply: true, reason: "cut", breakTie: ["b", "c"] }), // tie needs exactly 1
    );
    expect(res.status).toBe(409);
    const out = res.body as { status: string; reason: string };
    expect(out.status).toBe("refused");
    expect(out.reason).toContain("exactly 1");
    expect(auditCalls).toHaveLength(0);
  });

  it("a wrong-set breakTie (managerId outside the tied set) is refused", async () => {
    const { store } = fakeStore(tieSeed());
    const res = await handleAdvance(
      deps(store),
      body({ apply: true, reason: "cut", breakTie: ["d"] }),
    );
    expect(res.status).toBe(409);
    expect((res.body as { status: string }).status).toBe("refused");
  });

  it("a valid breakTie applies end-to-end and the audit detail records the adjudication", async () => {
    const { store, auditCalls, mem } = fakeStore(tieSeed());
    const res = await handleAdvance(
      deps(store),
      body({ apply: true, reason: "tie adjudicated", breakTie: ["b"] }),
    );
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("applied");
    expect(mem.entries.get("a")!.status).toBe("eliminated");
    expect(mem.entries.get("b")!.status).toBe("eliminated");
    expect(mem.entries.get("c")!.status).toBe("alive");
    expect(auditCalls[0]!.detail).toContain("tie");
  });
});

describe("handleAdvance — audit payload shape", () => {
  it("ONE round_advance row: reversible:false, names + count in the summary, structured targetRef", async () => {
    const { store, auditCalls } = fakeStore(determinedSeed());
    await handleAdvance(deps(store), body({ apply: true, reason: "R32 settled" }));
    expect(auditCalls).toHaveLength(1);
    const audit = auditCalls[0]!;
    expect(audit.actionType).toBe("round_advance");
    expect(audit.reversible).toBe(false);
    expect(audit.leagueId).toBe("lg_1");
    expect(audit.actorUserId).toBe("user_commish");
    expect(audit.reason).toBe("R32 settled");
    expect(audit.summary).toContain("R32");
    expect(audit.summary).toContain("2");
    expect(audit.summary).toContain("Alice FC");
    expect(audit.summary).toContain("Bravo XI");
    expect(audit.summary).toContain("released 3"); // a(2) + b(1) shed to the wire
    // The released roster ids per cut manager + the total ride the JSON target_ref (no migration).
    expect(audit.targetRef).toEqual({
      roundLabel: "R32",
      eliminated: ["a", "b"],
      champion: null,
      released: { a: ["a1", "a2"], b: ["b1"] },
      releasedCount: 3,
    });
    expect(audit.delta).toContain("−3 owned");
  });

  it("the Final's audit carries the champion by display name", async () => {
    const { store, auditCalls, mem } = fakeStore(finalSeed());
    const res = await handleAdvance(
      deps(store),
      body({ roundLabel: "Final", apply: true, reason: "crown" }),
    );
    expect(res.status).toBe(200);
    expect(mem.entries.get("b")!.status).toBe("champion");
    expect(auditCalls[0]!.detail).toContain("Bravo XI");
    expect(auditCalls[0]!.targetRef).toMatchObject({ champion: "b" });
  });
});
