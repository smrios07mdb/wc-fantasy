import { describe, it, expect } from "vitest";
import { managerForPick } from "./snake";

const FOUR = ["A", "B", "C", "D"];

describe("managerForPick — serpentine snake order", () => {
  it("round 1 runs forward through the seeded slot order", () => {
    expect([1, 2, 3, 4].map((p) => managerForPick(p, FOUR))).toEqual(["A", "B", "C", "D"]);
  });

  it("round 2 reverses (the snake turn)", () => {
    expect([5, 6, 7, 8].map((p) => managerForPick(p, FOUR))).toEqual(["D", "C", "B", "A"]);
  });

  it("round 3 runs forward again", () => {
    expect([9, 10, 11, 12].map((p) => managerForPick(p, FOUR))).toEqual(["A", "B", "C", "D"]);
  });

  it("maps the boundary picks of a turn correctly (last of a round, first of the next)", () => {
    // pick 4 = D (end of round 1), pick 5 = D again (D opens round 2 by snaking back)
    expect(managerForPick(4, FOUR)).toBe("D");
    expect(managerForPick(5, FOUR)).toBe("D");
    // pick 8 = A (end of round 2), pick 9 = A again (A opens round 3)
    expect(managerForPick(8, FOUR)).toBe("A");
    expect(managerForPick(9, FOUR)).toBe("A");
  });

  it("handles a single-manager draft (always that manager)", () => {
    expect([1, 2, 3].map((p) => managerForPick(p, ["solo"]))).toEqual(["solo", "solo", "solo"]);
  });

  it("rejects a pick number below 1", () => {
    expect(() => managerForPick(0, FOUR)).toThrow();
  });

  it("rejects an empty manager order", () => {
    expect(() => managerForPick(1, [])).toThrow();
  });
});
