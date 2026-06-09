import { describe, it, expect } from "vitest";
import type { WvClaim, WvPlayer } from "./types";
import {
  claimableFreeAgents,
  composerMaxBid,
  computeBudget,
  droppableRoster,
  isClaimVoid,
  isPlayerCutoffPassed,
  sortClaims,
} from "./waiversLogic";

const NOW = new Date("2026-06-08T12:00:00.000Z");
const FUTURE = "2026-06-08T15:00:00.000Z"; // +3h
const PAST = "2026-06-08T11:00:00.000Z"; // −1h

function player(over: Partial<WvPlayer> & { id: string }): WvPlayer {
  return {
    name: over.name ?? over.id,
    shortName: over.shortName ?? over.id,
    position: over.position ?? "MID",
    nation: over.nation ?? "ESP",
    teamName: over.teamName ?? "Spain",
    kickoffAt: over.kickoffAt ?? FUTURE,
    seasonPoints: over.seasonPoints ?? null,
    ...over,
  };
}

function claim(over: Partial<WvClaim> & { bidId: string }): WvClaim {
  return {
    amount: over.amount ?? 10,
    add: over.add ?? player({ id: `add-${over.bidId}` }),
    drop: over.drop ?? null,
    ...over,
  };
}

describe("cutoff + void derivation (the live void+refund state)", () => {
  it("a future kickoff is open; a past kickoff has passed the cutoff", () => {
    expect(isPlayerCutoffPassed(player({ id: "a", kickoffAt: FUTURE }), NOW)).toBe(false);
    expect(isPlayerCutoffPassed(player({ id: "a", kickoffAt: PAST }), NOW)).toBe(true);
  });

  it("a player with no upcoming fixture never voids on time", () => {
    expect(isPlayerCutoffPassed(player({ id: "a", kickoffAt: null }), NOW)).toBe(false);
  });

  it("a claim is void exactly when its ADD target's match has kicked off", () => {
    expect(isClaimVoid(claim({ bidId: "1", add: player({ id: "x", kickoffAt: PAST }) }), NOW)).toBe(
      true,
    );
    expect(
      isClaimVoid(claim({ bidId: "1", add: player({ id: "x", kickoffAt: FUTURE }) }), NOW),
    ).toBe(false);
  });
});

describe("claim ordering (engine own-bid resolution order)", () => {
  it("sorts by amount descending, stable on ties", () => {
    const claims = [
      claim({ bidId: "b", amount: 5 }),
      claim({ bidId: "a", amount: 20 }),
      claim({ bidId: "c", amount: 20 }),
    ];
    expect(sortClaims(claims).map((c) => c.bidId)).toEqual(["a", "c", "b"]);
  });
});

describe("budget math (engine-consistent: reserves every pending bid)", () => {
  it("available / pending / after reflect all pending claims", () => {
    const claims = [claim({ bidId: "1", amount: 24 }), claim({ bidId: "2", amount: 7 })];
    expect(computeBudget(51, claims)).toEqual({ available: 51, pending: 31, after: 20 });
  });

  it("composer cap for a NEW bid = budget − all other pending", () => {
    const claims = [claim({ bidId: "1", amount: 24 })];
    expect(composerMaxBid(51, claims, null)).toBe(27);
  });

  it("composer cap when EDITING frees the bid's own amount back into the cap", () => {
    const claims = [claim({ bidId: "1", amount: 24 }), claim({ bidId: "2", amount: 7 })];
    // editing bid "1": cap = 51 − (only bid "2" = 7) = 44
    expect(composerMaxBid(51, claims, "1")).toBe(44);
  });

  it("never returns a negative cap", () => {
    const claims = [claim({ bidId: "1", amount: 80 })];
    expect(composerMaxBid(51, claims, null)).toBe(0);
  });
});

describe("claimable free agents (composer left panel)", () => {
  const fas = [
    player({ id: "open-1", position: "FWD", name: "Open One", seasonPoints: 30 }),
    player({ id: "open-2", position: "MID", name: "Open Two", seasonPoints: 50 }),
    player({ id: "closed", position: "MID", name: "Closed", kickoffAt: PAST }),
  ];

  it("excludes players whose cutoff has passed", () => {
    const ids = claimableFreeAgents(fas, [], NOW).map((p) => p.id);
    expect(ids).not.toContain("closed");
  });

  it("excludes a player already named in another pending claim", () => {
    const claims = [claim({ bidId: "1", add: player({ id: "open-1" }) })];
    const ids = claimableFreeAgents(fas, claims, NOW).map((p) => p.id);
    expect(ids).not.toContain("open-1");
  });

  it("re-includes the player when editing THAT claim", () => {
    const claims = [claim({ bidId: "1", add: player({ id: "open-1" }) })];
    const ids = claimableFreeAgents(fas, claims, NOW, { editingBidId: "1" }).map((p) => p.id);
    expect(ids).toContain("open-1");
  });

  it("filters by position and query, sorts by season points desc", () => {
    expect(claimableFreeAgents(fas, [], NOW, { position: "MID" }).map((p) => p.id)).toEqual([
      "open-2",
    ]);
    expect(claimableFreeAgents(fas, [], NOW, { query: "two" }).map((p) => p.id)).toEqual([
      "open-2",
    ]);
    expect(claimableFreeAgents(fas, [], NOW).map((p) => p.id)).toEqual(["open-2", "open-1"]);
  });
});

describe("droppable roster (composer drop picker)", () => {
  it("excludes players locked by play and sorts weakest first", () => {
    const roster = [
      player({ id: "weak", seasonPoints: 5 }),
      player({ id: "strong", seasonPoints: 80 }),
      player({ id: "locked", seasonPoints: 1 }),
    ];
    expect(droppableRoster(roster, ["locked"]).map((p) => p.id)).toEqual(["weak", "strong"]);
  });
});
