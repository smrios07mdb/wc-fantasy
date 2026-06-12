// @vitest-environment jsdom
/**
 * REAL interaction proof for the Vs-the-Field per-opponent box-score drill-in (the Prompt 52/53
 * <PlayerScoreSheet> reuse). Mounts the exported <H2HDetail> in jsdom and drives the named XI lists:
 *
 *  - A played/locked player is a tappable button that fires `onOpenPlayer` with the right playerId.
 *    In VsFieldClient that callback is `setBoxPlayer`, i.e. tapping opens the modal — so asserting the
 *    callback fires with the correct id IS asserting the modal would open for that player.
 *  - This holds for an OPPONENT's player (not on the viewer's roster) as well as the viewer's own —
 *    proving the read is league-scoped, reachable beyond your own XI.
 *  - A to-play player (match not kicked off) is rendered but inert (no button → no modal): vsfield is
 *    read-only, no swap/drag.
 *  - The drill-in carries NO forfeit affordance anywhere — vsfield never edits lineups.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { H2HDetail } from "./components";
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

const FIELD: FieldEntry[] = [
  entry({
    managerId: "me",
    displayName: "You",
    isMe: true,
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
  }),
  entry({
    managerId: "opp",
    displayName: "Rival",
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
  }),
];

describe("H2HDetail — box-score drill-in", () => {
  it("opens the modal for an OPPONENT's played player (league-scoped — not the viewer's roster)", () => {
    const onOpenPlayer = vi.fn();
    render(<H2HDetail field={FIELD} oppId="opp" onClose={() => {}} onOpenPlayer={onOpenPlayer} />);
    fireEvent.click(screen.getByRole("button", { name: /Opp Played/ }));
    expect(onOpenPlayer).toHaveBeenCalledWith("opp-played");
  });

  it("opens the modal for the viewer's OWN played player too", () => {
    const onOpenPlayer = vi.fn();
    render(<H2HDetail field={FIELD} oppId="opp" onClose={() => {}} onOpenPlayer={onOpenPlayer} />);
    fireEvent.click(screen.getByRole("button", { name: /My Played/ }));
    expect(onOpenPlayer).toHaveBeenCalledWith("my-played");
  });

  it("renders to-play players but leaves them inert (no button → no modal)", () => {
    const onOpenPlayer = vi.fn();
    render(<H2HDetail field={FIELD} oppId="opp" onClose={() => {}} onOpenPlayer={onOpenPlayer} />);
    expect(screen.getByText("Opp ToPlay")).toBeTruthy(); // present + identifiable
    expect(screen.queryByRole("button", { name: /Opp ToPlay/ })).toBeNull(); // but not tappable
    expect(screen.queryByRole("button", { name: /My ToPlay/ })).toBeNull();
  });

  it("has NO forfeit affordance anywhere — vsfield never edits lineups", () => {
    render(<H2HDetail field={FIELD} oppId="opp" onClose={() => {}} onOpenPlayer={() => {}} />);
    expect(screen.queryByText(/forfeit/i)).toBeNull();
    expect(screen.queryByText(/bench/i)).toBeNull();
  });
});
