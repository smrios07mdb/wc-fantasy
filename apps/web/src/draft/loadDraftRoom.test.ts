import { vi, describe, it, expect } from "vitest";

// Mock @app/db so vitest doesn't need a live Prisma connection when importing the IO edge.
vi.mock("@app/db", () => ({ prisma: {} }));
// @app/draft is used only in the async loadDraftRoom fn — mock it too to keep the import clean.
vi.mock("@app/draft", () => ({ orderDraftPool: vi.fn() }));

import { toPlayer } from "../../app/draft/loadDraftRoom";

// Pure unit test for the toPlayer mapper (Prompt 34). The IO layer (loadDraftRoom) is untested by
// design; this isolates the country-binding logic: DraftPlayer.country flows from team.name.

describe("toPlayer — country binding from FifaTeam.name", () => {
  it("sets country from team.name when team is present", () => {
    const row = {
      id: "p1",
      displayName: "Lamine Yamal",
      firstName: "Lamine",
      lastName: "Yamal",
      position: "FWD" as const,
      team: { name: "Spain" },
    };
    expect(toPlayer(row).country).toBe("Spain");
  });

  it("sets country to null when team is null", () => {
    const row = {
      id: "p2",
      displayName: "Unknown",
      firstName: null,
      lastName: null,
      position: "MID" as const,
      team: null,
    };
    expect(toPlayer(row).country).toBeNull();
  });
});
