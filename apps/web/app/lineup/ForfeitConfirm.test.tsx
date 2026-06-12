// @vitest-environment jsdom
/**
 * Tap-routing + C2 forfeit UI — two layers of proof:
 *   1. Pure helpers: classifySlot + fillEligibleIds cover all 6 classification branches and
 *      position / lock eligibility filters (no DOM; logic-only).
 *   2. RTL mounts: SetLineupClient driven through jsdom to prove:
 *      - A tap on a played-starter token opens the score modal (NOT the forfeit confirm).
 *      - Forfeit is reachable via "Bench & forfeit" inside the modal → ForfeitConfirmSheet.
 *      - Pre-flight block: no eligible fill → modal button shows a toast, no confirm sheet.
 *      - Cancel and confirm lifecycle on the ForfeitConfirmSheet are intact.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { classifySlot, fillEligibleIds } from "../../src/lineup/view";
import { SetLineupClient } from "./SetLineupClient";
import type { LineupPlayer, PeriodLineup, SetLineupState } from "../../src/lineup/types";
import type { Position } from "@app/shared";

afterEach(cleanup);

// ── shared helpers ────────────────────────────────────────────────────────

function p(id: string, pos: Position): LineupPlayer {
  return {
    id,
    displayName: id.toUpperCase(),
    firstName: "X",
    lastName: id,
    position: pos,
    country: null,
  };
}

// A 15-man squad: 2GK / 5DEF (4 starters + 1 bench) / 5MID (3 starters + 2 bench) / 3FWD.
// DEF1 is the canonical C2 target: played starter with 7 pts at stake.
const GK1 = "gk1";
const GK2 = "gk2";
const DEF1 = "def1";
const DEF5 = "def5";
const SQUAD: LineupPlayer[] = [
  p(GK1, "GK"),
  p(GK2, "GK"),
  p(DEF1, "DEF"),
  p("def2", "DEF"),
  p("def3", "DEF"),
  p("def4", "DEF"),
  p(DEF5, "DEF"),
  p("mid1", "MID"),
  p("mid2", "MID"),
  p("mid3", "MID"),
  p("mid4", "MID"),
  p("mid5", "MID"),
  p("fwd1", "FWD"),
  p("fwd2", "FWD"),
  p("fwd3", "FWD"),
];
// 11 starters: 1 GK + 4 DEF + 3 MID + 3 FWD
const STARTERS = [
  GK1,
  DEF1,
  "def2",
  "def3",
  "def4",
  "mid1",
  "mid2",
  "mid3",
  "fwd1",
  "fwd2",
  "fwd3",
];

// Base period: DEF1 has played (C1 locked_at stamped → in locks; slotMeta says movable=true).
const BASE_PERIOD: PeriodLineup = {
  periodId: "md1",
  label: "MD1",
  status: "open",
  closesAt: "2099-01-01T00:00:00.000Z",
  starterIds: STARTERS,
  locks: [{ playerId: DEF1, isStarter: true }],
  slotMeta: {
    [DEF1]: { hasPlayed: true, movable: true, voided: false, pointsAtStake: 7 },
  },
  kickoffByPlayer: {},
  opponentByPlayer: {},
};

// Bare period with no locks and no slotMeta — used for pure classifySlot tests.
const BARE: PeriodLineup = { ...BASE_PERIOD, locks: [], slotMeta: {} };

function state(period: PeriodLineup = BASE_PERIOD): SetLineupState {
  return {
    sessionManagerId: "m1",
    displayName: "Los Dragones",
    squad: SQUAD,
    periods: [period],
    activePeriodId: "md1",
    timezone: "UTC",
  };
}

// Title emitted by PitchToken for a played-starter with points (new format after tap-routing fix).
const DEF1_TITLE = /DEF1.*played.*7 pts.*tap for breakdown/i;

// ── classifySlot ─────────────────────────────────────────────────────────

describe("classifySlot — all 6 classification branches", () => {
  it("voided → 'voided' regardless of isStarter", () => {
    const period = {
      ...BARE,
      slotMeta: { p1: { hasPlayed: true, movable: true, voided: true, pointsAtStake: 5 } },
    };
    expect(classifySlot(period, "p1", true)).toBe("voided");
    expect(classifySlot(period, "p1", false)).toBe("voided");
  });

  it("played + starter + movable → 'played-starter' (the C2 tap target)", () => {
    const period = {
      ...BARE,
      slotMeta: { p1: { hasPlayed: true, movable: true, voided: false, pointsAtStake: 7 } },
    };
    expect(classifySlot(period, "p1", true)).toBe("played-starter");
  });

  it("played + starter + NOT movable → 'locked' (period frozen or already voided-then-restored)", () => {
    const period = {
      ...BARE,
      slotMeta: { p1: { hasPlayed: true, movable: false, voided: false, pointsAtStake: 7 } },
    };
    expect(classifySlot(period, "p1", true)).toBe("locked");
  });

  it("played + bench (any movability) → 'played-bench' (IN-direction latch)", () => {
    const period = {
      ...BARE,
      slotMeta: { p1: { hasPlayed: true, movable: true, voided: false, pointsAtStake: 3 } },
    };
    expect(classifySlot(period, "p1", false)).toBe("played-bench");
  });

  it("not played + in period.locks → 'locked' (C1 locked_at path)", () => {
    const period = { ...BARE, locks: [{ playerId: "p1", isStarter: true }] };
    expect(classifySlot(period, "p1", true)).toBe("locked");
  });

  it("not played + not in period.locks → 'movable' (default — no constraints)", () => {
    expect(classifySlot(BARE, "p1", true)).toBe("movable");
    expect(classifySlot(BARE, "p1", false)).toBe("movable");
  });
});

// ── fillEligibleIds ──────────────────────────────────────────────────────

describe("fillEligibleIds — position + lock filtering", () => {
  it("returns unplayed outfield bench players for an outfield forfeit (GK/outfield segregated)", () => {
    const ids = fillEligibleIds(BASE_PERIOD, SQUAD, STARTERS, DEF1);
    // DEF5, mid4, mid5 are bench + unplayed + outfield → eligible
    expect(ids.has(DEF5)).toBe(true);
    expect(ids.has("mid4")).toBe(true);
    expect(ids.has("mid5")).toBe(true);
    // GK2 is bench + unplayed but is GK (wrong group) → excluded
    expect(ids.has(GK2)).toBe(false);
    // Starters are excluded regardless of play state
    expect(ids.has("def2")).toBe(false);
  });

  it("GK forfeit → only GK bench is eligible (segregation symmetry)", () => {
    const period: PeriodLineup = {
      ...BARE,
      locks: [{ playerId: GK1, isStarter: true }],
      slotMeta: { [GK1]: { hasPlayed: true, movable: true, voided: false, pointsAtStake: 4 } },
    };
    const ids = fillEligibleIds(period, SQUAD, STARTERS, GK1);
    expect(ids.has(GK2)).toBe(true);
    expect(ids.has(DEF5)).toBe(false);
    expect(ids.has("mid4")).toBe(false);
  });

  it("bench players in period.locks (played-bench) are excluded from eligible fills", () => {
    const allBenchLocked: PeriodLineup = {
      ...BASE_PERIOD,
      locks: [
        { playerId: DEF1, isStarter: true },
        { playerId: DEF5, isStarter: false },
        { playerId: "mid4", isStarter: false },
        { playerId: "mid5", isStarter: false },
      ],
    };
    expect(fillEligibleIds(allBenchLocked, SQUAD, STARTERS, DEF1).size).toBe(0);
  });
});

// ── RTL: token state ──────────────────────────────────────────────────────

describe("PitchToken — played-starter visual state", () => {
  it("played-starter is enabled, shows pts badge, is distinct from a locked token", () => {
    render(<SetLineupClient initialState={state()} />);
    const token = screen.getByTitle(DEF1_TITLE) as HTMLButtonElement;
    // tappable=true: movable=false but isPlayedStarter=true → disabled must be false
    expect(token.disabled).toBe(false);
    // ScorePill is rendered as a role=button with a title (replaced the static sl-tok-pts badge).
    // Both the pill and the token title include this text, so use queryAllByTitle.
    expect(screen.queryAllByTitle(/7 pts — tap for breakdown/i).length).toBeGreaterThan(0);
  });
});

// ── RTL: tap-routing ──────────────────────────────────────────────────────

describe("tap routing — played starter opens score modal, not forfeit confirm", () => {
  it("tapping a played-starter token opens the score modal, never the forfeit confirm", () => {
    render(<SetLineupClient initialState={state()} />);
    fireEvent.click(screen.getByTitle(DEF1_TITLE));
    const dialog = screen.getByRole("dialog");
    // Score modal aria-label (loading state before fetch resolves/fails)
    expect(dialog.getAttribute("aria-label")).toMatch(/score breakdown/i);
    // Forfeit confirm copy must NOT be the dialog label (that belongs to ForfeitConfirmSheet)
    expect(dialog.getAttribute("aria-label")).not.toBe("Bench DEF1");
  });

  it("score modal contains the forfeit copy + 'Bench & forfeit' button for a played starter", () => {
    render(<SetLineupClient initialState={state()} />);
    fireEvent.click(screen.getByTitle(DEF1_TITLE));
    const dialog = screen.getByRole("dialog");
    // ForfeitSection renders immediately (doesn't wait for fetch)
    expect(dialog.textContent).toMatch(/forfeits his 7 pts this period/);
    expect(dialog.textContent).toMatch(/can't return to your XI this period/);
    expect(screen.getByRole("button", { name: /Bench.*forfeit/i })).toBeTruthy();
  });
});

// ── RTL: pre-flight block ─────────────────────────────────────────────────

describe("ForfeitConfirmSheet — pre-flight block (no eligible fill)", () => {
  it("modal opens; 'Bench & forfeit' shows a toast and closes modal when no eligible fill exists", () => {
    const noFillPeriod: PeriodLineup = {
      ...BASE_PERIOD,
      locks: [
        { playerId: DEF1, isStarter: true },
        { playerId: DEF5, isStarter: false }, // played-bench → locked
        { playerId: "mid4", isStarter: false },
        { playerId: "mid5", isStarter: false },
      ],
    };
    render(<SetLineupClient initialState={state(noFillPeriod)} />);
    // Tap opens the score modal
    fireEvent.click(screen.getByTitle(DEF1_TITLE));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    // Clicking "Bench & forfeit" fires the no-fill guard: closes modal, shows toast
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

// ── RTL: forfeit confirm sheet lifecycle ──────────────────────────────────

describe("ForfeitConfirmSheet — open via modal / cancel / confirm lifecycle", () => {
  it("'Bench & forfeit' in score modal opens the forfeit confirm sheet", () => {
    render(<SetLineupClient initialState={state()} />);
    fireEvent.click(screen.getByTitle(DEF1_TITLE));
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Bench DEF1");
    expect(dialog.textContent).toMatch(/forfeits his 7 pts this period/);
    expect(dialog.textContent).toMatch(/can't return to your XI this period/);
  });

  it("Cancel on confirm sheet closes it — full undo; played-starter token stays tappable", () => {
    render(<SetLineupClient initialState={state()} />);
    fireEvent.click(screen.getByTitle(DEF1_TITLE));
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i }));
    expect(screen.queryByRole("dialog")).not.toBeNull(); // forfeit confirm is open
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Token still tappable after full undo
    const token = screen.getByTitle(DEF1_TITLE) as HTMLButtonElement;
    expect(token.disabled).toBe(false);
  });

  it("confirming forfeit arms the fill step: confirm closes, DEF1 token shows st-selected", () => {
    render(<SetLineupClient initialState={state()} />);
    // Open score modal → click forfeit → confirm sheet opens
    fireEvent.click(screen.getByTitle(DEF1_TITLE));
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i }));
    // Confirm — this button is now in the ForfeitConfirmSheet (score modal already closed)
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i }));
    // Confirm sheet dismissed, fill step armed
    expect(screen.queryByRole("dialog")).toBeNull();
    const def1Token = screen.getByTitle(DEF1_TITLE);
    expect(def1Token.className).toMatch(/st-selected/);
  });
});
