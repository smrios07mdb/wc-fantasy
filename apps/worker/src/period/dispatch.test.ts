import { describe, it, expect } from "vitest";
import { dispatchPeriodStatusAdvance } from "./dispatch";
import { MemoryPeriodStatusStore } from "./memoryStore";
import type { LifecyclePeriod } from "./store";

/**
 * The resident-tick PERIOD STATUS-ADVANCE driver (P1a — the dual-writer redundancy; DECISIONS.md
 * "dual-writer status-advance"): each 60s tick re-runs the UNCHANGED pure `selectPeriodStatusTransitions`
 * and applies it through the SAME guarded `updateMany` shape as the `wc-fantasy-period-close` cron, so a
 * stalled cron no longer silently skips a round's status-open / FA-window mount. Idempotency is the
 * guarded WHERE (close only a not-yet-closed row, open only a still-pending row): the tick may fire
 * repeatedly and the transition must apply exactly once. Exercised against the in-memory double.
 */

function period(over: Partial<LifecyclePeriod> & { id: string; label: string }): LifecyclePeriod {
  return { frozenAt: null, status: "pending", matches: [], ...over };
}

const KO_MD1 = new Date("2026-06-11T12:00:00Z");
const KO_MD2 = new Date("2026-06-15T12:00:00Z");

/** MD1 over (open, every fixture completed); MD2 not yet started (pending, scheduled). */
function handoffState(): MemoryPeriodStatusStore {
  return new MemoryPeriodStatusStore([
    period({
      id: "MD1",
      label: "MD1",
      status: "open",
      matches: [{ kickoffAt: KO_MD1, status: "completed" }],
    }),
    period({
      id: "MD2",
      label: "MD2",
      status: "pending",
      matches: [{ kickoffAt: KO_MD2, status: "scheduled" }],
    }),
  ]);
}

describe("dispatchPeriodStatusAdvance — the resident-tick second writer", () => {
  it("advances on a tick: closes the finished wave and opens the next pending one", async () => {
    const store = handoffState();

    const res = await dispatchPeriodStatusAdvance(store);

    expect(res.toClose).toEqual(["MD1"]);
    expect(res.toOpen).toEqual(["MD2"]);
    expect(store.statusOf("MD1")).toBe("closed");
    expect(store.statusOf("MD2")).toBe("open"); // the FA-window mount the SPOF used to silently miss
    expect(store.applyCalls).toBe(1);
  });

  it("is idempotent across consecutive ticks: the second tick is a clean no-op (no write)", async () => {
    const store = handoffState();

    await dispatchPeriodStatusAdvance(store);
    const second = await dispatchPeriodStatusAdvance(store);

    expect(second.toClose).toEqual([]);
    expect(second.toOpen).toEqual([]);
    expect(store.applyCalls).toBe(1); // the no-op tick skipped applyStatusTransitions entirely
    expect(store.statusOf("MD1")).toBe("closed");
    expect(store.statusOf("MD2")).toBe("open");
  });

  it("steady state (current wave already open, not yet over) is a no-op that never writes", async () => {
    const store = new MemoryPeriodStatusStore([
      period({
        id: "MD1",
        label: "MD1",
        status: "open",
        matches: [{ kickoffAt: KO_MD1, status: "in_progress" }],
      }),
      period({
        id: "MD2",
        label: "MD2",
        status: "pending",
        matches: [{ kickoffAt: KO_MD2, status: "scheduled" }],
      }),
    ]);

    const res = await dispatchPeriodStatusAdvance(store);

    expect(res.toClose).toEqual([]);
    expect(res.toOpen).toEqual([]); // current = MD1 (open, not pending) → nothing to open
    expect(store.applyCalls).toBe(0);
    expect(store.statusOf("MD1")).toBe("open");
    expect(store.statusOf("MD2")).toBe("pending");
  });
});
