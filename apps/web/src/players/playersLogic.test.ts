/**
 * Pure-logic suite for the /players browser (PLAYERS-1). Every filter is pinned ALONE, then in AND
 * composition; plus sort stability/nulls-last, page slicing, the bid-trailer predicate (all four
 * clauses), and the empty-state labels. No DB, no React — deterministic over injected `now`.
 */
import { describe, it, expect } from "vitest";
import type { PlPlayer, PlStatline } from "./types";
import {
  DEFAULT_PLAYERS_FILTER,
  activeFilterLabels,
  filterPlayers,
  isCutoffPassed,
  isWindowOpen,
  matchesActiveTeams,
  matchesAvailability,
  matchesNation,
  matchesPosition,
  matchesSearch,
  pageSlice,
  playersNations,
  shouldShowBidTrailer,
  sortPlayers,
  type PlayersFilter,
} from "./playersLogic";

const ME = "mgr-me";
const RIVAL = "mgr-rival";

const EMPTY_STATS: PlStatline = {
  pld: 0,
  min: 0,
  goals: 0,
  assists: 0,
  shots: 0,
  keyPasses: 0,
  tackles: 0,
  yellowCards: null,
  cleanSheets: null,
};

function plPlayer(id: string, over: Partial<PlPlayer> = {}): PlPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "MID",
    nation: over.nation ?? "France",
    teamName: over.teamName ?? over.nation ?? "France",
    kickoffAt: over.kickoffAt ?? null,
    seasonPoints: over.seasonPoints ?? null,
    nationAlive: over.nationAlive ?? true,
    owner: over.owner ?? null,
    stats: over.stats ?? EMPTY_STATS,
  };
}

const fa = (id: string, o: Partial<PlPlayer> = {}) => plPlayer(id, { ...o, owner: null });
const ownedBy = (id: string, mgr: string, o: Partial<PlPlayer> = {}) =>
  plPlayer(id, { ...o, owner: { managerId: mgr, name: mgr === ME ? "You" : "Rival FC" } });

const filter = (o: Partial<PlayersFilter> = {}): PlayersFilter => ({
  ...DEFAULT_PLAYERS_FILTER,
  ...o,
});

describe("single filters (each alone)", () => {
  it("matchesSearch is case-insensitive substring; empty ⇒ all", () => {
    const p = plPlayer("x", { name: "Kylian Mbappé" });
    expect(matchesSearch(p, "")).toBe(true);
    expect(matchesSearch(p, "  ")).toBe(true);
    expect(matchesSearch(p, "mbappé")).toBe(true);
    expect(matchesSearch(p, "KYL")).toBe(true);
    expect(matchesSearch(p, "messi")).toBe(false);
  });

  it("matchesPosition gates on the segment; ALL ⇒ all", () => {
    const gk = plPlayer("g", { position: "GK" });
    expect(matchesPosition(gk, "ALL")).toBe(true);
    expect(matchesPosition(gk, "GK")).toBe(true);
    expect(matchesPosition(gk, "FWD")).toBe(false);
  });

  it("matchesAvailability: all / fa / rostered / mine from the viewer's vantage", () => {
    const free = fa("f");
    const mine = ownedBy("m", ME);
    const theirs = ownedBy("t", RIVAL);
    for (const p of [free, mine, theirs]) expect(matchesAvailability(p, "all", ME)).toBe(true);

    expect(matchesAvailability(free, "fa", ME)).toBe(true);
    expect(matchesAvailability(mine, "fa", ME)).toBe(false);

    expect(matchesAvailability(mine, "rostered", ME)).toBe(true);
    expect(matchesAvailability(theirs, "rostered", ME)).toBe(true);
    expect(matchesAvailability(free, "rostered", ME)).toBe(false);

    expect(matchesAvailability(mine, "mine", ME)).toBe(true);
    expect(matchesAvailability(theirs, "mine", ME)).toBe(false);
    expect(matchesAvailability(free, "mine", ME)).toBe(false);
  });

  it("matchesNation gates on the fifa_team.name token; ALL ⇒ all", () => {
    const p = plPlayer("x", { nation: "Brazil" });
    expect(matchesNation(p, "ALL")).toBe(true);
    expect(matchesNation(p, "Brazil")).toBe(true);
    expect(matchesNation(p, "Argentina")).toBe(false);
  });

  it("matchesActiveTeams excludes eliminated nations only when the toggle is on", () => {
    const alive = plPlayer("a", { nationAlive: true });
    const out = plPlayer("o", { nationAlive: false });
    expect(matchesActiveTeams(alive, false)).toBe(true);
    expect(matchesActiveTeams(out, false)).toBe(true); // eliminated visible by default
    expect(matchesActiveTeams(alive, true)).toBe(true);
    expect(matchesActiveTeams(out, true)).toBe(false); // collapsed when on
  });
});

describe("filterPlayers — AND composition", () => {
  const pool = [
    fa("free-fwd-bra", { name: "Rodrygo", position: "FWD", nation: "Brazil", nationAlive: true }),
    ownedBy("mine-mid-fra", ME, { name: "Camavinga", position: "MID", nation: "France" }),
    ownedBy("rival-def-bra", RIVAL, { name: "Marquinhos", position: "DEF", nation: "Brazil" }),
    fa("free-mid-bra-out", {
      name: "Casemiro",
      position: "MID",
      nation: "Brazil",
      nationAlive: false,
    }),
  ];

  it("every clause must pass (fa ∧ Brazil ∧ active-only excludes the eliminated Brazilian FA)", () => {
    const out = filterPlayers(
      pool,
      filter({ availability: "fa", nation: "Brazil", activeTeamsOnly: true }),
      ME,
    );
    expect(out.map((p) => p.id)).toEqual(["free-fwd-bra"]);
  });

  it("mine + position composes", () => {
    const out = filterPlayers(pool, filter({ availability: "mine", position: "MID" }), ME);
    expect(out.map((p) => p.id)).toEqual(["mine-mid-fra"]);
  });

  it("search narrows within the other filters", () => {
    const out = filterPlayers(pool, filter({ query: "cas" }), ME);
    expect(out.map((p) => p.id)).toEqual(["free-mid-bra-out"]);
  });

  it("the default filter returns the whole pool", () => {
    expect(filterPlayers(pool, DEFAULT_PLAYERS_FILTER, ME)).toHaveLength(pool.length);
  });
});

describe("sortPlayers — season points, nulls last, stable name tiebreak", () => {
  it("desc by default; nulls sink to the bottom", () => {
    const pool = [
      plPlayer("a", { name: "A", seasonPoints: 10 }),
      plPlayer("b", { name: "B", seasonPoints: null }),
      plPlayer("c", { name: "C", seasonPoints: 40 }),
    ];
    expect(sortPlayers(pool).map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("asc still keeps nulls LAST (not floated to the top)", () => {
    const pool = [
      plPlayer("a", { name: "A", seasonPoints: 10 }),
      plPlayer("b", { name: "B", seasonPoints: null }),
      plPlayer("c", { name: "C", seasonPoints: 40 }),
    ];
    expect(sortPlayers(pool, "asc").map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("ties break on name (stable + deterministic) in both directions", () => {
    const pool = [
      plPlayer("z", { name: "Zidane", seasonPoints: 20 }),
      plPlayer("a", { name: "Abel", seasonPoints: 20 }),
    ];
    expect(sortPlayers(pool).map((p) => p.id)).toEqual(["a", "z"]);
    expect(sortPlayers(pool, "asc").map((p) => p.id)).toEqual(["a", "z"]);
  });

  it("does not mutate the input", () => {
    const pool = [plPlayer("a", { seasonPoints: 1 }), plPlayer("b", { seasonPoints: 2 })];
    const before = pool.map((p) => p.id);
    sortPlayers(pool);
    expect(pool.map((p) => p.id)).toEqual(before);
  });
});

describe("playersNations", () => {
  it("distinct + sorted, skips null nations", () => {
    const pool = [
      plPlayer("a", { nation: "France" }),
      plPlayer("b", { nation: "Brazil" }),
      plPlayer("c", { nation: "France" }),
      plPlayer("d", { nation: null }),
    ];
    expect(playersNations(pool)).toEqual(["Brazil", "France"]);
  });
});

describe("pageSlice — paged reveal", () => {
  const pool = Array.from({ length: 60 }, (_, i) => plPlayer(`p${i}`, { seasonPoints: 60 - i }));

  it("page 1 ⇒ first 25", () => {
    expect(pageSlice(pool, 1)).toHaveLength(25);
  });
  it("page 2 ⇒ first 50 (cumulative reveal)", () => {
    expect(pageSlice(pool, 2)).toHaveLength(50);
  });
  it("never exceeds the pool length", () => {
    expect(pageSlice(pool, 10)).toHaveLength(60);
  });
  it("custom size", () => {
    expect(pageSlice(pool, 1, 10)).toHaveLength(10);
  });
});

describe("shouldShowBidTrailer — all four clauses", () => {
  const now = new Date("2026-06-11T18:00:00Z");
  const future = "2026-06-11T20:00:00Z"; // cutoff not passed
  const past = "2026-06-11T17:00:00Z"; // cutoff passed

  it("shows for a claimable FA with an OPEN window", () => {
    const p = fa("x", { nationAlive: true, kickoffAt: future });
    expect(shouldShowBidTrailer(p, "sealed-bid", now)).toBe(true);
    expect(shouldShowBidTrailer(p, "free-agency", now)).toBe(true);
  });
  it("hidden when the window is locked/absent", () => {
    const p = fa("x", { nationAlive: true, kickoffAt: future });
    expect(shouldShowBidTrailer(p, "locked", now)).toBe(false);
    expect(shouldShowBidTrailer(p, null, now)).toBe(false);
  });
  it("hidden for a rostered player", () => {
    const p = ownedBy("x", RIVAL, { nationAlive: true, kickoffAt: future });
    expect(shouldShowBidTrailer(p, "sealed-bid", now)).toBe(false);
  });
  it("hidden for an eliminated nation (add-side eliminated gate)", () => {
    const p = fa("x", { nationAlive: false, kickoffAt: future });
    expect(shouldShowBidTrailer(p, "sealed-bid", now)).toBe(false);
  });
  it("hidden once his cutoff has passed", () => {
    const p = fa("x", { nationAlive: true, kickoffAt: past });
    expect(shouldShowBidTrailer(p, "sealed-bid", now)).toBe(false);
  });
  it("a null kickoff never counts as passed", () => {
    const p = fa("x", { nationAlive: true, kickoffAt: null });
    expect(isCutoffPassed(p, now)).toBe(false);
    expect(shouldShowBidTrailer(p, "sealed-bid", now)).toBe(true);
  });
});

describe("isWindowOpen", () => {
  it("open in sealed-bid + free-agency; closed otherwise", () => {
    expect(isWindowOpen("sealed-bid")).toBe(true);
    expect(isWindowOpen("free-agency")).toBe(true);
    expect(isWindowOpen("locked")).toBe(false);
    expect(isWindowOpen(null)).toBe(false);
  });
});

describe("activeFilterLabels — empty-state naming", () => {
  it("names only the non-default filters", () => {
    expect(activeFilterLabels(DEFAULT_PLAYERS_FILTER)).toEqual([]);
    expect(
      activeFilterLabels(
        filter({
          query: "abc",
          position: "GK",
          availability: "mine",
          nation: "Brazil",
          activeTeamsOnly: true,
        }),
      ),
    ).toEqual(["“abc”", "GK", "Your team", "Brazil", "Active teams only"]);
  });
});
