import { describe, it, expect } from "vitest";
import { selectPeriodsToClear, type PeriodCadenceView } from "./selectors";

/**
 * Pure per-period FAAB cadence (DECISIONS.md → Theme D "per-matchday acquisition window" amendment).
 * One blind-bid batch per scoring period, clearing before the period's first kickoff; idempotent via
 * the `batchClearedAt` latch. These pin the worker's trigger selection — the deadline math itself
 * (`effectiveBatchAt`) moved to @app/faab and is unit-tested in `packages/faab/src/batchTime.test.ts`;
 * here we prove the trigger consumes it correctly (worker behavior preserved post-extraction).
 */

const LEAD = 6 * 60 * 60_000; // 6h default (FAAB_BATCH_LEAD_MIN=360); see worker config.

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

describe("selectPeriodsToClear — the per-period trigger", () => {
  it("fires once the effective deadline has passed", () => {
    const now = new Date("2026-06-11T06:00:00Z"); // exactly the deadline
    expect(selectPeriodsToClear([period()], now, LEAD)).toEqual(["P1"]);
  });

  it("does NOT fire before the deadline", () => {
    const now = new Date("2026-06-11T05:59:59Z");
    expect(selectPeriodsToClear([period()], now, LEAD)).toEqual([]);
  });

  it("is idempotent: a period whose batchClearedAt latch is set is never re-selected", () => {
    const now = new Date("2026-06-11T08:00:00Z"); // well past the deadline
    const cleared = period({ batchClearedAt: new Date("2026-06-11T06:00:01Z") });
    expect(selectPeriodsToClear([cleared], now, LEAD)).toEqual([]);
  });

  it("skips a period with no fixtures (no deadline to evaluate)", () => {
    const now = new Date("2026-06-11T23:00:00Z");
    expect(selectPeriodsToClear([period({ firstKickoffAt: null })], now, LEAD)).toEqual([]);
  });

  it("still fires AFTER first kickoff if the latch was never stamped (worker-was-down recovery)", () => {
    // The resolver's per-player void-refund defends late clears; the batch must not be silently skipped.
    const now = new Date("2026-06-11T13:00:00Z"); // past the 12:00 first kickoff
    expect(selectPeriodsToClear([period()], now, LEAD)).toEqual(["P1"]);
  });

  it("honors the commissioner override deadline over the computed default", () => {
    const now = new Date("2026-06-11T09:30:00Z");
    const overridden = period({ waiverBatchAt: new Date("2026-06-11T09:30:00Z") });
    // default deadline (06:00) already passed, but so has the override — fires either way; assert it
    // fires AT the override and NOT one minute before it.
    expect(selectPeriodsToClear([overridden], new Date("2026-06-11T09:29:00Z"), LEAD)).toEqual([]);
    expect(selectPeriodsToClear([overridden], now, LEAD)).toEqual(["P1"]);
  });

  it("selects only the due periods among several", () => {
    const md1 = period({ id: "MD1", firstKickoffAt: new Date("2026-06-11T12:00:00Z") });
    const md2 = period({ id: "MD2", firstKickoffAt: new Date("2026-06-16T12:00:00Z") });
    const now = new Date("2026-06-11T06:00:00Z"); // MD1 due (06:00), MD2 not (its deadline is Jun 16 06:00)
    expect(selectPeriodsToClear([md1, md2], now, LEAD)).toEqual(["MD1"]);
  });
});
