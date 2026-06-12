import { describe, it, expect } from "vitest";
import { scoreManagerPeriod } from "./index";
import type { ManagerPeriodSlotInput, ScoreBreakdown } from "./types";

/** A slot whose player scored `total` points (single synthetic line). */
function scored(isStarter: boolean, total: number): ManagerPeriodSlotInput {
  const score: ScoreBreakdown = { total, lines: [{ category: "rating", points: total }] };
  return { isStarter, score };
}

/** A slot with no computed score yet — an unplayed / not-yet-locked player. */
function unscored(isStarter: boolean): ManagerPeriodSlotInput {
  return { isStarter, score: null };
}

describe("scoreManagerPeriod — pure aggregation over starters", () => {
  it("sums STARTER points only and excludes the bench", () => {
    const r = scoreManagerPeriod({
      slots: [
        scored(true, 10),
        scored(true, 5),
        scored(false, 100), // bench — excluded even though it scored big
        scored(false, 7), // bench — excluded
      ],
    });
    expect(r.total).toBe(15);
    expect(r.countedStarters).toBe(2);
  });

  it("an unplayed / not-yet-locked starter (null score) contributes 0 and is not counted", () => {
    const r = scoreManagerPeriod({
      slots: [scored(true, 8), unscored(true), scored(true, 4)],
    });
    expect(r.total).toBe(12);
    expect(r.countedStarters).toBe(2);
  });

  it("a starter who played but scored 0 still counts as a contributing starter", () => {
    const r = scoreManagerPeriod({ slots: [scored(true, 0), scored(true, 6)] });
    expect(r.total).toBe(6);
    expect(r.countedStarters).toBe(2);
  });

  it("negative starter scores are summed (cards can push a player negative)", () => {
    const r = scoreManagerPeriod({ slots: [scored(true, -3), scored(true, 9)] });
    expect(r.total).toBe(6);
    expect(r.countedStarters).toBe(2);
  });

  it("all-bench or empty lineups total 0", () => {
    expect(scoreManagerPeriod({ slots: [scored(false, 50), unscored(false)] })).toEqual({
      total: 0,
      countedStarters: 0,
    });
    expect(scoreManagerPeriod({ slots: [] })).toEqual({ total: 0, countedStarters: 0 });
  });
});

describe("scoreManagerPeriod — the forfeit model (no engine change; starters-only already handles it)", () => {
  // The lineup-forfeit engine (C1) records a forfeit by benching the played starter (is_starter → false)
  // and stamping voided_at; recompute reads is_starter only. So the rollup needs NO forfeit awareness: a
  // forfeited (voided) player arrives here as a NON-starter slot whose score (he played) is excluded, and
  // the player promoted in his place arrives as a starter and counts. This pins that contract.
  it("excludes a forfeited (benched-after-playing) starter's points and counts the player who replaced him", () => {
    const r = scoreManagerPeriod({
      slots: [
        scored(true, 9), // a normal starter
        scored(false, 12), // the FORFEITED player: he played (12) but was benched + voided → excluded
        scored(true, 4), // the incoming starter who replaced him → counts
      ],
    });
    expect(r.total).toBe(13); // 9 + 4; the forfeited 12 does not count
    expect(r.countedStarters).toBe(2);
  });
});
