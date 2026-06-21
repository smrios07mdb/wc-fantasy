// @vitest-environment jsdom
/**
 * REAL interaction proof that a PRIOR (completed) matchday is STRICTLY READ-ONLY on the set-lineup screen
 * (T11). A source-contract smoke can't prove a control is actually inert, so this mounts the REAL
 * {@link SetLineupClient} in jsdom and drives it: with `period.readOnly = true` the Save button and the
 * formation picker are disabled, and — the subtle case the adversarial review caught — tapping a *movable*
 * token (a never-appeared bench player has no `locked_at`, so it would otherwise be swappable) engages NO
 * selection and performs NO swap. The control test confirms the SAME tap DOES select on an editable period,
 * so the read-only assertion is not vacuous.
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

// 2 GK / 5 DEF / 5 MID / 3 FWD = 15. Default 4-3-3 starts 1+4+3+3; the other 4 (incl. a GK + a DEF) sit on
// the bench fully MOVABLE (no locks, empty slotMeta) — the worst case for read-only enforcement.
function squad(): LineupPlayer[] {
  const counts: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const out: LineupPlayer[] = [];
  for (const pos of POSITIONS)
    for (let i = 0; i < counts[pos]; i++) out.push(player(`${pos.toLowerCase()}${i + 1}`, pos));
  return out;
}

function stateFor(readOnly: boolean): SetLineupState {
  const s = squad();
  const period: PeriodLineup = {
    periodId: "md1",
    label: "MD1",
    kind: "group_md",
    status: "open", // status is deliberately NOT "closed" — read-only must rest on `readOnly`, not status
    readOnly,
    closesAt: "2099-01-01T00:00:00.000Z", // far future → the window would be editable but for `readOnly`
    starterIds: defaultStarterIds(s),
    locks: [], // no lock-on-play: every bench player is movable (the gap the review found)
    slotMeta: {},
    kickoffByPlayer: {},
    opponentByPlayer: {},
  };
  return {
    sessionManagerId: "m1",
    displayName: "Los Dragones",
    squad: s,
    periods: [period],
    activePeriodId: "md1",
    timezone: "UTC",
  };
}

const saveBtn = () => screen.getByRole("button", { name: /save lineup/i }) as HTMLButtonElement;
const movableTokens = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>("button.is-movable"));

describe("set-lineup — a PRIOR (read-only) matchday is non-editable (T11)", () => {
  it("disables Save and the formation picker, and marks the tab 'final'", () => {
    render(<SetLineupClient initialState={stateFor(true)} />);
    expect(saveBtn().disabled).toBe(true);
    // The formation picker still renders its shapes, but every option is disabled.
    const picker = within(screen.getByRole("tablist", { name: /formation options/i }));
    for (const tab of picker.getAllByRole("tab"))
      expect((tab as HTMLButtonElement).disabled).toBe(true);
    // The matchday tab carries the read-only indicator.
    expect(screen.getByText("final")).toBeTruthy();
  });

  it("does NOT swap or even select when a movable token is tapped (the review's gap)", () => {
    const { container } = render(<SetLineupClient initialState={stateFor(true)} />);
    const tokens = movableTokens(container);
    expect(tokens.length).toBeGreaterThan(0); // there ARE movable (never-locked) tokens to tap
    fireEvent.click(tokens[0]!);
    // No token entered the selected state, and the swap hint never appeared → onSelect short-circuited.
    expect(container.querySelector(".st-selected")).toBeNull();
    expect(screen.queryByText(/tap a highlighted teammate to swap/i)).toBeNull();
  });

  it("CONTROL: the same tap DOES select on an editable period (proves the test isn't vacuous)", () => {
    const { container } = render(<SetLineupClient initialState={stateFor(false)} />);
    const tokens = movableTokens(container);
    fireEvent.click(tokens[0]!);
    // On an editable period the tap selects the player (swap affordance engages).
    expect(container.querySelector(".st-selected")).not.toBeNull();
    expect(screen.getByText(/tap a highlighted teammate to swap/i)).toBeTruthy();
  });
});
