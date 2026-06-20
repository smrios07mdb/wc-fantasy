// @vitest-environment jsdom
/**
 * REAL interaction proof for the vsfield benches (feat/vsfield-benches): the opponent's bench AND the
 * viewer's own bench shown at the bottom of the head-to-head. Benches are a DISPLAY-ONLY sibling of the
 * server-computed snapshot (buildVsField untouched); the tokens reuse the XI's flag-kit vocabulary (kitOf)
 * + the `Pos` badge, with NO points / live-state (bench players don't score). Mounts <BenchStrip> and
 * <MaH2H> in jsdom and asserts:
 *
 *  - BenchStrip renders each sub as a token: name + a kit jersey swatch (.vf-bench-jersey) + a Pos badge;
 *  - an empty bench shows the muted "No substitutes named." note (keeps the two-up columns aligned);
 *  - the viewer's own strip carries the .is-me emphasis;
 *  - MaH2H shows the OPPONENT's bench by default (opp-first), and switching the You/Opp toggle swaps it to
 *    the viewer's bench — the bench follows whichever side's XI is on the pitch.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { BenchStrip, MaH2H } from "./components";
import type { FieldEntry, StarterView } from "@app/vsfield";
import type { BenchPlayerView, ManagerBench } from "@/src/vsfield/benches";

afterEach(cleanup);

function bench(
  over: Partial<BenchPlayerView> & Pick<BenchPlayerView, "playerId">,
): BenchPlayerView {
  return {
    playerId: over.playerId,
    name: over.name ?? over.playerId,
    nation: over.nation ?? null,
    role: over.role ?? "MID",
  };
}

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

describe("BenchStrip — the substitutes token strip", () => {
  it("renders each sub as a token: name + kit jersey swatch + position badge", () => {
    const players = [
      bench({ playerId: "s1", name: "Sub Keeper", role: "GK", nation: "Brazil" }),
      bench({ playerId: "s2", name: "Sub Winger", role: "FWD", nation: "France" }),
    ];
    const { container } = render(<BenchStrip label="You" players={players} />);
    expect(screen.getByText("Sub Keeper")).toBeTruthy();
    expect(screen.getByText("Sub Winger")).toBeTruthy();
    // one kit swatch + one Pos badge per sub (the reused XI vocabulary)
    expect(container.querySelectorAll(".vf-bench-jersey")).toHaveLength(2);
    expect(container.querySelector(".vf-bench-tok .pos-GK")).not.toBeNull();
    expect(container.querySelector(".vf-bench-tok .pos-FWD")).not.toBeNull();
  });

  it("an empty bench shows the muted note, not an empty strip", () => {
    const { container } = render(<BenchStrip label="Rival" players={[]} />);
    expect(screen.getByText("No substitutes named.")).toBeTruthy();
    expect(container.querySelector(".vf-bench-list")).toBeNull();
  });

  it("the viewer's own strip carries the .is-me emphasis", () => {
    const { container } = render(
      <BenchStrip label="You" isMe players={[bench({ playerId: "s1", name: "My Sub" })]} />,
    );
    expect(container.querySelector(".vf-bench.is-me")).not.toBeNull();
  });
});

const ME = entry({
  managerId: "me",
  displayName: "You",
  isMe: true,
  points: 12,
  starters: [starter({ playerId: "me-xi", name: "My Starter", role: "GK" })],
});
const OPP = entry({
  managerId: "opp",
  displayName: "Rival",
  points: 7,
  starters: [starter({ playerId: "opp-xi", name: "Opp Starter", role: "GK" })],
  h2hVsViewer: { result: "win", points: 12, opponentPoints: 7, margin: 5 },
});
const FIELD = [ME, OPP];
const BENCHES: ManagerBench[] = [
  { managerId: "me", players: [bench({ playerId: "me-sub", name: "My Sub" })] },
  { managerId: "opp", players: [bench({ playerId: "opp-sub", name: "Opp Sub" })] },
];

const benchStripEl = () => document.querySelector(".ma-benchwrap") as HTMLElement;

describe("MaH2H — the bench follows the You/Opp toggle (opp-first)", () => {
  it("shows the OPPONENT's bench by default, then the viewer's after toggling to You", () => {
    render(
      <MaH2H
        field={FIELD}
        oppId="opp"
        onBack={() => {}}
        onOpenPlayer={() => {}}
        dimLive={false}
        benches={BENCHES}
      />,
    );
    // opp-first: the opponent's sub is in the bench strip, the viewer's is not
    expect(within(benchStripEl()).getByText("Opp Sub")).toBeTruthy();
    expect(within(benchStripEl()).queryByText("My Sub")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^You/ }));
    expect(within(benchStripEl()).getByText("My Sub")).toBeTruthy();
    expect(within(benchStripEl()).queryByText("Opp Sub")).toBeNull();
  });

  it("degrades gracefully when benches are omitted (shows the empty note)", () => {
    render(
      <MaH2H field={FIELD} oppId="opp" onBack={() => {}} onOpenPlayer={() => {}} dimLive={false} />,
    );
    expect(within(benchStripEl()).getByText("No substitutes named.")).toBeTruthy();
  });
});
