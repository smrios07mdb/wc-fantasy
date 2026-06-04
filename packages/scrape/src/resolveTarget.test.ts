import { describe, it, expect } from "vitest";
import { resolveTarget } from "./resolveTarget";

describe("resolveTarget (stored-id only)", () => {
  it("resolves when both stored sofascore ids are present", () => {
    expect(resolveTarget({ sofascoreMatchId: 50, sofascorePlayerId: 1001 })).toEqual({
      sofascoreMatchId: 50,
      sofascorePlayerId: 1001,
    });
  });
  it("returns null when the match id is missing (→ no scrape row, fallback)", () => {
    expect(resolveTarget({ sofascoreMatchId: null, sofascorePlayerId: 1001 })).toBeNull();
  });
  it("returns null when the player id is missing", () => {
    expect(resolveTarget({ sofascoreMatchId: 50, sofascorePlayerId: null })).toBeNull();
  });
});
