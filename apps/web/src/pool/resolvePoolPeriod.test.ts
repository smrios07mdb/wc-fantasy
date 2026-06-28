import { describe, it, expect } from "vitest";
import { resolvePoolPeriod, THIRD_PLACE_POOL_LABEL } from "./resolvePoolPeriod";

describe("resolvePoolPeriod", () => {
  it("synthesizes a knockout_round/3P period for the 3rd-place play-off (which is always period-less)", () => {
    expect(resolvePoolPeriod({ isThirdPlace: true, period: null })).toEqual({
      periodKind: "knockout_round",
      periodLabel: THIRD_PLACE_POOL_LABEL,
    });
  });

  it("synthesizes the 3rd-place period even if (defensively) a period were somehow linked", () => {
    expect(
      resolvePoolPeriod({ isThirdPlace: true, period: { kind: "group_md", label: "MD1" } }),
    ).toEqual({ periodKind: "knockout_round", periodLabel: THIRD_PLACE_POOL_LABEL });
  });

  it("passes a normal knockout fixture through unchanged (no 3rd-place special-casing)", () => {
    expect(
      resolvePoolPeriod({ isThirdPlace: false, period: { kind: "knockout_round", label: "SF" } }),
    ).toEqual({ periodKind: "knockout_round", periodLabel: "SF" });
  });

  it("passes a group fixture through unchanged", () => {
    expect(
      resolvePoolPeriod({ isThirdPlace: false, period: { kind: "group_md", label: "MD2" } }),
    ).toEqual({ periodKind: "group_md", periodLabel: "MD2" });
  });

  it("passes an unseeded (period-less, non-3rd-place) fixture through as nulls", () => {
    expect(resolvePoolPeriod({ isThirdPlace: false, period: null })).toEqual({
      periodKind: null,
      periodLabel: null,
    });
  });
});
