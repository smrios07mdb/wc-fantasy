// @vitest-environment jsdom
/**
 * REAL interaction proof for the vsfield benches (T14 updated): bench points + drill-in modal +
 * the original per-manager toggle behavior. Benches carry `points` + `state` from the SAME server
 * snapshot the starters use (path a — no browser-direct read). Mounts <BenchStrip> and <MaH2H>
 * in jsdom and asserts:
 *
 *  - BenchStrip renders each sub as a token: name + kit jersey swatch + Pos badge + points chip;
 *  - a played/playing bench player's chip shows its points; a yet-to-play chip shows "– to play";
 *  - a played/playing token is a tappable button that calls onOpenPlayer with the playerId;
 *  - a yet-to-play token is NOT tappable (no click handler fires);
 *  - an empty bench shows the muted "No substitutes named." note;
 *  - the viewer's own strip carries the .is-me emphasis;
 *  - MaH2H shows the OPPONENT's bench by default (opp-first), and switching the You/Opp toggle swaps it to
 *    the viewer's bench — the bench follows whichever side's XI is on the pitch.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
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
    state: over.state ?? "yet-to-play",
    points: over.points ?? 0,
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

  it("yet-to-play chip shows '– to play', not a points number", () => {
    render(
      <BenchStrip
        label="You"
        players={[bench({ playerId: "s1", name: "Pending", state: "yet-to-play", points: 0 })]}
      />,
    );
    expect(screen.getByText("to play")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("played bench player shows points in the chip", () => {
    render(
      <BenchStrip
        label="You"
        players={[bench({ playerId: "s1", name: "Done", state: "played", points: 9 })]}
      />,
    );
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("pts")).toBeTruthy();
  });

  it("playing bench player chip carries the s-live class", () => {
    const { container } = render(
      <BenchStrip
        label="You"
        players={[bench({ playerId: "s1", name: "Live Sub", state: "playing", points: 4 })]}
      />,
    );
    expect(container.querySelector(".vf-bench-score.s-live")).not.toBeNull();
  });

  it("a played bench player's token is a tappable button that calls onOpenPlayer", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <BenchStrip
        label="You"
        players={[bench({ playerId: "played-sub", name: "Done", state: "played", points: 6 })]}
        onOpenPlayer={onOpen}
      />,
    );
    const btn = container.querySelector("button.vf-bench-tok") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith("played-sub");
  });

  it("a yet-to-play bench player's token is NOT a button even with onOpenPlayer wired", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <BenchStrip
        label="You"
        players={[bench({ playerId: "ytp-sub", name: "Pending", state: "yet-to-play", points: 0 })]}
        onOpenPlayer={onOpen}
      />,
    );
    expect(container.querySelector("button.vf-bench-tok")).toBeNull();
    expect(container.querySelector("div.vf-bench-tok")).not.toBeNull();
  });

  it("without onOpenPlayer, played tokens render as inert divs", () => {
    const { container } = render(
      <BenchStrip
        label="You"
        players={[bench({ playerId: "s1", name: "Done", state: "played", points: 3 })]}
      />,
    );
    expect(container.querySelector("button.vf-bench-tok")).toBeNull();
    expect(container.querySelector("div.vf-bench-tok")).not.toBeNull();
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
  {
    managerId: "me",
    players: [bench({ playerId: "me-sub", name: "My Sub", state: "played", points: 3 })],
  },
  {
    managerId: "opp",
    players: [bench({ playerId: "opp-sub", name: "Opp Sub", state: "playing", points: 1 })],
  },
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

  it("bench drill-in fires onOpenPlayer with the clicked player's id", () => {
    const onOpen = vi.fn();
    render(
      <MaH2H
        field={FIELD}
        oppId="opp"
        onBack={() => {}}
        onOpenPlayer={onOpen}
        dimLive={false}
        benches={BENCHES}
      />,
    );
    // opp-sub is in "playing" state → rendered as a button
    const btn = within(benchStripEl()).getByRole("button", { name: /Opp Sub/ });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith("opp-sub");
  });
});
