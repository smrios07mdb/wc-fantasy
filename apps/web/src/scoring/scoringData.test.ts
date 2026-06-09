import { describe, it, expect } from "vitest";
import { SECTION_HEADINGS, EXAMPLE_CARDS } from "./scoringData";

describe("scoringData — the static /scoring reference content (pure, IO-free)", () => {
  it("declares the eight rule sections, in render order", () => {
    expect(SECTION_HEADINGS).toHaveLength(8);
    expect(SECTION_HEADINGS[5]).toBe("Role Outcomes: GK & DEF");
  });

  it("has one example card per position (GK / DEF / MID / FWD)", () => {
    expect(EXAMPLE_CARDS.map((c) => c.position)).toEqual(["GK", "DEF", "MID", "FWD"]);
  });

  // updated: MID 13→17, FWD 20→21 per Prompt 29 (per-N bucket conversions)
  it("each card's breakdown rows sum to its stated total (14 / 20 / 17 / 21)", () => {
    for (const card of EXAMPLE_CARDS) {
      const summed = card.lines.reduce((acc, l) => acc + l.pts, 0);
      expect(summed, `${card.position} card total`).toBe(card.total);
    }
    expect(EXAMPLE_CARDS.map((c) => c.total)).toEqual([14, 20, 17, 21]);
  });
});
