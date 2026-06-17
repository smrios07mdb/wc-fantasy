import { describe, it, expect } from "vitest";
import { MemoryFaabBatchStore, type FaabBatchStore } from "@app/faab";
import { dispatchFaabBatches } from "./dispatch";
import { MemoryFaabCadenceStore } from "./memoryStore";
import type { PeriodCadenceView } from "./selectors";

/**
 * The worker-tick FAAB driver (DECISIONS.md → Theme D "per-matchday acquisition window" amendment):
 * each tick, clear every period whose batch is due, exactly once, via the UNCHANGED `runFaabBatch`.
 * Idempotency is the `batch_cleared_at` latch (stamped after the batch runs); the 60s tick may fire
 * repeatedly and the batch must run once per period. Exercised against the in-memory doubles.
 */

const LEAD = 6 * 60 * 60_000; // 6h
const NOW = new Date("2026-06-11T06:00:00Z"); // = the 12:00-kickoff period's deadline

function md1(over: Partial<PeriodCadenceView> = {}): PeriodCadenceView {
  return {
    id: "MD1",
    leagueId: "L",
    batchClearedAt: null,
    waiverBatchAt: null,
    firstKickoffAt: new Date("2026-06-11T12:00:00Z"),
    ...over,
  };
}

/** A league batch store seeded with one manager and one uncontested pending bid. */
function seededBatchStore(): MemoryFaabBatchStore {
  const store = new MemoryFaabBatchStore({
    leagueId: "L",
    managers: [
      {
        managerId: "A",
        faabBudget: 100,
        waiverOrderPosition: 1,
        counts: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
        ownedPlayerIds: [],
      },
    ],
  });
  store.addPendingBid({
    bidId: "b1",
    managerId: "A",
    playerAddId: "X",
    addPosition: "MID",
    addTargetKickoffAt: new Date("2026-06-11T12:00:00Z"), // future vs NOW → not voided
    playerDropId: null,
    dropPosition: null,
    dropLocked: false,
    amount: 5,
  });
  return store;
}

/** A PLAYOFF-phase league batch store: `participantManagerIds` carries the `alive` set (A only), exactly
 *  as the Prisma `loadBatchContext` builds it when `league.status === 'playoff'`. Eliminated manager B
 *  bids the HIGHER amount on the same player — so a batch run through the UNCHANGED `runFaabBatch` the
 *  dispatcher calls must void B and award A (the F-P0-01 fix, proven end to end through the driver). */
function playoffBatchStore(): MemoryFaabBatchStore {
  const store = new MemoryFaabBatchStore({
    leagueId: "L",
    participantManagerIds: new Set(["A"]), // A alive; B eliminated (no alive playoff_entry)
    managers: [
      {
        managerId: "A",
        faabBudget: 100,
        waiverOrderPosition: 1,
        counts: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
        ownedPlayerIds: [],
      },
      {
        managerId: "B",
        faabBudget: 100,
        waiverOrderPosition: 2,
        counts: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
        ownedPlayerIds: [],
      },
    ],
  });
  const kickoff = new Date("2026-06-11T12:00:00Z"); // future vs NOW → not voided for kickoff
  store.addPendingBid({
    bidId: "alive",
    managerId: "A",
    playerAddId: "X",
    addPosition: "MID",
    addTargetKickoffAt: kickoff,
    playerDropId: null,
    dropPosition: null,
    dropLocked: false,
    amount: 10, // survivor, lower bid
  });
  store.addPendingBid({
    bidId: "elim",
    managerId: "B",
    playerAddId: "X",
    addPosition: "MID",
    addTargetKickoffAt: kickoff,
    playerDropId: null,
    dropPosition: null,
    dropLocked: false,
    amount: 30, // eliminated, higher bid
  });
  return store;
}

describe("dispatchFaabBatches — the per-period trigger", () => {
  it("clears a due period once: runs the batch and stamps the latch", async () => {
    const cadence = new MemoryFaabCadenceStore([md1()]);
    const batch = seededBatchStore();

    const res = await dispatchFaabBatches(cadence, batch, NOW, LEAD);

    expect(res.due).toBe(1);
    expect(res.cleared).toHaveLength(1);
    expect(res.cleared[0]!.periodId).toBe("MD1");
    expect(batch.batches).toHaveLength(1); // the batch ran
    expect(batch.bidStatus("b1")).toBe("won"); // the uncontested bid was awarded
    expect(cadence.latchOf("MD1")).toEqual(NOW); // latch stamped
  });

  it("is idempotent: a second tick after the latch is set does NOT re-run the batch", async () => {
    const cadence = new MemoryFaabCadenceStore([md1()]);
    const batch = seededBatchStore();

    await dispatchFaabBatches(cadence, batch, NOW, LEAD);
    const second = await dispatchFaabBatches(
      cadence,
      batch,
      new Date("2026-06-11T08:00:00Z"),
      LEAD,
    );

    expect(second.due).toBe(0); // latch set → period not selected
    expect(batch.batches).toHaveLength(1); // still exactly one batch — no double clear
  });

  it("does not fire before the deadline", async () => {
    const cadence = new MemoryFaabCadenceStore([md1()]);
    const batch = seededBatchStore();

    const res = await dispatchFaabBatches(cadence, batch, new Date("2026-06-11T05:00:00Z"), LEAD);

    expect(res.due).toBe(0);
    expect(batch.batches).toHaveLength(0);
    expect(cadence.latchOf("MD1")).toBeNull();
  });

  it("isolates a failing batch: it is recorded as an error and its latch is NOT stamped (so it retries)", async () => {
    const cadence = new MemoryFaabCadenceStore([md1()]);
    const exploding: FaabBatchStore = {
      loadBatchContext: async () => {
        throw new Error("boom");
      },
      commitBatch: async () => "never",
    };

    const res = await dispatchFaabBatches(cadence, exploding, NOW, LEAD);

    expect(res.cleared).toHaveLength(0);
    expect(res.errors).toEqual([{ periodId: "MD1", message: "boom" }]);
    expect(cadence.latchOf("MD1")).toBeNull(); // not stamped → next tick retries
  });

  it("D4 playoff gate: an eliminated (non-participant) bid is voided through the driver; the survivor wins (F-P0-01)", async () => {
    const cadence = new MemoryFaabCadenceStore([md1()]);
    const batch = playoffBatchStore();

    const res = await dispatchFaabBatches(cadence, batch, NOW, LEAD);

    expect(res.cleared).toHaveLength(1);
    expect(batch.bidStatus("elim")).toBe("voided_refunded"); // eliminated → voided, not won
    expect(batch.ownedBy("B")).not.toContain("X"); // the higher bid did NOT win
    expect(batch.budgetOf("B")).toBe(100); // refunded — never debited
    expect(batch.bidStatus("alive")).toBe("won"); // the survivor wins the now-uncontested player
    expect(batch.ownedBy("A")).toContain("X");
    expect(cadence.latchOf("MD1")).toEqual(NOW); // latch stamped as usual
  });
});
