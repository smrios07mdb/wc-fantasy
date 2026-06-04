import { describe, it, expect } from "vitest";
import { extractRating } from "./extract";

const page = (players: Array<{ id: number; rating: number | null }>) =>
  `<html><body><script id="__SOFA_DATA__" type="application/json">${JSON.stringify({ players })}</script></body></html>`;

describe("extractRating", () => {
  it("returns the 0–10 rating for the given sofascore player id", () => {
    expect(
      extractRating(
        page([
          { id: 1001, rating: 7.4 },
          { id: 1002, rating: 6.1 },
        ]),
        1002,
      ),
    ).toBe(6.1);
  });
  it("returns null when the player is absent", () => {
    expect(extractRating(page([{ id: 1001, rating: 7.4 }]), 9999)).toBeNull();
  });
  it("returns null when the player's rating is null (DNP / not rated)", () => {
    expect(extractRating(page([{ id: 1001, rating: null }]), 1001)).toBeNull();
  });
  it("returns null on a blocked/empty page (no data script), without throwing", () => {
    expect(extractRating("<html><body>Access denied</body></html>", 1001)).toBeNull();
  });
  it("returns null on malformed JSON, without throwing", () => {
    expect(
      extractRating(`<script id="__SOFA_DATA__" type="application/json">{bad</script>`, 1001),
    ).toBeNull();
  });
});
