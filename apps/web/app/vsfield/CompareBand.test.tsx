// @vitest-environment jsdom
/**
 * REAL interaction proof for the Direction-A H2H surface (replaces the H2HDetail drill-in test).
 * Mounts <CompareBand> + <XIPanel> in jsdom and asserts:
 *
 *  - CompareBand renders Fact 1 (live margin: verdict word + signed diff) and Fact 2 (upside still to
 *    come), and — Fact 3 still deferred — NO Fact-3 player-by-player content in the BAND.
 *  - On the jersey pitch each starter shows a points CHIP under the kit (Prompt 41 / path a): the real
 *    `score_player_match.points` is the headline number, with three states — live (dark pill + dot + N
 *    PTS) · played (same pill + N PTS, no dot) · yet-to-play (dashed "– TO PLAY", no number).
 *  - A played/locked player is a tappable button that fires `onOpenPlayer` with the right playerId (in
 *    VsFieldClient that callback is `setBoxPlayer`, so the callback firing IS the modal opening). This
 *    holds for an OPPONENT's player as well as the viewer's own — the read is league-scoped.
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
    points: over.points ?? 0,
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
      points: 14,
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

describe("XIPanel — jersey-pitch drill-in (points chip + tap-to-open box-score modal)", () => {
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

  it("shows the per-player points chip (number is the headline), not a worded state label (Prompt 41)", () => {
    render(<XIPanel entry={OPP} onOpenPlayer={() => {}} dimLive={false} />);
    // the played starter's REAL points render as the chip headline …
    expect(screen.getByText("14")).toBeTruthy();
    // … the ytp slot keeps "to play" (no number) …
    expect(screen.getByText("to play")).toBeTruthy();
    // … and the old worded live/played labels are gone (the dot is the only live cue now).
    expect(screen.queryByText("Played")).toBeNull();
    expect(screen.queryByText("Playing")).toBeNull();
  });

  it("has NO forfeit affordance anywhere — vsfield never edits lineups", () => {
    render(<XIPanel entry={ME} onOpenPlayer={() => {}} dimLive={false} />);
    expect(screen.queryByText(/forfeit/i)).toBeNull();
    expect(screen.queryByText(/bench/i)).toBeNull();
  });
});

// One XI covering every chip state, with distinct points so each is checkable in isolation.
const CHIP = entry({
  managerId: "chip",
  displayName: "Chip",
  points: 17,
  starters: [
    starter({
      playerId: "c-live",
      name: "Live Star",
      role: "FWD",
      state: "playing",
      points: 3,
      locked: true,
    }),
    starter({
      playerId: "c-live0",
      name: "Live Zero",
      role: "MID",
      state: "playing",
      points: 0,
      locked: true,
    }),
    starter({
      playerId: "c-played",
      name: "Played Star",
      role: "DEF",
      state: "played",
      points: 14,
      locked: true,
    }),
    starter({
      playerId: "c-ytp",
      name: "ToPlay Star",
      role: "GK",
      state: "yet-to-play",
      points: 0,
    }),
  ],
});

const tokOf = (name: string) => screen.getByText(name).closest(".sl-tok-jersey") as HTMLElement;
const chipOf = (name: string) => tokOf(name).querySelector(".sl-jersey-score") as HTMLElement;

describe("XIToken — points chip, three states (Prompt 41 ScorePill)", () => {
  it("played: dark pill with the real points number + PTS unit, and NO live dot", () => {
    render(<XIPanel entry={CHIP} onOpenPlayer={() => {}} dimLive={false} />);
    const chip = chipOf("Played Star");
    expect(chip.className).toContain("s-played");
    expect(chip.querySelector("b")!.textContent).toBe("14");
    expect(tokOf("Played Star").querySelector(".sl-score-dot")).toBeNull(); // no dot = already played
  });

  it("live: dark pill with number + PTS AND the red pulsing dot (the sole live↔played cue)", () => {
    render(<XIPanel entry={CHIP} onOpenPlayer={() => {}} dimLive={false} />);
    const chip = chipOf("Live Star");
    expect(chip.className).toContain("s-live");
    expect(chip.querySelector("b")!.textContent).toBe("3");
    expect(tokOf("Live Star").querySelector(".sl-score-dot")).not.toBeNull(); // live dot present
  });

  it("yet-to-play: dashed pill with the em-dash + TO PLAY, NO number and NO dot", () => {
    render(<XIPanel entry={CHIP} onOpenPlayer={() => {}} dimLive={false} />);
    const chip = chipOf("ToPlay Star");
    expect(chip.className).toContain("s-ytp");
    expect(chip.querySelector("b")).toBeNull(); // no number element at all
    expect(chip.textContent).toContain("to play");
    expect(tokOf("ToPlay Star").querySelector(".sl-score-dot")).toBeNull();
  });

  it("a true 0 still renders the number (softened via is-zero), never a blank slot", () => {
    render(<XIPanel entry={CHIP} onOpenPlayer={() => {}} dimLive={false} />);
    const chip = chipOf("Live Zero");
    expect(chip.className).toContain("is-zero");
    expect(chip.querySelector("b")!.textContent).toBe("0");
  });

  it("stale feed (dimLive) suppresses the live dot but keeps the points number", () => {
    render(<XIPanel entry={CHIP} onOpenPlayer={() => {}} dimLive={true} />);
    expect(tokOf("Live Star").querySelector(".sl-score-dot")).toBeNull();
    expect(chipOf("Live Star").querySelector("b")!.textContent).toBe("3");
  });

  it("reflects updated points on re-render (the live nudge→refetch path feeds fresh props)", () => {
    const { rerender } = render(<XIPanel entry={CHIP} onOpenPlayer={() => {}} dimLive={false} />);
    expect(chipOf("Played Star").querySelector("b")!.textContent).toBe("14");
    const bumped = entry({
      ...CHIP,
      starters: CHIP.starters.map((s) => (s.playerId === "c-played" ? { ...s, points: 19 } : s)),
    });
    rerender(<XIPanel entry={bumped} onOpenPlayer={() => {}} dimLive={false} />);
    expect(chipOf("Played Star").querySelector("b")!.textContent).toBe("19");
  });
});
