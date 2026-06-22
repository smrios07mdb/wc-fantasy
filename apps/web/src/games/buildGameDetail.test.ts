/**
 * Pure unit suite for {@link buildGameDetail} — the T5/T6 box-score + fantasy-overlay assembly. No DB,
 * no DOM: injected rows in, view-model out. Pins the role grouping, the card classification (incl. the
 * out-of-scope 2nd-yellow staying a 2nd yellow), sub on/off, the owner overlay states, the team-name
 * fallback, and the period-null degradation.
 */
import { describe, it, expect } from "vitest";
import { buildGameDetail } from "./buildGameDetail";
import { UNNAMED_OPPONENT } from "@/src/lineup/view";
import type { BuildGameDetailInput, OwnerTag } from "./types";

function baseMatch(
  over: Partial<BuildGameDetailInput["match"]> = {},
): BuildGameDetailInput["match"] {
  return {
    matchId: "m1",
    status: "completed",
    kickoffIso: "2026-06-21T18:00:00.000Z",
    homeTeamId: "home",
    awayTeamId: "away",
    homeTeamName: "HT",
    awayTeamName: "AT",
    homeScore: 2,
    awayScore: 1,
    periodId: "per1",
    periodKind: "group_md",
    periodLabel: "Group A · MD1",
    round: "1",
    ...over,
  };
}

const owner = (managerId: string, state: OwnerTag["state"], isMe = false): OwnerTag => ({
  managerId,
  managerName: managerId === "M1" ? "Alice" : "Bob",
  isMe,
  state,
});

function fullInput(): BuildGameDetailInput {
  return {
    match: baseMatch(),
    players: [
      {
        id: "p1",
        displayName: "GK One",
        firstName: "G",
        lastName: "One",
        position: "GK",
        teamId: "home",
        nation: "HT",
      },
      {
        id: "p2",
        displayName: "Def Two",
        firstName: "D",
        lastName: "Two",
        position: "DEF",
        teamId: "home",
        nation: "HT",
      },
      {
        id: "p3",
        displayName: "Mid Three",
        firstName: "M",
        lastName: "Three",
        position: "MID",
        teamId: "home",
        nation: "HT",
      },
      {
        id: "p4",
        displayName: "Fwd Four",
        firstName: "F",
        lastName: "Four",
        position: "FWD",
        teamId: "home",
        nation: "HT",
      },
      {
        id: "p5",
        displayName: "Mid Five",
        firstName: "M",
        lastName: "Five",
        position: "MID",
        teamId: "away",
        nation: "AT",
      },
      {
        id: "p6",
        displayName: "Fwd Six",
        firstName: "F",
        lastName: "Six",
        position: "FWD",
        teamId: "away",
        nation: "AT",
      },
      // p7 plays for a team that is NEITHER side of this match → unplaceable (counted, not shown).
      {
        id: "p7",
        displayName: "Stray Seven",
        firstName: "S",
        lastName: "Seven",
        position: "DEF",
        teamId: "other",
        nation: "OT",
      },
    ],
    stats: [
      { playerId: "p1", minutesPlayed: 90, goals: null, assists: null, saves: 3 },
      { playerId: "p5", minutesPlayed: 75, goals: null, assists: null, saves: null },
      { playerId: "p6", minutesPlayed: 90, goals: 1, assists: 1, saves: null },
    ],
    scores: [
      { playerId: "p1", points: 6 },
      { playerId: "p2", points: -2 },
      { playerId: "p3", points: 1 },
      { playerId: "p5", points: 2 },
      { playerId: "p6", points: 4 },
    ],
    ratings: [
      { playerId: "p1", source: "balldontlie", rating: 6.8 },
      // p6 has BOTH sources — manual must win over balldontlie (DEFAULT_RATING_SOURCE_PRIORITY).
      { playerId: "p6", source: "balldontlie", rating: 8.0 },
      { playerId: "p6", source: "manual", rating: 7.5 },
      // p2 has a present-but-null balldontlie row → falls through to "no rating".
      { playerId: "p2", source: "balldontlie", rating: null },
    ],
    lineupEntries: [
      { playerId: "p1", isStarter: true },
      { playerId: "p2", isStarter: true },
      { playerId: "p4", isStarter: false },
      { playerId: "p5", isStarter: true },
    ],
    events: [
      {
        playerId: null,
        playerInId: "p3",
        playerOutId: null, // p3 came on; who he replaced isn't modelled here (p4 stays unused bench)
        incidentType: "substitution",
        incidentClass: null,
        minute: 60,
        rescinded: false,
      },
      {
        playerId: "p5",
        playerInId: null,
        playerOutId: null,
        incidentType: "card",
        incidentClass: "yellow",
        minute: 30,
        rescinded: false,
      },
      {
        playerId: "p5",
        playerInId: null,
        playerOutId: null,
        incidentType: "card",
        incidentClass: "yellow",
        minute: 70,
        rescinded: false,
      },
      {
        playerId: null,
        playerInId: null, // p6 did NOT come on (he appeared via a stat row, no sheet → inferred starter)
        playerOutId: "p5", // p5 (sheet starter) is withdrawn at 75'
        incidentType: "substitution",
        incidentClass: null,
        minute: 75,
        rescinded: false,
      },
      {
        playerId: "p2",
        playerInId: null,
        playerOutId: null,
        incidentType: "card",
        incidentClass: "red",
        minute: 80,
        rescinded: false,
      },
      // rescinded card for p1 — must NOT count.
      {
        playerId: "p1",
        playerInId: null,
        playerOutId: null,
        incidentType: "card",
        incidentClass: "yellow",
        minute: 50,
        rescinded: true,
      },
      // a non-card VAR-ish row — must NOT be classified as a card.
      {
        playerId: "p6",
        playerInId: null,
        playerOutId: null,
        incidentType: "varDecision",
        incidentClass: "goalAwarded",
        minute: 41,
        rescinded: false,
      },
    ],
    ownerByPlayer: {
      p1: owner("M1", "started", true),
      p2: owner("M1", "benched", true),
      p3: owner("M2", "owned"),
    },
    unresolvedFromPool: 1,
  };
}

describe("buildGameDetail — assembly", () => {
  it("groups each side into starters / subs / bench and orders by position", () => {
    const v = buildGameDetail(fullInput());
    expect(v.home.starters.map((l) => l.playerId)).toEqual(["p1", "p2"]); // GK then DEF
    expect(v.home.subs.map((l) => l.playerId)).toEqual(["p3"]); // came on at 60'
    expect(v.home.bench.map((l) => l.playerId)).toEqual(["p4"]); // sheet bench, never appeared
    // p5 (lineup starter) + p6 (appeared, no sheet → inferred starter), ordered MID before FWD.
    expect(v.away.starters.map((l) => l.playerId)).toEqual(["p5", "p6"]);
    expect(v.away.subs).toEqual([]);
    expect(v.away.bench).toEqual([]);
    expect(v.empty).toBe(false);
  });

  it("folds fantasy points + stat chips per participant (not just rostered players)", () => {
    const v = buildGameDetail(fullInput());
    const p1 = v.home.starters.find((l) => l.playerId === "p1")!;
    expect(p1.fantasyPoints).toBe(6);
    expect(p1.chips).toEqual([{ label: "SV", value: "3" }]); // GK saves chip
    const p6 = v.away.starters.find((l) => l.playerId === "p6")!;
    expect(p6.fantasyPoints).toBe(4);
    expect(p6.chips).toEqual([
      { label: "G", value: "1" },
      { label: "A", value: "1" },
    ]);
    const p4 = v.home.bench[0]!;
    expect(p4.fantasyPoints).toBeNull(); // unused bench, no score row
    expect(p4.appeared).toBe(false);
  });

  it("resolves the per-player rating via the shared resolver (manual > balldontlie; null when absent or present-but-null)", () => {
    const v = buildGameDetail(fullInput());
    const p1 = v.home.starters.find((l) => l.playerId === "p1")!;
    expect(p1.rating).toBe(6.8); // single balldontlie source
    const p6 = v.away.starters.find((l) => l.playerId === "p6")!;
    expect(p6.rating).toBe(7.5); // manual (7.5) overrides balldontlie (8.0) per DEFAULT priority
    const p2 = v.home.starters.find((l) => l.playerId === "p2")!;
    expect(p2.rating).toBeNull(); // present-but-null source falls through to "no rating"
    const p3 = v.home.subs[0]!;
    expect(p3.rating).toBeNull(); // no rating row at all → null (renders "–")
  });

  it("classifies cards exactly (rescinded ignored, non-card ignored, 2nd yellow stays a 2nd yellow)", () => {
    const v = buildGameDetail(fullInput());
    const p1 = v.home.starters.find((l) => l.playerId === "p1")!;
    expect(p1.yellowCards).toBe(0); // rescinded card does not count
    const p2 = v.home.starters.find((l) => l.playerId === "p2")!;
    expect(p2.redCard).toBe(true);
    const p5 = v.away.starters.find((l) => l.playerId === "p5")!;
    expect(p5.yellowCards).toBe(2); // banding OUT OF SCOPE — two yellows shown as two yellows
    expect(p5.redCard).toBe(false);
  });

  it("derives sub on/off minutes and the inferred role", () => {
    const v = buildGameDetail(fullInput());
    const p3 = v.home.subs[0]!;
    expect(p3.role).toBe("sub");
    expect(p3.cameOnMinute).toBe(60);
    const p5 = v.away.starters.find((l) => l.playerId === "p5")!;
    expect(p5.wentOffMinute).toBe(75);
    expect(p5.role).toBe("starter");
  });

  it("attaches the owner overlay (started / benched / owned) independent of the real-match role", () => {
    const v = buildGameDetail(fullInput());
    const p1 = v.home.starters.find((l) => l.playerId === "p1")!;
    expect(p1.owner).toEqual({
      managerId: "M1",
      managerName: "Alice",
      isMe: true,
      state: "started",
    });
    const p2 = v.home.starters.find((l) => l.playerId === "p2")!;
    // p2 is a real-match STARTER but his fantasy manager BENCHED him — the two are orthogonal.
    expect(p2.owner?.state).toBe("benched");
    const p3 = v.home.subs[0]!;
    expect(p3.owner?.state).toBe("owned");
    const p6 = v.away.starters.find((l) => l.playerId === "p6")!;
    expect(p6.owner).toBeNull(); // unowned by any manager
  });

  it("counts unresolved participants (no player row) + unplaceable (wrong team) honestly", () => {
    const v = buildGameDetail(fullInput());
    // p7 plays for neither side → unplaced(1); plus unresolvedFromPool(1).
    expect(v.unresolvedParticipants).toBe(2);
    const ids = [...v.home.starters, ...v.home.subs, ...v.home.bench, ...v.away.starters].map(
      (l) => l.playerId,
    );
    expect(ids).not.toContain("p7");
  });

  it("emits a deterministic UTC kickoff label and the canonical matchday label", () => {
    const v = buildGameDetail(fullInput());
    expect(v.header.kickoffLabel).toBe("Sun 21 Jun · 18:00");
    expect(v.header.matchdayLabel).toBe("Group A · MD1"); // period.label, NOT round
    expect(v.header.hasFantasyOverlay).toBe(true);
  });

  it("never surfaces a team UUID — an unnamed team falls back to UNNAMED_OPPONENT", () => {
    const input = fullInput();
    const v = buildGameDetail({
      ...input,
      match: baseMatch({ homeTeamName: null }),
    });
    expect(v.home.teamName).toBe(UNNAMED_OPPONENT);
    expect(v.home.teamCode).toBeNull();
    expect(v.away.teamName).toBe("AT");
  });

  it("degrades cleanly when the match has no fantasy period (no overlay, no tap-to-breakdown)", () => {
    const input = fullInput();
    const v = buildGameDetail({
      ...input,
      match: baseMatch({ periodId: null }),
      ownerByPlayer: {}, // loader leaves it empty when there is no period link
    });
    expect(v.periodId).toBeNull();
    expect(v.header.hasFantasyOverlay).toBe(false);
    const allLines = [...v.home.starters, ...v.home.subs, ...v.home.bench, ...v.away.starters];
    expect(allLines.every((l) => l.owner === null)).toBe(true);
    // Fantasy POINTS still render — they are match-keyed and exist independently of the period.
    expect(v.home.starters.find((l) => l.playerId === "p1")!.fantasyPoints).toBe(6);
  });

  it("is empty when there is no squad sheet and nobody has scored/appeared", () => {
    const v = buildGameDetail({
      match: baseMatch(),
      players: [],
      stats: [],
      scores: [],
      ratings: [],
      lineupEntries: [],
      events: [],
      ownerByPlayer: {},
      unresolvedFromPool: 0,
    });
    expect(v.empty).toBe(true);
    expect(v.home.starters).toEqual([]);
    expect(v.away.starters).toEqual([]);
    expect(v.unresolvedParticipants).toBe(0);
  });
});
