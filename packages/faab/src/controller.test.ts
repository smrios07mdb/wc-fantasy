import { describe, it, expect } from "vitest";
import { runFaabBatch } from "./controller";
import { resolveFaabBatch } from "./resolve";
import { MemoryFaabBatchStore } from "./memoryStore";
import type { Position } from "@app/shared";

/**
 * The batch controller is the thin orchestration the cron runs: load → resolve → commit. The locked
 * clearing math is the pure {@link ./resolve} (separately tested); here we pin the WIRING and the
 * idempotency guarantee — a batch with nothing pending is a no-op, and a re-run after a clear does not
 * re-process. Exercised against the in-memory store double (the production Prisma adapter is covered by
 * `tsc` + the same controller contract, mirroring @app/draft / @app/lineup).
 */

const FULL = { GK: 2, DEF: 5, MID: 5, FWD: 3 } as const;
const NOW = new Date("2026-06-10T06:00:00Z");

function store() {
  return new MemoryFaabBatchStore({
    leagueId: "L",
    managers: [
      {
        managerId: "A",
        faabBudget: 100,
        waiverOrderPosition: 1,
        counts: FULL,
        ownedPlayerIds: ["A-drop"],
      },
      {
        managerId: "B",
        faabBudget: 100,
        waiverOrderPosition: 2,
        counts: FULL,
        ownedPlayerIds: ["B-drop"],
      },
    ],
  });
}

function pendingBid(
  id: string,
  managerId: string,
  add: string,
  amount: number,
  drop: string,
): {
  bidId: string;
  managerId: string;
  playerAddId: string;
  addPosition: Position;
  addTargetKickoffAt: Date | null;
  playerDropId: string | null;
  dropPosition: Position | null;
  dropLocked: boolean;
  amount: number;
} {
  return {
    bidId: id,
    managerId,
    playerAddId: add,
    addPosition: "MID",
    addTargetKickoffAt: null,
    playerDropId: drop,
    dropPosition: "MID",
    dropLocked: false,
    amount,
  };
}

const PERIOD = "MD1";

describe("runFaabBatch — orchestration + idempotency", () => {
  it("is a no-op when there are no pending bids (no batch row created)", async () => {
    const s = store();
    const summary = await runFaabBatch(s, "L", NOW, PERIOD);
    expect(summary.batchId).toBeNull();
    expect(summary.bidsProcessed).toBe(0);
    expect(s.batches.length).toBe(0);
  });

  it("clears a contested player, settles bids, debits the winner, and stamps the batch id", async () => {
    const s = store();
    s.addPendingBid(pendingBid("hi", "A", "X", 30, "A-drop"));
    s.addPendingBid(pendingBid("lo", "B", "X", 10, "B-drop"));

    const summary = await runFaabBatch(s, "L", NOW, PERIOD);

    expect(summary.batchId).not.toBeNull();
    expect(summary.won).toBe(1);
    expect(summary.lost).toBe(1);
    // The won/lost bids are now terminal and carry the batch id.
    expect(s.bidStatus("hi")).toBe("won");
    expect(s.bidStatus("lo")).toBe("lost");
    expect(s.bidBatchId("hi")).toBe(summary.batchId);
    // Winner debited; the add/drop applied.
    expect(s.budgetOf("A")).toBe(70);
    expect(s.ownedBy("A")).toContain("X");
    expect(s.ownedBy("A")).not.toContain("A-drop");
  });

  it("does not re-process on a second run (idempotent): the cleared bids are gone from pending", async () => {
    const s = store();
    s.addPendingBid(pendingBid("hi", "A", "X", 30, "A-drop"));
    s.addPendingBid(pendingBid("lo", "B", "X", 10, "B-drop"));

    const first = await runFaabBatch(s, "L", NOW, PERIOD);
    expect(first.batchId).not.toBeNull();
    const budgetAfterFirst = s.budgetOf("A");

    const second = await runFaabBatch(s, "L", NOW, PERIOD);
    expect(second.batchId).toBeNull(); // nothing pending → no-op
    expect(second.bidsProcessed).toBe(0);
    expect(s.budgetOf("A")).toBe(budgetAfterFirst); // no double-debit
    expect(s.batches.length).toBe(1); // exactly one batch ran
  });

  it("voids + refunds a bid whose add target already kicked off (no debit, no win)", async () => {
    const s = store();
    const kicked = pendingBid("v", "A", "X", 40, "A-drop");
    kicked.addTargetKickoffAt = new Date("2026-06-10T05:00:00Z"); // an hour before `now`
    s.addPendingBid(kicked);

    const summary = await runFaabBatch(s, "L", NOW, PERIOD);
    expect(summary.voided).toBe(1);
    expect(summary.won).toBe(0);
    expect(s.bidStatus("v")).toBe("voided_refunded");
    expect(s.budgetOf("A")).toBe(100); // refunded — never debited
  });

  it("two concurrent applies for the same period: the period-claim entry gate lets exactly one apply", async () => {
    // Models two overlapping ticks / a second worker instance: BOTH loaded the same pending snapshot and
    // resolved the SAME outcome before either committed. The conditional `batch_cleared_at IS NULL` claim
    // (rowcount-gated, abort on 0) must let exactly ONE apply — no double debit, no double add/drop.
    const s = store();
    s.addPendingBid(pendingBid("hi", "A", "X", 30, "A-drop"));
    s.addPendingBid(pendingBid("lo", "B", "X", 10, "B-drop"));

    const ctx = await s.loadBatchContext("L");
    const outcome = resolveFaabBatch({
      now: NOW,
      managers: ctx!.managers,
      bids: ctx!.bids,
      ownedByLeague: ctx!.ownedByLeague,
      rosterCap: ctx!.rosterCap,
    });

    const firstBatch = await s.commitBatch({
      leagueId: "L",
      runAt: NOW,
      outcome,
      claimPeriodId: PERIOD,
    });
    const secondBatch = await s.commitBatch({
      leagueId: "L",
      runAt: NOW,
      outcome,
      claimPeriodId: PERIOD,
    });

    expect(firstBatch).not.toBeNull(); // the claim winner applied
    expect(secondBatch).toBeNull(); // the loser's claim matched 0 rows → aborted, NOTHING applied
    expect(s.batches.length).toBe(1); // exactly one batch row
    expect(s.budgetOf("A")).toBe(70); // debited once (30), not 40
    expect(s.ownedBy("A")).toContain("X"); // added once
    expect(s.ownedBy("A")).not.toContain("A-drop"); // dropped once
  });
});
