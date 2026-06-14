// @vitest-environment jsdom
/**
 * REAL interaction proof for the self/field cockpit swap (feat/vsfield-self-xi). The abstract dot-node
 * PitchMini + XILegend were replaced by the detailed jersey XI (the same XIPitch/XIToken the H2H compare
 * draws), fed with the viewer's OWN starters. Mounts <YouVsField> in jsdom and asserts:
 *
 *  - the viewer's XI renders as jersey tokens inside the `.da-pitch` (no leftover `.vf-pitch` dot pitch
 *    and no `.vf-legend2` dot legend);
 *  - per-player points chips ride those tokens (Prompt 41 / path a) across mixed states — live (dot + N),
 *    played (N, no dot), yet-to-play ("to play", no number);
 *  - the still-to-come / playing now / played side-count column is preserved;
 *  - tapping a played/locked token fires `onOpenPlayer` (in VsFieldClient that's `setBoxPlayer`, i.e. the
 *    box-score modal opening) while to-play tokens stay inert (vsfield is read-only);
 *  - an all-played XI still renders every chip with its number.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { YouVsField } from "./components";
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

// A mixed plan-state self XI: one live, one played, one yet-to-play.
const ME_MIXED = entry({
  managerId: "me",
  displayName: "You",
  isMe: true,
  points: 17,
  rank: 2,
  record: { w: 3, l: 1, d: 0 },
  counts: { yetToPlay: 1, playing: 1, played: 1, noMatch: 0 },
  starters: [
    starter({
      playerId: "p-live",
      name: "Live Star",
      role: "FWD",
      state: "playing",
      points: 3,
      locked: true,
    }),
    starter({
      playerId: "p-played",
      name: "Played Star",
      role: "DEF",
      state: "played",
      points: 14,
      locked: true,
    }),
    starter({ playerId: "p-ytp", name: "ToPlay Star", role: "GK", state: "yet-to-play" }),
  ],
});

const FIELD = [ME_MIXED, entry({ managerId: "rival", displayName: "Rival", points: 9, rank: 3 })];

const tokOf = (name: string) => screen.getByText(name).closest(".sl-tok-jersey") as HTMLElement;

describe("YouVsField — self/field cockpit now renders the detailed jersey XI", () => {
  it("renders the viewer's own starters as jersey tokens on the .da-pitch (not the dot pitch)", () => {
    const { container } = render(
      <YouVsField field={FIELD} periodLabel="Group MD1" onOpenPlayer={() => {}} dimLive={false} />,
    );
    expect(container.querySelector(".da-pitch")).not.toBeNull();
    expect(tokOf("Live Star")).not.toBeNull();
    expect(tokOf("Played Star")).not.toBeNull();
    // the abstract dot pitch + dot legend are gone
    expect(container.querySelector(".vf-pitch")).toBeNull();
    expect(container.querySelector(".vf-legend2")).toBeNull();
  });

  it("shows per-player points chips across mixed states (live dot, played number, to-play dash)", () => {
    render(
      <YouVsField field={FIELD} periodLabel="Group MD1" onOpenPlayer={() => {}} dimLive={false} />,
    );
    expect(tokOf("Live Star").querySelector(".sl-score-dot")).not.toBeNull(); // live → dot
    expect(tokOf("Live Star").querySelector("b")!.textContent).toBe("3");
    expect(tokOf("Played Star").querySelector(".sl-score-dot")).toBeNull(); // played → no dot
    expect(tokOf("Played Star").querySelector("b")!.textContent).toBe("14");
    expect(tokOf("ToPlay Star").textContent).toContain("to play"); // ytp → no number
    expect(tokOf("ToPlay Star").querySelector("b")).toBeNull();
  });

  it("keeps the still-to-come / playing now / played side-count column", () => {
    render(
      <YouVsField field={FIELD} periodLabel="Group MD1" onOpenPlayer={() => {}} dimLive={false} />,
    );
    expect(screen.getByText("still to come")).toBeTruthy();
    expect(screen.getByText("playing now")).toBeTruthy();
    expect(screen.getByText("played")).toBeTruthy();
  });

  it("tapping a played token fires onOpenPlayer (opens the box-score modal); to-play stays inert", () => {
    const onOpenPlayer = vi.fn();
    render(
      <YouVsField
        field={FIELD}
        periodLabel="Group MD1"
        onOpenPlayer={onOpenPlayer}
        dimLive={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Played Star/ }));
    expect(onOpenPlayer).toHaveBeenCalledWith("p-played");
    expect(screen.queryByRole("button", { name: /ToPlay Star/ })).toBeNull();
  });

  it("all-played XI: every token renders its points number", () => {
    const allPlayed = entry({
      managerId: "me",
      isMe: true,
      points: 28,
      counts: { yetToPlay: 0, playing: 0, played: 2, noMatch: 0 },
      starters: [
        starter({
          playerId: "a",
          name: "Alpha",
          role: "GK",
          state: "played",
          points: 9,
          locked: true,
        }),
        starter({
          playerId: "b",
          name: "Bravo",
          role: "FWD",
          state: "played",
          points: 19,
          locked: true,
        }),
      ],
    });
    render(
      <YouVsField
        field={[allPlayed]}
        periodLabel="Final"
        onOpenPlayer={() => {}}
        dimLive={false}
      />,
    );
    expect(tokOf("Alpha").querySelector("b")!.textContent).toBe("9");
    expect(tokOf("Bravo").querySelector("b")!.textContent).toBe("19");
  });
});
