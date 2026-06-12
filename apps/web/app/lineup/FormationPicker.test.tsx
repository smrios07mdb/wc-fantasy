// @vitest-environment jsdom
/**
 * REAL interaction proof for the set-lineup FormationPicker (P54 → render fix). The P54 lesson: a
 * source-contract smoke ("the JSX mentions <FormationPicker>") cannot prove a control actually renders
 * and is tappable. This mounts the REAL {@link SetLineupClient} in jsdom and drives it through RTL:
 * the picker shows every offered (fillable ∩ lock-legal) shape, selecting one reshapes the XI and it
 * re-validates (Save stays enabled), unfillable shapes are absent, and a one-shape squad gets a static
 * indicator instead of a dead control. Queries are scoped to the formation tablist because the period
 * tabs also use role="tab".
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { SetLineupClient } from "./SetLineupClient";
import { defaultStarterIds } from "../../src/lineup/view";
import type { LineupPlayer, PeriodLineup, SetLineupState } from "../../src/lineup/types";
import { POSITIONS, type Position } from "@app/shared";

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

function stateFor(squad: LineupPlayer[]): SetLineupState {
  const period: PeriodLineup = {
    periodId: "md1",
    label: "MD1",
    status: "open",
    closesAt: "2099-01-01T00:00:00.000Z", // far future → the window is editable
    starterIds: defaultStarterIds(squad), // mirrors the SSR loader's seed
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
    activePeriodId: "md1",
    timezone: "UTC",
  };
}

// Multi-formation squad (lots of MID, only 4 DEF): 2 GK / 4 DEF / 6 MID / 3 FWD = 15.
const MULTI = squadFrom({ GK: 2, DEF: 4, MID: 6, FWD: 3 });
// A squad that fits exactly ONE shape: 1 GK / 3 DEF / 4 MID / 7 FWD = 15 → only 3-4-3.
const SINGLE = squadFrom({ GK: 1, DEF: 3, MID: 4, FWD: 7 });

/** Scope to the formation picker's tablist (the period tabs also expose role="tab"). */
const picker = () => within(screen.getByRole("tablist", { name: /formation options/i }));
const ftab = (name: string) => picker().queryByRole("tab", { name });

describe("FormationPicker — a real, tappable control (proof a contract smoke can't fake)", () => {
  it("renders every offered formation as a tab and OMITS unfillable shapes", () => {
    render(<SetLineupClient initialState={stateFor(MULTI)} />);
    // 4-DEF squad → the five DEF≤4 shapes are offered, in canonical order.
    const shapes = picker()
      .getAllByRole("tab")
      .map((t) => t.textContent);
    expect(shapes).toEqual(["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1"]);
    // 5-DEF shapes are not fieldable (only 4 DEF) → never offered.
    expect(ftab("5-3-2")).toBeNull();
    expect(ftab("5-4-1")).toBeNull();
  });

  it("selecting a non-active formation reshapes the XI and it re-validates (Save stays enabled)", () => {
    render(<SetLineupClient initialState={stateFor(MULTI)} />);
    // Opens on the canonical default 4-3-3.
    expect(ftab("4-3-3")!.getAttribute("aria-selected")).toBe("true");
    expect(ftab("3-5-2")!.getAttribute("aria-selected")).toBe("false");
    const save = screen.getByRole("button", { name: /save lineup/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    fireEvent.click(ftab("3-5-2")!);

    // The reshape ran: 3-5-2 is now the active shape (formationKeyOf recomputed from new starterIds)…
    expect(ftab("3-5-2")!.getAttribute("aria-selected")).toBe("true");
    expect(ftab("4-3-3")!.getAttribute("aria-selected")).toBe("false");
    // …and the resulting XI is legal, so Save stays enabled (the same validateLineup gate the server runs).
    expect(save.disabled).toBe(false);
  });

  it("a squad that fits ONE shape shows a static indicator, NOT a dead control", () => {
    render(<SetLineupClient initialState={stateFor(SINGLE)} />);
    // No interactive formation tablist at all…
    expect(screen.queryByRole("tablist", { name: /formation options/i })).toBeNull();
    // …but the single fieldable shape is shown as a static, non-interactive indicator.
    expect(screen.getByLabelText(/only fieldable formation 3-4-3/i)).toBeTruthy();
  });
});
