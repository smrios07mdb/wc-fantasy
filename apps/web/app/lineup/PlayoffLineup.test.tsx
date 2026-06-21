// @vitest-environment jsdom
/**
 * REAL interaction proof for the PERIOD-DRIVEN playoff reduced-roster variant (DECISIONS.md Theme B,
 * feat/playoff-lineup-mode). A source-contract smoke can't prove the Set Lineup screen actually flips to
 * the 7+2 guillotine roster when a knockout window is selected — so this mounts the REAL
 * {@link SetLineupClient} (design_reference/setlineup → COMPONENT_MAP.md) in jsdom and drives it through
 * RTL. The mode is derived ONLY from `period.kind === "knockout_round"` (the Phase-1-owned value, read
 * here, never defined), not a manual toggle.
 *
 * Proven here:
 *   • a knockout period offers EXACTLY FORMATIONS_PO (2-3-1 / 3-2-1 / 2-2-2) and NONE of the group shapes,
 *     opens on the reduced 2-3-1 (7 starters + 2 reserves), labels the hero "Playoff XI", and a reshape
 *     within the set stays legal (Save enabled);
 *   • a group period rendered by the SAME component stays the full 11-man XI + the group shapes — the
 *     regression that proves the switch is period-driven, not global.
 *
 * Queries are scoped to the formation tablist because the period tabs also use role="tab".
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { SetLineupClient } from "./SetLineupClient";
import { defaultStarterIds, formationSetForKind } from "../../src/lineup/view";
import type { LineupPlayer, PeriodLineup, SetLineupState } from "../../src/lineup/types";
import { POSITIONS, type PeriodKind, type Position } from "@app/shared";

afterEach(cleanup);

function player(id: string, position: Position): LineupPlayer {
  return {
    id,
    displayName: id.toUpperCase(),
    firstName: "X",
    lastName: id,
    position,
    country: null,
  };
}

function squadFrom(counts: Record<Position, number>): LineupPlayer[] {
  const out: LineupPlayer[] = [];
  for (const pos of POSITIONS) {
    for (let i = 0; i < counts[pos]; i++) out.push(player(`${pos.toLowerCase()}${i + 1}`, pos));
  }
  return out;
}

/** A single-period SetLineupState in the given mode — the seed mirrors the SSR loader (mode's offer set). */
function stateFor(squad: LineupPlayer[], kind: PeriodKind): SetLineupState {
  const period: PeriodLineup = {
    periodId: "p1",
    label: kind === "knockout_round" ? "R32" : "MD1",
    kind,
    status: "open",
    readOnly: false,
    closesAt: "2099-01-01T00:00:00.000Z", // far future → the window is editable
    starterIds: defaultStarterIds(squad, formationSetForKind(kind)),
    locks: [],
    slotMeta: {},
    kickoffByPlayer: {},
    opponentByPlayer: {},
  };
  return {
    sessionManagerId: "m1",
    displayName: "Los Dragones",
    squad,
    periods: [period],
    activePeriodId: "p1",
    timezone: "UTC",
  };
}

// The reduced guillotine squad (DECISIONS Theme B survivor): 9 men = 1 GK / 3 DEF / 3 MID / 2 FWD.
const PO_SQUAD = squadFrom({ GK: 1, DEF: 3, MID: 3, FWD: 2 });
// A full group squad: 2 GK / 5 DEF / 5 MID / 3 FWD = 15.
const GROUP_SQUAD = squadFrom({ GK: 2, DEF: 5, MID: 5, FWD: 3 });

/** Scope to the formation picker's tablist (the period tabs also expose role="tab"). */
const picker = () => within(screen.getByRole("tablist", { name: /formation options/i }));
const ftab = (name: string) => picker().queryByRole("tab", { name });

describe("Set Lineup — period-driven playoff reduced roster (knockout_round)", () => {
  it("offers EXACTLY FORMATIONS_PO in a knockout period, and none of the group shapes", () => {
    render(<SetLineupClient initialState={stateFor(PO_SQUAD, "knockout_round")} />);
    const shapes = picker()
      .getAllByRole("tab")
      .map((t) => t.textContent);
    expect(shapes).toEqual(["2-3-1", "3-2-1", "2-2-2"]); // PLAYOFF_FORMATIONS, canonical order
    // group shapes never appear in the reduced mode
    expect(ftab("4-3-3")).toBeNull();
    expect(ftab("3-4-3")).toBeNull();
    expect(ftab("5-4-1")).toBeNull();
  });

  it("opens on the reduced 7+2 roster (2-3-1, 7 starters · 2 reserves) and labels the hero Playoff XI", () => {
    render(<SetLineupClient initialState={stateFor(PO_SQUAD, "knockout_round")} />);
    // The canonical playoff default 2-3-1 = 1 GK + 6 outfield = 7 starters.
    expect(ftab("2-3-1")!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Playoff XI/i)).toBeTruthy();
    // 9-man squad − 7 starters = 2 reserves on the bench.
    expect(screen.getByText(/^2 reserves$/)).toBeTruthy();
  });

  it("reshapes within the playoff set and stays legal (Save stays enabled)", () => {
    render(<SetLineupClient initialState={stateFor(PO_SQUAD, "knockout_round")} />);
    const save = screen.getByRole("button", { name: /save lineup/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(ftab("2-2-2")!);
    // The reshape ran (formationKeyOf recomputed from the new starter set) and re-validated.
    expect(ftab("2-2-2")!.getAttribute("aria-selected")).toBe("true");
    expect(ftab("2-3-1")!.getAttribute("aria-selected")).toBe("false");
    expect(save.disabled).toBe(false);
  });

  it("a group period rendered by the SAME component stays the full 11-man XI (period-driven, not global)", () => {
    render(<SetLineupClient initialState={stateFor(GROUP_SQUAD, "group_md")} />);
    // group shapes offered, playoff shapes absent
    expect(ftab("4-3-3")).toBeTruthy();
    expect(ftab("2-3-1")).toBeNull();
    expect(ftab("2-2-2")).toBeNull();
    expect(screen.getByText(/Starting XI/i)).toBeTruthy();
    // 15-man squad − 11 starters = 4 reserves.
    expect(screen.getByText(/^4 reserves$/)).toBeTruthy();
  });
});
