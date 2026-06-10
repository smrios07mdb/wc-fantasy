import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the /pool pick'em UI (Prompt 42). The repo's Vitest run has no
// DOM/JSX transform (by design — mirrors the lineup/draft/landing smokes), so the behaviours of the
// IO-bound files (the Prisma loader + the "use client" shell) are guarded from SOURCE; their shapes are
// covered by `tsc --noEmit` + `next build`, and the load-bearing pure logic is unit-tested at the right
// altitude in poolView.test.ts + @app/pool. Here we pin the contracts that aren't otherwise observable:
// the reveal SOURCE (own-always / others-post-kickoff), the lock disable, and the route 409 surfacing.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const loader = read("loadPool.ts");
const client = read("PoolClient.tsx");
const components = read("components.tsx");

describe("pool loader — reveal is server-enforced via the anti-copying read", () => {
  it("sources the picks-view reveal from store.readVisiblePicks (own always + others post-kickoff)", () => {
    expect(loader).toContain("store.readVisiblePicks");
  });

  it("uses the visible (reveal-gated) picks — NOT the full leaderboard read — for per-fixture myPick/others", () => {
    // The viewer's own pick + others' revealed picks are mapped from `visiblePicks`, never `allPick*`.
    expect(loader).toContain("for (const p of visiblePicks)");
    expect(loader).toMatch(/myPickByMatch|othersByMatch/);
    // The all-league read feeds ONLY the (aggregate-only, completed-match) leaderboard.
    expect(loader).toMatch(/buildPoolLeaderboardView\(\s*allPicks/);
  });

  it("derives the group↔knockout split + results from period.kind, never fifa_match.round", () => {
    expect(loader).toContain("m.period?.kind");
    // `round` is read ONLY to feed selectTournamentPhase (its documented tournament-phase contract).
    expect(loader).toContain("selectTournamentPhase(");
    expect(loader).not.toMatch(/periodKind:\s*m\.round/);
  });
});

describe("pool client — lock disable + reveal render + route 409 surfacing", () => {
  it("computes the per-fixture lock live from the clock via isFixtureLocked", () => {
    expect(client).toContain("isFixtureLocked(fixture, now)");
    expect(client).toContain("locked={isFixtureLocked(fixture, now)}");
  });

  it("posts picks to the existing gated route and refetches on success (no optimistic-only state)", () => {
    expect(client).toContain('"/api/pool/pick"');
    expect(client).toContain('method: "POST"');
    expect(client).toContain("router.refresh()");
  });

  it("surfaces the route's 409 codes (lock + knockout-DRAW) as inline messages", () => {
    expect(client).toContain('"pick-locked"');
    expect(client).toContain('"draw-not-allowed-knockout"');
  });

  it("renders the viewer's own pick always + others' revealed picks from what the loader returned", () => {
    // Own pick highlight is driven by fixture.myPick; others come from fixture.others (server-gated).
    expect(components).toContain("fixture.myPick === b.value");
    expect(components).toContain("fixture.others");
  });

  it("disables the pick buttons when locked (the lock-on-play affordance)", () => {
    expect(components).toContain("disabled={locked || busy}");
  });
});
