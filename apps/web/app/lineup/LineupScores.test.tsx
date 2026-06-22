// @vitest-environment jsdom
/**
 * REAL render proof for T11 R2 / Fix A-2 (corrected): a starter that is LOCKED-ON-PLAY (its match
 * has kicked off → `slot.movable === false`, the SAME condition the bench keys on) shows its points
 * pill on the pitch tile — on the CURRENT/editable matchday, not only a read-only prior one — instead
 * of a bare padlock; and the manager's canonical matchday total banner shows whenever the period has a
 * stored total. Mounts the REAL {@link SetLineupClient}.
 *
 * The original Fix A-2 gated the pill on the period-level `readOnly` flag, so on the current matchday
 * (readOnly=false) starters stayed padlocked while the bench — which keys on `!movable` — showed points
 * in the same view. These tests exercise the EDITABLE period and assert (a) the locked starter's pill,
 * (b) the total banner there too, and (c) movability is UNCHANGED: a locked-on-play starter is not
 * movable / not selectable (tap opens the box score), a not-yet-kicked-off starter still selects.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SetLineupClient } from "./SetLineupClient";
import type { LineupPlayer, PeriodLineup, SetLineupState, SlotMeta } from "../../src/lineup/types";
import { POSITIONS, type Position } from "@app/shared";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function player(id: string, position: Position): LineupPlayer {
  return { id, displayName: id, firstName: "X", lastName: id, position, country: null };
}

// A valid 15-man squad (2 GK / 5 DEF / 5 MID / 3 FWD).
function squad(): LineupPlayer[] {
  const counts: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const out: LineupPlayer[] = [];
  for (const pos of POSITIONS)
    for (let i = 1; i <= counts[pos]; i++) out.push(player(`${pos}${i}`, pos));
  return out;
}

// The XI (1-4-3-3). FWD1 = the locked-on-play scorer (9 pts). FWD3 = the not-yet-kicked-off starter
// (still movable → no pill, still selectable).
const STARTERS = [
  "GK1",
  "DEF1",
  "DEF2",
  "DEF3",
  "DEF4",
  "MID1",
  "MID2",
  "MID3",
  "FWD1",
  "FWD2",
  "FWD3",
];
const LOCKED_SCORER = "FWD1";
const SCORER_POINTS = 9;
const MOVABLE_STARTER = "FWD3";

function period(readOnly: boolean, withTotal: boolean): PeriodLineup {
  const sq = squad();
  const slotMeta: Record<string, SlotMeta> = {};
  for (const p of sq) {
    const isStarter = STARTERS.includes(p.id);
    // Every starter has kicked off EXCEPT the deliberately-movable one — so it is locked-on-play.
    const kicked = isStarter && p.id !== MOVABLE_STARTER;
    slotMeta[p.id] = {
      hasPlayed: kicked,
      pointsAtStake: p.id === LOCKED_SCORER ? SCORER_POINTS : 0,
      voided: false,
      // Editable (non-frozen) period → meta.movable true, so a played starter classifies as
      // "played-starter" (the real current-matchday shape); readOnly → frozen → "locked".
      movable: !readOnly,
    };
  }
  // Locks (= locked-on-play) cover every kicked-off starter; the movable starter has NO lock.
  const lockedIds = STARTERS.filter((id) => id !== MOVABLE_STARTER);
  return {
    periodId: "md1",
    label: "MD1",
    kind: "group_md",
    status: "open",
    readOnly,
    closesAt: "2099-01-01T00:00:00.000Z",
    starterIds: [...STARTERS],
    locks: lockedIds.map((id) => ({ playerId: id, isStarter: true })),
    slotMeta,
    kickoffByPlayer: {},
    opponentByPlayer: {},
    snapshotPlayers: readOnly ? sq.filter((p) => STARTERS.includes(p.id)) : undefined,
    ...(withTotal ? { matchdayTotal: 47 } : {}),
  };
}

function stateFor(readOnly: boolean, withTotal: boolean): SetLineupState {
  return {
    sessionManagerId: "mgr1",
    displayName: "Jager FC",
    squad: squad(),
    periods: [period(readOnly, withTotal)],
    activePeriodId: "md1",
    timezone: "UTC",
  };
}

describe("lineup shows scores on the CURRENT/editable matchday (T11 R2 / Fix A-2 corrected)", () => {
  it("a locked-on-play starter shows its points pill on the editable period", () => {
    render(<SetLineupClient initialState={stateFor(false, true)} />);
    // readOnly=false (editable) and yet the locked-on-play starter surfaces its 9-pts ScorePill.
    expect(screen.getByTitle(/^9 pts/)).toBeTruthy();
  });

  it("shows the canonical matchday total banner on the editable period too", () => {
    render(<SetLineupClient initialState={stateFor(false, true)} />);
    expect(screen.getByText(/matchday total/i)).toBeTruthy();
    expect(screen.getByText("47")).toBeTruthy();
  });

  it("does NOT show the total banner before scoring (no stored total)", () => {
    render(<SetLineupClient initialState={stateFor(false, false)} />);
    expect(screen.queryByText(/matchday total/i)).toBeNull();
  });

  it("movability is unchanged: locked starter is not movable, movable starter still is", () => {
    render(<SetLineupClient initialState={stateFor(false, true)} />);
    const locked = screen.getByTitle(/^FWD1 ·/);
    const movableStarter = screen.getByTitle(/^FWD3 ·/);
    // The locked-on-play starter is rendered as played (not movable); the other stays movable.
    expect(locked.className).toContain("sl-tok-played");
    expect(locked.className).not.toContain("is-movable");
    expect(movableStarter.className).toContain("is-movable");
  });

  it("a movable starter still selects on tap (movability preserved)", () => {
    render(<SetLineupClient initialState={stateFor(false, true)} />);
    fireEvent.click(screen.getByTitle(/^FWD3 ·/));
    expect(screen.getByTitle(/^FWD3 ·/).className).toContain("st-selected");
  });

  it("a locked-on-play starter cannot be selected — tap opens the box score, not a swap", () => {
    // PlayerScoreSheet fetches on mount; stub fetch so the click is inert (never resolves).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<SetLineupClient initialState={stateFor(false, true)} />);
    fireEvent.click(screen.getByTitle(/^FWD1 ·/));
    // It is NOT selected for a swap (movability unchanged — locked stays locked).
    expect(screen.getByTitle(/^FWD1 ·/).className).not.toContain("st-selected");
  });

  it("read-only prior matchday still shows the pill + total (unchanged behaviour)", () => {
    render(<SetLineupClient initialState={stateFor(true, true)} />);
    expect(screen.getByTitle(/^9 pts/)).toBeTruthy();
    expect(screen.getByText(/matchday total/i)).toBeTruthy();
  });
});
