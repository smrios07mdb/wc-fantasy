/**
 * Pure-logic suite for the manager-picks drill-in projection (T4) — IO-free, no DOM, no Prisma.
 * The headline invariant: `selectManagerPicks` surfaces ONLY what the gated `PoolView` already exposed.
 * For another manager that means picks present in `fixture.others` (server-revealed, post-kickoff only);
 * a pick the gate withheld (absent from `others`) is NEVER projected — the anti-copying reveal gate
 * (Prompt 40 §3) is inherited from the loader, not re-implemented here. For the viewer themselves, their
 * own `myPick` is always surfaced (own picks are always revealable, including pre-kickoff).
 */
import { describe, it, expect } from "vitest";
import type { MatchStatus, PoolPrediction } from "@app/shared";
import type { TournamentPhase } from "@/src/dashboard/selectTournamentPhase";
import { selectManagerPicks } from "./managerPicks";
import { selectPoolPicksView } from "./poolView";
import type { PoolFixture, PoolLeaderRow, PoolOtherPick, PoolView } from "./types";

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

function other(
  managerId: string,
  prediction: PoolPrediction,
  managerName = managerId,
): PoolOtherPick {
  return { managerId, managerName, prediction };
}

function leader(over: Partial<PoolLeaderRow> & { managerId: string }): PoolLeaderRow {
  return {
    managerId: over.managerId,
    managerName: over.managerName ?? over.managerId,
    isMe: over.isMe ?? false,
    played: over.played ?? 0,
    correct: over.correct ?? 0,
    points: over.points ?? 0,
  };
}

/** A PoolView with only the fields this projection reads (matchdays + leaderboard). */
function view(over: {
  managerId: string;
  matchdays?: PoolFixture[];
  bracket?: PoolFixture[];
  unscheduled?: PoolFixture[];
  completed?: PoolFixture[];
  leaderboard: PoolLeaderRow[];
  phase?: TournamentPhase;
}): PoolView {
  return {
    managerId: over.managerId,
    phase: over.phase ?? "group",
    playoffActive: false,
    picks: {
      matchdays: over.matchdays ? [{ label: "MD1", fixtures: over.matchdays }] : [],
      bracket: over.bracket ? [{ label: "R32", fixtures: over.bracket }] : [],
      unscheduled: over.unscheduled ?? [],
      completed: over.completed ?? [],
    },
    leaderboard: over.leaderboard,
    nowIso: ISO,
  };
}

describe("selectManagerPicks — reveal gate is inherited (others)", () => {
  it("does NOT surface another manager's pick on a match the gate withheld (absent from `others`)", () => {
    // The gated loader withholds a pre-kickoff other's pick → it never lands in `fixture.others`.
    const v = view({
      managerId: "me",
      matchdays: [
        fx({
          matchId: "future",
          status: "scheduled",
          kickoffAt: "2026-07-01T18:00:00.000Z",
          others: [], // ← rival's pre-kickoff pick is NOT here (server gate withheld it)
          myPick: "HOME", // viewer's own pick is present, but belongs to "me", not the rival
        }),
      ],
      leaderboard: [leader({ managerId: "rival", managerName: "Rival" })],
    });
    const picks = selectManagerPicks(v, "rival");
    expect(picks.rows).toEqual([]);
  });

  it("surfaces another manager's pick ONLY when the server revealed it (present in `others`)", () => {
    const v = view({
      managerId: "me",
      matchdays: [
        fx({
          matchId: "kicked-off",
          status: "in_progress",
          others: [other("rival", "AWAY", "Rival"), other("z", "HOME", "Zoe")],
        }),
      ],
      leaderboard: [leader({ managerId: "rival", managerName: "Rival" })],
    });
    const picks = selectManagerPicks(v, "rival");
    expect(picks.rows.map((r) => r.matchId)).toEqual(["kicked-off"]);
    expect(picks.rows[0]!.prediction).toBe("AWAY");
  });

  it("projects only the SELECTED manager's pick from a shared `others` list (no cross-talk)", () => {
    const v = view({
      managerId: "me",
      matchdays: [fx({ matchId: "m", others: [other("rival", "AWAY"), other("zoe", "DRAW")] })],
      leaderboard: [leader({ managerId: "zoe", managerName: "Zoe" })],
    });
    expect(selectManagerPicks(v, "zoe").rows[0]!.prediction).toBe("DRAW");
  });
});

describe("selectManagerPicks — the viewer's own picks", () => {
  it("surfaces the viewer's own pick even on a not-yet-kicked-off match (own always revealable)", () => {
    const v = view({
      managerId: "me",
      matchdays: [
        fx({
          matchId: "future",
          status: "scheduled",
          kickoffAt: "2026-07-01T18:00:00.000Z",
          myPick: "HOME",
          others: [],
        }),
      ],
      leaderboard: [leader({ managerId: "me", managerName: "Me", isMe: true })],
    });
    const picks = selectManagerPicks(v, "me");
    expect(picks.isMe).toBe(true);
    expect(picks.rows.map((r) => r.matchId)).toEqual(["future"]);
    expect(picks.rows[0]!.prediction).toBe("HOME");
  });

  it("reads the viewer's pick from `myPick`, ignoring any same-id entry that might appear in `others`", () => {
    // Defensive: the loader never puts the viewer in `others`, but the projection must key on identity.
    const v = view({
      managerId: "me",
      matchdays: [fx({ matchId: "m", myPick: "AWAY", others: [other("me", "HOME")] })],
      leaderboard: [leader({ managerId: "me", isMe: true })],
    });
    expect(selectManagerPicks(v, "me").rows[0]!.prediction).toBe("AWAY");
  });
});

describe("selectManagerPicks — grading, ordering, coverage", () => {
  const grade = (prediction: PoolPrediction, result: PoolPrediction | null, status: MatchStatus) =>
    selectManagerPicks(
      view({
        managerId: "me",
        matchdays: [fx({ matchId: "m", status, result, others: [other("r", prediction)] })],
        leaderboard: [leader({ managerId: "r" })],
      }),
      "r",
    ).rows[0]!;

  it("grades a revealed pick correct / wrong once the result settles, pending until then", () => {
    expect(grade("HOME", "HOME", "completed").outcome).toBe("correct");
    expect(grade("HOME", "AWAY", "completed").outcome).toBe("wrong");
    expect(grade("HOME", null, "in_progress").outcome).toBe("pending");
  });

  it("covers fixtures across matchdays, bracket, unscheduled AND the completed archive", () => {
    const v = view({
      managerId: "me",
      matchdays: [fx({ matchId: "g", others: [other("r", "HOME")] })],
      bracket: [fx({ matchId: "k", others: [other("r", "AWAY")] })],
      unscheduled: [fx({ matchId: "u", others: [other("r", "DRAW")] })],
      completed: [fx({ matchId: "c", status: "completed", others: [other("r", "HOME")] })],
      leaderboard: [leader({ managerId: "r" })],
    });
    expect(
      selectManagerPicks(v, "r")
        .rows.map((row) => row.matchId)
        .sort(),
    ).toEqual(["c", "g", "k", "u"]);
  });

  it("orders rows by kickoff ascending", () => {
    const v = view({
      managerId: "me",
      matchdays: [
        fx({
          matchId: "late",
          kickoffAt: "2026-07-05T18:00:00.000Z",
          others: [other("r", "HOME")],
        }),
        fx({
          matchId: "early",
          kickoffAt: "2026-06-25T18:00:00.000Z",
          others: [other("r", "AWAY")],
        }),
      ],
      leaderboard: [leader({ managerId: "r" })],
    });
    expect(selectManagerPicks(v, "r").rows.map((row) => row.matchId)).toEqual(["early", "late"]);
  });

  it("resolves the manager name from the leaderboard rows", () => {
    const v = view({
      managerId: "me",
      matchdays: [fx({ matchId: "m", others: [other("rival", "HOME", "ignored")] })],
      leaderboard: [leader({ managerId: "rival", managerName: "Rival FC", isMe: false })],
    });
    const picks = selectManagerPicks(v, "rival");
    expect(picks.managerName).toBe("Rival FC");
    expect(picks.isMe).toBe(false);
  });

  it("derives isMe from VIEWER IDENTITY, never the leaderboard row's isMe flag (no owner/data divergence)", () => {
    // The data branch (myPick vs others) and the displayed owner must agree by construction: both key
    // off managerId === view.managerId. A corrupted leaderboard isMe must not flip the title.
    const meRowWrong = view({
      managerId: "me",
      matchdays: [fx({ matchId: "m", myPick: "HOME" })],
      leaderboard: [leader({ managerId: "me", isMe: false })], // wrong flag for the viewer
    });
    expect(selectManagerPicks(meRowWrong, "me").isMe).toBe(true);

    const rivalRowWrong = view({
      managerId: "me",
      matchdays: [fx({ matchId: "m", others: [other("rival", "HOME")] })],
      leaderboard: [leader({ managerId: "rival", isMe: true })], // wrong flag for a rival
    });
    expect(selectManagerPicks(rivalRowWrong, "rival").isMe).toBe(false);
  });

  it("returns an empty projection (no rows) when the manager has nothing revealed", () => {
    const v = view({
      managerId: "me",
      matchdays: [fx({ matchId: "m", others: [] })],
      leaderboard: [leader({ managerId: "rival" })],
    });
    expect(selectManagerPicks(v, "rival").rows).toEqual([]);
  });
});

// ─── loadPool → selectPoolPicksView → selectManagerPicks seam (P1 regression-pin) ──────────────
// The drill-in modal reads `view.picks` — the SAME buckets the loader fills via selectPoolPicksView. The
// group-phase hide is a render-layer concern (PoolClient), NOT a data strip in the selector; if it were a
// strip, a manager's settled group picks would vanish from the modal once the tournament reaches playoff.
// This pins the real seam (the hand-built `view()` factory above can't catch a selector-side regression).
describe("selectManagerPicks — keeps full history through the live playoff selector (P1 seam)", () => {
  it("a settled GROUP pick is still reachable from the drill-in during the playoff phase", () => {
    const now = new Date("2026-07-05T18:00:00.000Z");
    const old = new Date("2026-06-20T18:00:00.000Z").toISOString(); // ≥24h before now → Completed bucket
    // Build the picks-view exactly as loadPool does in playoff (playoffActive = true).
    const picks = selectPoolPicksView(
      [
        fx({
          matchId: "grp",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          kickoffAt: old,
          myPick: "HOME",
          result: "HOME",
        }),
        fx({
          matchId: "ko",
          periodKind: "knockout_round",
          periodLabel: "R32",
          home: { name: "Brazil", code: "BR" },
          away: { name: "Japan", code: "JP" },
          myPick: "AWAY",
        }),
      ],
      "playoff",
      now,
      true,
    );
    const v: PoolView = {
      managerId: "me",
      phase: "playoff",
      playoffActive: true,
      picks,
      leaderboard: [leader({ managerId: "me", managerName: "Me", isMe: true })],
      nowIso: now.toISOString(),
    };
    const rows = selectManagerPicks(v, "me")
      .rows.map((r) => r.matchId)
      .sort();
    // BOTH the settled group pick (now in `completed`) AND the knockout pick remain reachable.
    expect(rows).toEqual(["grp", "ko"]);
  });
});
