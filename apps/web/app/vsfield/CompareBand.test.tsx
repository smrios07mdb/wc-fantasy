// @vitest-environment jsdom
/**
 * REAL interaction proof for the Direction-A H2H surface (replaces the H2HDetail drill-in test).
 * Mounts <CompareBand> + <XIPanel> in jsdom and asserts:
 *
 *  - CompareBand renders Fact 1 (live margin: verdict word + signed diff) and Fact 2 (upside still to
 *    come), and — per the F2 deferral — NO Fact-3 player-by-player content and NO per-player score
 *    anywhere (Theme F: per-player points are not in the SSR snapshot).
 *  - On the jersey pitch, a played/locked player is a tappable button that fires `onOpenPlayer` with
 *    the right playerId (in VsFieldClient that callback is `setBoxPlayer`, so the callback firing IS
 *    the modal opening). This holds for an OPPONENT's player as well as the viewer's own — the read
 *    is league-scoped, reachable beyond your own XI.
 *  - A to-play player (match not kicked off) renders but is inert (no button → no modal): vsfield is
 *    read-only, no swap/drag.
 *  - No forfeit affordance anywhere — vsfield never edits lineups.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CompareBand, XIPanel } from "./components";
import type { FieldEntry, StarterView } from "@app/vsfield";

afterEach(cleanup);

function starter(over: Partial<StarterView> & Pick<StarterView, "playerId">): StarterView {
  return {
    playerId: over.playerId,
    name: over.name ?? over.playerId,
    nation: over.nation ?? null,
    role: over.role ?? "MID",
    state: over.state ?? "yet-to-play",
    locked: over.locked ?? false,
  };
}

function entry(over: Partial<FieldEntry> & Pick<FieldEntry, "managerId">): FieldEntry {
  return {
    managerId: over.managerId,
    displayName: over.displayName ?? over.managerId,
    isMe: over.isMe ?? false,
    rank: over.rank ?? 1,
    points: over.points ?? 0,
    record: over.record ?? { w: 0, l: 0, d: 0 },
    starters: over.starters ?? [],
    counts: over.counts ?? { yetToPlay: 0, playing: 0, played: 0, noMatch: 0 },
    h2hVsViewer: over.h2hVsViewer ?? null,
  };
}

const ME = entry({
  managerId: "me",
  displayName: "You",
  isMe: true,
  points: 10,
  rank: 2,
  record: { w: 4, l: 2, d: 0 },
  counts: { yetToPlay: 1, playing: 0, played: 1, noMatch: 1 },
  starters: [
    starter({
      playerId: "my-played",
      name: "My Played",
      role: "GK",
      state: "played",
      locked: true,
    }),
    starter({ playerId: "my-toplay", name: "My ToPlay", role: "DEF", state: "yet-to-play" }),
  ],
});

const OPP = entry({
  managerId: "opp",
  displayName: "Rival",
  points: 4,
  rank: 5,
  record: { w: 1, l: 5, d: 0 },
  counts: { yetToPlay: 0, playing: 0, played: 2, noMatch: 0 },
  starters: [
    starter({
      playerId: "opp-played",
      name: "Opp Played",
      role: "FWD",
      nation: "Brazil",
      state: "played",
      locked: true,
    }),
    starter({ playerId: "opp-toplay", name: "Opp ToPlay", role: "MID", state: "yet-to-play" }),
  ],
  h2hVsViewer: { result: "win", points: 10, opponentPoints: 4, margin: 6 },
});

describe("CompareBand — Facts 1 + 2, Fact 3 deferred (F2 / Theme F)", () => {
  it("renders Fact 1: the live-margin verdict (word + signed diff) and both sides' scores", () => {
    render(<CompareBand me={ME} opp={OPP} />);
    expect(screen.getByText("WINNING")).toBeTruthy();
    expect(screen.getByText("+6")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Rival")).toBeTruthy();
  });

  it("renders Fact 2: upside still to come (yetToPlay + noMatch on BOTH sides)", () => {
    render(<CompareBand me={ME} opp={OPP} />);
    // me: 1 yetToPlay + 1 noMatch = 2 · opp: 0 — and the player edge
    expect(screen.getByText("Upside still to come")).toBeTruthy();
    expect(screen.getByText(/\+2 player edge/)).toBeTruthy();
  });

  it("renders NO Fact-3 player-by-player content (deferred — per-player pts not in the snapshot)", () => {
    render(<CompareBand me={ME} opp={OPP} />);
    expect(screen.queryByText(/player-by-player/i)).toBeNull();
    expect(screen.queryByText(/biggest edge/i)).toBeNull();
  });
});

describe("XIPanel — jersey-pitch box-score drill-in (Theme F: state only, never a score)", () => {
  it("opens the modal for an OPPONENT's played player (league-scoped — not the viewer's roster)", () => {
    const onOpenPlayer = vi.fn();
    render(<XIPanel entry={OPP} onOpenPlayer={onOpenPlayer} dimLive={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Opp Played/ }));
    expect(onOpenPlayer).toHaveBeenCalledWith("opp-played");
  });

  it("opens the modal for the viewer's OWN played player too", () => {
    const onOpenPlayer = vi.fn();
    render(<XIPanel entry={ME} onOpenPlayer={onOpenPlayer} dimLive={false} />);
    fireEvent.click(screen.getByRole("button", { name: /My Played/ }));
    expect(onOpenPlayer).toHaveBeenCalledWith("my-played");
  });

  it("renders to-play players but leaves them inert (no button → no modal)", () => {
    const onOpenPlayer = vi.fn();
    render(<XIPanel entry={OPP} onOpenPlayer={onOpenPlayer} dimLive={false} />);
    expect(screen.getByText("Opp ToPlay")).toBeTruthy(); // present + identifiable
    expect(screen.queryByRole("button", { name: /Opp ToPlay/ })).toBeNull(); // but not tappable
  });

  it("exposes player STATE words, never a per-player score value (Theme F)", () => {
    render(<XIPanel entry={OPP} onOpenPlayer={() => {}} dimLive={false} />);
    expect(screen.getByText("Played")).toBeTruthy(); // worded state, color + word
    expect(screen.getByText("to play")).toBeTruthy();
    // the only number in the panel is the MANAGER total in the header (4), never a per-player pts
    const panel = screen.getByText("Rival").closest(".da-xi") as HTMLElement;
    const tokens = panel.querySelectorAll(".sl-tok-jersey");
    expect(tokens.length).toBe(2);
    for (const tok of tokens) expect(tok.textContent ?? "").not.toMatch(/\d/);
  });

  it("has NO forfeit affordance anywhere — vsfield never edits lineups", () => {
    render(<XIPanel entry={ME} onOpenPlayer={() => {}} dimLive={false} />);
    expect(screen.queryByText(/forfeit/i)).toBeNull();
    expect(screen.queryByText(/bench/i)).toBeNull();
  });
});
