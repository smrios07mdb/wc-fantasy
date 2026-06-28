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
// Default `now` for the picks-view tests: the factory's fixtures are `scheduled` by default, so the
// ≥24h Completed-archive cutoff never fires for them regardless of this instant. Archive-specific
// cases below pass their own `now`.
const NOW = new Date(ISO);

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
      NOW,
      false,
    );
    expect(view.matchdays.map((s) => s.label)).toEqual(["MD1", "MD2"]);
    expect(view.matchdays[0]!.fixtures.map((f) => f.matchId).sort()).toEqual(["a", "c"]);
    expect(view.matchdays[1]!.fixtures.map((f) => f.matchId)).toEqual(["b"]);
  });

  it("emits NO bracket in group phase (knockout frame appears only in knockout phase)", () => {
    const view = selectPoolPicksView(
      [fx({ matchId: "a", periodKind: "group_md", periodLabel: "MD1" })],
      "group",
      NOW,
      false,
    );
    expect(view.bracket).toEqual([]);
  });

  it("emits NO bracket in pre-kickoff phase", () => {
    const view = selectPoolPicksView(
      [fx({ matchId: "a", periodKind: "group_md", periodLabel: "MD1" })],
      "pre-kickoff",
      NOW,
      false,
    );
    expect(view.bracket).toEqual([]);
  });
});

describe("selectPoolPicksView — knockout phase", () => {
  it("renders the FULL fixed R32→Final skeleton, in order, even when most rounds are empty", () => {
    const view = selectPoolPicksView(
      [fx({ matchId: "k1", periodKind: "knockout_round", periodLabel: "R32" })],
      "playoff",
      NOW,
      true,
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
      NOW,
      true,
    );
    const byLabel = Object.fromEntries(view.bracket.map((r) => [r.label, r.fixtures.length]));
    expect(byLabel).toEqual({ R32: 2, R16: 0, QF: 1, SF: 0, Final: 0 });
  });

  it("never fabricates matchups — empty future rounds are present but fixture-less", () => {
    // playoffActive=false + phase="complete" pins the defensive complete-OR carry-over in the gate.
    const view = selectPoolPicksView([], "complete", NOW, false);
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
      NOW,
      true,
    );
    expect(view.matchdays.map((s) => s.label)).toEqual(["MD3"]);
    expect(view.bracket.find((r) => r.label === "R16")?.fixtures.map((f) => f.matchId)).toEqual([
      "k",
    ]);
  });
});

// ─── selectPoolPicksView — the playoff_entry gate (R32 pre-kickoff blind spot) ───────────────
// The bracket gates on `playoffActive` (playoff_entry EXISTENCE), NOT the kickoff-derived tournament
// phase. `selectTournamentPhase` returns "group" through the ENTIRE R32 pre-kickoff window (every
// knockout match is still `scheduled`; it only flips to "playoff" once a KO match is in_progress/
// completed), so a phase-gated bracket would stay hidden exactly when managers must pick the first
// knockout games. Mirrors the FAAB CONTRACT-P2/P3 fix (phase derives from playoff_entry, not status).
describe("selectPoolPicksView — playoff_entry gate (R32 pre-kickoff blind spot)", () => {
  it("renders the POPULATED bracket when playoffActive even though phase is still 'group' (all KO scheduled)", () => {
    const view = selectPoolPicksView(
      [
        // Knockout fixtures seeded but still `scheduled` — first KO has not kicked off yet.
        fx({
          matchId: "k1",
          periodKind: "knockout_round",
          periodLabel: "R32",
          status: "scheduled",
        }),
        fx({
          matchId: "k2",
          periodKind: "knockout_round",
          periodLabel: "R32",
          status: "scheduled",
        }),
      ],
      "group", // selectTournamentPhase's R32-pre-kickoff blind spot — must NOT hide the bracket
      NOW,
      true, // playoffActive — playoff_entry rows exist
    );
    // Full R32→Final frame present; R32 carries its two real fixtures, later rounds honest TBD.
    expect(view.bracket.map((r) => r.label)).toEqual([...KNOCKOUT_ROUND_ORDER]);
    const byLabel = Object.fromEntries(view.bracket.map((r) => [r.label, r.fixtures.length]));
    expect(byLabel).toEqual({ R32: 2, R16: 0, QF: 0, SF: 0, Final: 0 });
  });

  it("regression-pin: NO bracket when playoffActive is false, mid group_md (unchanged group behavior)", () => {
    const view = selectPoolPicksView(
      [fx({ matchId: "g", periodKind: "group_md", periodLabel: "MD1" })],
      "group",
      NOW,
      false, // playoffActive — no playoff_entry rows yet
    );
    expect(view.bracket).toEqual([]);
    expect(view.matchdays.map((s) => s.label)).toEqual(["MD1"]);
  });
});

describe("selectPoolPicksView — unscheduled (period not yet linked)", () => {
  it("buckets fixtures with a null periodKind into 'unscheduled' (never guessed into a phase)", () => {
    const view = selectPoolPicksView([fx({ matchId: "u", periodKind: null })], "group", NOW, false);
    expect(view.unscheduled.map((f) => f.matchId)).toEqual(["u"]);
    expect(view.matchdays).toEqual([]);
  });
});

// ─── selectPoolPicksView — Completed archive (≥24h-old completed group matches) ─────────────

describe("selectPoolPicksView — Completed archive", () => {
  // Reference instant; fixtures are dated relative to it so the ≥24h cutoff is exercised precisely.
  const archNow = new Date("2026-06-22T18:00:00.000Z");
  const h = (n: number) => 60 * 60 * 1000 * n;
  const at = (msBeforeNow: number) => new Date(archNow.getTime() - msBeforeNow).toISOString();

  it("moves a completed group match ≥24h past kickoff into `completed`, out of every matchday", () => {
    const view = selectPoolPicksView(
      [
        fx({
          matchId: "old",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          kickoffAt: at(h(48)),
        }), // 48h ago
        fx({
          matchId: "live",
          periodKind: "group_md",
          periodLabel: "MD2",
          status: "scheduled",
          kickoffAt: at(-h(2)),
        }), // future
      ],
      "group",
      archNow,
      false,
    );
    expect(view.completed.map((f) => f.matchId)).toEqual(["old"]);
    // "old" is in no matchday; only the active MD2 section survives.
    expect(view.matchdays.map((s) => s.label)).toEqual(["MD2"]);
    expect(view.matchdays.flatMap((s) => s.fixtures.map((f) => f.matchId))).toEqual(["live"]);
  });

  it("keeps a completed match <24h past kickoff in its matchday (not yet archived)", () => {
    const view = selectPoolPicksView(
      [
        fx({
          matchId: "recent",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          kickoffAt: at(h(12)),
        }),
      ], // 12h ago
      "group",
      archNow,
      false,
    );
    expect(view.completed).toEqual([]);
    expect(view.matchdays.map((s) => s.label)).toEqual(["MD1"]);
    expect(view.matchdays[0]!.fixtures.map((f) => f.matchId)).toEqual(["recent"]);
  });

  it("archives a completed match at exactly the ≥24h boundary (inclusive)", () => {
    const view = selectPoolPicksView(
      [
        fx({
          matchId: "edge",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          kickoffAt: at(h(24)),
        }),
      ], // exactly 24h ago
      "group",
      archNow,
      false,
    );
    expect(view.completed.map((f) => f.matchId)).toEqual(["edge"]);
    expect(view.matchdays).toEqual([]);
  });

  it("never archives a non-completed match, however old (scheduled / in_progress stay in their matchday)", () => {
    const view = selectPoolPicksView(
      [
        fx({
          matchId: "sched",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "scheduled",
          kickoffAt: at(h(72)),
        }),
        fx({
          matchId: "live",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "in_progress",
          kickoffAt: at(h(72)),
        }),
      ],
      "group",
      archNow,
      false,
    );
    expect(view.completed).toEqual([]);
    expect(view.matchdays[0]!.fixtures.map((f) => f.matchId).sort()).toEqual(["live", "sched"]);
  });

  it("drops a matchday section entirely when all its fixtures archive", () => {
    const view = selectPoolPicksView(
      [
        fx({
          matchId: "a",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          kickoffAt: at(h(48)),
        }),
        fx({
          matchId: "b",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          kickoffAt: at(h(30)),
        }),
      ],
      "group",
      archNow,
      false,
    );
    expect(view.matchdays).toEqual([]); // MD1 emptied → dropped, not an empty section
    expect(view.completed.map((f) => f.matchId).sort()).toEqual(["a", "b"]);
  });

  it("sorts `completed` by kickoff descending (most recent first)", () => {
    const view = selectPoolPicksView(
      [
        fx({
          matchId: "older",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          kickoffAt: at(h(72)),
        }),
        fx({
          matchId: "newer",
          periodKind: "group_md",
          periodLabel: "MD2",
          status: "completed",
          kickoffAt: at(h(30)),
        }),
        fx({
          matchId: "mid",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          kickoffAt: at(h(48)),
        }),
      ],
      "group",
      archNow,
      false,
    );
    expect(view.completed.map((f) => f.matchId)).toEqual(["newer", "mid", "older"]);
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
