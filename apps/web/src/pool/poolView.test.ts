/**
 * Pure-logic suite for the /pool view builders (Prompt 42) — IO-free, no DOM, no Prisma (P37/P38
 * source-contract-smoke style). Covers the three pure functions the loader composes:
 *   - selectPoolPicksView : fixtures + phase → group matchday lists / knockout bracket / unscheduled
 *   - buildPoolLeaderboardView : picks + matches + members → ranked rows (all members, non-pickers 0/0/0)
 *   - isFixtureLocked : the lock predicate the controls disable on (past kickoff OR not scheduled)
 */
import { describe, it, expect } from "vitest";
import type { MatchStatus, PeriodKind, PoolPrediction } from "@app/shared";
import type { LeaderboardMatch, PoolPick } from "@app/pool";
import {
  KNOCKOUT_ROUND_ORDER,
  selectPoolPicksView,
  buildPoolLeaderboardView,
  isFixtureLocked,
} from "./poolView";
import type { PoolFixture } from "./types";

// ─── factories ───────────────────────────────────────────────────────────────────────────

const ISO = "2026-06-20T18:00:00.000Z";

function fx(over: Partial<PoolFixture> & { matchId: string }): PoolFixture {
  return {
    matchId: over.matchId,
    home: over.home ?? { name: "Home", code: "AA" },
    away: over.away ?? { name: "Away", code: "BB" },
    kickoffAt: over.kickoffAt ?? ISO,
    status: over.status ?? "scheduled",
    periodKind: over.periodKind ?? null,
    periodLabel: over.periodLabel ?? null,
    result: over.result ?? null,
    homeScore: over.homeScore ?? null,
    awayScore: over.awayScore ?? null,
    myPick: over.myPick ?? null,
    others: over.others ?? [],
  };
}

function lm(
  matchId: string,
  status: MatchStatus,
  periodKind: PeriodKind | null,
  scores: Partial<LeaderboardMatch> = {},
): LeaderboardMatch {
  return {
    matchId,
    status,
    kickoffAt: new Date(ISO),
    periodKind,
    periodLabel: scores.periodLabel ?? null,
    homeScore: scores.homeScore ?? null,
    awayScore: scores.awayScore ?? null,
    homeScoreEt: scores.homeScoreEt ?? null,
    awayScoreEt: scores.awayScoreEt ?? null,
    homeScorePens: scores.homeScorePens ?? null,
    awayScorePens: scores.awayScorePens ?? null,
  };
}

function pk(managerId: string, matchId: string, prediction: PoolPrediction): PoolPick {
  return { managerId, matchId, prediction };
}

// ─── selectPoolPicksView ──────────────────────────────────────────────────────────────────

describe("selectPoolPicksView — group phase", () => {
  it("groups group_md fixtures into matchday sections by period label, sorted by label", () => {
    const view = selectPoolPicksView(
      [
        fx({ matchId: "b", periodKind: "group_md", periodLabel: "MD2" }),
        fx({ matchId: "a", periodKind: "group_md", periodLabel: "MD1" }),
        fx({ matchId: "c", periodKind: "group_md", periodLabel: "MD1" }),
      ],
      "group",
    );
    expect(view.matchdays.map((s) => s.label)).toEqual(["MD1", "MD2"]);
    expect(view.matchdays[0]!.fixtures.map((f) => f.matchId).sort()).toEqual(["a", "c"]);
    expect(view.matchdays[1]!.fixtures.map((f) => f.matchId)).toEqual(["b"]);
  });

  it("emits NO bracket in group phase (knockout frame appears only in knockout phase)", () => {
    const view = selectPoolPicksView(
      [fx({ matchId: "a", periodKind: "group_md", periodLabel: "MD1" })],
      "group",
    );
    expect(view.bracket).toEqual([]);
  });

  it("emits NO bracket in pre-kickoff phase", () => {
    const view = selectPoolPicksView(
      [fx({ matchId: "a", periodKind: "group_md", periodLabel: "MD1" })],
      "pre-kickoff",
    );
    expect(view.bracket).toEqual([]);
  });
});

describe("selectPoolPicksView — knockout phase", () => {
  it("renders the FULL fixed R32→Final skeleton, in order, even when most rounds are empty", () => {
    const view = selectPoolPicksView(
      [fx({ matchId: "k1", periodKind: "knockout_round", periodLabel: "R32" })],
      "playoff",
    );
    expect(view.bracket.map((r) => r.label)).toEqual([...KNOCKOUT_ROUND_ORDER]);
  });

  it("places real knockout fixtures in their round; undecided rounds carry NO fixtures (honest TBD)", () => {
    const view = selectPoolPicksView(
      [
        fx({ matchId: "k1", periodKind: "knockout_round", periodLabel: "R32" }),
        fx({ matchId: "k2", periodKind: "knockout_round", periodLabel: "R32" }),
        fx({ matchId: "qf", periodKind: "knockout_round", periodLabel: "QF" }),
      ],
      "playoff",
    );
    const byLabel = Object.fromEntries(view.bracket.map((r) => [r.label, r.fixtures.length]));
    expect(byLabel).toEqual({ R32: 2, R16: 0, QF: 1, SF: 0, Final: 0 });
  });

  it("never fabricates matchups — empty future rounds are present but fixture-less", () => {
    const view = selectPoolPicksView([], "complete");
    expect(view.bracket.map((r) => r.label)).toEqual([...KNOCKOUT_ROUND_ORDER]);
    expect(view.bracket.every((r) => r.fixtures.length === 0)).toBe(true);
  });

  it("still lists group fixtures as matchdays alongside the bracket in knockout phase", () => {
    const view = selectPoolPicksView(
      [
        fx({ matchId: "g", periodKind: "group_md", periodLabel: "MD3" }),
        fx({ matchId: "k", periodKind: "knockout_round", periodLabel: "R16" }),
      ],
      "playoff",
    );
    expect(view.matchdays.map((s) => s.label)).toEqual(["MD3"]);
    expect(view.bracket.find((r) => r.label === "R16")?.fixtures.map((f) => f.matchId)).toEqual([
      "k",
    ]);
  });
});

describe("selectPoolPicksView — unscheduled (period not yet linked)", () => {
  it("buckets fixtures with a null periodKind into 'unscheduled' (never guessed into a phase)", () => {
    const view = selectPoolPicksView([fx({ matchId: "u", periodKind: null })], "group");
    expect(view.unscheduled.map((f) => f.matchId)).toEqual(["u"]);
    expect(view.matchdays).toEqual([]);
  });
});

// ─── buildPoolLeaderboardView ───────────────────────────────────────────────────────────────

describe("buildPoolLeaderboardView", () => {
  const managers = [
    { id: "m1", displayName: "Alex" },
    { id: "m2", displayName: "Bob" },
    { id: "m3", displayName: "Zoe" },
  ];

  it("ranks members by points desc, joining display names + the isMe flag", () => {
    const matches = [
      lm("g1", "completed", "group_md", { homeScore: 2, awayScore: 0 }), // result HOME
      lm("g2", "completed", "group_md", { homeScore: 1, awayScore: 1 }), // result DRAW
    ];
    const picks = [
      pk("m1", "g1", "HOME"), // correct
      pk("m1", "g2", "DRAW"), // correct → m1 = 2 pts
      pk("m2", "g1", "AWAY"), // wrong → m2 = 0 pts (played 1)
    ];
    const rows = buildPoolLeaderboardView(picks, matches, managers, "m1");
    expect(rows[0]).toMatchObject({
      managerId: "m1",
      isMe: true,
      played: 2,
      correct: 2,
      points: 2,
    });
    expect(rows[0]!.managerName).toBe("Alex");
  });

  it("includes EVERY league member — a member with no picks renders 0/0/0 and sorts last by name", () => {
    const matches = [lm("g1", "completed", "group_md", { homeScore: 3, awayScore: 0 })];
    // Only Bob (m2) has a pick, and it's wrong → 0 points but played 1. Alex + Zoe never picked.
    const picks = [pk("m2", "g1", "AWAY")];
    const rows = buildPoolLeaderboardView(picks, matches, managers, "m2");

    // All three members present.
    expect(rows.map((r) => r.managerId).sort()).toEqual(["m1", "m2", "m3"]);
    // Everyone has 0 points → ordered by name: Alex, Bob, Zoe. Zoe (zero-pick) sorts last.
    expect(rows.map((r) => r.managerName)).toEqual(["Alex", "Bob", "Zoe"]);
    const zoe = rows.find((r) => r.managerId === "m3")!;
    expect(zoe).toMatchObject({ played: 0, correct: 0, points: 0 });
    expect(rows[rows.length - 1]!.managerName).toBe("Zoe");
  });

  it("resolves knockout results via period kind (advancer through pens) and counts them", () => {
    const matches = [
      // Level after FT/ET, decided on penalties → advancer HOME.
      lm("k1", "completed", "knockout_round", {
        homeScore: 1,
        awayScore: 1,
        homeScorePens: 4,
        awayScorePens: 2,
      }),
    ];
    const picks = [pk("m1", "k1", "HOME")];
    const rows = buildPoolLeaderboardView(picks, matches, managers, "m1");
    expect(rows.find((r) => r.managerId === "m1")).toMatchObject({
      played: 1,
      correct: 1,
      points: 1,
    });
  });

  it("excludes pending/unscored matches — a pick on a non-completed match does not count as played", () => {
    const matches = [
      lm("live", "in_progress", "group_md", { homeScore: 1, awayScore: 0 }),
      lm("unseeded", "completed", null, { homeScore: 2, awayScore: 0 }), // periodKind null → no result
    ];
    const picks = [pk("m1", "live", "HOME"), pk("m1", "unseeded", "HOME")];
    const rows = buildPoolLeaderboardView(picks, matches, managers, "m1");
    expect(rows.find((r) => r.managerId === "m1")).toMatchObject({
      played: 0,
      correct: 0,
      points: 0,
    });
  });
});

// ─── isFixtureLocked ──────────────────────────────────────────────────────────────────────

describe("isFixtureLocked", () => {
  const now = new Date("2026-06-20T18:00:00.000Z");

  it("is NOT locked when scheduled and kickoff is in the future", () => {
    expect(
      isFixtureLocked(
        fx({ matchId: "a", status: "scheduled", kickoffAt: "2026-06-20T19:00:00.000Z" }),
        now,
      ),
    ).toBe(false);
  });

  it("is locked once now reaches kickoff (boundary inclusive)", () => {
    expect(
      isFixtureLocked(
        fx({ matchId: "a", status: "scheduled", kickoffAt: "2026-06-20T18:00:00.000Z" }),
        now,
      ),
    ).toBe(true);
  });

  it("is locked when the match has left 'scheduled' even before kickoff (postponed/in_progress)", () => {
    expect(
      isFixtureLocked(
        fx({ matchId: "a", status: "in_progress", kickoffAt: "2026-06-20T19:00:00.000Z" }),
        now,
      ),
    ).toBe(true);
  });
});
