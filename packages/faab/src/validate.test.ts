import { describe, it, expect } from "vitest";
import { validateBidSubmission, validateFaGrant } from "./validate";
import type {
  BidSubmission,
  BidValidationContext,
  FaGrantSubmission,
  FaGrantValidationContext,
} from "./validate";
import type { PositionCounts } from "./resolve";

/**
 * Submission-time validation (DECISIONS.md §D, "rejected at submission"): a bid is checked the moment
 * it is placed — over-commit, ownership, the acquisition cutoff, and roster legality — so an illegal
 * claim never reaches the batch. Pure: `now` + the cutoff + the manager snapshot are passed in.
 *
 * Per the Theme-D "per-matchday acquisition window" amendment, the cutoff is the add target's PERIOD
 * first kickoff (league-wide), NOT the player's own kickoff — resolved by the IO layer.
 */

const FULL: PositionCounts = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

function ctx(over: Partial<BidValidationContext> = {}): BidValidationContext {
  return {
    now: new Date("2026-06-10T06:00:00Z"),
    faabBudget: 100,
    pendingTotal: 0,
    counts: FULL,
    squadSize: 15,
    rosterCap: 15, // group phase by default; playoff cases override to 9
    ownedByManager: new Set(["DROP"]),
    ownedByLeague: new Set(["DROP"]),
    acquisitionCutoffAt: new Date("2026-06-10T15:00:00Z"), // the period's first kickoff (upcoming)
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

  it("rejects an add whose PERIOD first kickoff has already passed (acquisition window closed)", () => {
    const now = new Date("2026-06-10T16:00:00Z");
    const e = validateBidSubmission(
      sub(),
      ctx({ now, acquisitionCutoffAt: new Date("2026-06-10T15:00:00Z") }),
    );
    expect(e?.code).toBe("add-kicked-off");
  });

  it("accepts when the period's first kickoff is still in the future (window open)", () => {
    const now = new Date("2026-06-10T06:00:00Z");
    expect(
      validateBidSubmission(
        sub(),
        ctx({ now, acquisitionCutoffAt: new Date("2026-06-10T15:00:00Z") }),
      ),
    ).toBeNull();
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

  it("allows GK-for-MID on a full squad now the per-position cap is lifted (Prompt 44 → @app/faab)", () => {
    // Was rejected (GK 2→3 over the old cap of 2); now legal — only the 15-man total is enforced.
    expect(
      validateBidSubmission(sub({ addPosition: "GK", dropPosition: "MID" }), ctx()),
    ).toBeNull();
  });

  it("allows a 4th forward (drop a MID, add a FWD) on a full squad — total stays 15", () => {
    // FULL 2/5/5/3 → add FWD / drop MID ⇒ FWD 3→4, MID 5→4, total 15. Legal now the per-position cap is gone.
    expect(
      validateBidSubmission(sub({ addPosition: "FWD", dropPosition: "MID" }), ctx()),
    ).toBeNull();
  });

  it("accepts a same-position swap on a full squad (DEF for DEF)", () => {
    expect(
      validateBidSubmission(sub({ addPosition: "DEF", dropPosition: "DEF" }), ctx()),
    ).toBeNull();
  });
});

/**
 * $0 free-agency grant validation (DECISIONS.md → Theme D amendment, Prompt 48). Unlike a bid, there is
 * no amount/budget/cutoff check: the cost is $0, and the timing is the WINDOW gate (free-agency phase
 * only) + the snapshot ELIGIBILITY (open-at-batch-clear, not live-unowned). Drop + roster rules are the
 * SAME as a bid (shared `checkDropAndRoster`).
 */
function faCtx(over: Partial<FaGrantValidationContext> = {}): FaGrantValidationContext {
  return {
    windowState: "free-agency",
    faEligible: true,
    counts: FULL,
    squadSize: 15,
    rosterCap: 15, // group phase by default; playoff cases override to 9
    ownedByManager: new Set(["DROP"]),
    dropLocked: false,
    ...over,
  };
}

function faSub(over: Partial<FaGrantSubmission> = {}): FaGrantSubmission {
  return {
    managerId: "A",
    playerAddId: "X",
    addPosition: "MID",
    playerDropId: "DROP",
    dropPosition: "MID",
    ...over,
  };
}

describe("validateFaGrant", () => {
  it("accepts a legal grant in the free-agency phase (returns null)", () => {
    expect(validateFaGrant(faSub(), faCtx())).toBeNull();
  });

  it("rejects when the window is still sealed-bid (bid, don't grab)", () => {
    expect(validateFaGrant(faSub(), faCtx({ windowState: "sealed-bid" }))?.code).toBe(
      "fa-window-closed",
    );
  });

  it("rejects once the window is locked (first kickoff passed)", () => {
    const e = validateFaGrant(faSub(), faCtx({ windowState: "locked" }));
    expect(e?.code).toBe("fa-window-closed");
  });

  it("rejects a target that is not an open free agent (batch-clear snapshot rule)", () => {
    expect(validateFaGrant(faSub(), faCtx({ faEligible: false }))?.code).toBe("fa-not-eligible");
  });

  it("requires a drop once the roster is full", () => {
    const e = validateFaGrant(
      faSub({ playerDropId: null, dropPosition: null }),
      faCtx({ squadSize: 15 }),
    );
    expect(e?.code).toBe("drop-required");
  });

  it("allows a null drop when the roster has an open slot (reinforcement)", () => {
    expect(
      validateFaGrant(
        faSub({ playerDropId: null, dropPosition: null }),
        faCtx({ squadSize: 8, counts: { GK: 1, DEF: 3, MID: 2, FWD: 2 } }),
      ),
    ).toBeNull();
  });

  it("rejects a drop the manager does not own", () => {
    expect(
      validateFaGrant(faSub({ playerDropId: "NOTMINE", dropPosition: "MID" }), faCtx())?.code,
    ).toBe("drop-not-owned");
  });

  it("rejects a drop locked by play (already played this matchday)", () => {
    expect(validateFaGrant(faSub(), faCtx({ dropLocked: true }))?.code).toBe("drop-locked");
  });

  it("rejects a drop equal to the add", () => {
    const e = validateFaGrant(
      faSub({ playerAddId: "SAME", playerDropId: "SAME" }),
      faCtx({ ownedByManager: new Set(["SAME"]) }),
    );
    expect(e?.code).toBe("drop-equals-add");
  });

  it("allows GK-for-MID on a full squad now the per-position cap is lifted (Prompt 44 → @app/faab)", () => {
    // Same lift on the $0 FA path: GK 2→3 was over the old cap; now only the 15-man total gates it.
    expect(validateFaGrant(faSub({ addPosition: "GK", dropPosition: "MID" }), faCtx())).toBeNull();
  });
});

// The squad cap drops 15 → 9 at the group→playoff transition (DECISIONS.md → Theme C/D). The cap is
// INJECTED (`rosterCap`); the IO layer resolves it from `league.status`. These cases pin BOTH entry points.
const PLAYOFF_NINE: PositionCounts = { GK: 1, DEF: 3, MID: 3, FWD: 2 }; // sums to the 9-man playoff cap

describe("roster cap is mode-aware (15 group / 9 playoff)", () => {
  it("bid: blocks an add for an untrimmed 15-man squad carried into the playoff (cap 9)", () => {
    // The trim-miss enforcement: at cap 9 a 15-man roster's add/drop nets 15 > 9 → roster-illegal, so a
    // manager who has not yet trimmed cannot acquire (Theme C: "blocked from FAAB adds until trimmed").
    const e = validateBidSubmission(sub(), ctx({ rosterCap: 9 })); // FULL = 15 actives
    expect(e).toMatchObject({ code: "roster-illegal", cap: 9 });
  });

  it("bid: a full 9-man playoff squad must name a drop", () => {
    const e = validateBidSubmission(
      sub({ playerDropId: null, dropPosition: null }),
      ctx({ counts: PLAYOFF_NINE, squadSize: 9, rosterCap: 9 }),
    );
    expect(e?.code).toBe("drop-required");
  });

  it("bid: a legal add/drop on a 9-man playoff squad passes", () => {
    expect(
      validateBidSubmission(sub(), ctx({ counts: PLAYOFF_NINE, squadSize: 9, rosterCap: 9 })),
    ).toBeNull();
  });

  it("bid: the group cap (15) still admits a swap a 9-cap would block (regression)", () => {
    // Same 9-man squad + a no-drop add: rejected at cap 9 (drop-required) but fine while cap is 15.
    expect(
      validateBidSubmission(
        sub({ playerDropId: null, dropPosition: null }),
        ctx({ counts: PLAYOFF_NINE, squadSize: 9, rosterCap: 15 }),
      ),
    ).toBeNull();
  });

  it("FA grant: shares the playoff cap — a full 9-man squad must name a drop", () => {
    const e = validateFaGrant(
      faSub({ playerDropId: null, dropPosition: null }),
      faCtx({ counts: PLAYOFF_NINE, squadSize: 9, rosterCap: 9 }),
    );
    expect(e?.code).toBe("drop-required");
  });

  it("FA grant: blocks an untrimmed 15-man squad at the playoff cap", () => {
    expect(validateFaGrant(faSub(), faCtx({ rosterCap: 9 }))).toMatchObject({
      code: "roster-illegal",
      cap: 9,
    });
  });
});
