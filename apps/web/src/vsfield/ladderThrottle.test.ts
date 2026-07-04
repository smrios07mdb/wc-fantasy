import { describe, it, expect } from "vitest";
import { LADDER_RESORT_MS, nextLadderOrder } from "./ladderThrottle";

const T0 = 1_000_000;

describe("nextLadderOrder — one re-sort per 10s window, membership changes immediate", () => {
  it("adopts the first order immediately", () => {
    const s = nextLadderOrder(null, ["a", "b", "c"], T0);
    expect(s.order).toEqual(["a", "b", "c"]);
    expect(s.adoptedAt).toBe(T0);
  });

  it("returns the SAME state object when the order is unchanged (no re-render churn)", () => {
    const s0 = nextLadderOrder(null, ["a", "b"], T0);
    const s1 = nextLadderOrder(s0, ["a", "b"], T0 + 5_000);
    expect(s1).toBe(s0);
  });

  it("holds a re-order inside the window, then adopts once the window elapses", () => {
    const s0 = nextLadderOrder(null, ["a", "b", "c"], T0);
    const held = nextLadderOrder(s0, ["b", "a", "c"], T0 + LADDER_RESORT_MS - 1);
    expect(held).toBe(s0);
    const adopted = nextLadderOrder(held, ["b", "a", "c"], T0 + LADDER_RESORT_MS);
    expect(adopted.order).toEqual(["b", "a", "c"]);
    expect(adopted.adoptedAt).toBe(T0 + LADDER_RESORT_MS);
  });

  it("adopts a MEMBERSHIP change immediately (round rollover — never a stale roster)", () => {
    const s0 = nextLadderOrder(null, ["a", "b", "c"], T0);
    const s1 = nextLadderOrder(s0, ["a", "b"], T0 + 1);
    expect(s1.order).toEqual(["a", "b"]);
    expect(s1.adoptedAt).toBe(T0 + 1);
  });

  it("a fresh adoption restarts the window", () => {
    const s0 = nextLadderOrder(null, ["a", "b"], T0);
    const s1 = nextLadderOrder(s0, ["b", "a"], T0 + LADDER_RESORT_MS);
    const held = nextLadderOrder(s1, ["a", "b"], T0 + LADDER_RESORT_MS + 5_000);
    expect(held).toBe(s1);
  });
});
