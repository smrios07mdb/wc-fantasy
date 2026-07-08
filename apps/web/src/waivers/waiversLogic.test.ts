import { describe, it, expect } from "vitest";
import type { WvClaim, WvPlayer } from "./types";
import {
  buildBatchWindowView,
  claimableFreeAgents,
  composerMaxBid,
  computeBudget,
  droppableRoster,
  freeAgentNations,
  isClaimVoid,
  isPlayerCutoffPassed,
  pendingBidCountByPlayer,
  sortClaims,
  watchedFreeAgents,
} from "./waiversLogic";
import { DEFAULT_FAAB_BATCH_LEAD_MIN, effectiveBatchAt } from "@app/faab";
import { formatInLeagueTz, selectCurrentPeriod } from "@app/shared";

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

describe("budget math (speculative bids: pending may exceed budget)", () => {
  it("available / pending / after reflect all pending claims (computeBudget unchanged)", () => {
    const claims = [claim({ bidId: "1", amount: 24 }), claim({ bidId: "2", amount: 7 })];
    expect(computeBudget(51, claims)).toEqual({ available: 51, pending: 31, after: 20 });
  });

  it("computeBudget's `after` goes negative when pending over-commits (never clamped — S2 overage)", () => {
    const claims = [claim({ bidId: "1", amount: 40 }), claim({ bidId: "2", amount: 30 })];
    expect(computeBudget(51, claims)).toEqual({ available: 51, pending: 70, after: -19 });
  });

  it("composer cap for a bid = the manager's full CURRENT budget (a single bid can't exceed it)", () => {
    // S1: the per-bid cap is the whole budget regardless of other pending claims — the SUM may exceed it.
    expect(composerMaxBid(51)).toBe(51);
    expect(composerMaxBid(0)).toBe(0);
  });
});

describe("claimable free agents (composer left panel)", () => {
  const fas = [
    player({ id: "open-1", position: "FWD", name: "Open One", seasonPoints: 30 }),
    player({ id: "open-2", position: "MID", name: "Open Two", seasonPoints: 50 }),
    player({ id: "closed", position: "MID", name: "Closed", kickoffAt: PAST }),
  ];

  it("excludes players whose cutoff has passed", () => {
    const ids = claimableFreeAgents(fas, NOW).map((p) => p.id);
    expect(ids).not.toContain("closed");
  });

  it("S3: no longer hides a player the manager already has a pending bid on (pool is claims-agnostic)", () => {
    // The old own-bid exclusion is retired — the row stays visible (the UI badges it "Your bid ×N")
    // so a second, different bid can be placed on him. claimableFreeAgents no longer takes the claims.
    const ids = claimableFreeAgents(fas, NOW).map((p) => p.id);
    expect(ids).toContain("open-1");
    expect(ids).toContain("open-2");
  });

  it("filters by position and query, sorts by season points desc", () => {
    expect(claimableFreeAgents(fas, NOW, { position: "MID" }).map((p) => p.id)).toEqual(["open-2"]);
    expect(claimableFreeAgents(fas, NOW, { query: "two" }).map((p) => p.id)).toEqual(["open-2"]);
    expect(claimableFreeAgents(fas, NOW).map((p) => p.id)).toEqual(["open-2", "open-1"]);
  });

  it("filters by nation (the collapsible country filter), ALL is a no-op", () => {
    const pool = [
      player({ id: "es-1", nation: "Spain" }),
      player({ id: "fr-1", nation: "France" }),
      player({ id: "es-2", nation: "Spain" }),
    ];
    expect(
      claimableFreeAgents(pool, NOW, { nation: "Spain" })
        .map((p) => p.id)
        .sort(),
    ).toEqual(["es-1", "es-2"]);
    expect(claimableFreeAgents(pool, NOW, { nation: "ALL" }).length).toBe(3);
    // the nation filter composes with position
    expect(
      claimableFreeAgents(pool, NOW, { nation: "France", position: "GK" }).map((p) => p.id),
    ).toEqual([]);
  });
});

describe("pendingBidCountByPlayer (the 'Your bid ×N' pool-row indicator)", () => {
  it("counts the viewer's live pending claims per add-target player id", () => {
    const claims = [
      claim({ bidId: "1", add: player({ id: "open-1" }) }),
      claim({ bidId: "2", add: player({ id: "open-1" }) }),
      claim({ bidId: "3", add: player({ id: "open-2" }) }),
    ];
    const counts = pendingBidCountByPlayer(claims);
    expect(counts.get("open-1")).toBe(2);
    expect(counts.get("open-2")).toBe(1);
    expect(counts.get("nobody")).toBeUndefined();
  });

  it("is empty for no claims (the free-agency phase — the badge never renders)", () => {
    expect(pendingBidCountByPlayer([]).size).toBe(0);
  });
});

describe("freeAgentNations (the country-filter chip list)", () => {
  it("returns the distinct nations present in the pool, sorted, skipping nulls", () => {
    const pool = [
      player({ id: "a", nation: "Spain" }),
      player({ id: "b", nation: "France" }),
      player({ id: "c", nation: "Spain" }),
      player({ id: "d", nation: null }),
    ];
    expect(freeAgentNations(pool)).toEqual(["France", "Spain"]);
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

describe("batch-window view (the 'next batch' element — phase→label/time in league tz)", () => {
  // America/New_York is UTC−4 in June (EDT) — a deliberately non-UTC league tz so the formatted wall
  // clock differs from the stored UTC instant, proving the Intl conversion really happens.
  const TZ = "America/New_York";
  const BATCH_AT = new Date("2026-06-11T17:00:00.000Z"); // = 1:00 PM EDT
  const KICKOFF = new Date("2026-06-11T18:00:00.000Z"); // = 2:00 PM EDT

  it("sealed-bid: 'Waivers process at {batchTime}' + a live countdown to the batch", () => {
    const w = buildBatchWindowView({
      phase: "sealed-bid",
      periodLabel: "MD1",
      batchAt: BATCH_AT,
      firstKickoffAt: KICKOFF,
      timezone: TZ,
    });
    expect(w.phase).toBe("sealed-bid");
    expect(w.caption).toBe("Waivers process at");
    expect(w.value).toContain("1:00 PM"); // 17:00Z rendered in EDT, NOT the UTC 5:00 PM
    expect(w.value).toContain("EDT"); // reads ET/EDT, not the raw IANA tz
    expect(w.sub).toBe("MD1");
    expect(w.countdownToIso).toBe("2026-06-11T17:00:00.000Z"); // drives the live "Processes in" clock
  });

  it("free-agency: 'Free agency open — locks at {firstKickoff}', no countdown", () => {
    const w = buildBatchWindowView({
      phase: "free-agency",
      periodLabel: "MD1",
      batchAt: BATCH_AT,
      firstKickoffAt: KICKOFF,
      timezone: TZ,
    });
    expect(w.phase).toBe("free-agency");
    expect(w.caption).toBe("Free agency open — locks at");
    expect(w.value).toContain("2:00 PM"); // the first kickoff (18:00Z) in EDT
    expect(w.value).toContain("EDT");
    expect(w.sub).toBe("MD1");
    expect(w.countdownToIso).toBeNull();
  });

  it("locked: 'Waivers locked for {period.label}', no time, no countdown", () => {
    const w = buildBatchWindowView({
      phase: "locked",
      periodLabel: "MD1",
      batchAt: BATCH_AT,
      firstKickoffAt: KICKOFF,
      timezone: TZ,
    });
    expect(w.phase).toBe("locked");
    expect(w.caption).toBe("Waivers locked for");
    expect(w.value).toBe("MD1");
    expect(w.sub).toBeNull();
    expect(w.countdownToIso).toBeNull();
  });

  it("formats in the GIVEN tz — UTC league sees the raw instant, not the EDT wall clock", () => {
    const w = buildBatchWindowView({
      phase: "sealed-bid",
      periodLabel: "MD1",
      batchAt: BATCH_AT,
      firstKickoffAt: KICKOFF,
      timezone: "UTC",
    });
    expect(w.value).toContain("5:00 PM"); // same instant, UTC wall clock
    expect(w.value).toContain("UTC");
  });

  it("sealed-bid with no anchorable batch time (no fixtures, no override) degrades gracefully", () => {
    const w = buildBatchWindowView({
      phase: "sealed-bid",
      periodLabel: "MD1",
      batchAt: null,
      firstKickoffAt: null,
      timezone: TZ,
    });
    expect(w.value).toBe("TBD");
    expect(w.countdownToIso).toBeNull(); // nothing to count down to
  });
});

describe("selectCurrentPeriod (period picker — opensAt never seeded, batchClearedAt advancement)", () => {
  // WC opening day: Group MD1 first kickoff. Non-UTC league tz proves the Intl conversion happens.
  const MD1_KO = new Date("2026-06-11T16:00:00.000Z"); // Group MD1 first kickoff
  const FINAL_KO = new Date("2026-07-19T19:00:00.000Z"); // WC Final kickoff

  const FINAL = {
    id: "final",
    label: "Final",
    status: "pending",
    batchClearedAt: null,
    matches: [{ kickoffAt: FINAL_KO }],
  };
  const MD1 = {
    id: "md1",
    label: "Group MD1",
    status: "pending",
    batchClearedAt: null,
    matches: [{ kickoffAt: MD1_KO }],
  };

  it("on a pre-kickoff opening day returns the EARLIEST pending period, not the alphabetically first", () => {
    // DB returns [Final, MD1] (alphabetical because opensAt is NULL for all periods at provision)
    const picked = selectCurrentPeriod([FINAL, MD1], (p) => p.batchClearedAt === null);
    expect(picked?.id).toBe("md1");
    // Resolved batch instant = MD1 kickoff − 360 min = 10:00Z = 6:00 AM EDT (non-UTC league tz)
    const batchAt = effectiveBatchAt(
      {
        id: "md1",
        leagueId: "l",
        batchClearedAt: null,
        waiverBatchAt: null,
        firstKickoffAt: MD1_KO,
      },
      DEFAULT_FAAB_BATCH_LEAD_MIN * 60_000,
    );
    expect(batchAt?.toISOString()).toBe("2026-06-11T10:00:00.000Z");
    expect(formatInLeagueTz(batchAt!, "America/New_York")).toContain("6:00 AM");
    expect(formatInLeagueTz(batchAt!, "America/New_York")).toContain("EDT");
  });

  it("prefers an open period over the earliest pending", () => {
    const openMd2 = {
      id: "md2",
      label: "Group MD2",
      status: "open",
      batchClearedAt: null,
      matches: [{ kickoffAt: new Date("2026-06-15T16:00:00.000Z") }],
    };
    expect(selectCurrentPeriod([FINAL, openMd2, MD1], (p) => p.batchClearedAt === null)?.id).toBe(
      "md2",
    );
  });

  it("returns null when all periods are closed", () => {
    expect(
      selectCurrentPeriod(
        [
          { ...MD1, status: "closed" },
          { ...FINAL, status: "closed" },
        ],
        (p) => p.batchClearedAt === null,
      ),
    ).toBeNull();
  });

  it("a period with no fixtures sorts last so a period-with-fixtures is preferred", () => {
    const noFixtures = {
      id: "tbd",
      label: "Quarterfinals",
      status: "pending",
      batchClearedAt: null,
      matches: [],
    };
    expect(selectCurrentPeriod([noFixtures, MD1], (p) => p.batchClearedAt === null)?.id).toBe(
      "md1",
    );
  });
});

describe("watchedFreeAgents — the private 'Watched only' filter (T2)", () => {
  const pool = [player({ id: "a" }), player({ id: "b" }), player({ id: "c" })];

  it("empty watched set → no rows", () => {
    expect(watchedFreeAgents(pool, new Set())).toEqual([]);
  });

  it("partial set → only the starred players, input order preserved", () => {
    expect(watchedFreeAgents(pool, new Set(["c", "a"])).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("all watched → the whole pool", () => {
    expect(watchedFreeAgents(pool, new Set(["a", "b", "c"])).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("a starred id no longer in the pool simply drops out (no stale row)", () => {
    expect(watchedFreeAgents(pool, new Set(["a", "gone"])).map((p) => p.id)).toEqual(["a"]);
  });

  it("is pure — does not mutate the input pool", () => {
    const before = pool.map((p) => p.id);
    watchedFreeAgents(pool, new Set(["a"]));
    expect(pool.map((p) => p.id)).toEqual(before);
  });
});
