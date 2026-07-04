/**
 * Source-contract smoke pinning the REAL /players + entry-point components to the `verify-players.mjs`
 * render-proof replica's class markers — the same tripwire pattern as `theCutSkin.test.ts`. The Playwright
 * proof mounts a REPLICA (jsdom can't paint), so this test is what stops the shipped components from
 * silently drifting away from the markers the proof asserts. Pure fs reads — no DOM.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../..");
const read = (rel: string) => readFileSync(resolve(webDir, rel), "utf8");

const components = read("src/players/components.tsx");
const client = read("src/players/PlayersClient.tsx");
const dashboard = read("app/_dashboard/Dashboard.tsx");
const waivers = read("src/waivers/WaiversClient.tsx");
const moreSheet = read("app/shell/MoreSheet.tsx");
const verify = read("scripts/verify-players.mjs");

describe("statline row — the components emit the markers the render proof asserts", () => {
  it("the stat table uses the design .mt-* grid markers", () => {
    for (const m of ["mt-cols", "mt-head", "mt-idc", "mt-owner", "mt-stat", "mt-end", "mt-bid"]) {
      expect(components).toContain(m);
    }
    expect(client).toContain("mt-scroll");
    expect(client).toContain("mt-wrap");
    expect(client).toContain("<StatHeader");
    expect(client).toContain("<PlayerStatRow");
    expect(client).toContain("<SwipeHint");
  });

  it("the KIT column reuses the shared flag-kit primitive kitOf (NOT the waivers text chip)", () => {
    expect(components).toContain('from "@/src/kit/kitOf"');
    expect(components).toContain("kitOf(player.nation)");
    expect(components).toContain('className="pl-kit"');
    expect(components).toContain("pl-kit-flag");
    // the waivers text-abbrev chip must NOT be imported here
    expect(components).not.toContain('from "../waivers/components"');
    expect(components).not.toContain("wv-kit");
  });

  it("the stat columns are the design order; a genuine 0 (and CS's null) mute to '—' via statCellText", () => {
    // STAT_COLUMNS order: Pld Min G A Sh KP CS Tkl YC
    const order = [
      "pld",
      "min",
      "goals",
      "assists",
      "shots",
      "keyPasses",
      "cleanSheets",
      "tackles",
      "yellowCards",
    ];
    let last = -1;
    for (const key of order) {
      const at = components.indexOf(`key: "${key}"`);
      expect(at, `STAT_COLUMNS missing/!ordered: ${key}`).toBeGreaterThan(last);
      last = at;
    }
    // a genuine 0 and a null both mute to "—" (statCellText)
    expect(components).toContain("export function statCellText");
  });
});

describe("entry points — the markers the render proof asserts", () => {
  it("the dashboard Player-pool tile is a Module cta anchor to /players, in the live phases", () => {
    expect(dashboard).toContain("function PlayerPoolModule");
    expect(dashboard).toContain('cta={{ label: "Browse all players", href: "/players" }}');
    // widened gate covers R16 (playoff) + group + complete
    expect(dashboard).toMatch(
      /phase === "group" \|\| phase === "playoff" \|\| phase === "complete"/,
    );
    // the Module cta renders as an <a href> (not plain text)
    expect(dashboard).toContain('<a className="db-mod-cta" href={cta.href}>');
  });

  it("the waivers Browse-all link renders UNCONDITIONALLY (outside the claims/results tabs)", () => {
    expect(waivers).toContain('className="wv-browse-foot"');
    expect(waivers).toContain('className="wv-browse-all t-sm" href="/players"');
    // it must sit OUTSIDE the tab ternary — after the `{tab === "claims" ? … : …}` block closes and
    // before the composer modal. Assert its position is after the results-page branch marker.
    const foot = waivers.indexOf("wv-browse-foot");
    const resultsBranch = waivers.indexOf('className="wv-results-page"');
    expect(foot).toBeGreaterThan(resultsBranch);
  });

  it("the MoreSheet carries a 'Browse players' entry linking to /players", () => {
    expect(moreSheet).toContain('<a href="/players" className="sh-more-item"');
    expect(moreSheet).toContain("Browse players");
  });
});

describe("render proof reads the REAL CSS (can't pass against stale styles)", () => {
  it("verify-players.mjs loads the shipped stylesheets", () => {
    for (const css of [
      "app/styles/ds.css",
      "src/players/players.css",
      "src/waivers/waivers.css",
      "app/shell/shell.css",
      "app/_dashboard/dashboard.css",
    ]) {
      expect(verify).toContain(css);
    }
  });
});
