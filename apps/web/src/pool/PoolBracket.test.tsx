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
 *   - scope 3: NO group matchday / unscheduled sections render in playoff — but the Completed archive
 *     drawer DOES (it now spans group + knockout, so an archived R32 shows there, not in the R32 round).
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
      // The Completed archive now spans BOTH phases (group + knockout). The selector has already moved a
      // long-finished group match AND an archived R32 knockout match here; the Picks tab shows this drawer
      // in playoff. Names are distinct from the hidden MD3 matchday (Spain/Italy) and the live R32
      // (Brazil/Japan) so the render placement is unambiguous.
      completed: [
        fx({
          matchId: "cg",
          periodKind: "group_md",
          periodLabel: "MD1",
          status: "completed",
          home: { name: "Chile", code: "CL" },
          away: { name: "Uruguay", code: "UY" },
        }),
        fx({
          matchId: "cr32",
          periodKind: "knockout_round",
          periodLabel: "R32",
          status: "completed",
          home: { name: "Ghana", code: "GH" },
          away: { name: "Egypt", code: "EG" },
        }),
      ],
    },
    leaderboard: [],
    nowIso: NOW,
    timezone: "UTC",
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

describe("/pool knockout — group hidden but Completed archive shown in playoff (scope 3)", () => {
  it("hides the group matchday + unscheduled sections yet SHOWS the Completed archive drawer in playoff", () => {
    const { container } = render(<PoolClient view={playoffView()} />);
    // The Completed drawer (`.pl-md .pl-completed`) is now rendered in playoff, exactly as in group phase.
    const completed = container.querySelector(".pl-completed");
    expect(completed).not.toBeNull();
    // The ONLY `.pl-md` left is that Completed <details> — the group matchday (MD3) + unscheduled lists
    // (which also use `.pl-md`) stay hidden in playoff.
    const mds = [...container.querySelectorAll(".pl-md")];
    expect(mds).toHaveLength(1);
    expect(mds[0]!.classList.contains("pl-completed")).toBe(true);
    // The hidden MD3 matchday's teams (Spain/Italy) must not reach the DOM…
    expect(container.textContent).not.toMatch(/Spain|Italy/);
    // …while the live bracket rounds still render.
    expect(container.querySelectorAll(".pl-round").length).toBeGreaterThan(0);
  });

  it("renders an archived R32 match inside the Completed drawer, NOT in the R32 round section", () => {
    const { container } = render(<PoolClient view={playoffView()} />);
    const completed = container.querySelector(".pl-completed") as HTMLElement;
    // The archived R32 (Ghana/Egypt) appears in the Completed drawer (name in both TeamLabel + pick button).
    expect(within(completed).getAllByText("Ghana").length).toBeGreaterThan(0);
    expect(within(completed).getAllByText("Egypt").length).toBeGreaterThan(0);
    // …and the still-live R32 round section shows Brazil/Japan, never the archived Ghana/Egypt.
    const r32 = container.querySelectorAll(".pl-round")[0] as HTMLElement;
    expect(within(r32).getAllByText("Brazil").length).toBeGreaterThan(0);
    expect(r32.textContent).not.toMatch(/Ghana|Egypt/);
  });

  it("keeps a still-visible R16 round rendering alongside the Completed drawer (archiving R32 didn't collapse it)", () => {
    const { container } = render(<PoolClient view={playoffView()} />);
    const r16 = container.querySelectorAll(".pl-round")[1] as HTMLElement;
    expect(within(r16).getByText("Round of 16")).toBeTruthy();
    expect(within(r16).getByText("Teams to be decided")).toBeTruthy();
  });
});
