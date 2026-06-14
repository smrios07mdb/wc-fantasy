// @vitest-environment jsdom
/**
 * Focused proof of the period-less Stats body extracted in Prompt 56 (Part A). `<PlayerStatsTab/>` is
 * purely presentational over `{ loading, error, stats }` — the eager fetch lives in the
 * `usePlayerTournamentStats` hook its hosts (PlayerScoreSheet + FaPlayerCardSheet) call. So we mount it
 * directly with fixtures: a populated render (tiles + game log, null-cell "—", genuine-0 omission) and
 * the two quiet degrade states. The behaviour-preservation of the move is separately proven by the
 * UNCHANGED PlayerScoreSheet.test.tsx (which still drives the same tab through the real fetch).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PlayerStatsTab } from "./PlayerStatsTab";
import type { PlayerTournamentStats } from "@/src/playerTournamentStats/buildPlayerTournamentStats";

afterEach(() => cleanup());

const STATS: PlayerTournamentStats = {
  totals: {
    matches: 1,
    goals: 1,
    assists: 0,
    points: 8,
    saves: 0,
    cleanSheets: 0,
    conceded: 0,
    keyPasses: 0,
    shots: 3,
    tackles: 0,
    dribbles: 0,
  },
  tiles: [
    { key: "matches", label: "Matches", value: 1 },
    { key: "goals", label: "Goals", value: 1 },
    { key: "assists", label: "Assists", value: 0 },
    { key: "shots", label: "Shots", value: 3 },
    { key: "points", label: "Points", value: 8 },
  ],
  games: [
    {
      periodLabel: "MD1",
      opponentTeamName: "Mexico",
      opponentIso2: "MX",
      isHome: true,
      minutes: 90,
      scoreline: "2–0",
      result: "W",
      points: 8,
      lines: [
        { key: "goals", label: "G", value: 1 },
        { key: "assists", label: "A", value: null }, // null → "—" (shown)
        { key: "shots", label: "SH", value: 3 },
        { key: "dribbles", label: "DRB", value: 0 }, // genuine 0 → omitted
      ],
    },
  ],
};

describe("PlayerStatsTab (extracted, period-less Stats body)", () => {
  it("renders the position tiles + the completed-match log from a fixture", () => {
    const { container } = render(<PlayerStatsTab loading={false} error={false} stats={STATS} />);

    // Tiles (FWD set includes Shots) + the game-log opponent / matchday / scoreline.
    expect(screen.getByText("Shots")).toBeTruthy();
    expect(screen.getByText("Mexico")).toBeTruthy();
    expect(screen.getByText("MD1")).toBeTruthy();
    expect(screen.getByText("2–0")).toBeTruthy();

    // A null cell ("A") is shown; a genuine 0 ("DRB") is omitted — unknown data never reads as 0.
    const statline = container.querySelector(".pc-statline");
    expect(statline?.textContent).toContain("A");
    expect(statline?.textContent).not.toContain("DRB");
  });

  it("shows the quiet loading state (no tiles, no throw)", () => {
    render(<PlayerStatsTab loading={true} error={false} stats={null} />);
    expect(screen.getByText(/loading stats/i)).toBeTruthy();
    expect(screen.queryByText("Matches")).toBeNull();
  });

  it("shows the quiet error state on a failed/absent fetch", () => {
    render(<PlayerStatsTab loading={false} error={true} stats={null} />);
    expect(screen.getByText(/couldn’t load stats|couldn't load stats/i)).toBeTruthy();
  });
});
