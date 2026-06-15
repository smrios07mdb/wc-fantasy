import { describe, it, expect } from "vitest";
import {
  buildTransitionPlan,
  runPlayoffTransition,
  type PlayoffTransitionStore,
  type TransitionContext,
  type TransitionPlan,
} from "./transition";
import type { PeriodCadenceView } from "@app/faab";
import type { LeagueStatus } from "@app/shared";

/**
 * The group→playoff transition (Theme C/D). The pure derivation ({@link buildTransitionPlan}) is pinned
 * with literals; the orchestrator runs against an in-memory store double (the production Prisma adapter is
 * covered by `tsc` + the same store contract, mirroring the @app/faab / @app/draft convention). We assert
 * the dry-run mutates NOTHING, the apply leaves the full post-state, and a second apply is a no-op.
 */

const LEAD_MS = 6 * 60 * 60_000; // 6h (FAAB_BATCH_LEAD_MIN=360), same as the worker config
const COMMISH = { email: "commish@example.com", isCommissioner: true } as const;

interface SeedManager {
  managerId: string;
  displayName: string;
  seed: number;
  waiverOrderPosition: number | null;
  rosterSize: number;
  faabBudget: number;
}

interface MemState {
  managerId: string;
  displayName: string;
  seed: number;
  waiverOrderPosition: number | null;
  rosterSize: number;
  faabBudget: number;
}

interface StoreSeed {
  leagueStatus: LeagueStatus;
  managers: SeedManager[];
  r32Cadence?: PeriodCadenceView | null;
}

/** An in-memory {@link PlayoffTransitionStore} mirroring the Prisma adapter's semantics. */
class MemoryTransitionStore implements PlayoffTransitionStore {
  leagueStatus: LeagueStatus;
  readonly managers = new Map<string, MemState>();
  readonly cutCounts = new Map<string, number>();
  readonly entries = new Map<string, { seed: number; status: string }>();
  applyCount = 0;
  private readonly r32: PeriodCadenceView | null;

  constructor(seed: StoreSeed) {
    this.leagueStatus = seed.leagueStatus;
    for (const m of seed.managers) this.managers.set(m.managerId, { ...m });
    this.r32 = seed.r32Cadence ?? null;
  }

  async loadTransitionContext(leagueId: string): Promise<TransitionContext | null> {
    const all = [...this.managers.values()];
    return {
      leagueId,
      leagueStatus: this.leagueStatus,
      standings: all.map((m) => ({ managerId: m.managerId, seed: m.seed })),
      managers: all.map((m) => ({
        managerId: m.managerId,
        displayName: m.displayName,
        waiverOrderPosition: m.waiverOrderPosition,
      })),
      activeRosterSizeByManager: Object.fromEntries(all.map((m) => [m.managerId, m.rosterSize])),
      r32Cadence: this.r32,
    };
  }

  async applyTransition(
    plan: TransitionPlan,
    { runAt: _runAt }: { runAt: Date },
  ): Promise<"applied" | "already-transitioned"> {
    // ENTRY GATE: the conditional group→playoff claim (mirrors the Prisma `updateMany WHERE status='group'`).
    if (this.leagueStatus !== "group") return "already-transitioned";
    this.leagueStatus = "playoff";
    for (const c of plan.cutSchedule) this.cutCounts.set(c.round, c.cutCount);
    for (const f of plan.field) this.entries.set(f.managerId, { seed: f.seed, status: "alive" });
    for (const r of plan.released) this.managers.get(r.managerId)!.rosterSize = 0;
    for (const id of plan.budgetResetManagerIds)
      this.managers.get(id)!.faabBudget = plan.budgetResetTo;
    for (const m of this.managers.values()) m.waiverOrderPosition = null;
    for (const slot of plan.waiverOrder)
      this.managers.get(slot.managerId)!.waiverOrderPosition = slot.position;
    this.applyCount += 1;
    return "applied";
  }
}

/** 12 managers, seed = i, waiver position = reverse of seed (so carry-forward ≠ seed order), full 15-man
 *  rosters, a deliberately-spent $30 budget (to prove the reset writes 100, not @default). */
function twelveManagers(): SeedManager[] {
  return Array.from({ length: 12 }, (_, i) => {
    const seed = i + 1;
    return {
      managerId: `m${seed}`,
      displayName: `Team ${seed}`,
      seed,
      waiverOrderPosition: 13 - seed, // m1 last (12), m12 first (1)
      rosterSize: 15,
      faabBudget: 30,
    };
  });
}

function store(over: Partial<StoreSeed> = {}): MemoryTransitionStore {
  return new MemoryTransitionStore({
    leagueStatus: "group",
    managers: twelveManagers(),
    ...over,
  });
}

const deps = (s: PlayoffTransitionStore) => ({
  now: new Date("2026-06-26T12:00:00Z"),
  leadMs: LEAD_MS,
  store: s,
  log: () => {},
});

const input = (over: Record<string, unknown> = {}) => ({
  actor: COMMISH,
  leagueId: "L1",
  fieldSize: 8,
  reason: "group stage complete",
  apply: false,
  ...over,
});

// ── pure derivation ───────────────────────────────────────────────────────────────────
describe("buildTransitionPlan", () => {
  const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
    leagueId: "L1",
    leagueStatus: "group",
    standings: twelveManagers().map((m) => ({ managerId: m.managerId, seed: m.seed })),
    managers: twelveManagers().map((m) => ({
      managerId: m.managerId,
      displayName: m.displayName,
      waiverOrderPosition: m.waiverOrderPosition,
    })),
    activeRosterSizeByManager: Object.fromEntries(twelveManagers().map((m) => [m.managerId, 15])),
    r32Cadence: null,
    ...over,
  });

  it("seeds the top-N field, derives the 5-round cut schedule, and lists the non-advancers", () => {
    const plan = buildTransitionPlan(ctx(), 8, LEAD_MS);
    expect(plan.field.map((f) => f.managerId)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8",
    ]);
    expect(plan.field.map((f) => f.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(plan.cutSchedule.map((c) => [c.round, c.cutCount])).toEqual([
      ["R32", 2],
      ["R16", 2],
      ["QF", 1],
      ["SF", 1],
      ["Final", 1],
    ]);
    expect(plan.released.map((r) => r.managerId)).toEqual(["m9", "m10", "m11", "m12"]);
    expect(plan.budgetResetManagerIds).toHaveLength(8);
    expect(plan.budgetResetTo).toBe(100);
    expect(plan.trimCap).toBe(9);
  });

  it("carries the waiver order forward by LIVE position (not seed), re-packed contiguous, survivors only", () => {
    // Survivors m1..m8 had waiver positions 12..5; carried = lowest live position first, renumbered 1..8.
    const plan = buildTransitionPlan(ctx(), 8, LEAD_MS);
    expect(plan.waiverOrder).toEqual([
      { managerId: "m8", position: 1 },
      { managerId: "m7", position: 2 },
      { managerId: "m6", position: 3 },
      { managerId: "m5", position: 4 },
      { managerId: "m4", position: 5 },
      { managerId: "m3", position: 6 },
      { managerId: "m2", position: 7 },
      { managerId: "m1", position: 8 },
    ]);
  });

  it("derives the trim deadline from the R32 first kickoff (− lead) when fixtures are synced", () => {
    const r32: PeriodCadenceView = {
      id: "p-r32",
      leagueId: "L1",
      batchClearedAt: null,
      waiverBatchAt: null,
      firstKickoffAt: new Date("2026-07-01T18:00:00Z"),
    };
    const plan = buildTransitionPlan(ctx({ r32Cadence: r32 }), 8, LEAD_MS);
    expect(plan.trimDeadlineAt?.toISOString()).toBe("2026-07-01T12:00:00.000Z"); // 18:00 − 6h
  });

  it("leaves the trim deadline null when no R32 period / fixtures exist yet", () => {
    expect(buildTransitionPlan(ctx({ r32Cadence: null }), 8, LEAD_MS).trimDeadlineAt).toBeNull();
  });
});

// ── orchestrator: dry-run / apply / idempotency / refusals ──────────────────────────────
describe("runPlayoffTransition", () => {
  it("DRY-RUN (default) returns the plan and mutates nothing", async () => {
    const s = store();
    const res = await runPlayoffTransition(deps(s), input());
    expect(res.status).toBe("planned");
    expect(s.applyCount).toBe(0);
    expect(s.leagueStatus).toBe("group");
    expect(s.entries.size).toBe(0);
    expect(s.cutCounts.size).toBe(0);
    expect(s.managers.get("m9")!.rosterSize).toBe(15); // not released
    expect(s.managers.get("m1")!.faabBudget).toBe(30); // not reset
  });

  it("--apply performs the full transition transactionally", async () => {
    const s = store();
    const res = await runPlayoffTransition(deps(s), input({ apply: true }));
    expect(res.status).toBe("applied");

    // status flipped
    expect(s.leagueStatus).toBe("playoff");
    // survival state: 8 alive entries, seeds verbatim; non-advancers get NO row
    expect(s.entries.size).toBe(8);
    expect(s.entries.get("m1")).toEqual({ seed: 1, status: "alive" });
    expect(s.entries.has("m9")).toBe(false);
    // knockout cut_counts
    expect([...s.cutCounts.entries()].sort()).toEqual([
      ["Final", 1],
      ["QF", 1],
      ["R16", 2],
      ["R32", 2],
      ["SF", 1],
    ]);
    // non-advancers released into the pool, advancers untouched
    expect(s.managers.get("m9")!.rosterSize).toBe(0);
    expect(s.managers.get("m1")!.rosterSize).toBe(15);
    // every advancer reset to a fresh $100
    expect(s.managers.get("m1")!.faabBudget).toBe(100);
    expect(s.managers.get("m8")!.faabBudget).toBe(100);
    // waiver order carried forward (survivors 1..8), non-advancers cleared to NULL
    expect(s.managers.get("m8")!.waiverOrderPosition).toBe(1);
    expect(s.managers.get("m1")!.waiverOrderPosition).toBe(8);
    expect(s.managers.get("m9")!.waiverOrderPosition).toBeNull();
  });

  it("is idempotent — a second --apply is a no-op skip (the league has left the group phase)", async () => {
    const s = store();
    await runPlayoffTransition(deps(s), input({ apply: true }));
    const second = await runPlayoffTransition(deps(s), input({ apply: true }));
    expect(second.status).toBe("skipped");
    expect(s.applyCount).toBe(1); // applyTransition NOT called a second time
  });

  it("the store entry-gate refuses a concurrent apply (already-transitioned)", async () => {
    const s = store();
    const ctx = await s.loadTransitionContext("L1");
    const plan = buildTransitionPlan(ctx!, 8, LEAD_MS);
    expect(await s.applyTransition(plan, { runAt: new Date() })).toBe("applied");
    expect(await s.applyTransition(plan, { runAt: new Date() })).toBe("already-transitioned");
  });

  it("refuses a non-commissioner", async () => {
    const res = await runPlayoffTransition(
      deps(store()),
      input({ apply: true, actor: { email: "x@example.com", isCommissioner: false } }),
    );
    expect(res).toMatchObject({ status: "refused" });
  });

  it("refuses an empty reason", async () => {
    const res = await runPlayoffTransition(deps(store()), input({ reason: "  " }));
    expect(res).toMatchObject({ status: "refused" });
  });

  it("refuses a field larger than the manager pool", async () => {
    const res = await runPlayoffTransition(deps(store()), input({ fieldSize: 20 }));
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/exceeds/);
  });

  it("refuses a field below the 5-round minimum", async () => {
    const res = await runPlayoffTransition(deps(store()), input({ fieldSize: 5 }));
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/minimum/);
  });

  it("skips when the league is already in the playoff phase", async () => {
    const res = await runPlayoffTransition(
      deps(store({ leagueStatus: "playoff" })),
      input({ apply: true }),
    );
    expect(res.status).toBe("skipped");
  });

  it("refuses before the group stage (draft phase)", async () => {
    const res = await runPlayoffTransition(
      deps(store({ leagueStatus: "draft" })),
      input({ apply: true }),
    );
    expect(res.status).toBe("refused");
  });
});
