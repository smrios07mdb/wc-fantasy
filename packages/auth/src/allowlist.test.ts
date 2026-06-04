import { describe, it, expect } from "vitest";
import { isEmailAllowed, normalizeEmail } from "./allowlist";
import type { AllowlistEntry } from "./types";

const allowlist: AllowlistEntry[] = [{ email: "alice@example.com" }, { email: "bob@example.com" }];

describe("normalizeEmail", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
  });
});

describe("isEmailAllowed — the pure allowlist gate", () => {
  it("allows an allowlisted email", () => {
    expect(isEmailAllowed("alice@example.com", allowlist)).toBe(true);
  });

  it("denies a non-allowlisted email", () => {
    expect(isEmailAllowed("mallory@example.com", allowlist)).toBe(false);
  });

  it("denies against an empty allowlist", () => {
    expect(isEmailAllowed("alice@example.com", [])).toBe(false);
  });

  // TODO(confirm): §6 does not pin email case-sensitivity. Supabase normalizes emails to lowercase,
  // so a case-insensitive match is the safe, robust default (asserted here).
  it("matches case-insensitively (both sides) and ignores whitespace", () => {
    expect(isEmailAllowed("ALICE@example.com", allowlist)).toBe(true);
    expect(isEmailAllowed("  bob@EXAMPLE.com  ", allowlist)).toBe(true);
    expect(isEmailAllowed("alice@example.com", [{ email: "Alice@Example.com" }])).toBe(true);
  });
});
