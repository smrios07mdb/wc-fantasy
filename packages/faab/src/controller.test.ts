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

describe("runFaabBatch — D4 playoff participant gate (F-P0-01)", () => {
  // A playoff-phase batch context carries `participantManagerIds` (the `alive` set), exactly as the
  // Prisma `loadBatchContext` builds it when `league.status === 'playoff'`. The controller MUST thread it
  // into the resolver, which voids + refunds every non-participant's still-pending bid. This is the
  // controller-boundary coverage F-P0-01 / F-P2-01 was missing — the pure resolver was already correct,
  // but the controller dropped the field so the gate was dead on the production batch path.
  function playoffStore(participantManagerIds: ReadonlySet<string>) {
    return new MemoryFaabBatchStore({
      leagueId: "L",
      participantManagerIds,
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

  it("voids + refunds an eliminated (non-participant) manager's bid — it can't out-bid a survivor", async () => {
    // A is alive; B is eliminated (NOT in the participant set) yet bids HIGHER on the same player.
    const s = playoffStore(new Set(["A"]));
    s.addPendingBid(pendingBid("alive", "A", "X", 10, "A-drop")); // survivor, lower bid
    s.addPendingBid(pendingBid("elim", "B", "X", 30, "B-drop")); // eliminated, higher bid

    const summary = await runFaabBatch(s, "L", NOW, PERIOD);

    // The eliminated bid is voided + refunded and does NOT win, despite being the higher amount.
    expect(s.bidStatus("elim")).toBe("voided_refunded");
    expect(s.ownedBy("B")).not.toContain("X");
    expect(s.budgetOf("B")).toBe(100); // refunded — the budget was never debited
    // Control: the alive manager's bid resolves normally and wins the now-uncontested player.
    expect(s.bidStatus("alive")).toBe("won");
    expect(s.ownedBy("A")).toContain("X");
    expect(s.budgetOf("A")).toBe(90); // debited 10
    expect(summary.voided).toBe(1);
    expect(summary.won).toBe(1);
  });

  it("does NOT void a participant: in playoff an alive manager's higher bid still wins", async () => {
    // Both A and B are alive participants → the gate must touch neither; the higher bid wins as usual.
    const s = playoffStore(new Set(["A", "B"]));
    s.addPendingBid(pendingBid("lo", "A", "X", 10, "A-drop"));
    s.addPendingBid(pendingBid("hi", "B", "X", 30, "B-drop"));

    await runFaabBatch(s, "L", NOW, PERIOD);

    expect(s.bidStatus("hi")).toBe("won");
    expect(s.ownedBy("B")).toContain("X");
    expect(s.bidStatus("lo")).toBe("lost");
  });

  it("is a no-op in the group phase (participantManagerIds null): every bid competes", async () => {
    // `store()` seeds NO participant set (null = group / pre-playoff). The gate is inert — the higher bid
    // wins regardless of participation. This is what makes the F-P0-01 fix safe to deploy mid-tournament.
    const s = store();
    s.addPendingBid(pendingBid("lo", "A", "X", 10, "A-drop"));
    s.addPendingBid(pendingBid("hi", "B", "X", 30, "B-drop"));

    await runFaabBatch(s, "L", NOW, PERIOD);

    expect(s.bidStatus("hi")).toBe("won");
    expect(s.ownedBy("B")).toContain("X");
    expect(s.bidStatus("lo")).toBe("lost");
  });
});
