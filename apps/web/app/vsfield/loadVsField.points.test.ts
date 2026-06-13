import { vi, describe, it, expect } from "vitest";

// Mock @app/db so importing the IO edge doesn't need a live Prisma connection (the loadDraftRoom
// convention). We exercise ONLY the exported PURE helper — the IO loader itself stays untested by
// design (it needs a live DB; tsc + the @app/vsfield suite cover the shapes it produces).
vi.mock("@app/db", () => ({ prisma: {} }));

import { playerPointsLookup } from "./loadVsField";

// Prompt 41 (path a): per-player points are joined SERVER-SIDE from the period's score_player_match
// rows onto each starter, defaulting a starter with no scored row to 0. This is that join, in isolation.
describe("playerPointsLookup — path-(a) per-player points join (no-row → 0)", () => {
  it("returns a player's real score_player_match.points when a row exists (played / live)", () => {
    const lookup = playerPointsLookup([
      { playerId: "p-played", points: 9 },
      { playerId: "p-live", points: 4 },
    ]);
    expect(lookup("p-played")).toBe(9);
    expect(lookup("p-live")).toBe(4);
  });

  it("defaults a starter with no scored row to 0 (yet-to-play, or live-but-not-yet-appeared)", () => {
    const lookup = playerPointsLookup([{ playerId: "p-played", points: 9 }]);
    expect(lookup("p-ytp")).toBe(0);
    expect(lookup("p-missing")).toBe(0);
  });

  it("carries a real 0 (a player whose scored row is 0) — indistinguishable from absence, both read 0", () => {
    const lookup = playerPointsLookup([{ playerId: "p-zero", points: 0 }]);
    expect(lookup("p-zero")).toBe(0);
  });
});
