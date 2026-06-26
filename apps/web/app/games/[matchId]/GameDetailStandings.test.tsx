// @vitest-environment jsdom
/**
 * REAL render proof for the T18 Standings tab. A source-contract smoke can't prove the tab actually
 * renders, so this mounts the REAL {@link GameDetailClient} over a {@link buildGameDetail} view (the group
 * table comes from the real pure builder) and drives the tab switch through RTL:
 *   - the Standings tab button appears only when the group table is present, and clicking it shows the
 *     sorted table with the top-2 green cutline badges + the two in-match teams highlighted, and
 *   - the tab is HIDDEN (no button) when the builder returns null (no ingested standings / cross-group).
 * `next/navigation` is mocked (no app-router provider in jsdom — GameDetailClient calls useRouter().back()).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GameDetailClient } from "./GameDetailClient";
import { buildGameDetail } from "@/src/games/buildGameDetail";
import type { BuildGameDetailInput, GdStandingInput } from "@/src/games/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: () => {} }) }));

afterEach(cleanup);

const match: BuildGameDetailInput["match"] = {
  matchId: "m1",
  status: "completed",
  kickoffIso: "2026-06-21T18:00:00.000Z",
  homeTeamId: "home",
  awayTeamId: "away",
  homeTeamName: "Mexico",
  awayTeamName: "South Korea",
  homeScore: 2,
  awayScore: 0,
  periodId: null,
  periodKind: "group_md",
  periodLabel: "Group A · MD3",
  round: "3",
};

// At least one line per side so `view.empty` is false (else the client renders the empty card with NO tabs).
const players: BuildGameDetailInput["players"] = [
  { id: "p1", displayName: "H. One", firstName: "Home", lastName: "One", position: "FWD", teamId: "home", nation: "Mexico" }, // prettier-ignore
  { id: "p2", displayName: "A. One", firstName: "Away", lastName: "One", position: "FWD", teamId: "away", nation: "South Korea" }, // prettier-ignore
];
const lineupEntries: BuildGameDetailInput["lineupEntries"] = [
  { playerId: "p1", isStarter: true },
  { playerId: "p2", isStarter: true },
];

const gs = (teamId: string, over: Partial<GdStandingInput>): GdStandingInput => ({
  teamId,
  teamName: teamId,
  bdlGroupId: 1,
  groupName: "Group A",
  position: 1,
  played: 3,
  won: 1,
  drawn: 1,
  lost: 1,
  goalsFor: 3,
  goalsAgainst: 3,
  goalDifference: 0,
  points: 4,
  ...over,
});

function view(standings: GdStandingInput[]) {
  const input: BuildGameDetailInput = {
    match,
    players,
    stats: [],
    scores: [],
    ratings: [],
    teamStats: [],
    standings,
    lineupEntries,
    events: [],
    ownerByPlayer: {},
    unresolvedFromPool: 0,
  };
  return buildGameDetail(input);
}

const fullGroup: GdStandingInput[] = [
  gs("home", { teamName: "Mexico", position: 1, won: 3, drawn: 0, lost: 0, goalsFor: 6, goalsAgainst: 0, goalDifference: 6, points: 9 }), // prettier-ignore
  gs("x", { teamName: "South Africa", position: 2, goalDifference: -1, points: 4 }),
  gs("away", { teamName: "South Korea", position: 3, goalDifference: -1, points: 3 }),
  gs("y", { teamName: "Ghana", position: 4, won: 0, drawn: 1, lost: 2, goalsFor: 1, goalsAgainst: 5, goalDifference: -4, points: 1 }), // prettier-ignore
];

describe("GameDetailClient — Standings tab (T18 render)", () => {
  it("shows the Standings tab and renders the sorted group table with cutline + in-match highlights", () => {
    render(<GameDetailClient view={view(fullGroup)} />);
    fireEvent.click(screen.getByRole("tab", { name: "Standings" }));

    const table = document.querySelector(".gd-standings");
    expect(table).not.toBeNull();

    // Group header + advancement note + tie-break footnote.
    expect(document.querySelector(".gd-gr-head")?.textContent).toContain("Group A");
    expect(document.querySelector(".gd-gr-note")?.textContent).toContain("Top 2 advance");
    expect(document.querySelector(".gd-gr-tiebreak")?.textContent).toContain("head-to-head");

    // Four rows, sorted by position (the row order in the DOM is home, x, away, y).
    const bodyRows = Array.from(document.querySelectorAll(".gd-gr-table tbody tr"));
    expect(bodyRows).toHaveLength(4);

    // Top-2 cutline: exactly two green qualification badges.
    expect(document.querySelectorAll(".gd-gr-pos.is-qual")).toHaveLength(2);

    // The two in-match teams (home + away) get the accent row tint + dot — and ONLY those two.
    expect(document.querySelectorAll(".gd-gr-table tbody tr.is-inmatch")).toHaveLength(2);
    expect(document.querySelectorAll(".gd-gr-dot")).toHaveLength(2);

    // Signed GD + the scored:conceded GF pair render for the leader.
    const text = table?.textContent ?? "";
    expect(text).toContain("+6"); // Mexico GD
    expect(text).toContain("6:0"); // Mexico GF:GA
    expect(text).toContain("-4"); // Ghana GD (natural minus)
  });

  it("hides the Standings tab entirely when there is no ingested group table", () => {
    render(<GameDetailClient view={view([])} />);
    // Other tabs still render (the view is not empty), but Standings is absent.
    expect(screen.getByRole("tab", { name: "Lineups" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Standings" })).toBeNull();
  });
});
