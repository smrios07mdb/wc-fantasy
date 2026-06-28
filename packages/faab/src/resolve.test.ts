import { describe, it, expect } from "vitest";
import { resolveFaabBatch } from "./resolve";
import type { BidInput, ManagerState, PositionCounts, ResolveBatchInput } from "./resolve";
import type { Position } from "@app/shared";

/**
 * The pure batch resolver is the heart of the FAAB engine (DECISIONS.md §D). These literal-driven
 * tests pin the 8 locked algorithm steps — especially the two subtle ones: move-to-bottom fires ONLY
 * when the waiver tiebreak is actually used, and a manager's own winning bids resolve highest-first,
 * skipping any that no longer fit.
 */

// ── terse builders ───────────────────────────────────────────────────────────

const FULL_SQUAD: PositionCounts = { GK: 2, DEF: 5, MID: 5, FWD: 3 }; // the locked 15-man squad

/** A manager whose roster is FULL (the group-stage steady state) — every claim must be add/drop. */
function mgr(
  managerId: string,
  waiverOrderPosition: number | null,
  opts: { budget?: number; counts?: PositionCounts; owned?: string[] } = {},
): ManagerState {
  return {
    managerId,
    faabBudget: opts.budget ?? 100,
    waiverOrderPosition,
    counts: opts.counts ?? FULL_SQUAD,
    ownedPlayerIds: opts.owned ?? [],
  };
}

let bidSeq = 0;
/** A bid; add/drop default to a MID-for-MID swap so roster legality is a no-op unless overridden. */
function bid(
  managerId: string,
  playerAddId: string,
  amount: number,
  opts: {
    drop?: string | null;
    addPos?: Position;
    dropPos?: Position | null;
    kickoff?: Date | null;
    dropLocked?: boolean;
    eliminated?: boolean;
    id?: string;
  } = {},
): BidInput {
  const drop = opts.drop === undefined ? `${managerId}-drop` : opts.drop;
  return {
    bidId: opts.id ?? `bid-${++bidSeq}`,
    managerId,
    playerAddId,
    addPosition: opts.addPos ?? "MID",
    addTargetKickoffAt: opts.kickoff ?? null,
    addTeamEliminated: opts.eliminated ?? false,
    playerDropId: drop,
    dropPosition: drop === null ? null : (opts.dropPos ?? "MID"),
    dropLocked: opts.dropLocked ?? false,
    amount,
  };
}

function input(
  managers: ManagerState[],
  bids: BidInput[],
  extra: {
    now?: Date;
    ownedByLeague?: string[];
    rosterCap?: number;
    participantManagerIds?: ReadonlySet<string> | null;
  } = {},
): ResolveBatchInput {
  // Each manager owns its own default drop target so a MID-for-MID swap is always legal.
  const owned = new Set(extra.ownedByLeague ?? []);
  for (const m of managers) for (const p of m.ownedPlayerIds) owned.add(p);
  return {
    now: extra.now ?? new Date("2026-06-10T06:00:00Z"),
    managers,
    bids,
    ownedByLeague: owned,
    rosterCap: extra.rosterCap ?? 15, // group cap by default; playoff cases pass 9
    participantManagerIds: extra.participantManagerIds,
  };
}

function wonBids(out: ReturnType<typeof resolveFaabBatch>) {
  return out.resolutions.filter((r) => r.outcome === "won");
}
function resolutionFor(out: ReturnType<typeof resolveFaabBatch>, bidId: string) {
  return out.resolutions.find((r) => r.bidId === bidId)!;
}

// ── Step 2: highest bid wins ───────────────────────────────────────────────────

describe("resolveFaabBatch — highest bid wins (step 2)", () => {
  it("awards a contested player to the highest bidder; the loser is marked lost", () => {
    const managers = [mgr("A", 1, { owned: ["A-drop"] }), mgr("B", 2, { owned: ["B-drop"] })];
    const hi = bid("A", "X", 30, { id: "hi" });
    const lo = bid("B", "X", 10, { id: "lo" });

    const out = resolveFaabBatch(input(managers, [hi, lo]));

    const won = resolutionFor(out, "hi");
    expect(won.outcome).toBe("won");
    if (won.outcome === "won") {
      expect(won.managerId).toBe("A");
      expect(won.amount).toBe(30);
      expect(won.tiebreakUsed).toBe(false); // won on amount alone
    }
    const lost = resolutionFor(out, "lo");
    expect(lost.outcome).toBe("lost");
    if (lost.outcome === "lost") expect(lost.reason).toBe("outbid");
  });

  it("a $0 uncontested bid wins (minimum bid is legal)", () => {
    const out = resolveFaabBatch(
      input([mgr("A", 1, { owned: ["A-drop"] })], [bid("A", "X", 0, { id: "free" })]),
    );
    const r = resolutionFor(out, "free");
    expect(r.outcome).toBe("won");
    if (r.outcome === "won") {
      expect(r.amount).toBe(0);
      expect(r.tiebreakUsed).toBe(false);
    }
  });

  it("debits only the winning amount from the winner's budget (losers untouched)", () => {
    const managers = [
      mgr("A", 1, { budget: 100, owned: ["A-drop"] }),
      mgr("B", 2, { budget: 100, owned: ["B-drop"] }),
    ];
    const out = resolveFaabBatch(
      input(managers, [bid("A", "X", 30, { id: "hi" }), bid("B", "X", 10, { id: "lo" })]),
    );
    const a = out.budgetDeltas.find((d) => d.managerId === "A")!;
    expect(a.spent).toBe(30);
    expect(a.newBudget).toBe(70);
    // B won nothing → no debit (either absent or zero spend).
    const b = out.budgetDeltas.find((d) => d.managerId === "B");
    expect(b?.spent ?? 0).toBe(0);
  });
});

// ── Steps 3 & 4: tie → waiver order, move-to-bottom ONLY when the tiebreak is used ──────────────

describe("resolveFaabBatch — tie breaks on waiver order; move-to-bottom only when USED", () => {
  it("equal bids on a player break on waiver order (lower position wins) and mark the win tiebreakUsed", () => {
    const managers = [
      mgr("A", 1, { owned: ["A-drop"] }), // higher priority (lower number)
      mgr("B", 2, { owned: ["B-drop"] }),
    ];
    const out = resolveFaabBatch(
      input(managers, [bid("A", "X", 20, { id: "a" }), bid("B", "X", 20, { id: "b" })]),
    );
    const a = resolutionFor(out, "a");
    expect(a.outcome).toBe("won");
    if (a.outcome === "won") expect(a.tiebreakUsed).toBe(true);
    const b = resolutionFor(out, "b");
    expect(b.outcome).toBe("lost");
    if (b.outcome === "lost") expect(b.reason).toBe("lost-tiebreak");
  });

  it("winning on amount alone does NOT move the winner to the bottom (the critical asymmetry)", () => {
    const managers = [mgr("A", 1, { owned: ["A-drop"] }), mgr("B", 2, { owned: ["B-drop"] })];
    // A outbids B on amount — no tie, so the order must NOT change.
    const out = resolveFaabBatch(
      input(managers, [bid("A", "X", 30, { id: "a" }), bid("B", "X", 10, { id: "b" })]),
    );
    expect(out.waiverOrderChanged).toBe(false);
    expect(out.waiverOrder).toEqual([
      { managerId: "A", position: 1 },
      { managerId: "B", position: 2 },
    ]);
  });

  it("a tiebreak winner drops to the bottom immediately, so a second tied player goes to the next priority (no sweep)", () => {
    // Three managers, A highest priority. A and B tie on TWO different players X and Y.
    const managers = [
      mgr("A", 1, { owned: ["A-d1", "A-d2"] }),
      mgr("B", 2, { owned: ["B-d1", "B-d2"] }),
      mgr("C", 3, { owned: ["C-drop"] }),
    ];
    const bids = [
      bid("A", "X", 20, { id: "ax", drop: "A-d1" }),
      bid("B", "X", 20, { id: "bx", drop: "B-d1" }),
      bid("A", "Y", 20, { id: "ay", drop: "A-d2" }),
      bid("B", "Y", 20, { id: "by", drop: "B-d2" }),
    ];
    const out = resolveFaabBatch(input(managers, bids));

    // X resolves first (both at 20): A wins on order → A moves to bottom.
    expect(resolutionFor(out, "ax").outcome).toBe("won");
    // Y: now B is the higher priority of the two tied → B wins Y. A did NOT sweep.
    const by = resolutionFor(out, "by");
    expect(by.outcome).toBe("won");
    if (by.outcome === "won") expect(by.tiebreakUsed).toBe(true);
    expect(resolutionFor(out, "ay").outcome).toBe("lost");

    // Both A and B used their tiebreak, so BOTH dropped to the bottom in turn: A first (winning X),
    // then B (winning Y) — leaving the final order C, A, B. C never bid yet rises to the top. The
    // order stays a contiguous 1..N permutation throughout.
    expect(out.waiverOrderChanged).toBe(true);
    expect(out.waiverOrder).toEqual([
      { managerId: "C", position: 1 },
      { managerId: "A", position: 2 },
      { managerId: "B", position: 3 },
    ]);
  });
});

// ── Step 5: a manager's own winning bids resolve highest-first, skipping any that no longer fit ──────

describe("resolveFaabBatch — own multiple wins resolve highest-first, skipping the unfit (step 5)", () => {
  it("skips a lower own bid whose drop was already consumed by the higher own bid", () => {
    // A bids on X (30) and Y (20), BOTH dropping the same Z. Highest-first: X wins (drops Z); then the
    // Y bid's drop Z is no longer owned → skipped (lost, drop-invalid). No double-drop.
    const managers = [mgr("A", 1, { owned: ["Z"] })];
    const bids = [
      bid("A", "X", 30, { id: "ax", drop: "Z" }),
      bid("A", "Y", 20, { id: "ay", drop: "Z" }),
    ];
    const out = resolveFaabBatch(input(managers, bids));

    expect(resolutionFor(out, "ax").outcome).toBe("won");
    const ay = resolutionFor(out, "ay");
    expect(ay.outcome).toBe("lost");
    if (ay.outcome === "lost") expect(ay.reason).toBe("drop-invalid");
    // Only the won bid debited.
    expect(out.budgetDeltas).toEqual([{ managerId: "A", spent: 30, newBudget: 70 }]);
  });

  it("skips a lower own bid once the budget is exhausted by the higher one", () => {
    const managers = [mgr("A", 1, { budget: 30, owned: ["Z1", "Z2"] })];
    const bids = [
      bid("A", "X", 30, { id: "ax", drop: "Z1" }),
      bid("A", "Y", 20, { id: "ay", drop: "Z2" }),
    ];
    const out = resolveFaabBatch(input(managers, bids));
    expect(resolutionFor(out, "ax").outcome).toBe("won");
    const ay = resolutionFor(out, "ay");
    expect(ay.outcome).toBe("lost");
    if (ay.outcome === "lost") expect(ay.reason).toBe("budget-exhausted");
  });

  it("two own wins both land (highest-first) and the budget delta sums them", () => {
    const managers = [mgr("A", 1, { budget: 100, owned: ["Z1", "Z2"] })];
    const bids = [
      bid("A", "X", 30, { id: "ax", drop: "Z1" }),
      bid("A", "Y", 20, { id: "ay", drop: "Z2" }),
    ];
    const out = resolveFaabBatch(input(managers, bids));
    expect(
      wonBids(out)
        .map((r) => r.bidId)
        .sort(),
    ).toEqual(["ax", "ay"]);
    expect(out.budgetDeltas).toEqual([{ managerId: "A", spent: 50, newBudget: 50 }]);
  });

  it("allows an own win that changes the position shape now the cap is lifted (GK for MID; total stays 15)", () => {
    // A's roster is full; a GK add dropping a MID pushes GK to 3 / MID to 4 (total 15). Was skipped on
    // the old 2/5/5/3 cap (roster-illegal); now it wins — only the 15-man total gates a claim.
    const managers = [mgr("A", 1, { owned: ["Z"] })];
    const bids = [bid("A", "K", 10, { id: "ak", drop: "Z", addPos: "GK", dropPos: "MID" })];
    const out = resolveFaabBatch(input(managers, bids));
    expect(resolutionFor(out, "ak").outcome).toBe("won");
    expect(out.budgetDeltas).toEqual([{ managerId: "A", spent: 10, newBudget: 90 }]);
  });
});

// ── Step 1: void + refund when the add target already kicked off ────────────────

describe("resolveFaabBatch — void + refund the kicked-off add target (step 1)", () => {
  it("voids a bid whose add target kicked off at `now` (no budget change) and it does not compete", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const past = new Date("2026-06-10T11:00:00Z"); // kicked off an hour ago
    const future = new Date("2026-06-10T15:00:00Z");
    const managers = [mgr("A", 1, { owned: ["A-drop"] }), mgr("B", 2, { owned: ["B-drop"] })];
    // A bid higher but his add target already kicked off → voided; B (lower, still upcoming) wins X.
    const bids = [
      bid("A", "X", 50, { id: "a", kickoff: past }),
      bid("B", "X", 10, { id: "b", kickoff: future }),
    ];
    const out = resolveFaabBatch(input(managers, bids, { now }));

    expect(resolutionFor(out, "a").outcome).toBe("voided_refunded");
    expect(resolutionFor(out, "b").outcome).toBe("won");
    // A was never debited (refund = no change); B paid 10.
    expect(out.budgetDeltas).toEqual([{ managerId: "B", spent: 10, newBudget: 90 }]);
  });

  it("treats kickoff exactly at `now` as already kicked off (closed)", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const out = resolveFaabBatch(
      input([mgr("A", 1, { owned: ["A-drop"] })], [bid("A", "X", 5, { id: "a", kickoff: now })], {
        now,
      }),
    );
    expect(resolutionFor(out, "a").outcome).toBe("voided_refunded");
  });
});

// ── Eliminated-team add target: void + refund (DECISIONS §D add gate; sibling of the step-1 kickoff void) ──
describe("resolveFaabBatch — void + refund an eliminated-team add target (add-side only)", () => {
  it("voids+refunds an eliminated-team bid with NO budget debit, NO roster change, NO waiver move", () => {
    const managers = [mgr("A", 1, { budget: 100, owned: ["A-drop"] })];
    const out = resolveFaabBatch(
      input(managers, [bid("A", "ELIM", 50, { id: "e", eliminated: true })]),
    );
    expect(resolutionFor(out, "e").outcome).toBe("voided_refunded");
    // Refund = the budget was never debited; the manager keeps 100 (no delta row, like a kicked-off void).
    expect(out.budgetDeltas).toEqual([]);
    // No tiebreak ⇒ no move-to-bottom; the seeded order is untouched.
    expect(out.waiverOrderChanged).toBe(false);
    expect(out.waiverOrder).toEqual([{ managerId: "A", position: 1 }]);
  });

  it("an eliminated-team add never competes — a valid bid on ANOTHER player still wins (no interference)", () => {
    const managers = [mgr("A", 1, { owned: ["A-drop"] }), mgr("B", 2, { owned: ["B-drop"] })];
    const out = resolveFaabBatch(
      input(managers, [
        bid("A", "ELIM", 50, { id: "a-elim", eliminated: true }),
        bid("B", "GOOD", 10, { id: "b-good" }),
      ]),
    );
    expect(resolutionFor(out, "a-elim").outcome).toBe("voided_refunded");
    expect(resolutionFor(out, "b-good").outcome).toBe("won");
    expect(out.budgetDeltas).toEqual([{ managerId: "B", spent: 10, newBudget: 90 }]);
  });

  it("both bids on the SAME eliminated player are voided (the whole player is off the wire)", () => {
    const managers = [mgr("A", 1, { owned: ["A-drop"] }), mgr("B", 2, { owned: ["B-drop"] })];
    const out = resolveFaabBatch(
      input(managers, [
        bid("A", "ELIM", 50, { id: "a", eliminated: true }),
        bid("B", "ELIM", 40, { id: "b", eliminated: true }),
      ]),
    );
    expect(resolutionFor(out, "a").outcome).toBe("voided_refunded");
    expect(resolutionFor(out, "b").outcome).toBe("voided_refunded");
    expect(out.budgetDeltas).toEqual([]);
  });

  it("is inert when addTeamEliminated is false/absent — an alive-team bid wins as before (byte-identical)", () => {
    const managers = [mgr("A", 1, { owned: ["A-drop"] })];
    const out = resolveFaabBatch(
      input(managers, [bid("A", "X", 5, { id: "x", eliminated: false })]),
    );
    expect(resolutionFor(out, "x").outcome).toBe("won");
  });
});

// ── add target already owned league-wide ────────────────────────────────────────

describe("resolveFaabBatch — add target off the wire", () => {
  it("marks a bid lost when its add target is already owned league-wide", () => {
    const out = resolveFaabBatch(
      input([mgr("A", 1, { owned: ["A-drop"] })], [bid("A", "TAKEN", 40, { id: "a" })], {
        ownedByLeague: ["TAKEN"],
      }),
    );
    const r = resolutionFor(out, "a");
    expect(r.outcome).toBe("lost");
    if (r.outcome === "lost") expect(r.reason).toBe("add-unavailable");
  });
});

// ── Step 8: contiguity preserved across multiple moves, untouched + unseeded managers ───────────────

describe("resolveFaabBatch — waiver-order contiguity (step 8)", () => {
  it("keeps a contiguous 1..N permutation after a move, leaving non-bidders in place", () => {
    // 4 seeded managers; only A and B tie (on X). A wins → bottom. C and D never bid.
    const managers = [
      mgr("A", 1, { owned: ["A-drop"] }),
      mgr("B", 2, { owned: ["B-drop"] }),
      mgr("C", 3),
      mgr("D", 4),
    ];
    const out = resolveFaabBatch(
      input(managers, [bid("A", "X", 15, { id: "a" }), bid("B", "X", 15, { id: "b" })]),
    );
    // A used the tiebreak → bottom; B, C, D shift up one, order otherwise preserved.
    expect(out.waiverOrder).toEqual([
      { managerId: "B", position: 1 },
      { managerId: "C", position: 2 },
      { managerId: "D", position: 3 },
      { managerId: "A", position: 4 },
    ]);
  });

  it("an unseeded (null-position) manager never wins a tie and is absent from the order", () => {
    // A is unseeded (null). A and B tie; B (seeded) must win because null sorts last.
    const managers = [mgr("A", null, { owned: ["A-drop"] }), mgr("B", 1, { owned: ["B-drop"] })];
    const out = resolveFaabBatch(
      input(managers, [bid("A", "X", 20, { id: "a" }), bid("B", "X", 20, { id: "b" })]),
    );
    expect(resolutionFor(out, "b").outcome).toBe("won");
    expect(resolutionFor(out, "a").outcome).toBe("lost");
    // B won on the tiebreak → moves to bottom of the seeded order (just [B]).
    expect(out.waiverOrder).toEqual([{ managerId: "B", position: 1 }]);
  });
});

// ── Step 2/3: tied top amounts ACROSS players are processed in WAIVER ORDER, not by player id ────────

describe("resolveFaabBatch — cross-player ties processed by the leading bidder's waiver position", () => {
  it("processes two equally-topped players in leader-waiver order, not alphabetical, so move-to-bottom sequences correctly", () => {
    // A(1), B(2), C(3). Player "zzz" is tied A=50 vs C=50 (leader A, pos 1). Player "aaa" is tied
    // B=50 vs C=50 (leader B, pos 2). C contends both, loses both. By WAIVER order "zzz" (leader A,
    // pos 1) is processed first; by the OLD player-id order "aaa" would go first — which would invert
    // the final waiver order. Winners are the same either way; the ORDER is what this pins.
    const managers = [
      mgr("A", 1, { owned: ["A1"] }),
      mgr("B", 2, { owned: ["B1"] }),
      mgr("C", 3, { budget: 100, owned: ["C1", "C2"] }),
    ];
    const bids = [
      bid("A", "zzz", 50, { id: "a-zzz", drop: "A1" }),
      bid("C", "zzz", 50, { id: "c-zzz", drop: "C1" }),
      bid("B", "aaa", 50, { id: "b-aaa", drop: "B1" }),
      bid("C", "aaa", 50, { id: "c-aaa", drop: "C2" }),
    ];
    const out = resolveFaabBatch(input(managers, bids));

    // Winners: A wins zzz (tiebreak vs C), B wins aaa (tiebreak vs C), C wins nothing.
    expect(resolutionFor(out, "a-zzz").outcome).toBe("won");
    expect(resolutionFor(out, "b-aaa").outcome).toBe("won");
    expect(resolutionFor(out, "c-zzz").outcome).toBe("lost");
    expect(resolutionFor(out, "c-aaa").outcome).toBe("lost");

    // The ORDER decides the final waiver order. Correct (waiver) order: zzz first → A→bottom [B,C,A];
    // then aaa → B→bottom [C,A,B] ⇒ A ABOVE B. The old player-id order ("aaa" first) would yield
    // [C,B,A] (B above A) — so this assertion fails on the buggy ordering.
    expect(out.waiverOrder).toEqual([
      { managerId: "C", position: 1 },
      { managerId: "A", position: 2 },
      { managerId: "B", position: 3 },
    ]);
  });
});

// ── Step 5 / DECISIONS §B lock-on-play: a drop locked by play is invalid, the batch skips it ─────────

describe("resolveFaabBatch — a locked-lineup drop is skipped (drop-invalid)", () => {
  it("skips a winning bid whose drop is locked, passing the player to the next valid bid", () => {
    // A's bid is higher but its drop is LOCKED (he has played this matchday) → invalid, skipped. The
    // player falls to B (lower bid, valid drop), who wins.
    const managers = [mgr("A", 1, { owned: ["A-locked"] }), mgr("B", 2, { owned: ["B-drop"] })];
    const bids = [
      bid("A", "X", 40, { id: "a", drop: "A-locked", dropLocked: true }),
      bid("B", "X", 10, { id: "b", drop: "B-drop" }),
    ];
    const out = resolveFaabBatch(input(managers, bids));

    const a = resolutionFor(out, "a");
    expect(a.outcome).toBe("lost");
    if (a.outcome === "lost") expect(a.reason).toBe("drop-invalid");
    expect(resolutionFor(out, "b").outcome).toBe("won");
    // A's drop never happened → no debit for A.
    expect(out.budgetDeltas).toEqual([{ managerId: "B", spent: 10, newBudget: 90 }]);
  });
});

describe("playoff phase — the injected squad cap (rosterCap) drops 15 → 9", () => {
  const EIGHT: PositionCounts = { GK: 1, DEF: 3, MID: 3, FWD: 1 }; // 8 actives — room for exactly ONE add

  it("awards only ONE of two stacked no-drop wins (the second would push 9 → 10 > cap 9)", () => {
    // Submission validates each no-drop bid independently (8 < 9, both pass), so the BATCH is the only
    // place the CUMULATIVE over-cap is caught — hence the resolver must be mode-aware too, not just the
    // submission validator. P1 (id asc) resolves first → won; P2 then finds the squad at 9 → roster-illegal.
    const a = mgr("A", 1, { counts: EIGHT });
    const out = resolveFaabBatch(
      input(
        [a],
        [
          bid("A", "P1", 10, { drop: null, id: "a1" }),
          bid("A", "P2", 10, { drop: null, id: "a2" }),
        ],
        { rosterCap: 9 },
      ),
    );
    expect(resolutionFor(out, "a1").outcome).toBe("won");
    const second = resolutionFor(out, "a2");
    expect(second.outcome).toBe("lost");
    if (second.outcome === "lost") expect(second.reason).toBe("roster-illegal");
  });

  it("the SAME two no-drop bids both clear under the group cap (15) — regression", () => {
    const a = mgr("A", 1, { counts: EIGHT });
    const out = resolveFaabBatch(
      input(
        [a],
        [
          bid("A", "P1", 10, { drop: null, id: "a1" }),
          bid("A", "P2", 10, { drop: null, id: "a2" }),
        ],
      ),
    );
    expect(wonBids(out)).toHaveLength(2);
  });
});

// ── D4 (trim-down): the non-participant resolver backstop ───────────────────────
describe("non-participant backstop (playoff)", () => {
  it("voids + refunds a non-participant's bid that reaches the batch, awarding the participant", () => {
    const alive = mgr("ALIVE", 1, { owned: ["ALIVE-drop"] });
    const cut = mgr("CUT", 2, { owned: ["CUT-drop"] });
    const cutBid = bid("CUT", "STAR", 50); // higher amount, but not a participant
    const aliveBid = bid("ALIVE", "STAR", 10);
    const out = resolveFaabBatch(
      input([alive, cut], [cutBid, aliveBid], { participantManagerIds: new Set(["ALIVE"]) }),
    );
    expect(resolutionFor(out, cutBid.bidId).outcome).toBe("voided_refunded");
    expect(resolutionFor(out, aliveBid.bidId).outcome).toBe("won"); // ALIVE wins despite the lower bid
  });

  it("is inert when participantManagerIds is absent — everyone competes (group byte-identical)", () => {
    const a = mgr("A", 1, { owned: ["A-drop"] });
    const b = mgr("B", 2, { owned: ["B-drop"] });
    const bHi = bid("B", "STAR", 50);
    const aLo = bid("A", "STAR", 10);
    const out = resolveFaabBatch(input([a, b], [bHi, aLo])); // no participant set
    expect(resolutionFor(out, bHi.bidId).outcome).toBe("won"); // B wins on amount, never voided
  });
});
