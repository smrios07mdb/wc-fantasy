import { describe, it, expect } from "vitest";
import { acquisitionWindowState, type PeriodWindowView } from "./window";

/**
 * The shared acquisition-window predicate (DECISIONS.md → Theme D amendment). Three phases keyed on
 * the period's batch-clear + first-kickoff instants. Pure: `now` is injected.
 */

function period(over: Partial<PeriodWindowView> = {}): PeriodWindowView {
  return {
    batchClearedAt: null,
    firstKickoffAt: new Date("2026-06-11T12:00:00Z"),
    ...over,
  };
}

const FIRST_KICK = new Date("2026-06-11T12:00:00Z");

describe("acquisitionWindowState", () => {
  it("is sealed-bid before the batch clears", () => {
    expect(acquisitionWindowState(period(), new Date("2026-06-11T03:00:00Z"))).toBe("sealed-bid");
  });

  it("opens free-agency after the batch clears, before first kickoff", () => {
    const cleared = period({ batchClearedAt: new Date("2026-06-11T06:00:00Z") });
    expect(acquisitionWindowState(cleared, new Date("2026-06-11T07:00:00Z"))).toBe("free-agency");
  });

  it("MD1 regression: a CLEARED latch ⇒ free-agency even with first kickoff still ahead (non-UTC tz)", () => {
    // The boundary keys on the actual `batch_cleared_at` LATCH, not a scheduled batch time. Instants use a
    // −04:00 offset to show the predicate compares ABSOLUTE instants (tz only affects display). A sealed $0
    // bid placed in THIS phase was accepted then stranded behind the latch in MD1 — now it's free-agency.
    const cleared = period({
      batchClearedAt: new Date("2026-06-11T02:00:00-04:00"),
      firstKickoffAt: new Date("2026-06-11T08:00:00-04:00"),
    });
    expect(acquisitionWindowState(cleared, new Date("2026-06-11T04:00:00-04:00"))).toBe(
      "free-agency",
    );
  });

  it("is LOCKED at the period's first kickoff (hard league-wide lock — FA closed)", () => {
    const cleared = period({ batchClearedAt: new Date("2026-06-11T06:00:00Z") });
    expect(acquisitionWindowState(cleared, FIRST_KICK)).toBe("locked");
    expect(acquisitionWindowState(cleared, new Date("2026-06-11T18:00:00Z"))).toBe("locked");
  });

  it("a not-yet-scheduled period (no fixtures) stays sealed-bid (no deadline, no lock)", () => {
    expect(acquisitionWindowState(period({ firstKickoffAt: null }), new Date())).toBe("sealed-bid");
  });

  it(
    "a mid-window drop is held to the NEXT period: the just-played period is locked while the next " +
      "period still only accepts sealed bids (clearing at its own batch)",
    () => {
      const now = new Date("2026-06-11T13:00:00Z"); // P1 underway
      const p1 = period({
        batchClearedAt: new Date("2026-06-11T06:00:00Z"),
        firstKickoffAt: FIRST_KICK,
      });
      const p2 = period({ firstKickoffAt: new Date("2026-06-16T12:00:00Z") });
      expect(acquisitionWindowState(p1, now)).toBe("locked");
      expect(acquisitionWindowState(p2, now)).toBe("sealed-bid");
    },
  );
});
