// @vitest-environment jsdom
/**
 * REAL render proof for T11 R2 / Fix B-2: the settled-batch list groups by PLAYER. A player
 * contested by multiple managers appears ONCE, with every bid (winner + loser) beneath him — so
 * the whole contest reads at a glance instead of being scattered across amount-ordered rows.
 * Mounts the REAL {@link ResultsBatch} with the live screenshot scenario (Felix Nmecha won by
 * Jager FC $15 dropping Ugarte, lost by yader.rosales $7).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ResultsBatch } from "./components";
import type { WvBatch, WvPlayer, WvResult } from "./types";

afterEach(cleanup);

function player(id: string, over: Partial<WvPlayer> = {}): WvPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "MID",
    nation: over.nation ?? null,
    teamName: over.teamName ?? null,
    kickoffAt: over.kickoffAt ?? null,
    seasonPoints: over.seasonPoints ?? null,
  };
}

const NMECHA = player("nmecha", { name: "Felix Nmecha", shortName: "F. Nmecha", position: "MID" });

const RESULTS: WvResult[] = [
  {
    bidId: "b-lost",
    managerId: "m2",
    managerName: "yader.rosales",
    isMine: false,
    add: NMECHA,
    drop: null,
    amount: 7,
    outcome: "lost",
  },
  {
    bidId: "b-won",
    managerId: "m1",
    managerName: "Jager FC",
    isMine: false,
    add: NMECHA,
    drop: player("ugarte", { name: "Manuel Ugarte", shortName: "M. Ugarte", position: "MID" }),
    amount: 15,
    outcome: "won",
  },
];

const BATCH: WvBatch = {
  batchId: "b1",
  runAt: "2026-06-18T19:00:00.000Z",
  matchdayLabel: "Group MD2",
  results: RESULTS,
};

describe("batch results grouped by player (T11 R2 / Fix B-2)", () => {
  it("shows the contested player exactly once", () => {
    render(<ResultsBatch batch={BATCH} formatRunAt={() => "2:00 PM"} />);
    // Pre-fix Nmecha rendered twice (one row per bid); now his identity header appears once.
    expect(screen.getAllByText("F. Nmecha").length).toBe(1);
  });

  it("shows BOTH bids — winner and loser — under the one player entry", () => {
    render(<ResultsBatch batch={BATCH} formatRunAt={() => "2:00 PM"} />);
    expect(screen.getByText("Jager FC")).toBeTruthy();
    expect(screen.getByText("yader.rosales")).toBeTruthy();
    expect(screen.getByText("$15")).toBeTruthy();
    expect(screen.getByText("$7")).toBeTruthy();
    expect(screen.getByText("won")).toBeTruthy();
    expect(screen.getByText("lost")).toBeTruthy();
  });

  it("keeps the dropped-player detail on the winning bid, and the matchday label", () => {
    render(<ResultsBatch batch={BATCH} formatRunAt={() => "2:00 PM"} />);
    expect(screen.getByText(/dropped M\. Ugarte/)).toBeTruthy();
    expect(screen.getByText(/Group MD2/)).toBeTruthy();
  });
});
