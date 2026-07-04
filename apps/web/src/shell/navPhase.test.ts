import { describe, it, expect } from "vitest";
import { deriveNavPhaseState, type NavPhaseMatchSummary } from "./navPhase";
import { navItemsForPhase, BOTTOM_TAB_ITEMS, MORE_SHEET_ITEMS, NAV_ITEMS } from "./crossNav";

function m(
  status: string,
  periodKind: "group_md" | "knockout_round" | null,
  periodId: string | null,
  periodLabel: string | null = null,
): NavPhaseMatchSummary {
  return {
    status: status as NavPhaseMatchSummary["status"],
    periodKind,
    periodId,
    periodLabel,
  };
}

describe("deriveNavPhaseState — phase + the knockout live dot (T15-CUT nav)", () => {
  it("group phase (incl. pre-kickoff): group, dot dark", () => {
    expect(deriveNavPhaseState([])).toEqual({ phase: "group", knockoutLive: false });
    expect(deriveNavPhaseState([m("in_progress", "group_md", "md1")])).toEqual({
      phase: "group",
      knockoutLive: false,
    });
  });

  it("a knockout round mid-play lights the dot", () => {
    const state = deriveNavPhaseState([
      m("completed", "group_md", "md1"),
      m("completed", "knockout_round", "r32"),
      m("in_progress", "knockout_round", "r32"),
      m("scheduled", "knockout_round", "r16"),
    ]);
    expect(state).toEqual({ phase: "knockout", knockoutLive: true });
  });

  it("pend (every round match completed) reads knockout with the dot DARK — mock state f", () => {
    const state = deriveNavPhaseState([
      m("completed", "group_md", "md1"),
      m("completed", "knockout_round", "r32"),
      m("completed", "knockout_round", "r32"),
      m("scheduled", "knockout_round", "r16"),
    ]);
    expect(state).toEqual({ phase: "knockout", knockoutLive: false });
  });

  it("post-final: complete, dot dark", () => {
    const state = deriveNavPhaseState([
      m("completed", "knockout_round", "fin", "Final"),
      m("completed", "knockout_round", "r32"),
    ]);
    expect(state).toEqual({ phase: "complete", knockoutLive: false });
  });
});

describe("navItemsForPhase — the T15-4 decision: relabel, never a new tab", () => {
  it("GROUP returns the base arrays BY REFERENCE — the group-phase nav is byte-identical (rider E)", () => {
    const nav = navItemsForPhase("group", false);
    expect(nav.navItems).toBe(NAV_ITEMS);
    expect(nav.bottomTabItems).toBe(BOTTOM_TAB_ITEMS);
    expect(nav.moreSheetItems).toBe(MORE_SHEET_ITEMS);
    expect(nav.vsfieldGlyph).toBe("vsfield");
    expect(nav.vsfieldLiveDot).toBe(false);
  });

  it("KNOCKOUT relabels exactly two slots: vsfield → 'The Cut', playoffs → 'Theater'", () => {
    const nav = navItemsForPhase("knockout", true);
    const bottom = Object.fromEntries(nav.bottomTabItems.map((i) => [i.id, i.label]));
    expect(bottom).toEqual({
      home: "Dashboard",
      lineup: "Set lineup",
      vsfield: "The Cut",
      pool: "Quiniela",
    });
    const more = Object.fromEntries(nav.moreSheetItems.map((i) => [i.id, i.label]));
    expect(more.playoffs).toBe("Theater");
    // Same ids, hrefs, slot count — no new tab, no removed tab.
    expect(nav.bottomTabItems.map((i) => i.id)).toEqual(BOTTOM_TAB_ITEMS.map((i) => i.id));
    expect(nav.navItems.map((i) => i.href)).toEqual(NAV_ITEMS.map((i) => i.href));
    expect(nav.vsfieldGlyph).toBe("cut");
    expect(nav.vsfieldLiveDot).toBe(true);
  });

  it("the live dot follows the round: dark on pend, dark post-final", () => {
    expect(navItemsForPhase("knockout", false).vsfieldLiveDot).toBe(false);
    const complete = navItemsForPhase("complete", false);
    expect(complete.vsfieldLiveDot).toBe(false);
    // Post-final the slot STAYS "The Cut" (champion state), Playoffs stays "Theater".
    expect(complete.bottomTabItems.find((i) => i.id === "vsfield")!.label).toBe("The Cut");
    expect(complete.moreSheetItems.find((i) => i.id === "playoffs")!.label).toBe("Theater");
  });

  it("never mutates the base arrays", () => {
    navItemsForPhase("knockout", true);
    expect(BOTTOM_TAB_ITEMS.find((i) => i.id === "vsfield")!.label).toBe("Vs the field");
    expect(MORE_SHEET_ITEMS.find((i) => i.id === "playoffs")!.label).toBe("Playoffs");
  });
});
