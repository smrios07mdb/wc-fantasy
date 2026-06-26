/**
 * Pure unit suite for {@link buildGameDetail} — the T5/T6 box-score + fantasy-overlay assembly. No DB,
 * no DOM: injected rows in, view-model out. Pins the role grouping, the card classification (incl. the
 * out-of-scope 2nd-yellow staying a 2nd yellow), sub on/off, the owner overlay states, the team-name
 * fallback, and the period-null degradation.
 */
import { describe, it, expect } from "vitest";
import type { Position } from "@app/shared";
import { buildGameDetail } from "./buildGameDetail";
import { UNNAMED_OPPONENT } from "@/src/lineup/view";
import type {
  BuildGameDetailInput,
  GdEventInput,
  GdLineupEntryInput,
  GdPlayerInput,
  GdStandingInput,
  GdStatInput,
  OwnerTag,
} from "./types";

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
        incidentType: "substitution",
        incidentClass: null,
        timeMinute: 60,
        addedTime: null,
        playerId: null,
        assistPlayerId: null,
        playerInId: "p3",
        playerOutId: null, // p3 came on; who he replaced isn't modelled here (p4 stays unused bench)
        rescinded: false,
        period: "2H",
      },
      {
        incidentType: "card",
        incidentClass: "yellow",
        timeMinute: 30,
        addedTime: null,
        playerId: "p5",
        assistPlayerId: null,
        playerInId: null,
        playerOutId: null,
        rescinded: false,
        period: "1H",
      },
      {
        incidentType: "card",
        incidentClass: "yellow",
        timeMinute: 70,
        addedTime: null,
        playerId: "p5",
        assistPlayerId: null,
        playerInId: null,
        playerOutId: null,
        rescinded: false,
        period: "2H",
      },
      {
        incidentType: "substitution",
        incidentClass: null,
        timeMinute: 75,
        addedTime: null,
        playerId: null,
        assistPlayerId: null,
        playerInId: null, // p6's come-on lacks an id; he's OFF the sheet but the side HAS one → Sub, not XI
        playerOutId: "p5", // p5 (sheet starter) is withdrawn at 75'
        rescinded: false,
        period: "2H",
      },
      {
        incidentType: "card",
        incidentClass: "red",
        timeMinute: 80,
        addedTime: null,
        playerId: "p2",
        assistPlayerId: null,
        playerInId: null,
        playerOutId: null,
        rescinded: false,
        period: "2H",
      },
      // rescinded card for p1 — must NOT count.
      {
        incidentType: "card",
        incidentClass: "yellow",
        timeMinute: 50,
        addedTime: null,
        playerId: "p1",
        assistPlayerId: null,
        playerInId: null,
        playerOutId: null,
        rescinded: true,
        period: "1H",
      },
      // a non-card VAR-ish row — must NOT be classified as a card.
      {
        incidentType: "varDecision",
        incidentClass: "goalAwarded",
        timeMinute: 41,
        addedTime: null,
        playerId: "p6",
        assistPlayerId: null,
        playerInId: null,
        playerOutId: null,
        rescinded: false,
        period: "1H",
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

// ─────────────────────────────────────────────────────────────────────────────────────
// Kickoff-XI reconciliation cascade.
//
// The official `is_starter` sheet is OVER-MARKED by the feed on some completed matches (a side can show
// 12+ flagged starters). The kickoff XI is the deterministic cascade: candidates = (`is_starter` rows) ∪
// (any `player_out`, who was on at kickoff); a candidate is KEPT iff NOT a `player_in` (a come-on is a
// Sub) AND (he was withdrawn, OR logged minutes > 0, OR is named in an on-field event — a card/goal). A
// flagged starter with no minutes + no events is a feed phantom (dropped, once the match has minute data;
// a pre-kickoff match with no data keeps the sheet as-is). The pitch == the Starting XI list (the §25
// invariant). When the cascade can't reach 11 the kept set is rendered as-is + a LineupAnomaly surfaces.
//
// England / Czechia / Croatia below are the real confirmed shapes (validated in SQL → exactly 11/side).
// ─────────────────────────────────────────────────────────────────────────────────────

// ── compact fixture factories (all action on the HOME side; away left empty) ──
const P = (id: string, position: Position): GdPlayerInput => ({
  id,
  displayName: id,
  firstName: null,
  lastName: id, // surname == id so the sub-pairing badges read naturally ("for Madueke")
  position,
  teamId: "home",
  nation: "HT",
});
const ST = (playerId: string, isStarter = true): GdLineupEntryInput => ({ playerId, isStarter });
const MIN = (playerId: string, minutesPlayed: number | null): GdStatInput => ({
  playerId,
  minutesPlayed,
  goals: null,
  assists: null,
  saves: null,
});
const SUB = (
  playerOutId: string | null,
  playerInId: string | null,
  minute: number,
): GdEventInput => ({
  incidentType: "substitution",
  incidentClass: null,
  timeMinute: minute,
  addedTime: null,
  playerId: null,
  assistPlayerId: null,
  playerInId,
  playerOutId,
  rescinded: false,
  period: minute <= 45 ? "1H" : "2H",
});
const CARD = (playerId: string, incidentClass: "yellow" | "red", minute: number): GdEventInput => ({
  incidentType: "card",
  incidentClass,
  timeMinute: minute,
  addedTime: null,
  playerId,
  assistPlayerId: null,
  playerInId: null,
  playerOutId: null,
  rescinded: false,
  period: minute <= 45 ? "1H" : "2H",
});

/** id, position, minutes-played (null ⇒ no stat row). Every row is flagged `is_starter`. */
type Row = readonly [string, Position, number | null];
function squad(rows: readonly Row[]): {
  players: GdPlayerInput[];
  lineupEntries: GdLineupEntryInput[];
  stats: GdStatInput[];
} {
  return {
    players: rows.map(([id, pos]) => P(id, pos)),
    lineupEntries: rows.map(([id]) => ST(id, true)),
    stats: rows.filter(([, , m]) => m !== null).map(([id, , m]) => MIN(id, m)),
  };
}

/** An all-home input (away side empty) from explicit players / sheet / stats / events. */
function homeOnly(over: {
  players: readonly GdPlayerInput[];
  lineupEntries: readonly GdLineupEntryInput[];
  stats: readonly GdStatInput[];
  events?: readonly GdEventInput[];
  status?: BuildGameDetailInput["match"]["status"];
}): BuildGameDetailInput {
  return {
    match: baseMatch(over.status ? { status: over.status } : {}),
    players: [...over.players],
    stats: [...over.stats],
    scores: [],
    ratings: [],
    teamStats: [],
    lineupEntries: [...over.lineupEntries],
    events: over.events ? [...over.events] : [],
    ownerByPlayer: {},
    unresolvedFromPool: 0,
  };
}

describe("buildGameDetail — kickoff XI reconciliation (cascade)", () => {
  it("England-shape: an over-flagged is_starter who actually CAME ON is dropped (12 → 11) and moved to Subs with an ↑ 'for' badge", () => {
    // 11 real starters (Madueke withdrawn at 60'); the feed ALSO flags Saka is_starter though he came on
    // for Madueke. Cascade: Saka (player_in) removed; Madueke (player_out) kept → exactly 11.
    const { players, lineupEntries, stats } = squad([
      ["h1", "GK", 90],
      ["h2", "DEF", 90],
      ["h3", "DEF", 90],
      ["h4", "DEF", 90],
      ["h5", "DEF", 90],
      ["h6", "MID", 90],
      ["h7", "MID", 90],
      ["h8", "MID", 90],
      ["h9", "FWD", 90],
      ["h10", "FWD", 90],
      ["Madueke", "FWD", 60],
      ["Saka", "FWD", 30], // 12th flagged is_starter — but a come-on
    ]);
    const v = buildGameDetail(
      homeOnly({ players, lineupEntries, stats, events: [SUB("Madueke", "Saka", 60)] }),
    );

    expect(v.home.pitch).toHaveLength(11);
    const pitchIds = v.home.pitch.map((l) => l.playerId);
    expect(pitchIds).toContain("Madueke");
    expect(pitchIds).not.toContain("Saka");
    // §25 invariant: the Starting XI list and the pitch carry the identical set.
    expect(v.home.starters.map((l) => l.playerId)).toEqual(pitchIds);

    const saka = v.home.subs.find((l) => l.playerId === "Saka")!;
    expect(saka.role).toBe("sub");
    expect(saka.cameOnMinute).toBe(60);
    expect(saka.subbedOnForName).toBe("Madueke"); // ↑ for the man he replaced

    const mad = v.home.pitch.find((l) => l.playerId === "Madueke")!;
    expect(mad.wentOffMinute).toBe(60);
    expect(mad.subbedOffForName).toBe("Saka"); // ↓ for the man who came on
    expect(v.lineupAnomalies).toEqual([]);
  });

  it("Czechia-shape: a flagged is_starter with null minutes and no events is a feed phantom — dropped (12 → 11), listed on the bench (never silently vanished)", () => {
    const { players, lineupEntries, stats } = squad([
      ["h1", "GK", 90],
      ["h2", "DEF", 90],
      ["h3", "DEF", 90],
      ["h4", "DEF", 90],
      ["h5", "DEF", 90],
      ["h6", "MID", 90],
      ["h7", "MID", 90],
      ["h8", "MID", 90],
      ["h9", "FWD", 90],
      ["h10", "FWD", 90],
      ["h11", "FWD", 90],
      ["Jurasek", "DEF", null], // 12th flagged is_starter — null minutes, no events
    ]);
    const v = buildGameDetail(homeOnly({ players, lineupEntries, stats }));

    expect(v.home.pitch).toHaveLength(11);
    expect(v.home.pitch.map((l) => l.playerId)).not.toContain("Jurasek");
    // Dropped from the XI but NOT dropped from the screen — he surfaces on the bench (did not feature).
    expect(v.home.bench.map((l) => l.playerId)).toContain("Jurasek");
    expect(v.home.starters.map((l) => l.playerId)).toEqual(v.home.pitch.map((l) => l.playerId));
    expect(v.lineupAnomalies).toEqual([]);
  });

  it("Croatia-shape: a withdrawn starter the feed left OFF the sheet is re-added via the player_out union (would-be 10 → 11)", () => {
    // 11 flagged incl Kovačić (a player_in who never went off). The man he replaced, Modrić, is a
    // player_out ABSENT from is_starter. Cascade: Kovačić (came on) removed; Modrić (player_out) added.
    const { players, lineupEntries, stats } = squad([
      ["h1", "GK", 90],
      ["h2", "DEF", 90],
      ["h3", "DEF", 90],
      ["h4", "DEF", 90],
      ["h5", "DEF", 90],
      ["h6", "MID", 90],
      ["h7", "MID", 90],
      ["Kovacic", "MID", 20], // flagged is_starter, but a come-on
      ["h9", "FWD", 90],
      ["h10", "FWD", 90],
      ["h11", "FWD", 90],
    ]);
    const modric = P("Modric", "MID"); // off-sheet, started, withdrawn for Kovačić
    const v = buildGameDetail(
      homeOnly({
        players: [...players, modric],
        lineupEntries, // Modrić NOT flagged
        stats: [...stats, MIN("Modric", 70)],
        events: [SUB("Modric", "Kovacic", 70)],
      }),
    );

    expect(v.home.pitch).toHaveLength(11); // NOT 10
    const pitchIds = v.home.pitch.map((l) => l.playerId);
    expect(pitchIds).toContain("Modric"); // event-union re-added the withdrawn off-sheet starter
    expect(pitchIds).not.toContain("Kovacic");
    expect(v.home.starters.map((l) => l.playerId)).toEqual(pitchIds); // invariant

    const kov = v.home.subs.find((l) => l.playerId === "Kovacic")!;
    expect(kov.role).toBe("sub");
    expect(kov.cameOnMinute).toBe(70);
    expect(kov.subbedOnForName).toBe("Modric");

    const mod = v.home.pitch.find((l) => l.playerId === "Modric")!;
    expect(mod.role).toBe("starter");
    expect(mod.wentOffMinute).toBe(70);
    expect(mod.subbedOffForName).toBe("Kovacic");
    expect(v.lineupAnomalies).toEqual([]);
  });

  it("keeps a red-carded starter on the pitch even with null minutes (a card proves he was on), with NO ↓ 'for' badge (no replacement)", () => {
    const { players, lineupEntries, stats } = squad([
      ["h1", "GK", 90],
      ["h2", "DEF", 90],
      ["h3", "DEF", 90],
      ["h4", "DEF", 90],
      ["h5", "DEF", 90],
      ["h6", "MID", 90],
      ["h7", "MID", 90],
      ["h8", "MID", 90],
      ["h9", "FWD", 90],
      ["h10", "FWD", 90],
      ["Lewa", "FWD", null], // starter, red-carded, no stat row
    ]);
    const v = buildGameDetail(
      homeOnly({ players, lineupEntries, stats, events: [CARD("Lewa", "red", 80)] }),
    );

    expect(v.home.pitch).toHaveLength(11);
    const lewa = v.home.pitch.find((l) => l.playerId === "Lewa")!;
    expect(lewa.role).toBe("starter");
    expect(lewa.redCard).toBe(true);
    expect(lewa.wentOffMinute).toBeNull(); // a red card is not a substitution → no ↓ badge
    expect(lewa.subbedOffForName).toBeNull();
    expect(v.lineupAnomalies).toEqual([]);
  });

  it("SAFETY NET: when the cascade can't resolve to 11 it renders the kept set as-is (no fabrication) and surfaces a LineupAnomaly", () => {
    // The feed flags 12 starters who ALL logged minutes and none came on — irreducible.
    const { players, lineupEntries, stats } = squad([
      ["h1", "GK", 90],
      ["h2", "DEF", 90],
      ["h3", "DEF", 90],
      ["h4", "DEF", 90],
      ["h5", "DEF", 90],
      ["h6", "MID", 90],
      ["h7", "MID", 90],
      ["h8", "MID", 90],
      ["h9", "FWD", 90],
      ["h10", "FWD", 90],
      ["h11", "FWD", 90],
      ["h12", "FWD", 90],
    ]);
    const v = buildGameDetail(homeOnly({ players, lineupEntries, stats }));

    expect(v.home.pitch).toHaveLength(12); // rendered as-is — NOT silently trimmed to 11
    expect(v.home.starters.map((l) => l.playerId)).toEqual(v.home.pitch.map((l) => l.playerId));
    expect(v.lineupAnomalies).toHaveLength(1);
    const a = v.lineupAnomalies[0]!;
    expect(a.side).toBe("home");
    expect(a.teamId).toBe("home");
    expect(a.count).toBe(12);
    expect(a.keptPlayerIds).toHaveLength(12);
    expect(a.removedPlayerIds).toEqual([]); // none removed — every candidate kept (the net, not a drop)
  });

  it("PRE-KICKOFF: a scheduled match (sheet present, zero events, zero minutes) keeps is_starter as-is — no phantom drops, no anomaly", () => {
    const rows: Row[] = [
      ["h1", "GK", null],
      ["h2", "DEF", null],
      ["h3", "DEF", null],
      ["h4", "DEF", null],
      ["h5", "DEF", null],
      ["h6", "MID", null],
      ["h7", "MID", null],
      ["h8", "MID", null],
      ["h9", "FWD", null],
      ["h10", "FWD", null],
      ["h11", "FWD", null],
    ];
    const { players, lineupEntries } = squad(rows);
    const v = buildGameDetail(
      homeOnly({ players, lineupEntries, stats: [], events: [], status: "scheduled" }),
    );

    expect(v.home.pitch).toHaveLength(11); // the announced XI, untouched
    expect(v.home.pitch.map((l) => l.playerId).sort()).toEqual(rows.map((r) => r[0]).sort());
    expect(v.lineupAnomalies).toEqual([]);
  });

  it("a no-sheet side has an empty pitch by design — that is NOT flagged as an anomaly", () => {
    const v = buildGameDetail({ ...fullInput(), lineupEntries: [] });
    expect(v.home.pitch).toEqual([]);
    expect(v.away.pitch).toEqual([]);
    expect(v.lineupAnomalies).toEqual([]);
  });

  it("LIVE/partial ingest: a not-yet-terminal match keeps its announced XI when only some starters have minutes (no collapse, no anomaly)", () => {
    // in_progress: only h9 has logged a minute; the other 10 are null with no events. The phantom drop is
    // disabled off a terminal status, so the live XI is kept whole instead of collapsing to the 1 with data.
    const { players, lineupEntries, stats } = squad([
      ["h1", "GK", null],
      ["h2", "DEF", null],
      ["h3", "DEF", null],
      ["h4", "DEF", null],
      ["h5", "DEF", null],
      ["h6", "MID", null],
      ["h7", "MID", null],
      ["h8", "MID", null],
      ["h9", "FWD", 5], // an early goalscorer's minute lands first
      ["h10", "FWD", null],
      ["h11", "FWD", null],
    ]);
    const v = buildGameDetail(
      homeOnly({ players, lineupEntries, stats, events: [], status: "in_progress" }),
    );
    expect(v.home.pitch).toHaveLength(11);
    expect(v.home.starters.map((l) => l.playerId)).toEqual(v.home.pitch.map((l) => l.playerId));
    expect(v.lineupAnomalies).toEqual([]);
  });

  it("a TERMINAL match with NO ingested minutes keeps the sheet as-is (a drop can't be justified without minute data)", () => {
    const rows: Row[] = [
      ["h1", "GK", null],
      ["h2", "DEF", null],
      ["h3", "DEF", null],
      ["h4", "DEF", null],
      ["h5", "DEF", null],
      ["h6", "MID", null],
      ["h7", "MID", null],
      ["h8", "MID", null],
      ["h9", "FWD", null],
      ["h10", "FWD", null],
      ["h11", "FWD", null],
    ];
    const { players, lineupEntries } = squad(rows);
    const v = buildGameDetail(
      homeOnly({ players, lineupEntries, stats: [], events: [], status: "completed" }),
    );
    expect(v.home.pitch).toHaveLength(11);
    expect(v.lineupAnomalies).toEqual([]);
  });

  it("SAFETY NET removed-split: a terminal side that still can't reach 11 lists the dropped candidates in removedPlayerIds", () => {
    // 13 flagged: 12 genuine (minutes) + a Jurásek-style phantom (null minutes, no events). The phantom is
    // dropped → pitch 12 (still ≠ 11) → anomaly that names the removed candidate, kept set rendered as-is.
    const { players, lineupEntries, stats } = squad([
      ["h1", "GK", 90],
      ["h2", "DEF", 90],
      ["h3", "DEF", 90],
      ["h4", "DEF", 90],
      ["h5", "DEF", 90],
      ["h6", "MID", 90],
      ["h7", "MID", 90],
      ["h8", "MID", 90],
      ["h9", "FWD", 90],
      ["h10", "FWD", 90],
      ["h11", "FWD", 90],
      ["h12", "FWD", 90],
      ["Jurasek", "DEF", null],
    ]);
    const v = buildGameDetail(homeOnly({ players, lineupEntries, stats }));
    expect(v.home.pitch).toHaveLength(12); // the phantom dropped, but 12 genuine remain — rendered as-is
    const a = v.lineupAnomalies[0]!;
    expect(a.count).toBe(12);
    expect(a.removedPlayerIds).toEqual(["Jurasek"]);
    expect(a.keptPlayerIds).not.toContain("Jurasek");
    expect(v.home.bench.map((l) => l.playerId)).toContain("Jurasek"); // not silently vanished
  });
});

// ─── events timeline (T16b) ──────────────────────────────────────────────────────────

const EV_PLAYERS: GdPlayerInput[] = [
  { id: "scorer", displayName: "H. Kane", firstName: "Harry", lastName: "Kane", position: "FWD", teamId: "home", nation: "HT" }, // prettier-ignore
  { id: "assister", displayName: "P. Foden", firstName: "Phil", lastName: "Foden", position: "MID", teamId: "home", nation: "HT" }, // prettier-ignore
  { id: "owngoaler", displayName: "O. Goaler", firstName: "Own", lastName: "Goaler", position: "DEF", teamId: "home", nation: "HT" }, // prettier-ignore
  { id: "ascorer", displayName: "K. Mbappe", firstName: "Kylian", lastName: "Mbappe", position: "FWD", teamId: "away", nation: "AT" }, // prettier-ignore
  { id: "varscorer", displayName: "V. Ruled", firstName: "Var", lastName: "Ruled", position: "FWD", teamId: "away", nation: "AT" }, // prettier-ignore
  { id: "subon", displayName: "S. On", firstName: "Sub", lastName: "On", position: "MID", teamId: "away", nation: "AT" }, // prettier-ignore
  { id: "suboff", displayName: "S. Off", firstName: "Sub", lastName: "Off", position: "MID", teamId: "away", nation: "AT" }, // prettier-ignore
];

/** Minimal event factory — defaults to an unkeyed goal row; pass the discriminators you care about. */
const ev = (over: Partial<GdEventInput>): GdEventInput => ({
  incidentType: "goal",
  incidentClass: null,
  timeMinute: null,
  addedTime: null,
  playerId: null,
  assistPlayerId: null,
  playerInId: null,
  playerOutId: null,
  rescinded: false,
  period: null,
  ...over,
});

function eventsInput(over: Partial<BuildGameDetailInput> = {}): BuildGameDetailInput {
  return {
    match: baseMatch({ homeScore: 2, awayScore: 1 }),
    players: EV_PLAYERS,
    stats: [],
    scores: [],
    ratings: [],
    teamStats: [],
    lineupEntries: [],
    events: [],
    ownerByPlayer: {},
    unresolvedFromPool: 0,
    ...over,
  };
}

/** A full match's worth of events, deliberately NOT pre-sorted, to prove the builder's own ordering. */
const STD_EVENTS: GdEventInput[] = [
  ev({ incidentType: "goal", incidentClass: "regular", playerId: "scorer", assistPlayerId: "assister", timeMinute: 10, period: "1H" }), // prettier-ignore
  ev({ incidentType: "goal", incidentClass: "ownGoal", playerId: "owngoaler", timeMinute: 25, period: "1H" }), // prettier-ignore
  ev({ incidentType: "goal", incidentClass: "penalty", playerId: "scorer", timeMinute: 50, period: "2H" }), // prettier-ignore
  ev({
    incidentType: "goal",
    incidentClass: "regular",
    playerId: "varscorer",
    timeMinute: 60,
    period: "2H",
  }), // disallowed (overturned below)  // prettier-ignore
  ev({ incidentType: "varDecision", incidentClass: "goalNotAwarded", playerId: "varscorer", timeMinute: 61, period: "2H" }), // prettier-ignore
  ev({
    incidentType: "varDecision",
    incidentClass: "goalAwarded",
    playerId: "ascorer",
    timeMinute: 41,
    period: "1H",
  }), // plain VAR → dropped  // prettier-ignore
  ev({ incidentType: "substitution", playerInId: "subon", playerOutId: "suboff", timeMinute: 70, period: "2H" }), // prettier-ignore
  ev({ incidentType: "card", incidentClass: "yellow", playerId: "ascorer", timeMinute: 80, period: "2H" }), // prettier-ignore
];

describe("buildGameDetail — events timeline (T16b)", () => {
  it("emits an ordered KO→FT timeline with a replayed running score (own goal credits the opposing side, penalty + regular counted, VAR-disallowed + every varDecision excluded)", () => {
    const v = buildGameDetail(eventsInput({ events: STD_EVENTS }));
    const shape = v.events.map(
      (e) =>
        `${e.kind}:${e.label ?? e.playerName ?? ""}@${e.minuteLabel ?? ""}=${e.homeScore}-${e.awayScore}`,
    );
    expect(shape).toEqual([
      "marker:Kick-off@=0-0",
      "goal:Harry Kane@10'=1-0",
      "goal:Own Goaler@25'=1-1", // own goal by a HOME player → AWAY's score
      "marker:Half-time@=1-1",
      "goal:Harry Kane@50'=2-1",
      "sub:Sub On@70'=2-1",
      "card:Kylian Mbappe@80'=2-1",
      "marker:Full-time@=2-1",
    ]);
    // computed (2–1) == stored (2–1), nothing unresolved → no anomaly.
    expect(v.eventScoreAnomaly).toBeNull();
    // a VAR-disallowed goal's scorer never appears on the timeline.
    expect(v.events.some((e) => e.playerName === "Var Ruled")).toBe(false);
  });

  it("resolves the assist name and flags own-goal / penalty / side", () => {
    const v = buildGameDetail(eventsInput({ events: STD_EVENTS }));
    const goals = v.events.filter((e) => e.kind === "goal");
    expect(goals.map((g) => g.playerName)).toEqual(["Harry Kane", "Own Goaler", "Harry Kane"]);
    expect(goals[0]!.assistName).toBe("Phil Foden");
    expect(goals[1]!).toMatchObject({ isOwnGoal: true, side: "away" });
    expect(goals[2]!).toMatchObject({ isPenalty: true, isOwnGoal: false, side: "home" });
  });

  it("orders same-minute events deterministically (goal before card) regardless of input order", () => {
    const same: GdEventInput[] = [
      ev({
        incidentType: "card",
        incidentClass: "yellow",
        playerId: "ascorer",
        timeMinute: 30,
        period: "1H",
      }),
      ev({
        incidentType: "goal",
        incidentClass: "regular",
        playerId: "scorer",
        timeMinute: 30,
        period: "1H",
      }),
    ];
    const m = baseMatch({ homeScore: 1, awayScore: 0 });
    const forward = buildGameDetail(eventsInput({ events: same, match: m }));
    const reversed = buildGameDetail(eventsInput({ events: [...same].reverse(), match: m }));
    expect(forward.events.filter((e) => e.kind !== "marker").map((e) => e.kind)).toEqual([
      "goal",
      "card",
    ]);
    expect(reversed.events.map((e) => e.kind)).toEqual(forward.events.map((e) => e.kind));
  });

  it("never silently credits a goal whose scorer can't be placed on a side; counts it in the anomaly", () => {
    const v = buildGameDetail(
      eventsInput({
        events: [
          ev({
            incidentType: "goal",
            incidentClass: "regular",
            playerId: "ghost",
            timeMinute: 12,
            period: "1H",
          }),
        ],
        match: baseMatch({ homeScore: 0, awayScore: 0 }),
      }),
    );
    expect(v.events.find((e) => e.kind === "goal")?.side).toBeNull();
    expect(v.events.at(-1)).toMatchObject({ label: "Full-time", homeScore: 0, awayScore: 0 });
    expect(v.eventScoreAnomaly).toMatchObject({ unresolvedGoals: 1 });
  });

  it("flags a terminal computed-vs-stored mismatch but still renders the accumulated timeline score", () => {
    const v = buildGameDetail(
      eventsInput({
        events: [
          ev({
            incidentType: "goal",
            incidentClass: "regular",
            playerId: "scorer",
            timeMinute: 10,
            period: "1H",
          }),
        ],
        match: baseMatch({ status: "completed", homeScore: 3, awayScore: 0 }),
      }),
    );
    expect(v.eventScoreAnomaly).toMatchObject({
      computedHome: 1,
      computedAway: 0,
      finalHome: 3,
      finalAway: 0,
    });
    expect(v.events.at(-1)).toMatchObject({ label: "Full-time", homeScore: 1, awayScore: 0 });
  });

  it("is live-safe: no Full-time mid-match, and Half-time only once the second half is reached", () => {
    const firstHalf = buildGameDetail(
      eventsInput({
        events: [
          ev({
            incidentType: "goal",
            incidentClass: "regular",
            playerId: "scorer",
            timeMinute: 10,
            period: "1H",
          }),
        ],
        match: baseMatch({ status: "in_progress", homeScore: 1, awayScore: 0 }),
      }),
    );
    expect(firstHalf.events.some((e) => e.label === "Full-time")).toBe(false);
    expect(firstHalf.events.some((e) => e.label === "Half-time")).toBe(false);
    const secondHalf = buildGameDetail(
      eventsInput({
        events: [
          ev({
            incidentType: "card",
            incidentClass: "yellow",
            playerId: "scorer",
            timeMinute: 47,
            period: "2H",
          }),
        ],
        match: baseMatch({ status: "in_progress", homeScore: 0, awayScore: 0 }),
      }),
    );
    expect(secondHalf.events.some((e) => e.label === "Half-time")).toBe(true);
    expect(secondHalf.events.some((e) => e.label === "Full-time")).toBe(false);
  });

  it("renders the added-time minute form (45+2')", () => {
    const v = buildGameDetail(
      eventsInput({
        events: [
          ev({
            incidentType: "goal",
            incidentClass: "regular",
            playerId: "scorer",
            timeMinute: 45,
            addedTime: 2,
            period: "1H",
          }),
        ],
        match: baseMatch({ homeScore: 1, awayScore: 0 }),
      }),
    );
    const goal = v.events.find((e) => e.kind === "goal");
    expect(goal?.minuteLabel).toBe("45+2'");
    expect(goal?.minute).toBe(47);
  });

  it("orders a knockout's regulation → extra-time → penalty goals by period rank, replaying the score across them", () => {
    // Deliberately unsorted input mixing 2H / ET / PEN (the World Cup knockout case).
    const knockout: GdEventInput[] = [
      ev({
        incidentType: "goal",
        incidentClass: "regular",
        playerId: "ascorer",
        timeMinute: 105,
        period: "ET",
      }), // away ET goal
      ev({
        incidentType: "goal",
        incidentClass: "penalty",
        playerId: "scorer",
        timeMinute: 120,
        period: "PEN",
      }), // home shoot-out
      ev({
        incidentType: "goal",
        incidentClass: "regular",
        playerId: "scorer",
        timeMinute: 70,
        period: "2H",
      }), // home 2H goal
    ];
    const v = buildGameDetail(
      eventsInput({ events: knockout, match: baseMatch({ homeScore: 2, awayScore: 1 }) }),
    );
    const goals = v.events.filter((e) => e.kind === "goal");
    expect(goals.map((g) => `${g.period}@${g.minute}=${g.homeScore}-${g.awayScore}`)).toEqual([
      "2H@70=1-0",
      "ET@105=1-1",
      "PEN@120=2-1",
    ]);
    // Half-time rides the 1H→2H boundary (the first ≥2 event), not ET/PEN.
    const htIdx = v.events.findIndex((e) => e.label === "Half-time");
    const firstGoalIdx = v.events.findIndex((e) => e.kind === "goal");
    expect(htIdx).toBeGreaterThan(0);
    expect(htIdx).toBeLessThan(firstGoalIdx); // HT before the 2H goal
    expect(v.eventScoreAnomaly).toBeNull();
  });

  it("does NOT flag an open-play goal as a penalty (the 'pen' substring trap)", () => {
    const v = buildGameDetail(
      eventsInput({
        events: [
          ev({
            incidentType: "goal",
            incidentClass: "openPlay",
            playerId: "scorer",
            timeMinute: 20,
            period: "1H",
          }),
          ev({
            incidentType: "goal",
            incidentClass: "penalty",
            playerId: "scorer",
            timeMinute: 60,
            period: "2H",
          }),
        ],
        match: baseMatch({ homeScore: 2, awayScore: 0 }),
      }),
    );
    const goals = v.events.filter((e) => e.kind === "goal");
    expect(goals.map((g) => g.isPenalty)).toEqual([false, true]); // "openPlay" → false, "penalty" → true
  });

  it("surfaces the goal-less completed fixture's reconciliation anomaly (a 2–1 final with no goal events)", () => {
    // The canonical assembly fixture is a completed 2–1 with subs/cards only (no goal rows) — documenting that
    // buildEvents flags the divergence rather than masking it (computed 0–0 vs stored 2–1).
    const v = buildGameDetail(fullInput());
    expect(v.eventScoreAnomaly).toMatchObject({
      computedHome: 0,
      computedAway: 0,
      finalHome: 2,
      finalAway: 1,
      unresolvedGoals: 0,
    });
  });
});

// ─── group standings (T18) — buildGroupStandings via the view-model's `standings` field ──────────────
describe("buildGameDetail — standings (T18)", () => {
  // `fullInput().match` has homeTeamId "home" / awayTeamId "away".
  const gs = (teamId: string, over: Partial<GdStandingInput> = {}): GdStandingInput => ({
    teamId,
    teamName: teamId.toUpperCase(),
    bdlGroupId: 1,
    groupName: "Group A",
    position: 1,
    played: 3,
    won: 1,
    drawn: 1,
    lost: 1,
    goalsFor: 3,
    goalsAgainst: 3,
    goalDifference: 0,
    points: 4,
    ...over,
  });
  const withStandings = (
    standings: GdStandingInput[],
    matchOver: Partial<BuildGameDetailInput["match"]> = {},
  ) =>
    buildGameDetail({
      ...fullInput(),
      match: { ...fullInput().match, ...matchOver },
      standings,
    }).standings;

  it("hides the tab (null) when no standings were ingested for the group", () => {
    expect(withStandings([])).toBeNull();
  });

  it("hides the tab when one in-match team has no standing row", () => {
    // rows present for other teams, but neither "home" nor "away".
    expect(withStandings([gs("x"), gs("y")])).toBeNull();
  });

  it("hides the tab when a side is TBD/null (A1)", () => {
    expect(withStandings([gs("home"), gs("away")], { awayTeamId: null })).toBeNull();
    expect(withStandings([gs("home"), gs("away")], { homeTeamId: null })).toBeNull();
  });

  it("hides the tab when the two teams are in DIFFERENT groups (e.g. a knockout fixture)", () => {
    expect(
      withStandings([
        gs("home", { bdlGroupId: 1, groupName: "Group A" }),
        gs("away", { bdlGroupId: 2, groupName: "Group B" }),
      ]),
    ).toBeNull();
  });

  it("renders the group table sorted by position, flags in-match teams + the top-2 cutline, with notes", () => {
    const standings: GdStandingInput[] = [
      gs("away", { teamName: "AT", position: 3, points: 3 }),
      gs("home", { teamName: "HT", position: 1, points: 9 }),
      gs("x", { teamName: "X", position: 2, points: 4 }),
      gs("y", { teamName: null, position: 4, points: 1 }), // unnamed → fallback
    ];
    const v = withStandings(standings);
    expect(v).not.toBeNull();
    expect(v?.groupName).toBe("Group A");
    // sorted by the feed's authoritative `position` ascending
    expect(v?.rows.map((r) => r.teamId)).toEqual(["home", "x", "away", "y"]);
    // top-2 cutline
    expect(v?.rows.map((r) => r.isQualifying)).toEqual([true, true, false, false]);
    // the two in-match teams highlighted (and ONLY those)
    expect(
      v?.rows
        .filter((r) => r.inMatch)
        .map((r) => r.teamId)
        .sort(),
    ).toEqual(["away", "home"]);
    expect(v?.rows.find((r) => r.teamId === "x")?.inMatch).toBe(false);
    // unnamed team → UNNAMED fallback, never a raw UUID
    expect(v?.rows.find((r) => r.teamId === "y")?.teamName).toBe(UNNAMED_OPPONENT);
    // static notes present
    expect(v?.advanceNote).toContain("Top 2 advance");
    expect(v?.tiebreakNote).toContain("head-to-head");
  });

  it("only includes the in-match teams' own group, ignoring other groups' rows in the superset", () => {
    const v = withStandings([
      gs("home", { position: 1 }),
      gs("away", { position: 2 }),
      // a stray row from another group (the loader fetches a superset) — must be excluded
      gs("z", { bdlGroupId: 9, groupName: "Group Z", position: 1 }),
    ]);
    expect(v?.rows.map((r) => r.teamId)).toEqual(["home", "away"]);
  });
});
