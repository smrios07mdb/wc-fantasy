// @vitest-environment jsdom
/**
 * Rider E (T15-CUT) — the group-phase regression guard, DOM half: with NO `ko` sibling on the
 * snapshot, the REAL <VsFieldClient> mounts ZERO knockout DOM — no KO* component output, no
 * knockout.css class anywhere in the tree, the group screen title — i.e. group-phase /vsfield is
 * render-equivalent to today. The pure half (loadVsField composes no `ko` pre-transition) is pinned
 * by knockout.test.ts + the theCutSkin.test.ts loader-gate pins.
 *
 * A knockout-mode mount runs as the positive control so the zero-ko assertion can never pass
 * vacuously (if the ko branches broke entirely, the control would fail first).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { VsFieldViewWithBenches } from "@/src/vsfield/benches";
import type { KnockoutContext } from "@/src/vsfield/knockout";
import { VsFieldClient } from "./VsFieldClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/vsfield",
  useSearchParams: () => new URLSearchParams(),
}));
// The live controller only spins up inside the onAuthStateChange callback; never invoking it keeps
// the mount socket-free (the controller itself is unit-tested in liveController.test.ts).
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

afterEach(cleanup);

function entry(
  managerId: string,
  displayName: string,
  rank: number,
  points: number,
  isMe = false,
): VsFieldViewWithBenches["field"][number] {
  return {
    managerId,
    displayName,
    isMe,
    rank,
    points,
    record: { w: 1, l: 1, d: 0 },
    starters: [],
    counts: { yetToPlay: 3, playing: 0, played: 8, noMatch: 0 },
    h2hVsViewer: isMe ? null : { result: "win", points: 10, opponentPoints: 5, margin: 5 },
  };
}

function groupView(): VsFieldViewWithBenches {
  return {
    asOf: "2026-06-15T12:00:00.000Z",
    leagueId: "lg1",
    viewerManagerId: "m1",
    currentPeriod: { id: "md2", label: "MD2" },
    field: [entry("m1", "You Manager", 1, 50, true), entry("m2", "Rival", 2, 40)],
    season: [],
    matches: [],
    benches: [],
    selectablePeriods: [{ id: "md2", label: "MD2", isLive: true, isDone: false }],
    isLivePeriod: true,
    // NO `ko` — the group-phase snapshot (the loader never composes one pre-transition).
  };
}

function koContext(): KnockoutContext {
  return {
    roundLabel: "R32",
    roundName: "Round of 32",
    roundIdx: 0,
    totalRounds: 3,
    cutCount: 1,
    aliveCount: 2,
    advanceCount: 1,
    pend: false,
    complete: false,
    champion: null,
    ladder: [
      { managerId: "m1", displayName: "You Manager", isMe: true, points: 50, rank: 1 },
      { managerId: "m2", displayName: "Rival", isMe: false, points: 40, rank: 2 },
    ],
    cutIndex: 1,
    zoneIds: ["m2"],
    viewer: {
      state: "safe",
      rank: 1,
      of: 2,
      points: 50,
      margin: 10,
      marginLevel: false,
      stillToCome: 3,
      outRoundLabel: null,
      placement: null,
    },
    fallen: [],
    settled: null,
    roundStatuses: ["live", "future", "future"],
  };
}

describe("VsFieldClient — group phase renders ZERO knockout DOM (rider E)", () => {
  it("mounts no ko-/koc- class, no machete, and keeps the group title", () => {
    const { container } = render(<VsFieldClient initialView={groupView()} />);
    expect(container.querySelectorAll('[class*="ko-"], [class*="koc"]').length).toBe(0);
    expect(container.querySelector("svg.ko-mach")).toBeNull();
    expect(container.textContent).not.toContain("The Cut");
    expect(container.textContent).toContain("The Field");
    expect(container.textContent).not.toContain("GUILLOTINE");
    // The group tree itself is intact (the leaderboard-first mobile home + the standings label).
    expect(container.textContent).toContain("Standings · tap to compare");
  });
});

describe("VsFieldClient — knockout mode mounts the ko surface (positive control)", () => {
  it("renders the marquee + YOU band + ladder + title swap when `ko` is present", () => {
    const view = { ...groupView(), currentPeriod: { id: "r32", label: "R32" }, ko: koContext() };
    const { container } = render(<VsFieldClient initialView={view} />);
    expect(container.querySelector(".ko-marq")).not.toBeNull();
    expect(container.querySelector(".ko-you.is-safe")).not.toBeNull();
    expect(container.textContent).toContain("The Cut");
    expect(container.textContent).toContain("ROUND OF 32 · GUILLOTINE");
    expect(container.textContent).toContain("LOWEST 1 GET THE CHOP");
    // The aggregate "You vs the whole field" button is hidden in knockout (the YOU band owns it).
    expect(container.textContent).not.toContain("You vs the whole field");
  });
});
