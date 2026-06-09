import { describe, it, expect } from "vitest";
import { reorderQueue } from "./queueReorder";

describe("reorderQueue — drag splice logic", () => {
  it("dragging index 0 to index 2 produces [1, 2, 0] order", () => {
    expect(reorderQueue(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("dragging index 2 to index 0 moves last item to front", () => {
    expect(reorderQueue(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("dragging to the same index returns the original order", () => {
    expect(reorderQueue(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
});
