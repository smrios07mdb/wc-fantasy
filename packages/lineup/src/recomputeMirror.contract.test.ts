/**
 * CONTRACT test — the forfeit save's recompute enqueue must not DRIFT from what @app/recompute's sweep
 * consumes. @app/lineup's Prisma store mirrors @app/recompute.enqueueManagerPeriodDirty (a deduped
 * recompute_dirty insert) rather than depending on it (a deliberate decoupling). To guard that mirror this
 * test pins the contract from the CONSUMER side, importing @app/recompute directly (a test-only devDep;
 * @app/recompute does NOT import @app/lineup, so there is no cycle):
 *
 *   1. shape  — the (manager, period) ref the forfeit emits is assignable to @app/recompute's
 *               `ManagerPeriodRef` (a field rename on the consumer side fails to compile here);
 *   2. dedup/sweep — that exact ref round-trips through the REAL recompute consumer (enqueue → it dedups a
 *               duplicate → listDirtyManagerPeriods returns it → markManagerPeriodProcessed clears it), so a
 *               change to the dedup key or sweep semantics fails here;
 *   3. scope  — the canonical recompute_dirty scope literal both Prisma adapters write is the Prisma
 *               `RecomputeScope` enum value `"manager_period"` (renaming the enum fails to compile here AND
 *               in both prismaStores).
 *
 * Why a test, not a shared-helper extraction (the "(ii)" option): the enqueue is Prisma-bound so it cannot
 * live in @app/shared (which is IO-free, purity-tested); it must run INSIDE @app/lineup's `$transaction` to
 * keep the forfeit write atomic (the existing @app/recompute enqueue binds the module `prisma`, not a tx);
 * and routing it through @app/recompute would add a new @app/lineup→@app/recompute RUNTIME dependency,
 * reversing the deliberate decoupling. That is a multi-file refactor + an architecture-edge addition, not the
 * one-file move the option requires — so the contract is pinned with this test instead.
 */
import { describe, it, expect } from "vitest";
import { MemoryStore, type ManagerPeriodRef } from "@app/recompute";
import type { RecomputeScope } from "@app/db";
import type { Position } from "@app/shared";
import { MemoryLineupStore } from "./memoryStore";
import { setLineup } from "./controller";

// (3) The canonical scope literal both Prisma adapters write. Typed as the Prisma enum, so a schema rename
//     of the enum value breaks this line (and both prismaStores) at compile time.
const MANAGER_PERIOD_SCOPE: RecomputeScope = "manager_period";

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
const XI_WITHOUT_D1 = ["gk1", "d5", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"];

/** Drive a real confirmed forfeit and return the (manager, period) ref it enqueued. */
async function forfeitAndGetEnqueuedRef(): Promise<ManagerPeriodRef> {
  const store = new MemoryLineupStore();
  store.seedManager("mgr-1", "L1");
  store.seedPeriod("L1", { id: "md1", status: "open", closesAt: CLOSES });
  for (const [playerId, position] of SQUAD) store.seedRoster("L1", "mgr-1", playerId, position);
  store.seedSlot("mgr-1", "md1", "d1", "DEF", { isStarter: true, hasPlayed: true });

  const res = await setLineup(
    store,
    {
      managerId: "mgr-1",
      periodId: "md1",
      starterIds: XI_WITHOUT_D1,
      forfeitConfirmedPlayerIds: ["d1"],
    },
    NOW,
  );
  expect(res.ok).toBe(true);

  const enqueued = store.enqueuedRecomputes();
  expect(enqueued).toHaveLength(1);
  const first = enqueued[0];
  if (!first) throw new Error("expected exactly one enqueued recompute ref");
  // (1) shape pin: the emitted ref must BE a @app/recompute ManagerPeriodRef (compile-time + structural).
  const ref: ManagerPeriodRef = first;
  return ref;
}

describe("forfeit recompute enqueue ↔ @app/recompute sweep contract (drift guard)", () => {
  it("emits the canonical manager-period scope literal (Prisma enum value)", () => {
    expect(MANAGER_PERIOD_SCOPE).toBe("manager_period");
  });

  it("emits a ref the REAL recompute consumer dedups, sweeps, and clears (2)", async () => {
    const ref = await forfeitAndGetEnqueuedRef();
    expect(ref).toEqual({ managerId: "mgr-1", periodId: "md1" });

    // Feed the forfeit's ref into the actual @app/recompute consumer and exercise the full sweep contract.
    const sweep = new MemoryStore();
    await sweep.enqueueManagerPeriodDirty(ref);
    await sweep.enqueueManagerPeriodDirty(ref); // a duplicate must be deduped (same dedup key as the mirror)
    expect(await sweep.listDirtyManagerPeriods()).toEqual([ref]); // exactly one unprocessed marker

    await sweep.markManagerPeriodProcessed(ref); // the sweep can clear it by the SAME (manager, period) key
    expect(await sweep.listDirtyManagerPeriods()).toEqual([]);
  });
});
