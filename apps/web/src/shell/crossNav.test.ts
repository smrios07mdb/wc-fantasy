import { describe, it, expect } from "vitest";
import {
  NAV_ITEMS,
  BOTTOM_TAB_ITEMS,
  MORE_SHEET_ITEMS,
  COMMISH_NAV_ITEM,
  selectActiveNav,
  selectMobileNavPartition,
} from "./crossNav";

describe("crossNav config — shared cross-nav link set (pure, presentational)", () => {
  it("lists Home plus authenticated feature screens, in order", () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([
      "home",
      "draft",
      "lineup",
      "vsfield",
      "standings",
      "waivers",
      "players",
      "pool",
      "playoffs",
      "scoring",
      "settings",
    ]);
  });

  it("reuses the Prompt-16 hub labels verbatim for the feature screens", () => {
    const byId = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item]));
    expect(byId.draft).toMatchObject({ href: "/draft", label: "Draft room" });
    expect(byId.lineup).toMatchObject({ href: "/lineup", label: "Set lineup" });
    expect(byId.vsfield).toMatchObject({ href: "/vsfield", label: "Vs the field" });
    // T10: dedicated all-play-all standings page.
    expect(byId.standings).toMatchObject({ href: "/standings", label: "Standings" });
    expect(byId.waivers).toMatchObject({ href: "/waivers", label: "Waivers" });
    // PLAYERS-TAB: the read-only /players browser is now a first-class nav entry (adjacent to Waivers).
    expect(byId.players).toMatchObject({ href: "/players", label: "Players" });
    // Prompt 42 / feat/pool-nav: the pick'em pool seam is now a real nav entry.
    // Prompt 45: user-facing label renamed to "Quiniela" (the id/href/key stay "pool").
    expect(byId.pool).toMatchObject({ href: "/pool", label: "Quiniela" });
    expect(byId.scoring).toMatchObject({ href: "/scoring", label: "Scoring" });
    // Phase 4: the guillotine playoffs theater is a real nav entry.
    expect(byId.playoffs).toMatchObject({ href: "/playoffs", label: "Playoffs" });
    expect(byId.home).toMatchObject({ href: "/", label: "Home" });
    // Prompt 39: Settings seam is now a real route.
    expect(byId.settings).toMatchObject({ href: "/settings", label: "Settings" });
  });
});

describe("BOTTOM_TAB_ITEMS — primary mobile bottom bar destinations", () => {
  it("lists the primary tabs in the specified order (PLAYERS-TAB added Players as the 5th)", () => {
    expect(BOTTOM_TAB_ITEMS.map((i) => i.id)).toEqual([
      "home",
      "lineup",
      "vsfield",
      "pool",
      "players",
    ]);
  });

  it("relabels home as Dashboard on the bottom bar (same route, different label)", () => {
    const home = BOTTOM_TAB_ITEMS.find((i) => i.id === "home")!;
    expect(home.href).toBe("/");
    expect(home.label).toBe("Dashboard");
  });
});

describe("MORE_SHEET_ITEMS — secondary destinations in the More sheet", () => {
  it("lists the More sheet items in spec order: Scoring · Waivers · Standings · Playoffs · Draft · Settings", () => {
    expect(MORE_SHEET_ITEMS.map((i) => i.id)).toEqual([
      "scoring",
      "waivers",
      "standings",
      "playoffs",
      "draft",
      "settings",
    ]);
  });

  it("covers the routes NOT in the bottom bar", () => {
    const bottomIds = new Set(BOTTOM_TAB_ITEMS.map((i) => i.id));
    for (const item of MORE_SHEET_ITEMS) {
      expect(bottomIds.has(item.id), `${item.id} should NOT appear in both`).toBe(false);
    }
  });
});

describe("selectActiveNav — current path → active nav id (pure, IO-free)", () => {
  it("marks the exact feature route active", () => {
    expect(selectActiveNav("/draft")).toBe("draft");
    expect(selectActiveNav("/lineup")).toBe("lineup");
    expect(selectActiveNav("/vsfield")).toBe("vsfield");
    expect(selectActiveNav("/standings")).toBe("standings");
    expect(selectActiveNav("/waivers")).toBe("waivers");
    expect(selectActiveNav("/players")).toBe("players");
    expect(selectActiveNav("/pool")).toBe("pool");
    expect(selectActiveNav("/playoffs")).toBe("playoffs");
    expect(selectActiveNav("/scoring")).toBe("scoring");
    expect(selectActiveNav("/settings")).toBe("settings");
  });

  it("marks home active ONLY on the exact root path (never via prefix)", () => {
    expect(selectActiveNav("/")).toBe("home");
    // "/" must not greedily match every path through a startsWith check.
    expect(selectActiveNav("/draft")).not.toBe("home");
  });

  it("treats a trailing slash and nested sub-paths as the same screen", () => {
    expect(selectActiveNav("/draft/")).toBe("draft");
    expect(selectActiveNav("/lineup/edit")).toBe("lineup");
    expect(selectActiveNav("/waivers/")).toBe("waivers");
  });

  it("does not false-match a sibling route that merely shares a prefix", () => {
    expect(selectActiveNav("/draftroom")).toBeNull();
  });

  it("returns null for paths outside the nav (e.g. /sign-in) and for an empty path", () => {
    expect(selectActiveNav("/sign-in")).toBeNull();
    expect(selectActiveNav("")).toBeNull();
  });
});

describe("selectMobileNavPartition — maps active NavId to primary/secondary bucket", () => {
  it("places bottom-bar routes in bottomActive", () => {
    expect(selectMobileNavPartition("home")).toMatchObject({
      bottomActive: "home",
      moreActive: null,
      moreHasActive: false,
    });
    expect(selectMobileNavPartition("lineup")).toMatchObject({
      bottomActive: "lineup",
      moreActive: null,
      moreHasActive: false,
    });
    expect(selectMobileNavPartition("vsfield")).toMatchObject({
      bottomActive: "vsfield",
      moreActive: null,
      moreHasActive: false,
    });
    expect(selectMobileNavPartition("pool")).toMatchObject({
      bottomActive: "pool",
      moreActive: null,
      moreHasActive: false,
    });
    // PLAYERS-TAB: Players is a primary bottom tab, never routed to the More overflow.
    expect(selectMobileNavPartition("players")).toMatchObject({
      bottomActive: "players",
      moreActive: null,
      moreHasActive: false,
    });
  });

  it("places More-sheet routes in moreActive and sets moreHasActive", () => {
    expect(selectMobileNavPartition("scoring")).toMatchObject({
      bottomActive: null,
      moreActive: "scoring",
      moreHasActive: true,
    });
    expect(selectMobileNavPartition("waivers")).toMatchObject({
      bottomActive: null,
      moreActive: "waivers",
      moreHasActive: true,
    });
    expect(selectMobileNavPartition("draft")).toMatchObject({
      bottomActive: null,
      moreActive: "draft",
      moreHasActive: true,
    });
    expect(selectMobileNavPartition("settings")).toMatchObject({
      bottomActive: null,
      moreActive: "settings",
      moreHasActive: true,
    });
  });

  it("returns all-null when active is null (no route matched)", () => {
    expect(selectMobileNavPartition(null)).toEqual({
      bottomActive: null,
      moreActive: null,
      moreHasActive: false,
    });
  });

  it("every NavId resolves to exactly one of the two buckets (no overlap, no gap)", () => {
    const allIds = NAV_ITEMS.map((i) => i.id);
    for (const id of allIds) {
      const { bottomActive, moreActive, moreHasActive } = selectMobileNavPartition(id);
      const inBottom = bottomActive !== null;
      const inMore = moreActive !== null;
      // exactly one bucket is active
      expect(inBottom !== inMore, `${id} must be in exactly one bucket`).toBe(true);
      // moreHasActive flag is consistent with moreActive
      expect(moreHasActive).toBe(inMore);
    }
  });
});

describe("Players — first-class nav tab (PLAYERS-TAB)", () => {
  it("sits in the desktop top strip immediately after Waivers", () => {
    const ids = NAV_ITEMS.map((i) => i.id);
    expect(ids[ids.indexOf("waivers") + 1]).toBe("players");
    expect(NAV_ITEMS.find((i) => i.id === "players")).toMatchObject({
      href: "/players",
      label: "Players",
    });
  });

  it("is a PRIMARY mobile bottom tab — never a More-sheet-only entry", () => {
    expect(BOTTOM_TAB_ITEMS.map((i) => i.id)).toContain("players");
    expect(MORE_SHEET_ITEMS.map((i) => i.id)).not.toContain("players");
    // so the partition routes /players to the bottom bar, never the More overflow
    expect(selectMobileNavPartition("players")).toEqual({
      bottomActive: "players",
      moreActive: null,
      moreHasActive: false,
    });
  });

  it("is UNGATED — present in the always-render lists (unlike the gated COMMISH entry)", () => {
    expect(NAV_ITEMS.map((i) => i.id)).toContain("players");
    expect(BOTTOM_TAB_ITEMS.map((i) => i.id)).toContain("players");
  });

  it("resolves /players (and a trailing slash) to the players nav id", () => {
    expect(selectActiveNav("/players")).toBe("players");
    expect(selectActiveNav("/players/")).toBe("players");
  });
});

describe("COMMISH_NAV_ITEM — the is_commissioner-gated console entry", () => {
  it("points at /commish with the commish id", () => {
    expect(COMMISH_NAV_ITEM).toEqual({ id: "commish", href: "/commish", label: "Commissioner" });
  });

  it("is kept OUT of every always-rendered list (so non-commissioners never see it)", () => {
    const ids = [
      ...NAV_ITEMS.map((i) => i.id),
      ...BOTTOM_TAB_ITEMS.map((i) => i.id),
      ...MORE_SHEET_ITEMS.map((i) => i.id),
    ];
    expect(ids).not.toContain("commish");
  });

  it("is treated as a More-area item by the mobile partition (lights the More button, no bottom tab)", () => {
    expect(selectMobileNavPartition("commish")).toEqual({
      bottomActive: null,
      moreActive: "commish",
      moreHasActive: true,
    });
  });
});
