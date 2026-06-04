import { describe, it, expect } from "vitest";
import type { RatingRow } from "./resolver";
import { resolveRating, pickRating } from "./resolver";

const rows = (...rs: RatingRow[]): RatingRow[] => rs;

describe("resolveRating — source priority [manual, scrape, balldontlie]", () => {
  it("manual wins over scrape and balldontlie", () => {
    const r = rows(
      { source: "balldontlie", rating: 6.0 },
      { source: "scrape", rating: 7.0 },
      { source: "manual", rating: 8.5 },
    );
    expect(resolveRating(r)).toBe(8.5);
    expect(pickRating(r).source).toBe("manual");
  });

  it("scrape (primary) wins over balldontlie when there is no manual override", () => {
    const r = rows({ source: "balldontlie", rating: 6.0 }, { source: "scrape", rating: 7.2 });
    expect(resolveRating(r)).toBe(7.2);
    expect(pickRating(r).source).toBe("scrape");
  });

  it("balldontlie is the automatic fallback when the scrape is missing", () => {
    const r = rows({ source: "balldontlie", rating: 6.4 });
    expect(resolveRating(r)).toBe(6.4);
    expect(pickRating(r).source).toBe("balldontlie");
  });

  it("a present-but-null higher-priority source falls through to the next", () => {
    const r = rows({ source: "scrape", rating: null }, { source: "balldontlie", rating: 6.9 });
    expect(resolveRating(r)).toBe(6.9);
    expect(pickRating(r).source).toBe("balldontlie");
  });

  it("all sources null/absent → null (no rating, no source)", () => {
    expect(resolveRating(rows({ source: "scrape", rating: null }))).toBeNull();
    expect(resolveRating(rows())).toBeNull();
    expect(pickRating(rows())).toEqual({ rating: null, source: null });
  });

  it("a 0.0 rating is honored (not treated as null)", () => {
    expect(resolveRating(rows({ source: "scrape", rating: 0 }))).toBe(0);
  });

  it("a reordered priority is honored (balldontlie-first)", () => {
    const r = rows({ source: "scrape", rating: 7.0 }, { source: "balldontlie", rating: 6.0 });
    expect(resolveRating(r, ["balldontlie", "scrape", "manual"])).toBe(6.0);
  });
});
