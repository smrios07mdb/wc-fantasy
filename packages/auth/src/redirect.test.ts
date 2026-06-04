import { describe, it, expect } from "vitest";
import { isSafeRelativePath, safeNextPath } from "./redirect";

describe("isSafeRelativePath — same-origin path-absolute guard", () => {
  it("accepts a single-leading-slash path (and preserves query/hash)", () => {
    expect(isSafeRelativePath("/")).toBe(true);
    expect(isSafeRelativePath("/draft")).toBe(true);
    expect(isSafeRelativePath("/draft?x=1#h")).toBe(true);
  });

  it("rejects protocol-relative and backslash host tricks", () => {
    expect(isSafeRelativePath("//evil.com")).toBe(false);
    expect(isSafeRelativePath("/\\evil.com")).toBe(false);
  });

  it("rejects values that escape the origin via concatenation (no leading slash)", () => {
    // The callback builds `${origin}${next}` with no separator, so these reach another host.
    expect(isSafeRelativePath("@evil.com")).toBe(false);
    expect(isSafeRelativePath(".evil.com")).toBe(false);
    expect(isSafeRelativePath("evil.com")).toBe(false);
  });

  it("rejects absolute URLs with a scheme", () => {
    expect(isSafeRelativePath("https://evil.com")).toBe(false);
    expect(isSafeRelativePath("http://evil.com")).toBe(false);
    expect(isSafeRelativePath("javascript:alert(1)")).toBe(false);
  });

  it("rejects empty / nullish", () => {
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath(null)).toBe(false);
    expect(isSafeRelativePath(undefined)).toBe(false);
  });
});

describe("safeNextPath — validated value or fallback", () => {
  it("returns the value when safe", () => {
    expect(safeNextPath("/draft")).toBe("/draft");
  });

  it("falls back to '/' for unsafe / absent input", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("@evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("honors a custom fallback", () => {
    expect(safeNextPath("//evil.com", "/home")).toBe("/home");
  });
});
