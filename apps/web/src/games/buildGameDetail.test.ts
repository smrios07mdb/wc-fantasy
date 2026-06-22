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
    teamStats: [
      {
        teamId: "home",
        possession: 61,
        offsides: 2,
        shotsBlocked: 3,
        extra: {
          expected_goals: 1.84,
          big_chances: 4,
          shots_total: 14,
          shots_on_target: 6,
          hit_woodwork: 1,
          corners: 7,
          passes_total: 540,
          passes_accurate: 470,
          tackles: 14,
          interceptions: 9,
          clearances: 12,
          ground_duels_won: 23,
          ground_duels_total: 40,
          aerial_duels_won: 8,
          aerial_duels_total: 15,
          saves: 2,
          fouls: 9,
          yellow_cards: 1,
        },
      },
      {
        teamId: "away",
        possession: 39,
        offsides: 1,
        shotsBlocked: 1,
        extra: {
          expected_goals: 0.42,
          big_chances: 1,
          shots_total: 6,
          shots_on_target: 2,
          // hit_woodwork absent on away → woodwork away = null
          corners: 2,
          passes_total: 320,
          passes_accurate: 250,
          tackles: 18,
          interceptions: 6,
          clearances: 22,
          // duel keys absent on away → duelPct away = null
          saves: 5,
          fouls: 12,
          yellow_cards: 2,
        },
      },
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
        playerInId: null, // p6's come-on lacks an id; he's OFF the sheet but the side HAS one → Sub, not XI
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
    // away HAS a sheet (p5): only p5 is an official starter. p6 appeared but is OFF the sheet (a
    // come-on with no player_in id) → Subs, never inferred into the Starting XI.
    expect(v.away.starters.map((l) => l.playerId)).toEqual(["p5"]);
    expect(v.away.subs.map((l) => l.playerId)).toEqual(["p6"]);
    expect(v.away.bench).toEqual([]);
    expect(v.empty).toBe(false);
  });

  // ── lists honor the official sheet when present (Starting XI == pitch; off-sheet come-on → Subs) ──
  it("classifies STRICTLY by the official sheet when the side has one — an off-sheet appearance is a Sub, never a starter", () => {
    const v = buildGameDetail(fullInput());
    // away HAS an official sheet (p5 ∈ match_lineup_entry). p6 appeared with NO sheet entry — a come-on
    // whose player_in event lacked an id — so he belongs in Subs, NEVER the Starting XI.
    expect(v.away.starters.map((l) => l.playerId)).toEqual(["p5"]);
    expect(v.away.subs.map((l) => l.playerId)).toEqual(["p6"]);
    expect(v.away.starters.map((l) => l.playerId)).not.toContain("p6");
  });

  it("Starting XI list converges with the pitch on a side WITH an official sheet (no inferred 12th starter)", () => {
    const v = buildGameDetail(fullInput());
    for (const side of [v.home, v.away]) {
      expect(side.starters.map((l) => l.playerId)).toEqual(side.pitch.map((l) => l.playerId));
    }
  });

  it("falls back to appearance-inference for the LISTS only when the side has NO official sheet", () => {
    const v = buildGameDetail({ ...fullInput(), lineupEntries: [] });
    // No sheet on either side → graceful inference (show a squad), with the pitch empty (T-PITCH).
    expect(v.away.starters.map((l) => l.playerId)).toEqual(["p5", "p6"]); // both inferred as starters
    expect(v.home.starters.length + v.home.subs.length + v.home.bench.length).toBeGreaterThan(0);
    expect(v.home.pitch).toEqual([]);
    expect(v.away.pitch).toEqual([]);
  });

  // ── formation PITCH = the official starting XI only (never inferred/come-on starters) ──
  it("pitch renders ONLY the official is_starter sheet — excludes an inferred/come-on starter", () => {
    const v = buildGameDetail(fullInput());
    // Sheet starters: p1, p2 (home), p5 (away). p6 appeared with NO sheet entry → classified into
    // `subs` (the side has a sheet, pinned above) and kept OFF the pitch — a side never shows >11.
    expect(v.home.pitch.map((l) => l.playerId)).toEqual(["p1", "p2"]);
    expect(v.away.pitch.map((l) => l.playerId)).toEqual(["p5"]);
    expect(v.away.pitch.map((l) => l.playerId)).not.toContain("p6");
    expect(v.away.subs.map((l) => l.playerId)).toContain("p6"); // listed in Subs, just not on pitch
    // Invariant: pitch ⊆ starters, ≤ 11 per side.
    for (const side of [v.home, v.away]) {
      const starterIds = new Set(side.starters.map((l) => l.playerId));
      expect(side.pitch.every((l) => starterIds.has(l.playerId))).toBe(true);
      expect(side.pitch.length).toBeLessThanOrEqual(11);
    }
  });

  it("keeps a subbed-off / sent-off STARTER in BOTH the Starting XI list and the pitch", () => {
    const v = buildGameDetail(fullInput());
    // p5 is an official starter withdrawn at 75' — he stays in the Starting XI list AND on the pitch.
    expect(v.away.starters.map((l) => l.playerId)).toContain("p5");
    const p5 = v.away.pitch.find((l) => l.playerId === "p5");
    expect(p5?.wentOffMinute).toBe(75);
    // p2 is an official starter sent off (red, 80') — also stays in the list AND on the pitch.
    expect(v.home.starters.map((l) => l.playerId)).toContain("p2");
    const p2 = v.home.pitch.find((l) => l.playerId === "p2");
    expect(p2?.redCard).toBe(true);
  });

  it("renders an empty pitch when no official lineup sheet has been posted (graceful placeholder)", () => {
    const v = buildGameDetail({ ...fullInput(), lineupEntries: [] });
    expect(v.home.pitch).toEqual([]);
    expect(v.away.pitch).toEqual([]);
    // The squad is still LISTED (roles inferred from appearances) — only the formation pitch waits.
    expect(v.home.starters.length + v.home.subs.length + v.home.bench.length).toBeGreaterThan(0);
  });

  it("folds fantasy points + stat chips per participant (not just rostered players)", () => {
    const v = buildGameDetail(fullInput());
    const p1 = v.home.starters.find((l) => l.playerId === "p1")!;
    expect(p1.fantasyPoints).toBe(6);
    expect(p1.chips).toEqual([{ label: "SV", value: "3" }]); // GK saves chip
    const p6 = v.away.subs.find((l) => l.playerId === "p6")!;
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
    const p6 = v.away.subs.find((l) => l.playerId === "p6")!;
    expect(p6.rating).toBe(7.5); // manual (7.5) overrides balldontlie (8.0) per DEFAULT priority
    const p2 = v.home.starters.find((l) => l.playerId === "p2")!;
    expect(p2.rating).toBeNull(); // present-but-null source falls through to "no rating"
    const p3 = v.home.subs[0]!;
    expect(p3.rating).toBeNull(); // no rating row at all → null (renders "–")
  });

  it("builds home-vs-away team statistics from the typed columns + extra (derived pcts; missing → null)", () => {
    const v = buildGameDetail(fullInput());
    expect(v.statistics).not.toBeNull();
    // Group order + titles mirror design/design_reference/match_detail (Overview has no title).
    expect(v.statistics!.groups.map((g) => g.title)).toEqual([
      null,
      "Shots",
      "Attacking",
      "Passing",
      "Defending",
      "Discipline",
    ]);
    const rows = v.statistics!.groups.flatMap((g) => g.rows);
    const row = (key: string) => rows.find((r) => r.key === key)!;

    // Typed stat_team_match columns → home/away by team id.
    expect(row("poss")).toMatchObject({ format: "pct", neutral: false, home: 61, away: 39 });
    expect(row("blocked")).toMatchObject({ home: 3, away: 1 });
    expect(row("offsides")).toMatchObject({ neutral: true, home: 2, away: 1 }); // lower-is-better

    // extra-sourced metrics.
    expect(row("xg")).toMatchObject({ format: "dec", home: 1.84, away: 0.42 });
    expect(row("shots")).toMatchObject({ home: 14, away: 6 });

    // Derived percentages (each side's OWN rate): accuracy = accurate/total*100, rounded.
    expect(row("accPct")).toMatchObject({ format: "pct", home: 87, away: 78 }); // 470/540, 250/320
    // Duels = (ground+aerial) won / total; away has NO duel data → null ("–").
    expect(row("duelPct").home).toBe(56); // (23+8)/(40+15)=31/55→56
    expect(row("duelPct").away).toBeNull();

    // A metric the feed omits on one side resolves to null on that side only.
    expect(row("woodwork")).toMatchObject({ home: 1, away: null });

    // The lower-is-better (neutral) set.
    expect(row("fouls").neutral).toBe(true);
    expect(row("saves").neutral).toBe(true);
    expect(row("yellow").neutral).toBe(true);
  });

  it("emits null statistics (tab hidden) when neither side has a team-stat row", () => {
    const v = buildGameDetail({ ...fullInput(), teamStats: [] });
    expect(v.statistics).toBeNull();
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
    const p6 = v.away.subs.find((l) => l.playerId === "p6")!;
    expect(p6.owner).toBeNull(); // unowned by any manager
  });

  it("counts unresolved participants (no player row) + unplaceable (wrong team) honestly", () => {
    const v = buildGameDetail(fullInput());
    // p7 plays for neither side → unplaced(1); plus unresolvedFromPool(1).
    expect(v.unresolvedParticipants).toBe(2);
    const ids = [
      ...v.home.starters,
      ...v.home.subs,
      ...v.home.bench,
      ...v.away.starters,
      ...v.away.subs,
      ...v.away.bench,
    ].map((l) => l.playerId);
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
    const allLines = [
      ...v.home.starters,
      ...v.home.subs,
      ...v.home.bench,
      ...v.away.starters,
      ...v.away.subs,
      ...v.away.bench,
    ];
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
      teamStats: [],
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
