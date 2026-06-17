import { describe, it, expect } from "vitest";
import { STAT_DIRTY_UPDATE } from "./dirty";

describe("STAT_DIRTY_UPDATE (shared no-clobber invariant)", () => {
  it("the CONFLICT/update branch flips ONLY `dirty` — never a stat column", () => {
    // Used by @app/ingest (05a event re-mark): a late write must re-dirty the player WITHOUT nulling
    // stats that already landed. Nulls live only in the insert branch.
    expect(STAT_DIRTY_UPDATE).toEqual({ dirty: true });
    expect(Object.keys(STAT_DIRTY_UPDATE)).toEqual(["dirty"]);
  });
});
