import { describe, it, expect } from "vitest";
import {
  effectiveBatchAt,
  selectPeriodsToClear,
  acquisitionWindowState,
  type PeriodCadenceView,
} from "./selectors";

/**
 * Pure per-period FAAB cadence (DECISIONS.md → Theme D "per-matchday acquisition window" amendment).
 * One blind-bid batch per scoring period, clearing before the period's first kickoff; idempotent via
 * the `batchClearedAt` latch. These pin the trigger selection, the commissioner override, and the
 * three acquisition-window phases — all with literal dates (the fns carry no clock).
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

describe("acquisitionWindowState — the three phases (FA window)", () => {
  const FIRST_KICK = new Date("2026-06-11T12:00:00Z");

  it("is sealed-bid before the batch clears", () => {
    const now = new Date("2026-06-11T03:00:00Z");
    expect(acquisitionWindowState(period(), now, LEAD)).toBe("sealed-bid");
  });

  it("opens free-agency after the batch clears, before first kickoff", () => {
    const now = new Date("2026-06-11T07:00:00Z");
    const cleared = period({ batchClearedAt: new Date("2026-06-11T06:00:00Z") });
    expect(acquisitionWindowState(cleared, now, LEAD)).toBe("free-agency");
  });

  it("is LOCKED at the period's first kickoff (hard league-wide lock — FA closed)", () => {
    const cleared = period({ batchClearedAt: new Date("2026-06-11T06:00:00Z") });
    expect(acquisitionWindowState(cleared, FIRST_KICK, LEAD)).toBe("locked");
    expect(acquisitionWindowState(cleared, new Date("2026-06-11T18:00:00Z"), LEAD)).toBe("locked");
  });

  it(
    "a mid-window drop is held to the NEXT period's batch: the just-played period is locked while the " +
      "next period still only accepts sealed bids (clearing at its own batch)",
    () => {
      const now = new Date("2026-06-11T13:00:00Z"); // P1 underway
      const p1 = period({
        id: "P1",
        firstKickoffAt: FIRST_KICK,
        batchClearedAt: new Date("2026-06-11T06:00:00Z"),
      });
      const p2 = period({ id: "P2", firstKickoffAt: new Date("2026-06-16T12:00:00Z") });
      expect(acquisitionWindowState(p1, now, LEAD)).toBe("locked"); // can't re-grab a P1 player mid-period
      expect(acquisitionWindowState(p2, now, LEAD)).toBe("sealed-bid"); // a drop re-enters via P2's batch
    },
  );
});
