// @vitest-environment jsdom
/**
 * RTL/jsdom proof for the leaderboard → manager-picks drill-in (T4), exercised through the REAL click
 * path (PoolClient → LeaderboardTable → ManagerPicksModal). The headline, task-mandated assertion:
 *
 *   Clicking another manager NEVER reveals a not-yet-kicked-off pick.
 *
 * The view handed to the client is built exactly as the gated loader builds it — a future match carries
 * `others: []` (the server's anti-copying read withheld the rival's pick), a kicked-off match carries the
 * rival's revealed pick in `others`. We click the rival on the leaderboard and assert their FUTURE-match
 * pick (Spain/Brazil) is absent from the modal while their kicked-off pick (France) is present. The modal
 * derives entirely from the props already in hand — opening it issues NO fetch / new read path. The
 * contrast case (clicking "You") confirms the viewer DOES see their own pre-kickoff pick, as the gate allows.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { PoolPrediction } from "@app/shared";
import type { PoolFixture, PoolLeaderRow, PoolOtherPick, PoolView } from "./types";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { PoolClient } from "./PoolClient";

afterEach(cleanup);

const FUTURE = "2026-07-01T18:00:00.000Z"; // well after the seeded `now`
const PAST = "2026-06-10T18:00:00.000Z"; // before the seeded `now`
const NOW = "2026-06-20T18:00:00.000Z";

function fx(over: Partial<PoolFixture> & { matchId: string }): PoolFixture {
  return {
    matchId: over.matchId,
    home: over.home ?? null,
    away: over.away ?? null,
    kickoffAt: over.kickoffAt ?? NOW,
    status: over.status ?? "scheduled",
    periodKind: over.periodKind ?? "group_md",
    periodLabel: over.periodLabel ?? "MD1",
    result: over.result ?? null,
    homeScore: over.homeScore ?? null,
    awayScore: over.awayScore ?? null,
    myPick: over.myPick ?? null,
    others: over.others ?? [],
  };
}
const other = (id: string, name: string, p: PoolPrediction): PoolOtherPick => ({
  managerId: id,
  managerName: name,
  prediction: p,
});
const leader = (over: Partial<PoolLeaderRow> & { managerId: string }): PoolLeaderRow => ({
  managerId: over.managerId,
  managerName: over.managerName ?? over.managerId,
  isMe: over.isMe ?? false,
  played: over.played ?? 0,
  correct: over.correct ?? 0,
  points: over.points ?? 0,
});

// A view shaped exactly as the gated loader would produce it:
//   • SECRET future match (Spain v Brazil): rival's pick is withheld → others: []. My own pick is HOME.
//   • REVEALED past match (France v Germany): two others revealed (rival → France, zoe → Germany);
//     my own pick is AWAY. The two revealed others let the click path prove per-manager filtering.
function poolView(): PoolView {
  return {
    managerId: "me",
    phase: "group",
    playoffActive: false,
    picks: {
      matchdays: [
        {
          label: "MD1",
          fixtures: [
            fx({
              matchId: "secret",
              home: { name: "Spain", code: "ES" },
              away: { name: "Brazil", code: "BR" },
              kickoffAt: FUTURE,
              status: "scheduled",
              myPick: "HOME", // mine (Spain) — always revealed to me, never to the rival
              others: [], // rival's pre-kickoff pick is NOT here (the server gate withheld it)
            }),
            fx({
              matchId: "revealed",
              home: { name: "France", code: "FR" },
              away: { name: "Germany", code: "DE" },
              kickoffAt: PAST,
              status: "completed",
              result: "HOME",
              homeScore: 2,
              awayScore: 0,
              myPick: "AWAY", // mine (Germany)
              // Two managers' revealed picks on the SAME match: rival → France (HOME), zoe → Germany (AWAY).
              others: [other("rival", "Rival", "HOME"), other("zoe", "Zoe", "AWAY")],
            }),
          ],
        },
      ],
      bracket: [],
      unscheduled: [],
      completed: [],
    },
    leaderboard: [
      leader({ managerId: "me", managerName: "Me", isMe: true, played: 1, correct: 0, points: 0 }),
      leader({ managerId: "rival", managerName: "Rival", played: 1, correct: 1, points: 1 }),
      leader({ managerId: "zoe", managerName: "Zoe", played: 1, correct: 0, points: 0 }),
    ],
    nowIso: NOW,
    timezone: "UTC",
  };
}

const goToLeaderboard = () => fireEvent.click(screen.getByRole("tab", { name: "Leaderboard" }));
const openManager = (text: string) => fireEvent.click(screen.getByText(text)); // bubbles to the row button

describe("leaderboard → manager picks drill-in (T4)", () => {
  it("on the leaderboard tab, no team/pick text is in the DOM until a manager is opened", () => {
    render(<PoolClient view={poolView()} />);
    goToLeaderboard();
    // The Picks tab is unmounted, so the ONLY path for any fixture text into the DOM is the modal.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryAllByText(/France|Spain|Brazil|Germany/)).toHaveLength(0);
  });

  it("clicking a rival reveals ONLY their kicked-off pick — never their not-yet-kicked-off pick", () => {
    render(<PoolClient view={poolView()} />);
    goToLeaderboard();
    openManager("Rival");

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Rival’s picks")).toBeTruthy();

    // REVEALED (kicked-off) match present — France shows as the matchup side and as the picked team.
    expect(within(dialog).queryAllByText(/France/).length).toBeGreaterThan(0);

    // SECRET (not-yet-kicked-off) match absent — neither as text nor via a flag's accessible name.
    expect(within(dialog).queryAllByText(/Spain|Brazil/)).toHaveLength(0);
    expect(within(dialog).queryByRole("img", { name: /Spain|Brazil/i })).toBeNull();

    // EXACTLY ONE row, and it is the RIVAL's pick (France) — NOT Zoe's pick (Germany) on the same match.
    // This proves both "only the kicked-off pick" and per-manager filtering across a multi-other fixture.
    expect(dialog.querySelectorAll(".pl-mp-row")).toHaveLength(1);
    expect(within(dialog).getByText("France", { selector: "b" })).toBeTruthy();
    expect(within(dialog).queryByText("Germany", { selector: "b" })).toBeNull();
    expect(within(dialog).getByText("Correct")).toBeTruthy();
  });

  it("clicking yourself DOES surface your own pre-kickoff pick (own picks are always revealable)", () => {
    render(<PoolClient view={poolView()} />);
    goToLeaderboard();
    openManager("You");

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Your picks")).toBeTruthy();
    // My own future (pre-kickoff) Spain pick IS shown to me, alongside the past Germany pick.
    expect(within(dialog).queryAllByText(/Spain/).length).toBeGreaterThan(0);
    expect(within(dialog).queryAllByText(/Germany/).length).toBeGreaterThan(0);
  });

  it("closes on the close button and on Escape", () => {
    render(<PoolClient view={poolView()} />);
    goToLeaderboard();

    openManager("Rival");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    openManager("Rival");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
