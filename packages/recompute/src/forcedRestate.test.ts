import { describe, it, expect } from "vitest";
import { planForcedRestate, forcedRestate, type ForcedRestatePeriod } from "./forcedRestate";
import { MemoryStore } from "./memoryStore";

/**
 * The commissioner FORCED restatement (the `job:recompute` core). Unlike the dirty-driven `sweep`, it
 * recomputes EVERY manager × period from current state regardless of any dirty marker, then recomputes
 * the league standing. `planForcedRestate` is the pure decision (period-filter + frozen gate); the
 * `forcedRestate` orchestration drives the real `recompute*` units against the in-memory store double.
 */

const MANAGERS = ["m1", "m2"];

const META: ForcedRestatePeriod[] = [
  { id: "p1", label: "Group MD1", frozenAt: null },
  { id: "p2", label: "Group MD2", frozenAt: null },
];
const META_P2_FROZEN: ForcedRestatePeriod[] = [
  { id: "p1", label: "Group MD1", frozenAt: null },
  { id: "p2", label: "Group MD2", frozenAt: new Date("2026-06-20T00:00:00Z") },
];

/** A store with two managers and two group_md periods in league L (optionally with some frozen). */
function seedStore(frozen: string[] = []): MemoryStore {
  const s = new MemoryStore();
  for (const m of MANAGERS) s.seedManagerLeague(m, "L");
  s.seedPeriod("p1", { leagueId: "L", kind: "group_md" });
  s.seedPeriod("p2", { leagueId: "L", kind: "group_md" });
  for (const p of frozen) s.freezePeriod(p);
  return s;
}

// ── planForcedRestate (the pure decision) ────────────────────────────────────────

describe("planForcedRestate — period selection + frozen gate (pure)", () => {
  it("plans every manager × period when there is no filter and nothing frozen", () => {
    const plan = planForcedRestate(MANAGERS, META);
    expect(plan.periodsToRecompute).toEqual(["p1", "p2"]);
    expect(plan.skippedFrozenPeriods).toEqual([]);
    expect(plan.periodFilterMatchedNothing).toBe(false);
    expect(plan.pairs).toEqual([
      { managerId: "m1", periodId: "p1" },
      { managerId: "m2", periodId: "p1" },
      { managerId: "m1", periodId: "p2" },
      { managerId: "m2", periodId: "p2" },
    ]);
  });

  it("scopes to a single period by label (case-insensitive, trimmed)", () => {
    const plan = planForcedRestate(MANAGERS, META, { periodLabel: "  group md1 " });
    expect(plan.periodsToRecompute).toEqual(["p1"]);
    expect(plan.pairs).toEqual([
      { managerId: "m1", periodId: "p1" },
      { managerId: "m2", periodId: "p1" },
    ]);
    expect(plan.periodFilterMatchedNothing).toBe(false);
  });

  it("flags an unknown --period label as matched-nothing (no pairs)", () => {
    const plan = planForcedRestate(MANAGERS, META, { periodLabel: "Group MD9" });
    expect(plan.pairs).toEqual([]);
    expect(plan.periodsToRecompute).toEqual([]);
    expect(plan.periodFilterMatchedNothing).toBe(true);
  });

  it("skips a frozen period by default (excluded from pairs, listed as skipped)", () => {
    const plan = planForcedRestate(MANAGERS, META_P2_FROZEN);
    expect(plan.periodsToRecompute).toEqual(["p1"]);
    expect(plan.skippedFrozenPeriods).toEqual(["p2"]);
    expect(plan.pairs.map((r) => r.periodId)).toEqual(["p1", "p1"]);
  });

  it("includes a frozen period when allowFrozen (commissioner override)", () => {
    const plan = planForcedRestate(MANAGERS, META_P2_FROZEN, { allowFrozen: true });
    expect(plan.periodsToRecompute).toEqual(["p1", "p2"]);
    expect(plan.skippedFrozenPeriods).toEqual([]);
    expect(plan.pairs).toHaveLength(4);
  });

  it("yields no pairs when there are no managers, but still resolves the periods", () => {
    const plan = planForcedRestate([], META);
    expect(plan.pairs).toEqual([]);
    expect(plan.periodsToRecompute).toEqual(["p1", "p2"]);
  });
});

// ── forcedRestate (the store orchestration) ──────────────────────────────────────

describe("forcedRestate — forced restatement from current state (no dirty markers)", () => {
  it("recomputes EVERY manager × period with NO dirty marker, overwriting stale scores, then standings", async () => {
    const store = seedStore();
    // A stale manager-period score and NO dirty markers anywhere: `sweep` would do nothing here.
    store.seedManagerPeriodScore("m1", "p1", 99);

    const plan = planForcedRestate(MANAGERS, META);
    const summary = await forcedRestate(store, "L", plan);

    // All four (manager, period) rows were (re)written — the stale 99 is overwritten to 0 (no slots).
    expect(store.writtenManagerScore("m1", "p1")).toBe(0);
    expect(store.writtenManagerScore("m2", "p1")).toBe(0);
    expect(store.writtenManagerScore("m1", "p2")).toBe(0);
    expect(store.writtenManagerScore("m2", "p2")).toBe(0);
    expect(summary.managerPeriods).toBe(4);
    // Standing recomputed for the league (one row per manager).
    expect(summary.standingRows).toBe(2);
    expect(store.allStandings()).toHaveLength(2);
  });

  it("skips a frozen period by default and restates it only under allowFrozen", async () => {
    const store = seedStore(["p2"]);

    const planDefault = planForcedRestate(MANAGERS, META_P2_FROZEN);
    const a = await forcedRestate(store, "L", planDefault);
    expect(store.writtenManagerScore("m1", "p1")).toBe(0);
    expect(store.writtenManagerScore("m1", "p2")).toBeUndefined(); // frozen → not restated
    expect(a.managerPeriods).toBe(2);

    const planOverride = planForcedRestate(MANAGERS, META_P2_FROZEN, { allowFrozen: true });
    const b = await forcedRestate(store, "L", planOverride, { allowFrozen: true });
    expect(store.writtenManagerScore("m1", "p2")).toBe(0); // override restates the frozen period
    expect(b.managerPeriods).toBe(4);
  });

  it("scopes the restatement to one period via --period", async () => {
    const store = seedStore();
    const plan = planForcedRestate(MANAGERS, META, { periodLabel: "Group MD2" });
    const summary = await forcedRestate(store, "L", plan);

    expect(store.writtenManagerScore("m1", "p1")).toBeUndefined(); // not in scope
    expect(store.writtenManagerScore("m1", "p2")).toBe(0);
    expect(summary.managerPeriods).toBe(2);
  });
});
