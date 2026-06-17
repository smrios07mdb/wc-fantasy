import { describe, it, expect } from "vitest";
import type { RatingRow } from "./resolver";
import { resolveRating, pickRating } from "./resolver";

const rows = (...rs: RatingRow[]): RatingRow[] => rs;

describe("resolveRating — source priority [manual, balldontlie]", () => {
  it("manual overrides the balldontlie canonical rating", () => {
    const r = rows({ source: "balldontlie", rating: 6.0 }, { source: "manual", rating: 8.5 });
    expect(resolveRating(r)).toBe(8.5);
    expect(pickRating(r).source).toBe("manual");
  });

  it("balldontlie is the canonical source when there is no manual override", () => {
    const r = rows({ source: "balldontlie", rating: 6.4 });
    expect(resolveRating(r)).toBe(6.4);
    expect(pickRating(r).source).toBe("balldontlie");
  });

  it("a present-but-null higher-priority source falls through to the next", () => {
    const r = rows({ source: "manual", rating: null }, { source: "balldontlie", rating: 6.9 });
    expect(resolveRating(r)).toBe(6.9);
    expect(pickRating(r).source).toBe("balldontlie");
  });

  it("all sources null/absent → null (no rating, no source)", () => {
    expect(resolveRating(rows({ source: "balldontlie", rating: null }))).toBeNull();
    expect(resolveRating(rows())).toBeNull();
    expect(pickRating(rows())).toEqual({ rating: null, source: null });
  });

  it("a 0.0 rating is honored (not treated as null)", () => {
    expect(resolveRating(rows({ source: "balldontlie", rating: 0 }))).toBe(0);
  });

  it("a source absent from the priority is skipped — the retired 'scrape' value resolves to null", () => {
    // The Sofascore scrape arm was removed (CODE_PROMPT_57). `'scrape'` remains a valid RatingSource
    // enum value (schema drop deferred post-tournament) but is no longer in the default priority, so a
    // scrape-only row finds no matching priority slot and resolves to null under the default ordering.
    expect(resolveRating(rows({ source: "scrape", rating: 7.0 }))).toBeNull();
  });

  it("an explicit priority is honored (reorderable / config-driven)", () => {
    const r = rows({ source: "balldontlie", rating: 6.0 }, { source: "manual", rating: 8.5 });
    expect(resolveRating(r, ["balldontlie", "manual"])).toBe(6.0);
  });
});
