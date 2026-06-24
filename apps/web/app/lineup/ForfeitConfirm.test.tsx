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
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { classifySlot, fillEligibleIds } from "../../src/lineup/view";
import { SetLineupClient } from "./SetLineupClient";
import type { LineupPlayer, PeriodLineup, SetLineupState } from "../../src/lineup/types";
import type { Position } from "@app/shared";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
  kind: "group_md",
  status: "open",
  readOnly: false,
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

// ── RTL: forfeit-sub save surfaces NO spurious error (T7) ──────────────────
// The full destructive path: forfeit a played starter, fill his slot with an unplayed reserve, and SAVE.
// The save returns 200 {ok:true} and the slot is voided server-side; the screen must NOT then re-surface
// the `forfeit-requires-confirm` reason. (Regression: clearing the confirmed-forfeit set on save made the
// post-save re-validation — run against the still-stale local lock state, which models the forfeited man
// as an un-voided played STARTER — re-demand a confirm, painting an `is-error` reason beside the
// "Lineup saved." toast.)
describe("forfeit-sub save — succeeds without surfacing a spurious error (T7)", () => {
  it("after a 200 save, shows the success toast and NO forfeit-requires-confirm error in the SaveBar", async () => {
    // Stub the global fetch the client uses: a 200 {ok:true} for the lineup POST; a non-ok response for
    // the score modal's player-box / tournament-stats reads so that modal degrades to its error branch
    // (never crashing the test on an unexpected payload shape).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/lineup")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SetLineupClient initialState={state()} />);

    // Drive the forfeit: tap the played-starter token → score modal → "Bench & forfeit" → confirm sheet.
    fireEvent.click(screen.getByTitle(DEF1_TITLE));
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i })); // in-modal action
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i })); // confirm sheet
    // Fill step is armed (DEF1 selected). Tap an eligible unplayed DEF reserve to complete the sub.
    const def5Btn = screen.getByText("X. def5").closest("button");
    expect(def5Btn).not.toBeNull();
    fireEvent.click(def5Btn!);

    // Save — submitLineup → POST /api/lineup → 200 {ok:true}.
    fireEvent.click(screen.getByRole("button", { name: /Save lineup/i }));

    // The success toast confirms the 200 was read.
    await screen.findByText("Lineup saved.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lineup",
      expect.objectContaining({ method: "POST" }),
    );

    // The spurious surfacing: the SaveBar must NOT re-paint forfeit-requires-confirm after the save.
    const reason = document.querySelector(".sl-savebar-reason");
    expect(reason).not.toBeNull();
    expect(reason!.className).not.toMatch(/is-error/);
    expect(reason!.textContent ?? "").not.toMatch(/forfeit/i);
    expect(screen.queryByText(/confirm the forfeit to proceed/i)).toBeNull();
  });
});

// ── RTL: T13 flag-kit jerseys (starters + bench) ───────────────────────────
// The pitch + bench now render the flag-kit chip (`.sl-kit`) in place of the position-color
// PlayerAvatar disc. This proves the swap preserves the flag badge, the real-XI medallion + availClass,
// and the lock-on-play state (played-starter dim + ScorePill) — and that the tap routing is unchanged.
describe("PlayerKit jerseys — T13 (kit chip replaces the disc on starters + bench)", () => {
  // A squad carrying real nations so kitOf resolves to an inline gradient (null country → surface fallback).
  function pc(id: string, pos: Position, country: string | null): LineupPlayer {
    return {
      id,
      displayName: id.toUpperCase(),
      firstName: "X",
      lastName: id,
      position: pos,
      country,
    };
  }
  // Same 2GK/5DEF/5MID/3FWD shape + ids as SQUAD/STARTERS. fwd1 = Mexico (movable + officially STARTING
  // → medallion). DEF1 = France (the played-starter lock target). mid5 = Belgium (a bench man). The kits
  // are single-layer `linear-gradient`s on purpose: jsdom's CSS parser keeps those inline (it silently
  // drops multi-layer gradients like Argentina/Brazil), so the inline-gradient assertions stay reliable.
  const KIT_SQUAD: LineupPlayer[] = [
    pc(GK1, "GK", "Germany"),
    pc(GK2, "GK", null),
    pc(DEF1, "DEF", "France"),
    pc("def2", "DEF", null),
    pc("def3", "DEF", null),
    pc("def4", "DEF", null),
    pc(DEF5, "DEF", null),
    pc("mid1", "MID", null),
    pc("mid2", "MID", null),
    pc("mid3", "MID", null),
    pc("mid4", "MID", null),
    pc("mid5", "MID", "Belgium"),
    pc("fwd1", "FWD", "Mexico"),
    pc("fwd2", "FWD", null),
    pc("fwd3", "FWD", null),
  ];
  // BASE_PERIOD + an announced "starting" availability for the movable fwd1 (drives medallion + glow).
  const KIT_PERIOD: PeriodLineup = { ...BASE_PERIOD, starterStatusByPlayer: { fwd1: "starting" } };
  const kitState = (): SetLineupState => ({ ...state(KIT_PERIOD), squad: KIT_SQUAD });

  it("renders a .sl-kit chip for all 15 players and NO PlayerAvatar disc", () => {
    const { container } = render(<SetLineupClient initialState={kitState()} />);
    expect(container.querySelectorAll(".sl-kit").length).toBe(15); // 11 starters + 4 bench
    expect(container.querySelector(".player-avatar")).toBeNull(); // the disc is gone
  });

  it("a starter chip carries an inline kit gradient + the flag badge", () => {
    const { container } = render(<SetLineupClient initialState={kitState()} />);
    const wrap = container.querySelector('[aria-label="FWD1"]'); // fwd1 = Mexico
    expect(wrap).not.toBeNull();
    const chip = wrap!.querySelector(".sl-kit") as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.getAttribute("style") ?? "").toMatch(/linear-gradient/); // MX kit = a real CSS gradient
    expect(wrap!.querySelector(".pa-flag")).not.toBeNull(); // the flag badge rides the jersey
  });

  it("the bench renders the SAME shared .sl-kit chip (with its own kit gradient)", () => {
    const { container } = render(<SetLineupClient initialState={kitState()} />);
    const wrap = container.querySelector('[aria-label="MID5"]'); // mid5 = Belgium, a bench player
    expect(wrap).not.toBeNull();
    const chip = wrap!.querySelector(".sl-kit") as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.getAttribute("style") ?? "").toMatch(/linear-gradient/);
  });

  it("a movable + officially-starting token keeps its real-XI medallion + availClass", () => {
    render(<SetLineupClient initialState={kitState()} />);
    const fwd1 = screen.getByTitle(/FWD1 · FWD · movable/i);
    expect(fwd1.className).toMatch(/sl-av-starting/); // availClass host class preserved
    expect(fwd1.querySelector(".sl-av-medal")).not.toBeNull(); // corner medallion preserved
  });

  it("preserves lock-on-play visuals: a played-starter keeps sl-tok-played + ScorePill alongside the kit", () => {
    render(<SetLineupClient initialState={kitState()} />);
    const def1 = screen.getByTitle(DEF1_TITLE); // DEF1 played-starter
    expect(def1.className).toMatch(/sl-tok-played/); // lock dim class intact
    expect(def1.querySelector(".sl-scorepill")).not.toBeNull(); // ScorePill intact
    expect(def1.querySelector(".sl-kit")).not.toBeNull(); // and it's a kit chip now
  });

  it("preserves the tap route: clicking a movable starter selects it (st-selected)", () => {
    render(<SetLineupClient initialState={kitState()} />);
    fireEvent.click(screen.getByTitle(/FWD1 · FWD · movable/i));
    expect(screen.getByTitle(/FWD1 · FWD · movable/i).className).toMatch(/st-selected/);
  });
});
