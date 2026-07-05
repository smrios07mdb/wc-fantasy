import { describe, it, expect } from "vitest";
import { looksLikeEmail } from "./email";

describe("looksLikeEmail — full-string email shape only (PII write-guard predicate)", () => {
  // The crux: the FALSE-POSITIVE boundary. A legit name that merely CONTAINS "@"
  // (accents/apostrophes ethos) must stay legal; only a full-string address is rejected.
  const cases: [input: string, expected: boolean, why: string][] = [
    // --- actual emails → true (reject) ---
    ["a@b.co", true, "minimal address"],
    ["yader.rosales@gmail.com", true, "real member address"],
    ["First.Last@sub.domain.io", true, "subdomain + mixed case"],
    ["  a@b.co  ", true, "trimmed before the check"],
    ["\ta@b.co\n", true, "trims tabs/newlines too"],

    // --- legit names with an @ but NOT a full-string address → false (allow) ---
    ["n@cho", false, "no dot after the @ — a stylized name, not an address"],
    ["@handle", false, "leading @, empty local part"],
    ["me@", false, "trailing @, empty domain"],
    ["a@b", false, "no TLD dot"],
    ["Nacho @ Home", false, "@ surrounded by spaces — two words, not one address"],
    ["a b@c.co", false, "internal whitespace — not a single address token"],

    // --- ordinary names → false (allow) ---
    ["Alice", false, "plain name"],
    ["O'Brien", false, "apostrophe"],
    ["张伟", false, "non-ASCII"],
    ["Manager 3", false, "synthetic fallback label"],
    ["", false, "empty string"],
    ["   ", false, "whitespace-only"],
  ];

  for (const [input, expected, why] of cases) {
    it(`${JSON.stringify(input)} → ${expected} (${why})`, () => {
      expect(looksLikeEmail(input)).toBe(expected);
    });
  }
});
