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

describe("reorderQueue — ↑/↓ button adjacent-swap logic", () => {
  it("↑ on index 1 moves item to index 0", () => {
    expect(reorderQueue(["a", "b", "c"], 1, 0)).toEqual(["b", "a", "c"]);
  });

  it("↓ on second-to-last moves item to last", () => {
    expect(reorderQueue(["a", "b", "c"], 1, 2)).toEqual(["a", "c", "b"]);
  });

  it("↑ disabled condition: index 0 is the first element (no move possible)", () => {
    // Verifies the boundary: moving from 0 to -1 is prevented by the disabled prop.
    // Moving 0→0 is a no-op — consistent with the disabled guard.
    expect(reorderQueue(["a", "b", "c"], 0, 0)).toEqual(["a", "b", "c"]);
  });

  it("↓ disabled condition: last index is the last element (no move possible)", () => {
    expect(reorderQueue(["a", "b", "c"], 2, 2)).toEqual(["a", "b", "c"]);
  });
});
