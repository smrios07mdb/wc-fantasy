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
const managerPicks = read("managerPicks.ts");

/**
 * Strip block + line comments so the NEGATIVE leak-guard greps target CODE, not the doc prose that names
 * the very things being excluded ("NO Realtime", "postgres_changes is Prompt-43-out", …). The line-comment
 * pattern keeps a leading non-`:` char so it never eats the `//` in a `http://`-style literal.
 */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

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

  it("links the teams-score area to the real-match detail (T6) as a SEPARATE tap target from the picks", () => {
    // A dedicated <a> on .pl-fx-view → /games/<matchId>; the HOME/DRAW/AWAY buttons stay their own controls.
    expect(components).toContain("pl-fx-view");
    expect(components).toContain("href={`/games/${fixture.matchId}`}");
  });
});

describe("pool client — P43 live updates (clock-reveal + leaderboard poll) with NO Realtime", () => {
  it("wires the clock-reveal timer from poolLive over ALL fixtures, refetching via the gated loader", () => {
    expect(client).toContain("startRevealClock");
    expect(client).toContain("flattenPickFixtures(view.picks)");
    // The reveal refetch IS the existing gated path — router.refresh() re-runs loadPool under the
    // server kickoff gate; the client never receives a raw pre-kickoff pick frame.
    expect(client).toMatch(/onReveal:\s*\(\)\s*=>\s*router\.refresh\(\)/);
  });

  it("runs the visibility-gated leaderboard poll ONLY while the Leaderboard tab is active", () => {
    expect(client).toContain("startLeaderboardPoll");
    expect(client).toContain("LEADERBOARD_POLL_MS");
    // The poll effect early-returns (so it's torn down) whenever the Picks tab is active.
    expect(client).toMatch(/tab !==\s*"leaderboard"/);
  });

  it("gates the poll on document visibility + refetches immediately on visibilitychange→visible", () => {
    expect(client).toContain("!document.hidden");
    expect(client).toContain('addEventListener("visibilitychange"');
    expect(client).toContain("handleLeaderboardVisible");
  });

  it("REVEAL-LEAK GUARD: others' picks come ONLY from the gated loader — no Realtime/subscription client", () => {
    // The P43 decision record: NO pool_pick subscription. Raw postgres_changes frames would bypass the
    // server's clock-gated anti-copying read and leak pre-kickoff predictions. Assert the CODE wires no
    // such client under ANY refetch path; every refetch is router.refresh() → loadPool.
    const code = codeOnly(client);
    expect(code).not.toMatch(/postgres_changes|\.channel\(|\.subscribe\(|@supabase|createClient/i);
    // Reveal source is unchanged from P42: server-revealed others' picks, rendered in components.tsx.
    expect(components).toContain("fixture.others");
  });
});

describe("pool — manager picks drill-in (T4) reuses the gated view, adds NO read path", () => {
  it("the projection is pure: no fetch, no Prisma, no /api — it derives from the already-gated view", () => {
    const code = codeOnly(managerPicks);
    expect(code).not.toMatch(/fetch\(|prisma|@app\/db|\/api\/|readVisiblePicks|postgres_changes/i);
  });

  it("the drill-in opens from the already-loaded view (selectManagerPicks), not a new request", () => {
    const code = codeOnly(client);
    // The modal is fed by re-projecting `view` — opening it triggers no network call of its own.
    expect(code).toContain("selectManagerPicks(view, openManagerId)");
    expect(code).toContain("ManagerPicksModal");
    // The ONLY fetch in the client remains the existing gated pick POST — the drill-in adds none.
    const fetchCalls = code.match(/fetch\(/g) ?? [];
    expect(fetchCalls).toHaveLength(1);
    // Strong no-new-read-path guard: the ONLY /api path the client references is the existing pick POST.
    // A regression that added e.g. `/api/pool/all-picks` (under ANY transport) would change this set.
    const apiPaths = [...code.matchAll(/\/api\/[\w/-]+/g)].map((m) => m[0]);
    expect(new Set(apiPaths)).toEqual(new Set(["/api/pool/pick"]));
    // And no alternative read transport (client lib, subscription, server-data hook) sneaks a pick read in.
    expect(code).not.toMatch(
      /useSWR|useQuery|axios|EventSource|XMLHttpRequest|createClient|\.channel\(|\.subscribe\(/i,
    );
  });

  it("another manager's pick is sourced from fixture.others (server-gated), the viewer's from myPick", () => {
    const code = codeOnly(managerPicks);
    expect(code).toContain("f.others.find");
    expect(code).toContain("f.myPick");
  });
});
