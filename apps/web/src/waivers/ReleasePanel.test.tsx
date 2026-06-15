// @vitest-environment jsdom
/**
 * RTL/jsdom proof for the playoff trim-down release UI (DECISIONS §D). Two layers:
 *   1. ReleasePanel mounted directly — over-cap shows the panel, dropping below the 7-floor disables
 *      release, an unfillable 7–9 selection requires the confirm checkbox, a fillable trim is enabled.
 *   2. WaiversClient mount condition — the panel renders ONLY in the playoff phase, for a participant,
 *      while over cap; group-phase renders nothing, and a non-participant sees the closed banner instead.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Position } from "@app/shared";
import { ReleasePanel } from "./ReleasePanel";
import type { WvPlayer, WaiversView } from "./types";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { WaiversClient } from "./WaiversClient";

afterEach(cleanup);

function player(id: string, position: Position): WvPlayer {
  return {
    id,
    name: id,
    shortName: id,
    position,
    nation: "Brazil",
    teamName: "Team",
    kickoffAt: null,
    seasonPoints: 1,
  };
}

/** Build a roster of (position → count) with ids like "DEF1". */
function roster(spec: Partial<Record<Position, number>>): WvPlayer[] {
  const out: WvPlayer[] = [];
  for (const [pos, n] of Object.entries(spec) as [Position, number][]) {
    for (let i = 1; i <= n; i++) out.push(player(`${pos}${i}`, pos));
  }
  return out;
}

const clickRow = (name: string) => fireEvent.click(screen.getByText(name).closest("button")!);
const releaseBtn = () => screen.getByRole("button", { name: /Release/ }) as HTMLButtonElement;

describe("ReleasePanel (mounted)", () => {
  const panel = (over: Partial<Parameters<typeof ReleasePanel>[0]> = {}) =>
    render(
      <ReleasePanel
        roster={over.roster ?? roster({ GK: 1, DEF: 3, MID: 3, FWD: 3 })} // 10
        lockedPlayerIds={over.lockedPlayerIds ?? []}
        rosterCap={over.rosterCap ?? 9}
        forfeitDeadlineIso={over.forfeitDeadlineIso ?? "2026-06-20T15:00:00.000Z"}
        batchWindow={over.batchWindow ?? null}
        timezone={over.timezone ?? "UTC"}
        submitting={over.submitting ?? false}
        errorMessage={over.errorMessage ?? null}
        onRelease={over.onRelease ?? vi.fn()}
      />,
    );

  it("over cap: shows the panel with the X/cap count", () => {
    panel();
    expect(screen.getByText("Trim your squad")).toBeTruthy();
    expect(screen.getByText("10/9")).toBeTruthy();
  });

  it("disables release while nothing is selected", () => {
    panel();
    expect(releaseBtn().disabled).toBe(true);
  });

  it("a fillable trim to the cap enables release and reports confirmedUnfillable=false", () => {
    const onRelease = vi.fn();
    panel({ onRelease });
    clickRow("FWD3"); // 10 → 9, balanced (1/3/3/2) → fillable
    expect(releaseBtn().disabled).toBe(false);
    fireEvent.click(releaseBtn());
    expect(onRelease).toHaveBeenCalledWith(["FWD3"], false);
  });

  it("hard-blocks (disabled) a selection that drops below the 7-player floor", () => {
    panel();
    for (const id of ["GK1", "DEF1", "DEF2", "DEF3"]) clickRow(id); // 10 → 6
    expect(screen.getByText(/below the 7-player minimum/i)).toBeTruthy();
    expect(releaseBtn().disabled).toBe(true);
  });

  it("an unfillable 7–9 selection requires the confirm checkbox", () => {
    const onRelease = vi.fn();
    panel({ roster: roster({ GK: 1, DEF: 1, MID: 5, FWD: 3 }), onRelease }); // 10
    clickRow("FWD3"); // → {GK1, DEF1, MID5, FWD2} = 9, DEF too thin → unfillable
    expect(releaseBtn().disabled).toBe(true);
    const box = screen.getByRole("checkbox");
    fireEvent.click(box);
    expect(releaseBtn().disabled).toBe(false);
    fireEvent.click(releaseBtn());
    expect(onRelease).toHaveBeenCalledWith(["FWD3"], true);
  });
});

describe("WaiversClient release-panel mount condition", () => {
  function view(over: Partial<WaiversView> = {}): WaiversView {
    return {
      managerId: "A",
      faabBudget: 100,
      roster: roster({ GK: 1, DEF: 3, MID: 3, FWD: 3 }), // 10
      lockedPlayerIds: [],
      freeAgents: [],
      claims: [],
      batches: [],
      waiverOrder: [],
      batchWindow: null,
      timezone: "UTC",
      isPlayoffPhase: true,
      rosterCap: 9,
      isParticipant: true,
      playoffForfeitDeadlineIso: "2026-06-20T15:00:00.000Z",
      nowIso: "2026-06-20T08:00:00.000Z",
      ...over,
    };
  }

  it("renders the panel for an over-cap playoff participant", () => {
    render(<WaiversClient view={view()} />);
    expect(screen.getByText("Trim your squad")).toBeTruthy();
  });

  it("renders nothing in the group phase", () => {
    render(<WaiversClient view={view({ isPlayoffPhase: false, rosterCap: 15 })} />);
    expect(screen.queryByText("Trim your squad")).toBeNull();
  });

  it("hides the panel + shows the closed banner for a non-participant", () => {
    render(<WaiversClient view={view({ isParticipant: false })} />);
    expect(screen.queryByText("Trim your squad")).toBeNull();
    expect(screen.getByText(/not in the playoff field/i)).toBeTruthy();
  });
});
