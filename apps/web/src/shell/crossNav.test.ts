import { describe, it, expect } from "vitest";
import { NAV_ITEMS, selectActiveNav } from "./crossNav";

describe("crossNav config — the shared cross-nav link set (pure, presentational)", () => {
  it("lists Home plus the three authenticated feature screens, in that order", () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual(["home", "draft", "lineup", "vsfield"]);
  });

  it("reuses the Prompt-16 hub labels verbatim for the feature screens", () => {
    const byId = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item]));
    expect(byId.draft).toMatchObject({ href: "/draft", label: "Draft room" });
    expect(byId.lineup).toMatchObject({ href: "/lineup", label: "Set lineup" });
    expect(byId.vsfield).toMatchObject({ href: "/vsfield", label: "Vs the field" });
    expect(byId.home).toMatchObject({ href: "/", label: "Home" });
  });
});

describe("selectActiveNav — current path → active nav id (pure, IO-free)", () => {
  it("marks the exact feature route active", () => {
    expect(selectActiveNav("/draft")).toBe("draft");
    expect(selectActiveNav("/lineup")).toBe("lineup");
    expect(selectActiveNav("/vsfield")).toBe("vsfield");
  });

  it("marks home active ONLY on the exact root path (never via prefix)", () => {
    expect(selectActiveNav("/")).toBe("home");
    // "/" must not greedily match every path through a startsWith check.
    expect(selectActiveNav("/draft")).not.toBe("home");
  });

  it("treats a trailing slash and nested sub-paths as the same screen", () => {
    expect(selectActiveNav("/draft/")).toBe("draft");
    expect(selectActiveNav("/lineup/edit")).toBe("lineup");
  });

  it("does not false-match a sibling route that merely shares a prefix", () => {
    expect(selectActiveNav("/draftroom")).toBeNull();
  });

  it("returns null for paths outside the nav (e.g. /sign-in) and for an empty path", () => {
    expect(selectActiveNav("/sign-in")).toBeNull();
    expect(selectActiveNav("")).toBeNull();
  });
});
