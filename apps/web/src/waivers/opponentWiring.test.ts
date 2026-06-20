import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for T8 — each free agent's NEXT opponent on the waivers picker. The
// loader (`loadWaivers`) has no DB unit test (it needs a live Postgres), so this guards the load-bearing
// thread from source: the opponent is resolved via the SHARED lineup helper (never re-derived), the team
// names the resolver needs are selected, and the resolved value is attached onto the free-agent players
// only. The render path itself is proved by the jsdom mount in `freeAgentOpponent.test.tsx`; component
// compilation is covered by tsc --noEmit + next build.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const loader = read("../../app/waivers/loadWaivers.ts");
const components = read("./components.tsx");
const types = read("./types.ts");

describe("loadWaivers.ts — threads the next opponent via the shared resolveOpponentByPlayer", () => {
  it("imports the lineup resolver read-only (not a re-derived opponent resolver)", () => {
    expect(loader).toContain("import { resolveOpponentByPlayer }");
    expect(loader).toContain('from "../../src/lineup/view"');
  });

  it("selects the home/away team names the resolver needs for the 'vs/@ + flag + name' label", () => {
    expect(loader).toContain("homeTeam: { select: { name: true } }");
    expect(loader).toContain("awayTeam: { select: { name: true } }");
  });

  it("resolves against the same still-acquirable fixture set the cutoff clock uses", () => {
    // periodMatches is derived from the SAME `upcomingMatches` rows as kickoffByTeam → one fixture per FA.
    expect(loader).toContain("const periodMatches = upcomingMatches.map(");
    expect(loader).toContain("resolveOpponentByPlayer(");
  });

  it("attaches the resolved opponent onto the free-agent players only", () => {
    expect(loader).toMatch(
      /freeAgentRows\.map\(\(p\) => \(\{[\s\S]*opponent: opponentByFreeAgent\[p\.id\] \?\? null/,
    );
  });
});

describe("the FA picker row renders the threaded opponent (mirrors the lineup OpponentTag)", () => {
  it("components.tsx defines OpponentLine and FaPickRow renders it from player.opponent", () => {
    expect(components).toContain("export function OpponentLine(");
    expect(components).toContain("<OpponentLine opponent={player.opponent");
    // "vs" (home) / "@" (away) prefix + "TBD" fallback — the same three states the lineup tag renders.
    expect(components).toContain('opponent.isHome ? "vs" : "@"');
    expect(components).toContain("Next opponent TBD");
    // Reuses the sole flag surface, never a re-derived flag.
    expect(components).toContain("<NationFlag nation={opponent.opponentNation} />");
  });

  it("WvPlayer carries the optional opponent field reusing the lineup OpponentInfo type", () => {
    expect(types).toContain("readonly opponent?:");
    expect(types).toContain('from "../lineup/types"');
  });
});
