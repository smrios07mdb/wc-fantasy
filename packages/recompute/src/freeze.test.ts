import { describe, it, expect } from "vitest";
import { selectPeriodsToFreeze, selectAnomalyPeriods } from "./freeze";
import type { FreezePeriod, FreezeFixture } from "./freeze";

// ─── helpers ──────────────────────────────────────────────────────────────────

const T0 = new Date("2026-06-15T20:00:00Z"); // reference kickoff
const hours = (h: number) => new Date(T0.getTime() + h * 60 * 60 * 1_000);
const FREEZE_HOURS = 6;

/** Completed fixture with kickoff at `T0 + offsetHours`. */
const done = (offsetHours = 0): FreezeFixture => ({
  kickoffAt: hours(offsetHours),
  status: "completed",
});

/** Unfrozen period stub. */
const period = (id: string): FreezePeriod => ({ id, frozenAt: null });

// ─── selectPeriodsToFreeze ────────────────────────────────────────────────────

describe("selectPeriodsToFreeze", () => {
  it("freezes a period once all fixtures are completed and the window has passed", () => {
    const now = hours(FREEZE_HOURS + 1); // 1 h past threshold
    expect(
      selectPeriodsToFreeze([period("p1")], { p1: [done(0), done(-1)] }, FREEZE_HOURS, now),
    ).toEqual(["p1"]);
  });

  it("does NOT freeze before the freeze window elapses", () => {
    const now = hours(FREEZE_HOURS - 1); // 1 h before threshold
    expect(selectPeriodsToFreeze([period("p1")], { p1: [done(0)] }, FREEZE_HOURS, now)).toEqual([]);
  });

  it("freezes at the exact boundary (now === lastKickoff + freezeHours)", () => {
    const now = hours(FREEZE_HOURS); // exactly at threshold
    expect(selectPeriodsToFreeze([period("p1")], { p1: [done(0)] }, FREEZE_HOURS, now)).toEqual([
      "p1",
    ]);
  });

  it("skips an already-frozen period (idempotent)", () => {
    const frozen: FreezePeriod = { id: "p1", frozenAt: T0 };
    const now = hours(FREEZE_HOURS + 10);
    expect(selectPeriodsToFreeze([frozen], { p1: [done(0)] }, FREEZE_HOURS, now)).toEqual([]);
  });

  it("skips a period with a postponed fixture (anomaly — needs manual override)", () => {
    const now = hours(FREEZE_HOURS + 1);
    expect(
      selectPeriodsToFreeze(
        [period("p1")],
        { p1: [done(0), { kickoffAt: hours(1), status: "postponed" }] },
        FREEZE_HOURS,
        now,
      ),
    ).toEqual([]);
  });

  it("skips a period with an abandoned fixture (anomaly)", () => {
    const now = hours(FREEZE_HOURS + 1);
    expect(
      selectPeriodsToFreeze(
        [period("p1")],
        { p1: [done(0), { kickoffAt: hours(2), status: "abandoned" }] },
        FREEZE_HOURS,
        now,
      ),
    ).toEqual([]);
  });

  it("skips a period that still has in_progress fixtures", () => {
    const now = hours(FREEZE_HOURS + 1);
    expect(
      selectPeriodsToFreeze(
        [period("p1")],
        { p1: [done(0), { kickoffAt: hours(3), status: "in_progress" }] },
        FREEZE_HOURS,
        now,
      ),
    ).toEqual([]);
  });

  it("skips a period that still has a scheduled fixture", () => {
    const now = hours(FREEZE_HOURS + 1);
    expect(
      selectPeriodsToFreeze(
        [period("p1")],
        { p1: [done(0), { kickoffAt: hours(3), status: "scheduled" }] },
        FREEZE_HOURS,
        now,
      ),
    ).toEqual([]);
  });

  it("skips a period with no fixtures", () => {
    const now = hours(FREEZE_HOURS + 1);
    expect(selectPeriodsToFreeze([period("p1")], {}, FREEZE_HOURS, now)).toEqual([]);
  });

  it("uses the LAST kickoff as the freeze-threshold anchor across multiple fixtures", () => {
    // Fixtures at T0, T0+2h, T0+4h → last = T0+4h → threshold = T0+10h
    const fixtures = [done(0), done(2), done(4)];
    const now8 = hours(8); // before threshold
    const now11 = hours(11); // after threshold

    expect(selectPeriodsToFreeze([period("p1")], { p1: fixtures }, FREEZE_HOURS, now8)).toEqual([]);
    expect(selectPeriodsToFreeze([period("p1")], { p1: fixtures }, FREEZE_HOURS, now11)).toEqual([
      "p1",
    ]);
  });

  it("returns only the ready subset across multiple mixed-state periods", () => {
    // now = T0 + 7h; threshold for T0 kickoff = T0+6h (past), for T0+2h = T0+8h (future)
    const now = hours(7);

    const frozenPeriod: FreezePeriod = { id: "p-frozen", frozenAt: T0 };
    const readyPeriod = period("p-ready"); // last kickoff = T0 → threshold T0+6h ≤ now
    const notYetPeriod = period("p-notyet"); // last kickoff = T0+2h → threshold T0+8h > now
    const anomalyPeriod = period("p-anomaly");
    const incompletePeriod = period("p-incomplete");

    expect(
      selectPeriodsToFreeze(
        [frozenPeriod, readyPeriod, notYetPeriod, anomalyPeriod, incompletePeriod],
        {
          "p-frozen": [done(0)],
          "p-ready": [done(0), done(-2)],
          "p-notyet": [done(0), done(2)],
          "p-anomaly": [done(0), { kickoffAt: hours(1), status: "postponed" }],
          "p-incomplete": [done(0), { kickoffAt: hours(1), status: "scheduled" }],
        },
        FREEZE_HOURS,
        now,
      ),
    ).toEqual(["p-ready"]);
  });
});

// ─── selectAnomalyPeriods ─────────────────────────────────────────────────────

describe("selectAnomalyPeriods", () => {
  it("returns ids of unfrozen periods with postponed or abandoned fixtures", () => {
    const ids = selectAnomalyPeriods([period("p1"), period("p2"), period("p3")], {
      p1: [done(0)],
      p2: [done(0), { kickoffAt: hours(1), status: "postponed" }],
      p3: [done(0), { kickoffAt: hours(1), status: "abandoned" }],
    });
    expect(ids.sort()).toEqual(["p2", "p3"]);
  });

  it("ignores already-frozen periods", () => {
    const frozen: FreezePeriod = { id: "p1", frozenAt: T0 };
    expect(
      selectAnomalyPeriods([frozen], { p1: [{ kickoffAt: T0, status: "postponed" }] }),
    ).toEqual([]);
  });

  it("returns empty when no anomalies exist", () => {
    expect(selectAnomalyPeriods([period("p1")], { p1: [done(0)] })).toEqual([]);
  });
});
