import { describe, it, expect } from "vitest";
import { validateDisplayName } from "./displayName";

describe("validateDisplayName — pure normalization + length gate", () => {
  it("trims leading and trailing whitespace", () => {
    const r = validateDisplayName("  Alice  ");
    expect(r).toEqual({ ok: true, value: "Alice" });
  });

  it("collapses internal runs of whitespace to a single space", () => {
    const r = validateDisplayName("Alice   van   der   Berg");
    expect(r).toEqual({ ok: true, value: "Alice van der Berg" });
  });

  it("trims AND collapses in one pass", () => {
    const r = validateDisplayName("  \t  Bob   Smith  \n ");
    expect(r).toEqual({ ok: true, value: "Bob Smith" });
  });

  it("rejects empty string", () => {
    expect(validateDisplayName("")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects whitespace-only input", () => {
    expect(validateDisplayName("   ")).toEqual({ ok: false, reason: "empty" });
    expect(validateDisplayName("\t\n\r")).toEqual({ ok: false, reason: "empty" });
  });

  it("accepts a name of exactly 40 chars (the cap)", () => {
    const name40 = "A".repeat(40);
    expect(validateDisplayName(name40)).toEqual({ ok: true, value: name40 });
  });

  it("rejects a name of 41 chars", () => {
    const name41 = "A".repeat(41);
    expect(validateDisplayName(name41)).toEqual({ ok: false, reason: "too_long" });
  });

  it("length check applies to the NORMALIZED value (after trim+collapse)", () => {
    // 42 raw chars, collapses to 39 after trim → should PASS
    const raw = "  " + "A".repeat(38) + "  ";
    const r = validateDisplayName(raw);
    expect(r).toEqual({ ok: true, value: "A".repeat(38) });

    // 80 raw chars of runs, collapses to a 7-word phrase → should PASS
    const spacy = "one   two   three   four   five   six";
    const collapsed = validateDisplayName(spacy);
    expect(collapsed.ok).toBe(true);
    if (collapsed.ok) expect(collapsed.value).toBe("one two three four five six");
  });

  it("preserves accented characters", () => {
    const r = validateDisplayName("Zoé Martínez");
    expect(r).toEqual({ ok: true, value: "Zoé Martínez" });
  });

  it("preserves apostrophes in names", () => {
    const r = validateDisplayName("O'Brien");
    expect(r).toEqual({ ok: true, value: "O'Brien" });
  });

  it("preserves non-ASCII unicode", () => {
    const r = validateDisplayName("张伟");
    expect(r).toEqual({ ok: true, value: "张伟" });
  });
});
