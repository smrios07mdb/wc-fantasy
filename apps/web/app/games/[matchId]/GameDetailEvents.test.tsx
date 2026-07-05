// @vitest-environment jsdom
/**
 * REAL render proof for the T16b Events tab + the scoreboard scorers row. A source-contract smoke can't
 * prove a tab actually renders, so this mounts the REAL {@link GameDetailClient} over a {@link buildGameDetail}
 * view (timeline + scorers come from the real pure builder) and drives the tab switch through RTL:
 *   - the scoreboard scorers row shows each scorer's surname grouped by side, and
 *   - the Events tab shows the chronological goal timeline with full names, the assist sub-line, and the
 *     HT/FT markers carrying the replayed running score.
 * `next/navigation` is mocked (no app-router provider in jsdom — GameDetailClient calls useRouter().back()).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { GameDetailClient } from "./GameDetailClient";
import { buildGameDetail } from "@/src/games/buildGameDetail";
import type { BuildGameDetailInput } from "@/src/games/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: () => {} }) }));

afterEach(cleanup);

function viewWithGoals() {
  const input: BuildGameDetailInput = {
    match: {
      matchId: "m1",
      status: "completed",
      kickoffIso: "2026-06-21T18:00:00.000Z",
      homeTeamId: "home",
      awayTeamId: "away",
      homeTeamName: "England",
      awayTeamName: "France",
      homeScore: 2,
      awayScore: 1,
      periodId: null,
      periodKind: "group_md",
      periodLabel: "Group A · MD1",
      round: "1",
    },
    players: [
      { id: "saka", displayName: "B. Saka", firstName: "Bukayo", lastName: "Saka", position: "FWD", teamId: "home", nation: "England" }, // prettier-ignore
      { id: "kane", displayName: "H. Kane", firstName: "Harry", lastName: "Kane", position: "FWD", teamId: "home", nation: "England" }, // prettier-ignore
      { id: "mbappe", displayName: "K. Mbappe", firstName: "Kylian", lastName: "Mbappe", position: "FWD", teamId: "away", nation: "France" }, // prettier-ignore
    ],
    stats: [],
    scores: [],
    ratings: [],
    teamStats: [],
    lineupEntries: [],
    events: [
      { incidentType: "goal", incidentClass: "regular", timeMinute: 11, addedTime: null, playerId: "saka", assistPlayerId: "kane", playerInId: null, playerOutId: null, rescinded: false, period: "1H" }, // prettier-ignore
      { incidentType: "goal", incidentClass: "penalty", timeMinute: 55, addedTime: null, playerId: "kane", assistPlayerId: null, playerInId: null, playerOutId: null, rescinded: false, period: "2H" }, // prettier-ignore
      { incidentType: "goal", incidentClass: "regular", timeMinute: 70, addedTime: null, playerId: "mbappe", assistPlayerId: null, playerInId: null, playerOutId: null, rescinded: false, period: "2H" }, // prettier-ignore
    ],
    ownerByPlayer: {},
    unresolvedFromPool: 0,
    timezone: "UTC",
  };
  return buildGameDetail(input);
}

/** A richer 3–0 completed match: a brace, an own goal (away player → home's score), a sub, and a card. */
function viewRich() {
  const input: BuildGameDetailInput = {
    match: {
      matchId: "m2",
      status: "completed",
      kickoffIso: "2026-06-21T18:00:00.000Z",
      homeTeamId: "home",
      awayTeamId: "away",
      homeTeamName: "England",
      awayTeamName: "France",
      homeScore: 3,
      awayScore: 0,
      periodId: null,
      periodKind: "group_md",
      periodLabel: "Group A · MD1",
      round: "1",
    },
    players: [
      { id: "saka", displayName: "B. Saka", firstName: "Bukayo", lastName: "Saka", position: "FWD", teamId: "home", nation: "England" }, // prettier-ignore
      { id: "hernandez", displayName: "T. Hernandez", firstName: "Theo", lastName: "Hernandez", position: "DEF", teamId: "away", nation: "France" }, // prettier-ignore
      { id: "subon", displayName: "S. On", firstName: "Sub", lastName: "On", position: "MID", teamId: "away", nation: "France" }, // prettier-ignore
      { id: "suboff", displayName: "S. Off", firstName: "Sub", lastName: "Off", position: "MID", teamId: "away", nation: "France" }, // prettier-ignore
      { id: "mbappe", displayName: "K. Mbappe", firstName: "Kylian", lastName: "Mbappe", position: "FWD", teamId: "away", nation: "France" }, // prettier-ignore
    ],
    stats: [],
    scores: [],
    ratings: [],
    teamStats: [],
    lineupEntries: [],
    events: [
      { incidentType: "goal", incidentClass: "regular", timeMinute: 11, addedTime: null, playerId: "saka", assistPlayerId: null, playerInId: null, playerOutId: null, rescinded: false, period: "1H" }, // prettier-ignore
      { incidentType: "goal", incidentClass: "regular", timeMinute: 33, addedTime: null, playerId: "saka", assistPlayerId: null, playerInId: null, playerOutId: null, rescinded: false, period: "1H" }, // prettier-ignore
      { incidentType: "goal", incidentClass: "ownGoal", timeMinute: 40, addedTime: null, playerId: "hernandez", assistPlayerId: null, playerInId: null, playerOutId: null, rescinded: false, period: "1H" }, // prettier-ignore
      { incidentType: "substitution", incidentClass: null, timeMinute: 60, addedTime: null, playerId: null, assistPlayerId: null, playerInId: "subon", playerOutId: "suboff", rescinded: false, period: "2H" }, // prettier-ignore
      { incidentType: "card", incidentClass: "yellow", timeMinute: 70, addedTime: null, playerId: "mbappe", assistPlayerId: null, playerInId: null, playerOutId: null, rescinded: false, period: "2H" }, // prettier-ignore
    ],
    ownerByPlayer: {},
    unresolvedFromPool: 0,
    timezone: "UTC",
  };
  return buildGameDetail(input);
}

describe("GameDetailClient — Events tab + scorers row (T16b render)", () => {
  it("renders the scoreboard scorers row with each scorer's surname, scoped to its own side", () => {
    render(<GameDetailClient view={viewWithGoals()} />);
    const home = document.querySelector(".gd-scorers.is-home");
    const away = document.querySelector(".gd-scorers.is-away");
    expect(home).not.toBeNull();
    expect(away).not.toBeNull();
    // Both home scorers on the home side; the away scorer on the away side (grouping is per-side).
    expect(within(home as HTMLElement).getByText("Saka")).toBeTruthy();
    expect(within(home as HTMLElement).getByText("Kane")).toBeTruthy();
    expect(within(away as HTMLElement).getByText("Mbappe")).toBeTruthy();
  });

  it("switches to the Events tab and shows the timeline (assist, PEN tag, latest-first markers, running score)", () => {
    render(<GameDetailClient view={viewWithGoals()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Events" }));

    const timeline = document.querySelector(".gd-timeline");
    expect(timeline).not.toBeNull();
    const tl = within(timeline as HTMLElement);
    // Full names in the timeline (the scoreboard line used surnames); the penalty carries a PEN tag.
    expect(tl.getByText("Bukayo Saka")).toBeTruthy();
    expect(tl.getByText(/assist ·/).textContent).toContain("Harry Kane");
    expect(tl.getAllByText("PEN").length).toBeGreaterThan(0);

    // HT/FT markers carry the replayed running score (1–0 at the break, 2–1 at full-time)…
    const pills = Array.from(document.querySelectorAll(".gd-tlm-pill")).map(
      (e) => e.textContent ?? "",
    );
    expect(pills.some((t) => t.startsWith("Kick-off"))).toBe(true);
    expect(pills.some((t) => t.startsWith("Half-time") && t.includes("1") && t.includes("0"))).toBe(
      true,
    );
    expect(pills.some((t) => t.startsWith("Full-time") && t.includes("2") && t.includes("1"))).toBe(
      true,
    );
    // …and the list is latest-first: Full-time precedes Kick-off in the DOM.
    expect(pills.findIndex((t) => t.startsWith("Full-time"))).toBeLessThan(
      pills.findIndex((t) => t.startsWith("Kick-off")),
    );
  });

  it("renders a brace, an own goal (OG, beneficiary side), a substitution, and a card", () => {
    render(<GameDetailClient view={viewRich()} />);
    // Scorers row: the brace collapses to one row carrying both minutes; the OG sits on the beneficiary (home) side.
    const homeScorers = within(document.querySelector(".gd-scorers.is-home") as HTMLElement);
    const sakaRow = homeScorers.getByText("Saka").closest(".gd-scorer") as HTMLElement;
    expect(sakaRow.textContent).toContain("11'");
    expect(sakaRow.textContent).toContain("33'");
    const ogRow = homeScorers.getByText("Hernandez").closest(".gd-scorer") as HTMLElement;
    expect(ogRow.textContent).toContain("(OG)");
    // Away side has no scorers (the OG credited home).
    expect((document.querySelector(".gd-scorers.is-away") as HTMLElement).textContent).toBe("");

    // Events tab: the substitution (▲ on / ▼ off), the yellow card, and the timeline OG tag render.
    fireEvent.click(screen.getByRole("tab", { name: "Events" }));
    const tl = within(document.querySelector(".gd-timeline") as HTMLElement);
    expect(tl.getByText("Sub On")).toBeTruthy(); // subbed-on full name
    expect(tl.getByText("Sub Off")).toBeTruthy(); // subbed-off full name
    expect(document.querySelector(".gd-timeline .gd-ev-ic.is-yel")).not.toBeNull(); // yellow card icon
    expect(tl.getAllByText("OG").length).toBeGreaterThan(0); // own-goal tag on the timeline goal
  });
});
