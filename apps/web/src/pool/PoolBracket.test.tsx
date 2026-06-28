// @vitest-environment jsdom
/**
 * RTL/jsdom proof for the /pool knockout Picks tab (vertical round-sequential layout + TBD/non-pickable
 * undecided matches + group phase hidden in playoff). Renders the REAL client shell (PoolClient →
 * components) against a playoff-phase view shaped exactly as the gated loader produces it once
 * playoff_entry exists (matchdays/completed/unscheduled already emptied by selectPoolPicksView). Three
 * task-mandated assertions:
 *   - scope 1: rounds render as STACKED vertical sections, top-to-bottom R32 → R16 → QF → SF → Final.
 *   - scope 2: a resolved R32 match is pickable (HOME/AWAY buttons); a `Team {id}` placeholder match is
 *     TBD with NO pick buttons (and the raw placeholder name never reaches the DOM).
 *   - scope 3: NO group matchday / Completed / unscheduled sections render in playoff.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import type { PoolFixture, PoolView } from "./types";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { PoolClient } from "./PoolClient";

afterEach(cleanup);

const NOW = "2026-06-28T12:00:00.000Z";
const FUTURE = "2026-07-04T17:00:00.000Z"; // after NOW → not locked, controls enabled

function fx(over: Partial<PoolFixture> & { matchId: string }): PoolFixture {
  return {
    matchId: over.matchId,
    home: over.home ?? null,
    away: over.away ?? null,
    kickoffAt: over.kickoffAt ?? FUTURE,
    status: over.status ?? "scheduled",
    periodKind: over.periodKind ?? "knockout_round",
    periodLabel: over.periodLabel ?? null,
    result: over.result ?? null,
    homeScore: over.homeScore ?? null,
    awayScore: over.awayScore ?? null,
    myPick: over.myPick ?? null,
    others: over.others ?? [],
  };
}

/**
 * A playoff-phase view: the loader has already emptied matchdays/completed/unscheduled (scope 3). R32 has
 * a resolved real fixture (pickable); R16 + Final carry `Team {id}` placeholder fixtures (TBD); QF/SF are
 * fixture-less (honest empty rounds).
 */
function playoffView(): PoolView {
  return {
    managerId: "me",
    phase: "playoff",
    playoffActive: true,
    picks: {
      // group data is PRESENT in view.picks (the pure selector keeps it for the leaderboard drill-in) —
      // the Picks tab must hide it at the render layer when playoffActive.
      matchdays: [
        {
          label: "MD3",
          fixtures: [
            fx({
              matchId: "g",
              periodKind: "group_md",
              periodLabel: "MD3",
              home: { name: "Spain", code: "ES" },
              away: { name: "Italy", code: "IT" },
            }),
          ],
        },
      ],
      bracket: [
        {
          label: "R32",
          fixtures: [
            fx({
              matchId: "r32",
              periodLabel: "R32",
              home: { name: "Brazil", code: "BR" },
              away: { name: "Japan", code: "JP" },
            }),
          ],
        },
        {
          label: "R16",
          fixtures: [
            fx({
              matchId: "r16",
              periodLabel: "R16",
              home: { name: "Team 273", code: null },
              away: { name: "Team 274", code: null },
            }),
          ],
        },
        { label: "QF", fixtures: [] },
        { label: "SF", fixtures: [] },
        {
          label: "Final",
          fixtures: [
            fx({
              matchId: "fin",
              periodLabel: "Final",
              home: { name: "Team 303", code: null },
              away: { name: "Team 304", code: null },
            }),
          ],
        },
      ],
      unscheduled: [],
      completed: [
        fx({
          matchId: "c",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          home: { name: "Spain", code: "ES" },
          away: { name: "Italy", code: "IT" },
        }),
      ],
    },
    leaderboard: [],
    nowIso: NOW,
  };
}

describe("/pool knockout — vertical round-sequential layout (scope 1)", () => {
  it("renders the rounds as STACKED vertical sections, top-to-bottom R32 → R16 → QF → SF → Final", () => {
    const { container } = render(<PoolClient view={playoffView()} />);
    const titles = [...container.querySelectorAll(".pl-round")].map(
      (s) => s.querySelector(".t-label")?.textContent,
    );
    expect(titles).toEqual([
      "Round of 32",
      "Round of 16",
      "Quarter-finals",
      "Semi-finals",
      "Final",
    ]);
  });

  it("drops the old horizontal bracket column scroller (.pl-bracket / .pl-bcol)", () => {
    const { container } = render(<PoolClient view={playoffView()} />);
    expect(container.querySelector(".pl-bracket")).toBeNull();
    expect(container.querySelector(".pl-bcol")).toBeNull();
  });
});

describe("/pool knockout — TBD / non-pickable undecided matches (scope 2)", () => {
  it("a resolved R32 match is pickable — renders HOME/AWAY pick buttons by team name", () => {
    const { container } = render(<PoolClient view={playoffView()} />);
    const r32 = container.querySelectorAll(".pl-round")[0]!;
    const labels = [...r32.querySelectorAll(".pl-pickbtn")].map((b) => b.textContent);
    expect(labels).toEqual(["Brazil", "Japan"]);
  });

  it("a placeholder knockout match is TBD — NO pick buttons, placeholder name never in the DOM", () => {
    const { container } = render(<PoolClient view={playoffView()} />);
    const r16 = container.querySelectorAll(".pl-round")[1]! as HTMLElement;
    expect(r16.querySelectorAll(".pl-pickbtn")).toHaveLength(0);
    expect(within(r16).getByText("Teams to be decided")).toBeTruthy();
    expect(within(r16).queryAllByText("TBD").length).toBeGreaterThan(0);
    // the raw `Team {id}` placeholder name must never reach the rendered DOM
    expect(r16.textContent).not.toMatch(/Team 27[34]/);
  });

  it("an empty future round (QF) renders an honest 'To be decided' card, no buttons", () => {
    const { container } = render(<PoolClient view={playoffView()} />);
    const qf = container.querySelectorAll(".pl-round")[2]!;
    expect(qf.querySelectorAll(".pl-pickbtn")).toHaveLength(0);
    expect(qf.querySelector(".pl-tbd-card")).not.toBeNull();
  });
});

describe("/pool knockout — group phase hidden in playoff (scope 3)", () => {
  it("renders NO group matchday / Completed / unscheduled sections even though that data exists in view.picks", () => {
    const { container } = render(<PoolClient view={playoffView()} />);
    // group matchdays, the unscheduled section, and the Completed <details> ALL use the `.pl-md` class.
    expect(container.querySelectorAll(".pl-md")).toHaveLength(0);
    // the group data is KEPT in view.picks (for the leaderboard drill-in) but must not render on the Picks tab
    expect(container.textContent).not.toMatch(/Spain|Italy/);
    expect(container.querySelectorAll(".pl-round").length).toBeGreaterThan(0);
  });
});
