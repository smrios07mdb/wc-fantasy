// @vitest-environment jsdom
/**
 * The first-open cut-ceremony latch, proven end-to-end by mounting the REAL clients
 * (feat/cut-ceremony-first-open). Unlike the Playwright render proof (which proves the ceremony
 * PAINTS/animates in a real browser), this proves the LATCH LOGIC — the mount effect wiring, the
 * localStorage round-trip, and the SHARED key across both surfaces — against the real
 * `seenCeremony.ts` module (no drift). Complements `seenCeremony.test.ts` (the pure decision).
 *
 * Both `/vsfield` "The Cut" (KOCeremony takeover) and `/playoffs` "Theater" (blade choreography) are
 * exercised, plus the cross-surface no-replay: a fire on The Cut writes the SAME key the Theater reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { buildPlayoffsView } from "@app/recompute";
import type { VsFieldViewWithBenches } from "@/src/vsfield/benches";
import type { KnockoutContext } from "@/src/vsfield/knockout";
import { VsFieldClient } from "@/app/vsfield/VsFieldClient";
import { PlayoffsClient } from "@/app/playoffs/PlayoffsClient";
import type { PlayoffsView } from "@/app/playoffs/loadPlayoffs";
import { seenCutKey } from "@/src/playoffs/seenCeremony";

// next/navigation + the Supabase client are mocked so neither client opens a socket (the live
// controller only spins up inside the onAuthStateChange callback, which our stub never invokes).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/vsfield",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  }),
}));

// ── a fully-controllable in-memory localStorage + matchMedia (jsdom omits matchMedia) ──
const realLS = Object.getOwnPropertyDescriptor(window, "localStorage");
function installMemStorage(): Map<string, string> {
  const map = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    },
  });
  return map;
}
function mockMatchMedia(reduceMotion: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: /prefers-reduced-motion/.test(query) ? reduceMotion : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

let store: Map<string, string>;
beforeEach(() => {
  store = installMemStorage();
  mockMatchMedia(false);
  vi.useFakeTimers(); // freeze the blade/ceremony timers so mount state is deterministic
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  if (realLS) Object.defineProperty(window, "localStorage", realLS);
  vi.restoreAllMocks();
});

/* ─────────────────────────── /vsfield "The Cut" fixtures ─────────────────────────── */

function koAfterR32Cut(): KnockoutContext {
  // R32 cut has landed (past), R16 is live — i.e. the aftermath a late-opener would see.
  return {
    roundLabel: "R16",
    roundName: "Round of 16",
    roundIdx: 1,
    totalRounds: 2,
    cutCount: 1,
    aliveCount: 3,
    advanceCount: 2,
    pend: false,
    complete: false,
    champion: null,
    ladder: [
      { managerId: "m1", displayName: "You", isMe: true, points: 60, rank: 1 },
      { managerId: "m2", displayName: "Rival", isMe: false, points: 50, rank: 2 },
      { managerId: "m3", displayName: "Third", isMe: false, points: 40, rank: 3 },
    ],
    cutIndex: 2,
    zoneIds: ["m3"],
    viewer: {
      state: "safe",
      rank: 1,
      of: 3,
      points: 60,
      margin: 10,
      marginLevel: false,
      stillToCome: 2,
      outRoundLabel: null,
      placement: null,
    },
    fallen: [
      {
        managerId: "m4",
        displayName: "Cesar",
        isMe: false,
        roundLabel: "R32",
        roundIdx: 0,
        points: 57,
      },
    ],
    settled: {
      roundLabel: "R32",
      cutCount: 1,
      aliveAfter: 3,
      victims: [{ managerId: "m4", displayName: "Cesar", isMe: false, points: 57 }],
      viewerOutcome: "survived",
      viewerRank: 1,
      viewerOf: 4,
      viewerMargin: 3,
    },
    roundStatuses: ["past", "live"],
  };
}

function cutView(): VsFieldViewWithBenches {
  return {
    asOf: "2026-06-20T12:00:00.000Z",
    leagueId: "lg1",
    viewerManagerId: "m1",
    currentPeriod: { id: "r16", label: "R16" },
    field: [
      {
        managerId: "m1",
        displayName: "You",
        isMe: true,
        rank: 1,
        points: 60,
        record: { w: 1, l: 0, d: 0 },
        starters: [],
        counts: { yetToPlay: 2, playing: 0, played: 6, noMatch: 0 },
        h2hVsViewer: null,
      },
    ],
    season: [],
    matches: [],
    benches: [],
    selectablePeriods: [{ id: "r16", label: "R16", isLive: true, isDone: false }],
    isLivePeriod: true,
    ko: koAfterR32Cut(),
  };
}

/* ─────────────────────────── /playoffs "Theater" fixture ─────────────────────────── */

function theaterViewAfterR32Cut(): PlayoffsView {
  const core = buildPlayoffsView({
    viewerManagerId: "m1",
    rounds: [
      { label: "R32", cutCount: 1 },
      { label: "R16", cutCount: 1 },
    ],
    entries: [
      { managerId: "m1", seed: 1, status: "alive", eliminatedRound: null },
      { managerId: "m2", seed: 2, status: "alive", eliminatedRound: null },
      { managerId: "m3", seed: 3, status: "alive", eliminatedRound: null },
      { managerId: "m4", seed: 4, status: "eliminated", eliminatedRound: "R32" },
    ],
    roundScores: {
      R32: { m1: 60, m2: 50, m3: 40, m4: 30 },
      R16: { m1: 20, m2: 18, m3: 16 },
    },
    cumulativeTotals: new Map([
      ["m1", 80],
      ["m2", 68],
      ["m3", 56],
      ["m4", 30],
    ]),
    groupPeriods: [],
  });
  return {
    ...core,
    managerId: "m1",
    reducedLineup: null,
    reinforcement: null,
    managerNames: { m1: "You", m2: "Rival", m3: "Third", m4: "Cesar" },
  };
}

/* ───────────────────────────────── The Cut (vsfield) ───────────────────────────────── */

describe("VsFieldClient — first-open cut ceremony", () => {
  it("FIRST open after a cut FIRES the takeover and writes the seen key", () => {
    const { container } = render(<VsFieldClient initialView={cutView()} />);
    expect(container.querySelector(".koc")).not.toBeNull();
    expect(store.get(seenCutKey("lg1", "R32"))).toBe("1");
  });

  it("SECOND open (key already present) renders the settled aftermath, NO takeover", () => {
    store.set(seenCutKey("lg1", "R32"), "1");
    const { container } = render(<VsFieldClient initialView={cutView()} />);
    expect(container.querySelector(".koc")).toBeNull();
    // The ladder (settled aftermath) still renders — the screen is not blank.
    expect(container.querySelector(".ko-marq")).not.toBeNull();
  });

  it("reduced-motion still FIRES (static aftermath) and still records", () => {
    mockMatchMedia(true);
    const { container } = render(<VsFieldClient initialView={cutView()} />);
    const koc = container.querySelector(".koc");
    expect(koc).not.toBeNull();
    // KOCeremony jumps straight to the static aftermath under reduced motion (no armed→drop swing).
    expect(koc?.className).toContain("is-aftermath");
    expect(store.get(seenCutKey("lg1", "R32"))).toBe("1");
  });
});

/* ───────────────────────────────── Theater (playoffs) ───────────────────────────────── */

function hasWind(container: HTMLElement): boolean {
  return container.querySelectorAll(".po-hero.is-wind, .mpo-hero.is-wind").length > 0;
}

describe("PlayoffsClient — first-open blade choreography", () => {
  it("FIRST open after a cut FIRES the blade (is-wind) and writes the seen key", () => {
    const { container } = render(
      <PlayoffsClient initialView={theaterViewAfterR32Cut()} leagueId="lg1" />,
    );
    expect(hasWind(container)).toBe(true);
    expect(store.get(seenCutKey("lg1", "R32"))).toBe("1");
  });

  it("SECOND open (key present) does NOT swing — settled hero, no is-wind", () => {
    store.set(seenCutKey("lg1", "R32"), "1");
    const { container } = render(
      <PlayoffsClient initialView={theaterViewAfterR32Cut()} leagueId="lg1" />,
    );
    expect(hasWind(container)).toBe(false);
  });

  it("reduced-motion does NOT swing but STILL records", () => {
    mockMatchMedia(true);
    const { container } = render(
      <PlayoffsClient initialView={theaterViewAfterR32Cut()} leagueId="lg1" />,
    );
    expect(hasWind(container)).toBe(false);
    expect(store.get(seenCutKey("lg1", "R32"))).toBe("1");
  });
});

/* ─────────────────────────── cross-surface: ONE key, no replay ─────────────────────────── */

describe("cross-surface — a fire on The Cut suppresses the Theater replay (shared key)", () => {
  it("The Cut records xi:seenCut:lg1:R32 → Theater then opens with NO swing", () => {
    const cut = render(<VsFieldClient initialView={cutView()} />);
    expect(cut.container.querySelector(".koc")).not.toBeNull();
    expect(store.get(seenCutKey("lg1", "R32"))).toBe("1");
    cleanup(); // leave The Cut; the seen-set persists on the (per-device) store

    const theater = render(
      <PlayoffsClient initialView={theaterViewAfterR32Cut()} leagueId="lg1" />,
    );
    expect(hasWind(theater.container)).toBe(false); // no replay — the key is shared
  });
});
