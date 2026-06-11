import { describe, it, expect } from "vitest";
import { DEFAULT_FAAB_BATCH_LEAD_MIN, effectiveBatchAt, type PeriodCadenceView } from "./batchTime";

/**
 * The per-period FAAB batch deadline (DECISIONS.md → Theme D "per-matchday acquisition window").
 * `effectiveBatchAt` was extracted FROM the worker INTO @app/faab so the web waivers screen can compute
 * the SAME instant the worker fires (apps/web cannot import apps/worker — the constraint that moved
 * `acquisitionWindowState` here too). These pin the override-vs-default rule with literal dates.
 */

const LEAD = DEFAULT_FAAB_BATCH_LEAD_MIN * 60_000; // 6h default.

function period(over: Partial<PeriodCadenceView> = {}): PeriodCadenceView {
  return {
    id: "P1",
    leagueId: "L",
    batchClearedAt: null,
    waiverBatchAt: null,
    firstKickoffAt: new Date("2026-06-11T12:00:00Z"), // period's first kickoff
    ...over,
  };
}

describe("DEFAULT_FAAB_BATCH_LEAD_MIN", () => {
  it("is the shared 360-minute (6h) default both web + worker anchor to", () => {
    expect(DEFAULT_FAAB_BATCH_LEAD_MIN).toBe(360);
  });
});

describe("effectiveBatchAt", () => {
  it("defaults to first kickoff − lead when no commissioner override", () => {
    // 12:00 − 6h = 06:00.
    expect(effectiveBatchAt(period(), LEAD)).toEqual(new Date("2026-06-11T06:00:00Z"));
  });

  it("uses the commissioner override verbatim when set (configurable per period)", () => {
    const at = new Date("2026-06-11T09:30:00Z");
    expect(effectiveBatchAt(period({ waiverBatchAt: at }), LEAD)).toEqual(at);
  });

  it("is null when the period has no fixtures and no override (no anchor)", () => {
    expect(effectiveBatchAt(period({ firstKickoffAt: null }), LEAD)).toBeNull();
  });
});
