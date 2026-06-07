import { describe, it, expect } from "vitest";
import { comparePeriodPairwise, periodRecords, type ManagerPeriodPoints } from "@app/recompute";
import { buildVsField } from "./buildVsField";
import type {
  BuildVsFieldInput,
  FieldEntry,
  ManagerLineupInput,
  PeriodMatchInput,
  SeasonEntry,
} from "./types";

// Injected clock — purity. Kickoffs are anchored relative to this.
const NOW = new Date("2026-06-12T12:00:00.000Z");

const MANAGERS = [
  { managerId: "m1", displayName: "M1" },
  { managerId: "m2", displayName: "M2" },
  { managerId: "m3", displayName: "M3" },
  { managerId: "m4", displayName: "M4" },
];

// Three fixtures, one per state. A team plays exactly one match per matchday.
const MATCHES: PeriodMatchInput[] = [
  {
    matchId: "A",
    homeTeamId: "teamX",
    awayTeamId: "teamY",
    homeTeamName: "X",
    awayTeamName: "Y",
    status: "scheduled",
    kickoffAt: new Date("2026-06-12T15:00:00.000Z"), // +180 min
    homeScore: null,
    awayScore: null,
  },
  {
    matchId: "B",
    homeTeamId: "teamZ",
    awayTeamId: "teamW",
    homeTeamName: "Z",
    awayTeamName: "W",
    status: "in_progress",
    kickoffAt: new Date("2026-06-12T11:00:00.000Z"),
    homeScore: 1,
    awayScore: 0,
  },
  {
    matchId: "C",
    homeTeamId: "teamP",
    awayTeamId: "teamQ",
    homeTeamName: "P",
    awayTeamName: "Q",
    status: "completed",
    kickoffAt: new Date("2026-06-12T08:00:00.000Z"),
    homeScore: 2,
    awayScore: 2,
  },
];

// m1 has one starter in each match state (mixed); others minimal.
const LINEUPS: ManagerLineupInput[] = [
  {
    managerId: "m1",
    starters: [
      { playerId: "p1a", role: "GK", teamId: "teamX", locked: false }, // scheduled
      { playerId: "p1b", role: "DEF", teamId: "teamZ", locked: true }, // in_progress
      { playerId: "p1c", role: "FWD", teamId: "teamP", locked: true }, // completed
    ],
  },
  {
    managerId: "m2",
    starters: [{ playerId: "p2a", role: "MID", teamId: "teamY", locked: false }], // scheduled
  },
];

// score_manager_period for the current period. m4 is OMITTED → inactive → 0.
const SCORES: ManagerPeriodPoints[] = [
  { managerId: "m1", points: 20 },
  { managerId: "m2", points: 20 },
  { managerId: "m3", points: 10 },
];

const STANDINGS = [
  { managerId: "m1", allPlayAllW: 6, allPlayAllL: 1, totalPoints: 120, seed: 1 },
  { managerId: "m2", allPlayAllW: 5, allPlayAllL: 2, totalPoints: 110, seed: 2 },
  { managerId: "m3", allPlayAllW: 2, allPlayAllL: 5, totalPoints: 60, seed: 3 },
  { managerId: "m4", allPlayAllW: 0, allPlayAllL: 7, totalPoints: 0, seed: 4 },
];

const PER_PERIOD = [
  {
    periodId: "p1",
    scores: [
      { managerId: "m1", points: 10 },
      { managerId: "m2", points: 5 },
      { managerId: "m3", points: 0 },
      { managerId: "m4", points: 0 },
    ],
  },
  {
    periodId: "p2",
    scores: [
      { managerId: "m1", points: 20 },
      { managerId: "m2", points: 20 },
      { managerId: "m3", points: 10 },
      { managerId: "m4", points: 0 },
    ],
  },
];

function baseInput(over: Partial<BuildVsFieldInput> = {}): BuildVsFieldInput {
  return {
    leagueId: "lg1",
    viewerManagerId: "m1",
    managers: MANAGERS,
    currentPeriod: { id: "md1", label: "MD1" },
    currentPeriodScores: SCORES,
    lineupsForPeriod: LINEUPS,
    matchStatuses: MATCHES,
    standings: STANDINGS,
    perPeriodScores: PER_PERIOD,
    now: NOW,
    ...over,
  };
}

const field = (view: { field: FieldEntry[] }, id: string): FieldEntry =>
  view.field.find((e) => e.managerId === id)!;
const season = (view: { season: SeasonEntry[] }, id: string): SeasonEntry =>
  view.season.find((e) => e.managerId === id)!;

describe("buildVsField — running scores", () => {
  it("carries each manager's current-period running score, defaulting an absent manager to 0", () => {
    const view = buildVsField(baseInput());
    expect(field(view, "m1").points).toBe(20);
    expect(field(view, "m2").points).toBe(20);
    expect(field(view, "m3").points).toBe(10);
    // m4 has no score_manager_period row → 0 (inactive), but still appears in the field.
    expect(field(view, "m4").points).toBe(0);
    expect(view.field).toHaveLength(4);
  });

  it("ranks the current-period field by points desc (managerId tiebreak)", () => {
    const view = buildVsField(baseInput());
    expect(view.field.map((e) => e.managerId)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(view.field.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it("marks the viewer's own row and stamps asOf from the injected clock", () => {
    const view = buildVsField(baseInput());
    expect(field(view, "m1").isMe).toBe(true);
    expect(field(view, "m2").isMe).toBe(false);
    expect(view.asOf).toBe(NOW.toISOString());
    expect(view.leagueId).toBe("lg1");
    expect(view.viewerManagerId).toBe("m1");
    expect(view.currentPeriod).toEqual({ id: "md1", label: "MD1" });
  });
});

describe("buildVsField — provisional all-play-all record matches the Prompt-04 helper", () => {
  // The full field the helper compares over (inactive m4 included as 0).
  const FULL: ManagerPeriodPoints[] = [
    { managerId: "m1", points: 20 },
    { managerId: "m2", points: 20 },
    { managerId: "m3", points: 10 },
    { managerId: "m4", points: 0 },
  ];

  it("equals periodRecords(...) for every manager (w/l identical; tie folded into neither)", () => {
    const view = buildVsField(baseInput());
    for (const rec of periodRecords(FULL)) {
      const e = field(view, rec.managerId);
      expect(e.record.w).toBe(rec.w);
      expect(e.record.l).toBe(rec.l);
    }
  });

  it("tie = neither W nor L: tied m1/m2 each bank w=2,l=0 with one tie shown as d (w+l < N-1)", () => {
    const view = buildVsField(baseInput());
    // m1 and m2 are tied on 20: each beats m3 + m4 (w=2), loses to nobody (l=0), ties each other.
    expect(field(view, "m1").record).toEqual({ w: 2, l: 0, d: 1 });
    expect(field(view, "m2").record).toEqual({ w: 2, l: 0, d: 1 });
    // w + l = 2 is strictly less than N-1 = 3 — the tie is charged to neither side.
    expect(field(view, "m1").record.w + field(view, "m1").record.l).toBeLessThan(
      MANAGERS.length - 1,
    );
  });

  it("inactive-0 manager banks nobody and is a free win for everyone strictly above", () => {
    const view = buildVsField(baseInput());
    // m4 (0 pts): loses to all three scoring managers, beats nobody.
    expect(field(view, "m4").record).toEqual({ w: 0, l: 3, d: 0 });
    // And m3 (10 pts, the lowest active) banks a win specifically against m4.
    expect(field(view, "m3").record.w).toBe(1);
  });
});

describe("buildVsField — per-opponent H2H (viewer vs the field) via the helper", () => {
  it("computes the viewer's H2H against each opponent, with margin; own row is null", () => {
    const view = buildVsField(baseInput());
    // Cross-check against the helper filtered to the viewer's directed outcomes.
    const FULL: ManagerPeriodPoints[] = [
      { managerId: "m1", points: 20 },
      { managerId: "m2", points: 20 },
      { managerId: "m3", points: 10 },
      { managerId: "m4", points: 0 },
    ];
    const mine = comparePeriodPairwise(FULL).filter((o) => o.managerId === "m1");
    for (const o of mine) {
      const e = field(view, o.opponentId);
      expect(e.h2hVsViewer).toEqual({
        result: o.result,
        points: o.points,
        opponentPoints: o.opponentPoints,
        margin: o.points - o.opponentPoints,
      });
    }
    expect(field(view, "m1").h2hVsViewer).toBeNull(); // no self-H2H
    expect(field(view, "m2").h2hVsViewer!.result).toBe("tie");
    expect(field(view, "m3").h2hVsViewer).toEqual({
      result: "win",
      points: 20,
      opponentPoints: 10,
      margin: 10,
    });
  });
});

describe("buildVsField — full-roster completeness (Prompt-04 inactive-0 assumption)", () => {
  it("a roster member absent from the period score map AND with no XI is still rendered inactive-0 and is a free win for everyone above", () => {
    // m4 is in `managers` (the FULL league roster the loader enumerates) but is OMITTED from
    // currentPeriodScores (no score_manager_period row) AND from lineupsForPeriod (no XI) — the
    // all-benched / no-row manager. Prompt 04 line 42 assumes he is PRESENT as a 0; if he vanished,
    // every strictly-above manager's provisional W would be undercounted.
    const view = buildVsField(baseInput());
    const m4 = field(view, "m4");
    expect(m4).toBeDefined(); // still rendered (did not vanish)
    expect(m4.points).toBe(0); // inactive-0
    expect(m4.starters).toEqual([]); // empty XI
    expect(m4.counts).toEqual({ yetToPlay: 0, playing: 0, played: 0, noMatch: 0 });
    // free win for everyone above: he loses to all 3 scoring managers, beats nobody…
    expect(m4.record).toEqual({ w: 0, l: 3, d: 0 });
    // …even the LOWEST-scoring active manager (m3, 10 pts) banks the free win against him…
    expect(field(view, "m3").record.w).toBe(1);
    // …and the viewer (m1, 20) banks the free win in the per-opponent H2H column.
    expect(m4.h2hVsViewer).toEqual({
      result: "win",
      points: 20,
      opponentPoints: 0,
      margin: 20,
    });
  });
});

describe("buildVsField — starters yet to play (count grounded in §4 match status)", () => {
  it("buckets a mixed lineup by its starters' match status", () => {
    const view = buildVsField(baseInput());
    // m1: teamX scheduled, teamZ in_progress, teamP completed.
    expect(field(view, "m1").counts).toEqual({
      yetToPlay: 1,
      playing: 1,
      played: 1,
      noMatch: 0,
    });
    expect(field(view, "m1").starters.map((s) => s.state)).toEqual([
      "yet-to-play",
      "playing",
      "played",
    ]);
  });

  it("counts all starters as yet-to-play when every match is scheduled", () => {
    const lineups: ManagerLineupInput[] = [
      {
        managerId: "m1",
        starters: [
          { playerId: "a", role: "GK", teamId: "teamX", locked: false },
          { playerId: "b", role: "DEF", teamId: "teamY", locked: false },
        ],
      },
    ];
    const view = buildVsField(baseInput({ lineupsForPeriod: lineups }));
    expect(field(view, "m1").counts).toEqual({
      yetToPlay: 2,
      playing: 0,
      played: 0,
      noMatch: 0,
    });
  });

  it("counts all starters as played when every match is completed", () => {
    const lineups: ManagerLineupInput[] = [
      {
        managerId: "m1",
        starters: [
          { playerId: "a", role: "GK", teamId: "teamP", locked: true },
          { playerId: "b", role: "DEF", teamId: "teamQ", locked: true },
        ],
      },
    ];
    const view = buildVsField(baseInput({ lineupsForPeriod: lineups }));
    expect(field(view, "m1").counts).toEqual({
      yetToPlay: 0,
      playing: 0,
      played: 2,
      noMatch: 0,
    });
  });

  it("buckets a starter with no resolvable fixture (null team / postponed) as noMatch", () => {
    const matches: PeriodMatchInput[] = [
      { ...MATCHES[0]!, status: "postponed" }, // teamX/teamY postponed → no live fixture
    ];
    const lineups: ManagerLineupInput[] = [
      {
        managerId: "m1",
        starters: [
          { playerId: "a", role: "GK", teamId: null, locked: false }, // no team
          { playerId: "b", role: "DEF", teamId: "teamX", locked: false }, // postponed
          { playerId: "c", role: "MID", teamId: "teamUNSEEDED", locked: false }, // no fixture
        ],
      },
    ];
    const view = buildVsField(baseInput({ matchStatuses: matches, lineupsForPeriod: lineups }));
    expect(field(view, "m1").counts).toEqual({
      yetToPlay: 0,
      playing: 0,
      played: 0,
      noMatch: 3,
    });
    // For display the unresolved starters render as not-yet-played nodes.
    expect(field(view, "m1").starters.every((s) => s.state === "yet-to-play")).toBe(true);
  });

  it("a manager with no lineup rows shows zero counts and no starters", () => {
    const view = buildVsField(baseInput());
    expect(field(view, "m3").starters).toEqual([]);
    expect(field(view, "m3").counts).toEqual({
      yetToPlay: 0,
      playing: 0,
      played: 0,
      noMatch: 0,
    });
  });
});

describe("buildVsField — season view reads from standing", () => {
  it("passes W/L/points/seed straight through from the standing rows, ranked by seed", () => {
    const view = buildVsField(baseInput());
    expect(view.season.map((e) => e.managerId)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(view.season.map((e) => e.seed)).toEqual([1, 2, 3, 4]);
    expect(view.season.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    const m1 = season(view, "m1");
    expect(m1.allPlayAllW).toBe(6);
    expect(m1.allPlayAllL).toBe(1);
    expect(m1.totalPoints).toBe(120);
    expect(m1.isMe).toBe(true);
    expect(m1.winPct).toBeCloseTo(6 / 7, 5);
  });

  it("derives the per-period chips from perPeriodScores (display enrichment)", () => {
    const view = buildVsField(baseInput());
    const m1 = season(view, "m1");
    expect(m1.byPeriod).toEqual([
      { periodId: "p1", w: 3, l: 0, points: 10 },
      { periodId: "p2", w: 2, l: 0, points: 20 },
    ]);
  });

  it("shows a manager with no standing row as 0-0 / unseeded", () => {
    const view = buildVsField(
      baseInput({ standings: STANDINGS.filter((s) => s.managerId !== "m4") }),
    );
    const m4 = season(view, "m4");
    expect(m4.allPlayAllW).toBe(0);
    expect(m4.allPlayAllL).toBe(0);
    expect(m4.seed).toBeNull();
    expect(m4.winPct).toBe(0);
  });
});

describe("buildVsField — match strip", () => {
  it("projects the period's fixtures, ordered by kickoff, with startsInMinutes for scheduled only", () => {
    const view = buildVsField(baseInput());
    expect(view.matches.map((m) => m.matchId)).toEqual(["C", "B", "A"]); // by kickoff asc
    const a = view.matches.find((m) => m.matchId === "A")!;
    expect(a.status).toBe("scheduled");
    expect(a.startsInMinutes).toBe(180); // 15:00 - 12:00
    const b = view.matches.find((m) => m.matchId === "B")!;
    expect(b.status).toBe("in_progress");
    expect(b.startsInMinutes).toBeNull();
    expect(b.homeScore).toBe(1);
  });
});

describe("buildVsField — empty / pre-season", () => {
  it("handles no current period and no scores without throwing", () => {
    const view = buildVsField(
      baseInput({
        currentPeriod: null,
        currentPeriodScores: [],
        lineupsForPeriod: [],
        matchStatuses: [],
      }),
    );
    expect(view.currentPeriod).toBeNull();
    expect(view.field).toHaveLength(4); // every manager still listed (all 0)
    expect(field(view, "m1").points).toBe(0);
    expect(field(view, "m1").record).toEqual({ w: 0, l: 0, d: 0 });
    expect(view.matches).toEqual([]);
  });
});
