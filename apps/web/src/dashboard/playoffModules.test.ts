import { describe, it, expect } from "vitest";
import type { RankedRow, RankedState, PlayoffRoundView, ManagerSeasonStats } from "@app/recompute";
import { selectSurvivalView, selectChampionPodium, selectViewerFinish } from "./playoffModules";

// ─── fixtures ───────────────────────────────────────────────────────────────────────────────

function row(
  managerId: string,
  points: number,
  rank: number,
  state: RankedState,
  seed = rank,
): RankedRow {
  return { managerId, seed, points, rank, state };
}

function round(
  idx: number,
  label: string,
  status: PlayoffRoundView["status"],
  opts: Partial<Omit<PlayoffRoundView, "idx" | "round" | "status">> = {},
): PlayoffRoundView {
  return {
    idx,
    round: label,
    status,
    fieldCount: opts.fieldCount ?? 0,
    cutCount: opts.cutCount ?? 0,
    survives: opts.survives ?? 0,
    ranked: opts.ranked ?? null,
    survivors: opts.survivors ?? null,
    eliminatedIds: opts.eliminatedIds ?? null,
  };
}

const stat = (
  totalTitlePoints: number,
  powerW: number,
  powerL: number,
  bestWeek: number,
): ManagerSeasonStats => ({
  totalTitlePoints,
  powerW,
  powerL,
  bestWeek,
});

// ─── selectSurvivalView ─────────────────────────────────────────────────────────────────────

describe("selectSurvivalView — live guillotine round summary", () => {
  // 8-strong R16, cut 2: m1 m2 me m4 m5 m6 safe / m7 m8 in the zone.
  const liveRanked: RankedRow[] = [
    row("m1", 90, 1, "safe"),
    row("m2", 80, 2, "safe"),
    row("me", 70, 3, "safe"),
    row("m4", 60, 4, "safe"),
    row("m5", 55, 5, "safe"),
    row("m6", 50, 6, "safe"),
    row("m7", 40, 7, "zone"),
    row("m8", 30, 8, "zone"),
  ];
  const liveRound = round(0, "R16", "live", {
    fieldCount: 8,
    cutCount: 2,
    survives: 6,
    ranked: liveRanked,
    survivors: ["m1", "m2", "me", "m4", "m5", "m6"],
    eliminatedIds: ["m7", "m8"],
  });

  it("safe viewer: margin = me.points − first cut row's points (≥0, clear of the blade)", () => {
    const v = selectSurvivalView({
      managerId: "me",
      rounds: [liveRound],
      currentRoundIdx: 0,
      me: row("me", 70, 3, "safe"),
      aliveNow: 8,
      survivesNow: 6,
    });
    expect(v.roundLabel).toBe("R16");
    expect(v.status).toBe("live");
    expect(v.rows).toHaveLength(8);
    expect(v.meSafe).toBe(true);
    expect(v.marginPoints).toBe(30); // 70 − 40 (m7, first cut)
    expect(v.cutCount).toBe(2);
    expect(v.zoneCount).toBe(2);
    expect(v.aliveNow).toBe(8);
    expect(v.survivesNow).toBe(6);
    expect(v.rows.find((r) => r.managerId === "me")?.isMe).toBe(true);
    expect(v.rows.filter((r) => r.isMe)).toHaveLength(1);
  });

  it("zoned viewer: margin = me.points − last safe row's points (≤0, short of safety)", () => {
    // me drops to 35 — below m6 (50). Reshape so me is rank 7 in the zone, m3 takes the last safe slot.
    const ranked: RankedRow[] = [
      row("m1", 90, 1, "safe"),
      row("m2", 80, 2, "safe"),
      row("m4", 60, 3, "safe"),
      row("m5", 55, 4, "safe"),
      row("m6", 50, 5, "safe"),
      row("m3", 45, 6, "safe"),
      row("me", 35, 7, "zone"),
      row("m8", 30, 8, "zone"),
    ];
    const r = round(0, "R16", "live", { cutCount: 2, ranked, eliminatedIds: ["me", "m8"] });
    const v = selectSurvivalView({
      managerId: "me",
      rounds: [r],
      currentRoundIdx: 0,
      me: row("me", 35, 7, "zone"),
      aliveNow: 8,
      survivesNow: 6,
    });
    expect(v.meSafe).toBe(false);
    expect(v.marginPoints).toBe(-10); // 35 − 45 (m3, last safe)
    expect(v.zoneCount).toBe(2);
  });

  it("boundary tie: zoneCount tracks the provisional zone (eliminatedIds), not cutCount", () => {
    // cut 1, but two tied at the bottom both shown in the zone until adjudicated.
    const ranked: RankedRow[] = [
      row("m1", 90, 1, "safe"),
      row("me", 80, 2, "safe"),
      row("m3", 70, 3, "safe"),
      row("m4", 50, 4, "zone"),
      row("m5", 50, 5, "zone"),
    ];
    const r = round(0, "R16", "live", { cutCount: 1, ranked, eliminatedIds: ["m4", "m5"] });
    const v = selectSurvivalView({
      managerId: "me",
      rounds: [r],
      currentRoundIdx: 0,
      me: row("me", 80, 2, "safe"),
      aliveNow: 5,
      survivesNow: 4,
    });
    expect(v.cutCount).toBe(1);
    expect(v.zoneCount).toBe(2); // the whole tied set
    expect(v.marginPoints).toBe(30); // 80 − 50 (first cut)
  });

  it("viewer not in the round (me null): rows present, margin + meSafe null", () => {
    const v = selectSurvivalView({
      managerId: "ghost",
      rounds: [liveRound],
      currentRoundIdx: 0,
      me: null,
      aliveNow: 8,
      survivesNow: 6,
    });
    expect(v.rows).toHaveLength(8);
    expect(v.meSafe).toBeNull();
    expect(v.marginPoints).toBeNull();
    expect(v.rows.some((r) => r.isMe)).toBe(false);
  });

  it("future / unranked current round: empty rows, status carried, margin null", () => {
    const future = round(1, "QF", "future", { ranked: null });
    const v = selectSurvivalView({
      managerId: "me",
      rounds: [round(0, "R16", "live", { ranked: [] }), future],
      currentRoundIdx: 1,
      me: null,
      aliveNow: 4,
      survivesNow: 2,
    });
    expect(v.rows).toHaveLength(0);
    expect(v.status).toBe("future");
    expect(v.roundLabel).toBe("QF");
    expect(v.marginPoints).toBeNull();
  });

  it("out-of-range current round: status 'none', empty", () => {
    const v = selectSurvivalView({
      managerId: "me",
      rounds: [],
      currentRoundIdx: 0,
      me: null,
      aliveNow: 0,
      survivesNow: 0,
    });
    expect(v.status).toBe("none");
    expect(v.roundLabel).toBeNull();
    expect(v.rows).toHaveLength(0);
  });
});

// ─── selectChampionPodium ───────────────────────────────────────────────────────────────────

describe("selectChampionPodium — champion + runner-up with names + total title points", () => {
  const names = { m1: "Ana", m2: "Bo", me: "You" };
  const seasonStats = { m1: stat(140, 7, 1, 52), m2: stat(118, 6, 2, 48) };
  const finalRound = round(2, "Final", "past", {
    ranked: [row("m1", 50, 1, "safe"), row("m2", 44, 2, "eliminated")],
    survivors: ["m1"],
    eliminatedIds: ["m2"],
  });
  const rounds = [round(0, "R16", "past"), round(1, "SF", "past"), finalRound];

  it("resolves champion + runner-up (cut in the Final) from managerNames, carrying total title points", () => {
    const p = selectChampionPodium({
      managerId: "me",
      champion: "m1",
      totalRounds: 3,
      rounds,
      managerNames: names,
      seasonStats,
    });
    expect(p.champion).toEqual({
      managerId: "m1",
      name: "Ana",
      isMe: false,
      totalTitlePoints: 140,
    });
    expect(p.runnerUp).toEqual({ managerId: "m2", name: "Bo", isMe: false, totalTitlePoints: 118 });
  });

  it("marks isMe when the viewer is the champion", () => {
    const p = selectChampionPodium({
      managerId: "m1",
      champion: "m1",
      totalRounds: 3,
      rounds,
      managerNames: names,
      seasonStats,
    });
    expect(p.champion?.isMe).toBe(true);
  });

  it("no champion yet → both null", () => {
    const p = selectChampionPodium({
      managerId: "me",
      champion: null,
      totalRounds: 3,
      rounds,
      managerNames: names,
      seasonStats,
    });
    expect(p).toEqual({ champion: null, runnerUp: null });
  });

  it("falls back to managerId for a missing name AND 0 for missing season stats; null runner-up when the Final has no cut", () => {
    const p = selectChampionPodium({
      managerId: "me",
      champion: "mX",
      totalRounds: 1,
      rounds: [round(0, "Final", "past", { eliminatedIds: null })],
      managerNames: {},
      seasonStats: {},
    });
    expect(p.champion).toEqual({ managerId: "mX", name: "mX", isMe: false, totalTitlePoints: 0 });
    expect(p.runnerUp).toBeNull();
  });
});

// ─── selectViewerFinish ─────────────────────────────────────────────────────────────────────

describe("selectViewerFinish — the viewer's knockout finish + season recap", () => {
  const finalRound = round(2, "Final", "past", {
    ranked: [row("m1", 50, 1, "safe", 4), row("m2", 44, 2, "eliminated", 1)],
    eliminatedIds: ["m2"],
  });
  const r16 = round(0, "R16", "past", {
    ranked: [row("m5", 20, 7, "eliminated", 7)],
    eliminatedIds: ["m5", "m6"],
  });
  const rounds = [r16, round(1, "SF", "past"), finalRound];
  const seedOf = { m1: 4, m2: 1, m5: 7 };
  // Season rows: m1 power 7-1 / 140 pts / best 52; m2 6-2 / 118 / 48; m5 3-4 / 60 / 18.
  const seasonStats = { m1: stat(140, 7, 1, 52), m2: stat(118, 6, 2, 48), m5: stat(60, 3, 4, 18) };

  it("champion: outcome champion + Final rank/points + the viewer's season recap", () => {
    const f = selectViewerFinish({
      managerId: "m1",
      champion: "m1",
      totalRounds: 3,
      rounds,
      seedOf,
      seasonStats,
    });
    expect(f).toEqual({
      outcome: "champion",
      seed: 4,
      roundLabel: "Final",
      rank: 1,
      points: 50,
      powerW: 7,
      powerL: 1,
      totalTitlePoints: 140,
      bestWeek: 52,
    });
  });

  it("runner-up: cut in the LAST round → runner-up (not generic eliminated), with season recap", () => {
    const f = selectViewerFinish({
      managerId: "m2",
      champion: "m1",
      totalRounds: 3,
      rounds,
      seedOf,
      seasonStats,
    });
    expect(f.outcome).toBe("runner-up");
    expect(f.roundLabel).toBe("Final");
    expect(f.rank).toBe(2);
    expect(f.points).toBe(44);
    expect(f.seed).toBe(1);
    expect(f.powerW).toBe(6);
    expect(f.powerL).toBe(2);
    expect(f.totalTitlePoints).toBe(118);
    expect(f.bestWeek).toBe(48);
  });

  it("eliminated mid-ladder: outcome eliminated, the round they went out + that round's rank/points + season recap", () => {
    const f = selectViewerFinish({
      managerId: "m5",
      champion: "m1",
      totalRounds: 3,
      rounds,
      seedOf,
      seasonStats,
    });
    expect(f.outcome).toBe("eliminated");
    expect(f.roundLabel).toBe("R16");
    expect(f.rank).toBe(7);
    expect(f.points).toBe(20);
    expect(f.seed).toBe(7);
    expect(f.powerW).toBe(3);
    expect(f.powerL).toBe(4);
    expect(f.totalTitlePoints).toBe(60);
    expect(f.bestWeek).toBe(18);
  });

  it("non-participant (not champion, not in any eliminatedIds) → unknown + zeroed season recap", () => {
    const f = selectViewerFinish({
      managerId: "ghost",
      champion: "m1",
      totalRounds: 3,
      rounds,
      seedOf,
      seasonStats,
    });
    expect(f).toEqual({
      outcome: "unknown",
      seed: null,
      roundLabel: null,
      rank: null,
      points: null,
      powerW: 0,
      powerL: 0,
      totalTitlePoints: 0,
      bestWeek: 0,
    });
  });
});
