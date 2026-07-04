/**
 * Pure unit suite for `buildKnockoutContext` — The Cut's view-model projection (T15-CUT).
 *
 * Fixtures run the REAL `buildPlayoffsView` (@app/recompute, byte-untouched) so the projection is
 * pinned to the actual ladder shapes — zone semantics (tie-widened via `resolveRoundCut`), ranked
 * ordering (points desc → seed asc → id), and per-round statuses are the engine's, never a mock's.
 *
 * Rider E (group-phase regression guard, pure half): a league with NO knockout ladder — or a ladder
 * with no reachable round — projects to null; the loader composes no `ko` sibling at all in that
 * case (its gate is pinned by the source-contract smoke in theCutSkin.test.ts).
 */
import { describe, it, expect } from "vitest";
import { buildPlayoffsView, type BuildPlayoffsViewInput } from "@app/recompute";
import {
  buildKnockoutContext,
  cutLineIndex,
  knockoutRoundName,
  type KnockoutFieldIdentity,
} from "./knockout";

/** N league managers m1..mN; the LAST `groupOuts` of them never reach the playoffs (no entry row). */
function fieldOf(n: number, viewer = "m1"): KnockoutFieldIdentity[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `m${i + 1}`;
    return { managerId: id, displayName: `Manager ${i + 1}`, isMe: id === viewer, stillToCome: 3 };
  });
}

/** A 12-manager league: 10 playoff entries (seeds 1..10), m11/m12 out in the group stage. */
function baseInput(overrides: Partial<BuildPlayoffsViewInput> = {}): BuildPlayoffsViewInput {
  const entries = Array.from({ length: 10 }, (_, i) => ({
    managerId: `m${i + 1}`,
    seed: i + 1,
    status: "alive" as const,
    eliminatedRound: null as string | null,
  }));
  // Distinct round scores 100, 96, 92 … (m1 highest) with distinct cumulative totals — no boundary tie.
  const r32: Record<string, number> = {};
  const cumulative = new Map<string, number>();
  for (let i = 0; i < 10; i++) {
    r32[`m${i + 1}`] = 100 - i * 4;
    cumulative.set(`m${i + 1}`, 500 - i * 10);
  }
  return {
    viewerManagerId: "m1",
    rounds: [
      { label: "R32", cutCount: 2 },
      { label: "R16", cutCount: 2 },
      { label: "QF", cutCount: 2 },
    ],
    entries,
    roundScores: { R32: r32 },
    cumulativeTotals: cumulative,
    groupPeriods: [],
    ...overrides,
  };
}

function ctx(
  input: BuildKnockoutContextInputLike,
): NonNullable<ReturnType<typeof buildKnockoutContext>> {
  const out = buildKnockoutContext(input);
  expect(out).not.toBeNull();
  return out!;
}
type BuildKnockoutContextInputLike = Parameters<typeof buildKnockoutContext>[0];

describe("cutLineIndex — count-based blade position (order-stable, never 0)", () => {
  it("is entrants − cutCount, floored at 1", () => {
    expect(cutLineIndex(10, 2)).toBe(8);
    expect(cutLineIndex(3, 2)).toBe(1);
    expect(cutLineIndex(2, 1)).toBe(1);
    expect(cutLineIndex(2, 5)).toBe(1);
  });
});

describe("knockoutRoundName — canonical long labels, pass-through otherwise", () => {
  it("maps the KNOCKOUT_ROUNDS labels and passes unknown labels through", () => {
    expect(knockoutRoundName("R32")).toBe("Round of 32");
    expect(knockoutRoundName("Final")).toBe("The Final");
    expect(knockoutRoundName("3P")).toBe("3P");
  });
});

describe("buildKnockoutContext — live round, viewer surviving (mock state a)", () => {
  const core = buildPlayoffsView(baseInput());
  const ko = ctx({
    core,
    viewerManagerId: "m1",
    field: fieldOf(12),
    allMatchesCompleted: false,
  });

  it("projects the live round header facts (label · cut · standing · advance)", () => {
    expect(ko.roundLabel).toBe("R32");
    expect(ko.roundName).toBe("Round of 32");
    expect(ko.cutCount).toBe(2);
    expect(ko.aliveCount).toBe(10);
    expect(ko.advanceCount).toBe(8);
    expect(ko.pend).toBe(false);
    expect(ko.complete).toBe(false);
    expect(ko.champion).toBeNull();
  });

  it("carries the AUTHORITATIVE ranked order (with identity + points) and the count-based cut index", () => {
    expect(ko.ladder.map((r) => r.managerId)).toEqual(
      core.rounds[0]!.ranked!.map((r) => r.managerId),
    );
    expect(ko.ladder[0]).toEqual({
      managerId: "m1",
      displayName: "Manager 1",
      isMe: true,
      points: 100,
      rank: 1,
    });
    expect(ko.cutIndex).toBe(8);
    expect(ko.zoneIds).toEqual(["m9", "m10"]);
  });

  it("viewer = safe with the reference margin (me − first-on-the-block)", () => {
    // m1 100 pts; ranked[cutIndex] = m9 (68 pts) → +32 clear of the blade.
    expect(ko.viewer.state).toBe("safe");
    expect(ko.viewer.rank).toBe(1);
    expect(ko.viewer.of).toBe(10);
    expect(ko.viewer.margin).toBe(32);
    expect(ko.viewer.marginLevel).toBe(false);
  });

  it("the fallen are the group-stage non-advancers (no playoff_entry), sorted last with null round", () => {
    expect(ko.fallen.map((f) => f.managerId).sort()).toEqual(["m11", "m12"]);
    for (const f of ko.fallen) {
      expect(f.roundLabel).toBeNull();
      expect(f.roundIdx).toBe(-1);
      expect(f.points).toBeNull();
    }
  });

  it("no settled round before the first cut; statuses are idx-stable", () => {
    expect(ko.settled).toBeNull();
    expect(ko.roundStatuses).toEqual(["live", "future", "future"]);
  });
});

describe("buildKnockoutContext — viewer ON THE BLOCK (mock state b)", () => {
  const core = buildPlayoffsView(baseInput({ viewerManagerId: "m9" }));
  const ko = ctx({
    core,
    viewerManagerId: "m9",
    field: fieldOf(12, "m9"),
    allMatchesCompleted: false,
  });

  it("viewer = block with the negative margin vs the last-safe row", () => {
    // m9 (68) vs last-safe m8 (72) → −4 behind the blade.
    expect(ko.viewer.state).toBe("block");
    expect(ko.viewer.rank).toBe(9);
    expect(ko.viewer.margin).toBe(-4);
    expect(ko.viewer.stillToCome).toBe(3);
  });
});

describe("buildKnockoutContext — boundary tie widens the zone (resolveRoundCut projection)", () => {
  // 4 alive, cut 2: m4 strictly below; m2/m3 tied on round pts AND cumulative → the WHOLE tied set
  // joins the zone (3 ids > cutCount 2) while the cut line stays count-based at index 2.
  const entries = ["m1", "m2", "m3", "m4"].map((id, i) => ({
    managerId: id,
    seed: i + 1,
    status: "alive" as const,
    eliminatedRound: null,
  }));
  const core = buildPlayoffsView(
    baseInput({
      entries,
      roundScores: { R32: { m1: 90, m2: 50, m3: 50, m4: 40 } },
      cumulativeTotals: new Map([
        ["m1", 400],
        ["m2", 300],
        ["m3", 300],
        ["m4", 200],
      ]),
    }),
  );
  const ko = ctx({
    core,
    viewerManagerId: "m2",
    field: fieldOf(4, "m2"),
    allMatchesCompleted: false,
  });

  it("zoneIds carry the tie-widened provisional cut; cutIndex stays entrants − cutCount", () => {
    expect(new Set(ko.zoneIds)).toEqual(new Set(["m2", "m3", "m4"]));
    expect(ko.zoneIds.length).toBeGreaterThan(ko.cutCount);
    expect(ko.cutIndex).toBe(2);
  });

  it("a tied-zone viewer reads block with a level margin → tiebreak wording", () => {
    // Zone membership (not row position) drives the BLOCK state: m2 sits ABOVE the count line at
    // rank 2, but the tie pulls him into the zone. The reference margin math (positionally safe →
    // vs ranked[cutIndex] = m3, also 50) yields 0 → the "level — tiebreak applies" wording.
    expect(ko.viewer.state).toBe("block");
    expect(ko.viewer.margin).toBe(0);
    expect(ko.viewer.marginLevel).toBe(true);
  });
});

describe("buildKnockoutContext — pend (round locked, results provisional; mock state f)", () => {
  it("safe viewer flips to the pend variant when every match is completed", () => {
    const core = buildPlayoffsView(baseInput());
    const ko = ctx({
      core,
      viewerManagerId: "m1",
      field: fieldOf(12),
      allMatchesCompleted: true,
    });
    expect(ko.pend).toBe(true);
    expect(ko.viewer.state).toBe("pend");
  });

  it("a zone viewer at pend keeps the BLOCK (danger) treatment — provisionally cut", () => {
    const core = buildPlayoffsView(baseInput({ viewerManagerId: "m10" }));
    const ko = ctx({
      core,
      viewerManagerId: "m10",
      field: fieldOf(12, "m10"),
      allMatchesCompleted: true,
    });
    expect(ko.pend).toBe(true);
    expect(ko.viewer.state).toBe("block");
  });
});

describe("buildKnockoutContext — viewer eliminated, spectating a later round (mock state c)", () => {
  const entries = Array.from({ length: 10 }, (_, i) => {
    const id = `m${i + 1}`;
    return {
      managerId: id,
      seed: i + 1,
      status: (id === "m9" || id === "m10" ? "eliminated" : "alive") as "alive" | "eliminated",
      eliminatedRound: id === "m9" || id === "m10" ? "R32" : null,
    };
  });
  const r16: Record<string, number> = {};
  for (let i = 0; i < 8; i++) r16[`m${i + 1}`] = 80 - i * 5;
  const core = buildPlayoffsView(
    baseInput({ entries, roundScores: { ...baseInput().roundScores, R16: r16 } }),
  );

  it("the current round advances to R16 with the R32 cuts now fallen (pts-at-cut carried)", () => {
    const ko = ctx({
      core,
      viewerManagerId: "m9",
      field: fieldOf(12, "m9"),
      allMatchesCompleted: false,
    });
    expect(ko.roundLabel).toBe("R16");
    expect(ko.roundStatuses).toEqual(["past", "live", "future"]);
    const fallenIds = ko.fallen.map((f) => f.managerId);
    // Most-recent cut round first (R32 pair, by points desc), then the group-stage outs.
    expect(fallenIds.slice(0, 2)).toEqual(["m9", "m10"]);
    expect(fallenIds.slice(2).sort()).toEqual(["m11", "m12"]);
    const mine = ko.fallen.find((f) => f.managerId === "m9")!;
    expect(mine.roundLabel).toBe("R32");
    expect(mine.roundIdx).toBe(0);
    expect(mine.points).toBe(68); // his R32 score at the cut
    expect(mine.isMe).toBe(true);
  });

  it("viewer = out with the cut-round label; a group-stage-out viewer carries a null label", () => {
    const cutViewer = ctx({
      core,
      viewerManagerId: "m9",
      field: fieldOf(12, "m9"),
      allMatchesCompleted: false,
    });
    expect(cutViewer.viewer.state).toBe("out");
    expect(cutViewer.viewer.outRoundLabel).toBe("R32");
    expect(cutViewer.viewer.rank).toBeNull();

    const groupOut = ctx({
      core,
      viewerManagerId: "m11",
      field: fieldOf(12, "m11"),
      allMatchesCompleted: false,
    });
    expect(groupOut.viewer.state).toBe("out");
    expect(groupOut.viewer.outRoundLabel).toBeNull();
  });

  it("settled = the R32 cut, with victims + the surviving viewer's verdict facts", () => {
    const ko = ctx({
      core,
      viewerManagerId: "m1",
      field: fieldOf(12),
      allMatchesCompleted: false,
    });
    expect(ko.settled).not.toBeNull();
    const s = ko.settled!;
    expect(s.roundLabel).toBe("R32");
    expect(s.cutCount).toBe(2);
    expect(s.aliveAfter).toBe(8);
    expect(s.victims.map((v) => v.managerId).sort()).toEqual(["m10", "m9"]);
    expect(s.viewerOutcome).toBe("survived");
    expect(s.viewerRank).toBe(1);
    expect(s.viewerOf).toBe(10);
    expect(s.viewerMargin).toBe(32); // 100 − the top victim's 68
  });
});

describe("buildKnockoutContext — champion endgame (mock state e)", () => {
  // A 3-round ladder fully cut: R32 cuts m9/m10 · R16 cuts m7/m8 · QF cuts m3..m6 → m1 champion,
  // m2 cut in the QF (stays in the current-round ladder, NOT the fallen).
  const entries = Array.from({ length: 10 }, (_, i) => {
    const id = `m${i + 1}`;
    const eliminatedRound =
      id === "m9" || id === "m10"
        ? "R32"
        : id === "m7" || id === "m8"
          ? "R16"
          : id === "m1"
            ? null
            : "QF";
    return {
      managerId: id,
      seed: i + 1,
      status: (id === "m1" ? "champion" : "eliminated") as "champion" | "eliminated",
      eliminatedRound,
    };
  });
  const scores = (ids: string[], top: number): Record<string, number> =>
    Object.fromEntries(ids.map((id, i) => [id, top - i * 5]));
  const core = buildPlayoffsView(
    baseInput({
      entries,
      rounds: [
        { label: "R32", cutCount: 2 },
        { label: "R16", cutCount: 2 },
        { label: "QF", cutCount: 5 },
      ],
      roundScores: {
        R32: scores(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10"], 100),
        R16: scores(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"], 90),
        QF: scores(["m1", "m2", "m3", "m4", "m5", "m6"], 80),
      },
    }),
  );

  it("complete + champion surface; the last round's cuts stay OUT of the fallen (ladder medals)", () => {
    const ko = ctx({
      core,
      viewerManagerId: "m1",
      field: fieldOf(12),
      allMatchesCompleted: true,
    });
    expect(ko.complete).toBe(true);
    expect(ko.pend).toBe(false); // complete, not pending
    expect(ko.champion).toEqual({ managerId: "m1", displayName: "Manager 1", isMe: true });
    expect(ko.roundLabel).toBe("QF");
    const fallenIds = ko.fallen.map((f) => f.managerId);
    for (const qfCut of ["m2", "m3", "m4", "m5", "m6"]) expect(fallenIds).not.toContain(qfCut);
    expect(fallenIds.slice(0, 2)).toEqual(["m7", "m8"]); // R16 first (most recent BEFORE the last round)
  });

  it("the champion viewer reads champion with placement 1 of N", () => {
    const ko = ctx({
      core,
      viewerManagerId: "m1",
      field: fieldOf(12),
      allMatchesCompleted: true,
    });
    expect(ko.viewer.state).toBe("champion");
    expect(ko.viewer.placement).toEqual({ rank: 1, of: 12 });
  });

  it("an earlier-round-cut viewer gets the round-survived-then-pts placement", () => {
    const ko = ctx({
      core,
      viewerManagerId: "m7",
      field: fieldOf(12, "m7"),
      allMatchesCompleted: true,
    });
    expect(ko.viewer.state).toBe("out");
    expect(ko.viewer.outRoundLabel).toBe("R16");
    // Placement: m1 champion → QF cuts (m2..m6 by QF pts) → R16 cuts (m7, m8) → m7 is 7th of 12.
    expect(ko.viewer.placement).toEqual({ rank: 7, of: 12 });
  });
});

describe("buildKnockoutContext — group phase / no ladder projects to NOTHING (rider E, pure half)", () => {
  it("returns null when the league has no knockout rounds", () => {
    const core = buildPlayoffsView(baseInput({ rounds: [], entries: [], roundScores: {} }));
    expect(
      buildKnockoutContext({
        core,
        viewerManagerId: "m1",
        field: fieldOf(12),
        allMatchesCompleted: false,
      }),
    ).toBeNull();
  });
});
