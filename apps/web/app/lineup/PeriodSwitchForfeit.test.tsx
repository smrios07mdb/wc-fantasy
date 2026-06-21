// @vitest-environment jsdom
/**
 * T7 regression: a forfeit confirm must survive a PERIOD SWITCH.
 *
 * The bug: `pendingForfeits` was a single global Set that `onSelectPeriod` wiped on every switch, while
 * the benched working set (`lineups[periodId]`) and the immutable SSR `slotMeta`/`locks` are per-period
 * and never refetched. So after forfeiting + saving a played starter in MD1, switching to MD2 and back
 * to MD1 re-validated the still-benched played starter with NO confirm → validateLineup rule 4c painted
 * a spurious `forfeit-requires-confirm` error beside an otherwise-legal, already-saved lineup.
 *
 * The fix makes confirms per-period (`forfeitsByPeriod`), so returning to MD1 keeps the confirm and the
 * re-validation stays green. This drives the real client through jsdom end-to-end.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SetLineupClient } from "./SetLineupClient";
import type { LineupPlayer, PeriodLineup, SetLineupState } from "../../src/lineup/types";
import type { Position } from "@app/shared";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

// 15-man squad: 2 GK / 5 DEF / 5 MID / 3 FWD. DEF1 is the played-starter forfeit target; def5 the fill.
const DEF1 = "def1";
const SQUAD: LineupPlayer[] = [
  p("gk1", "GK"),
  p("gk2", "GK"),
  p(DEF1, "DEF"),
  p("def2", "DEF"),
  p("def3", "DEF"),
  p("def4", "DEF"),
  p("def5", "DEF"),
  p("mid1", "MID"),
  p("mid2", "MID"),
  p("mid3", "MID"),
  p("mid4", "MID"),
  p("mid5", "MID"),
  p("fwd1", "FWD"),
  p("fwd2", "FWD"),
  p("fwd3", "FWD"),
];

// Valid 4-3-3 starting XI used by both periods.
const STARTERS = [
  "gk1",
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

// MD1: DEF1 has played (locked + slotMeta hasPlayed, 7 pts at stake, still movable/un-voided).
const MD1: PeriodLineup = {
  periodId: "md1",
  label: "MD1",
  kind: "group_md",
  status: "open",
  closesAt: "2099-01-01T00:00:00.000Z",
  starterIds: STARTERS,
  locks: [{ playerId: DEF1, isStarter: true }],
  slotMeta: { [DEF1]: { hasPlayed: true, movable: true, voided: false, pointsAtStake: 7 } },
  kickoffByPlayer: {},
  opponentByPlayer: {},
};

// MD2: a clean upcoming window — no locks, no play state. Trivially legal with the same XI.
const MD2: PeriodLineup = {
  periodId: "md2",
  label: "MD2",
  kind: "group_md",
  status: "open",
  closesAt: "2099-01-01T00:00:00.000Z",
  starterIds: STARTERS,
  locks: [],
  slotMeta: {},
  kickoffByPlayer: {},
  opponentByPlayer: {},
};

const STATE: SetLineupState = {
  sessionManagerId: "m1",
  displayName: "Los Dragones",
  squad: SQUAD,
  periods: [MD1, MD2],
  activePeriodId: "md1",
  timezone: "UTC",
};

const DEF1_TITLE = /DEF1.*played.*7 pts.*breakdown/i;

function mockFetch() {
  // /api/lineup → 200 {ok:true}; any other read (player-box) degrades to a 500 the modal tolerates.
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/lineup")) {
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    }
    return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("T7 — forfeit confirm survives a period switch (no spurious forfeit-requires-confirm)", () => {
  it("forfeit+save in MD1, switch to MD2 and back → MD1 stays legal, no forfeit error", async () => {
    mockFetch();
    const { container } = render(<SetLineupClient initialState={STATE} />);

    // Drive the forfeit in MD1: tap played-starter → score modal → "Bench & forfeit" → confirm sheet.
    fireEvent.click(screen.getByTitle(DEF1_TITLE));
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i })); // in-modal action
    fireEvent.click(screen.getByRole("button", { name: /Bench.*forfeit/i })); // confirm sheet
    // Fill step armed (DEF1 selected): tap an eligible unplayed DEF reserve to complete the sub.
    const def5Btn = screen.getByText("X. def5").closest("button");
    expect(def5Btn).not.toBeNull();
    fireEvent.click(def5Btn!);

    // Save → POST /api/lineup → 200 {ok:true}.
    fireEvent.click(screen.getByRole("button", { name: /Save lineup/i }));
    await screen.findByText("Lineup saved.");

    // Round-trip the period selector: MD1 → MD2 → MD1.
    fireEvent.click(screen.getByRole("tab", { name: /MD2/i }));
    fireEvent.click(screen.getByRole("tab", { name: /MD1/i }));

    // Back on MD1: the lineup is still the saved, legal one — the savebar must NOT show a forfeit error.
    const reason = container.querySelector(".sl-savebar-reason");
    expect(reason).not.toBeNull();
    expect(reason!.className).not.toContain("is-error");
    expect(reason!.textContent ?? "").not.toMatch(/forfeit/i);
    expect(reason!.textContent ?? "").toMatch(/legal|ready to save/i);
  });
});
