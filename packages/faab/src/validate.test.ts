import { describe, it, expect } from "vitest";
import { validateBidSubmission } from "./validate";
import type { BidSubmission, BidValidationContext } from "./validate";
import type { PositionCounts } from "./resolve";

/**
 * Submission-time validation (DECISIONS.md §D, "rejected at submission"): a bid is checked the moment
 * it is placed — over-commit, ownership, the per-player kickoff cutoff, and roster legality — so an
 * illegal claim never reaches the batch. Pure: `now` + kickoff + the manager snapshot are passed in.
 */

const FULL: PositionCounts = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

function ctx(over: Partial<BidValidationContext> = {}): BidValidationContext {
  return {
    now: new Date("2026-06-10T06:00:00Z"),
    faabBudget: 100,
    pendingTotal: 0,
    counts: FULL,
    squadSize: 15,
    ownedByManager: new Set(["DROP"]),
    ownedByLeague: new Set(["DROP"]),
    addTargetKickoffAt: new Date("2026-06-10T15:00:00Z"), // upcoming
    dropLocked: false,
    ...over,
  };
}

function sub(over: Partial<BidSubmission> = {}): BidSubmission {
  return {
    managerId: "A",
    playerAddId: "X",
    addPosition: "MID",
    playerDropId: "DROP",
    dropPosition: "MID",
    amount: 10,
    ...over,
  };
}

describe("validateBidSubmission", () => {
  it("accepts a legal add/drop within budget (returns null)", () => {
    expect(validateBidSubmission(sub(), ctx())).toBeNull();
  });

  it("accepts a $0 bid (the minimum is legal)", () => {
    expect(validateBidSubmission(sub({ amount: 0 }), ctx())).toBeNull();
  });

  it("rejects a negative amount", () => {
    expect(validateBidSubmission(sub({ amount: -1 }), ctx())?.code).toBe("amount-negative");
  });

  it("rejects an amount over (budget − other pending bids) — no over-commit", () => {
    // budget 100, already 80 committed across other pending bids → only 20 left; a 30 bid over-commits.
    const e = validateBidSubmission(
      sub({ amount: 30 }),
      ctx({ faabBudget: 100, pendingTotal: 80 }),
    );
    expect(e?.code).toBe("over-budget");
    // the boundary is allowed: exactly 20 is fine.
    expect(
      validateBidSubmission(sub({ amount: 20 }), ctx({ faabBudget: 100, pendingTotal: 80 })),
    ).toBeNull();
  });

  it("rejects an add target already owned league-wide", () => {
    const e = validateBidSubmission(
      sub({ playerAddId: "TAKEN" }),
      ctx({ ownedByLeague: new Set(["DROP", "TAKEN"]) }),
    );
    expect(e?.code).toBe("add-owned");
  });

  it("rejects an add target whose match has already kicked off (cutoff closed)", () => {
    const now = new Date("2026-06-10T16:00:00Z");
    const e = validateBidSubmission(
      sub(),
      ctx({ now, addTargetKickoffAt: new Date("2026-06-10T15:00:00Z") }),
    );
    expect(e?.code).toBe("add-kicked-off");
  });

  it("requires a drop once the roster is full", () => {
    const e = validateBidSubmission(
      sub({ playerDropId: null, dropPosition: null }),
      ctx({ squadSize: 15 }),
    );
    expect(e?.code).toBe("drop-required");
  });

  it("allows a null drop when the roster has an open slot (reinforcement)", () => {
    expect(
      validateBidSubmission(
        sub({ playerDropId: null, dropPosition: null }),
        ctx({ squadSize: 8, counts: { GK: 1, DEF: 3, MID: 2, FWD: 2 } }),
      ),
    ).toBeNull();
  });

  it("rejects a drop the manager does not own", () => {
    const e = validateBidSubmission(
      sub({ playerDropId: "NOTMINE", dropPosition: "MID" }),
      ctx({ ownedByManager: new Set(["DROP"]) }),
    );
    expect(e?.code).toBe("drop-not-owned");
  });

  it("rejects a drop that is locked by play (already played this matchday)", () => {
    const e = validateBidSubmission(sub(), ctx({ dropLocked: true }));
    expect(e?.code).toBe("drop-locked");
  });

  it("rejects a drop equal to the add", () => {
    const e = validateBidSubmission(
      sub({ playerAddId: "SAME", playerDropId: "SAME" }),
      ctx({ ownedByManager: new Set(["SAME"]), ownedByLeague: new Set() }),
    );
    expect(e?.code).toBe("drop-equals-add");
  });

  it("rejects an add/drop that breaks a positional cap (GK-for-MID on a full squad)", () => {
    const e = validateBidSubmission(
      sub({ addPosition: "GK", dropPosition: "MID" }),
      ctx(), // full 2/5/5/3 → GK would become 3 (cap 2)
    );
    expect(e?.code).toBe("roster-illegal");
  });

  it("accepts a same-position swap on a full squad (DEF for DEF)", () => {
    expect(
      validateBidSubmission(sub({ addPosition: "DEF", dropPosition: "DEF" }), ctx()),
    ).toBeNull();
  });
});
