import { describe, it, expect } from "vitest";
import { STAT_DIRTY_UPDATE } from "./prismaStore";

describe("stat dirty-mark upsert invariant (clobber guard)", () => {
  it("the CONFLICT/update branch flips ONLY `dirty` — never a stat column", () => {
    // The mirror of the bug we just fixed: a late event (e.g. an 80th-minute booking arriving after the
    // live stats already populated the row) must re-dirty the player WITHOUT nulling real minutes/goals.
    // The all-null stub lives only in the create/insert branch; the update branch touches only the flag.
    expect(STAT_DIRTY_UPDATE).toEqual({ dirty: true });
    expect(Object.keys(STAT_DIRTY_UPDATE)).toEqual(["dirty"]); // no stat column may ever enter the update
  });
});
