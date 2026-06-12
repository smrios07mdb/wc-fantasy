// @vitest-environment jsdom
/**
 * C2 forfeit UI — two layers of proof:
 *   1. Pure helpers: classifySlot + fillEligibleIds cover all 6 classification branches and
 *      position / lock eligibility filters (no DOM; logic-only).
 *   2. RTL mounts: SetLineupClient driven through jsdom to prove the played-starter token is
 *      distinct from movable + locked, the destructive confirm sheet opens / cancels / confirms,
 *      and the pre-flight block fires a toast instead of the sheet when no eligible fill exists.
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
    const token = screen.getByTitle(
      /DEF1.*played — tap to bench \(forfeits 7 pts\)/i,
    ) as HTMLButtonElement;
    // tappable=true: movable=false but isPlayedStarter=true → disabled must be false
    expect(token.disabled).toBe(false);
    // Points badge is rendered with accessible label
    expect(screen.queryByLabelText("7 points")).not.toBeNull();
  });
});

// ── RTL: pre-flight block ─────────────────────────────────────────────────

describe("ForfeitConfirmSheet — pre-flight block (no eligible fill)", () => {
  it("tapping played starter with ALL bench locked shows a toast, not the confirm sheet", () => {
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
    fireEvent.click(screen.getByTitle(/DEF1.*played — tap to bench/i));
    // The confirm sheet must NOT appear
    expect(screen.queryByRole("dialog")).toBeNull();
    // But a status toast must be visible
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

// ── RTL: confirm sheet lifecycle ──────────────────────────────────────────

describe("ForfeitConfirmSheet — open / cancel / confirm lifecycle", () => {
  it("tapping played starter opens the confirm sheet with the correct destructive copy", () => {
    render(<SetLineupClient initialState={state()} />);
    fireEvent.click(screen.getByTitle(/DEF1.*played — tap to bench \(forfeits 7 pts\)/i));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Bench DEF1");
    expect(dialog.textContent).toMatch(/forfeits his 7 pts this period/);
    expect(dialog.textContent).toMatch(/can't return to your XI this period/);
  });

  it("Cancel closes the sheet — full undo; played-starter token returns to its tappable state", () => {
    render(<SetLineupClient initialState={state()} />);
    fireEvent.click(screen.getByTitle(/DEF1.*played — tap to bench \(forfeits 7 pts\)/i));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Token is still tappable after full undo
    const token = screen.getByTitle(
      /DEF1.*played — tap to bench \(forfeits 7 pts\)/i,
    ) as HTMLButtonElement;
    expect(token.disabled).toBe(false);
  });

  it("'Bench & forfeit' arms the fill step: sheet closes, DEF1 token shows st-selected state", () => {
    render(<SetLineupClient initialState={state()} />);
    fireEvent.click(screen.getByTitle(/DEF1.*played — tap to bench \(forfeits 7 pts\)/i));
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i }));
    // Sheet is dismissed
    expect(screen.queryByRole("dialog")).toBeNull();
    // DEF1 is now the selected player — its token has st-selected in its className
    const def1Token = screen.getByTitle(/DEF1.*played — tap to bench \(forfeits 7 pts\)/i);
    expect(def1Token.className).toMatch(/st-selected/);
  });
});
