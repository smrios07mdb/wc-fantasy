import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for Part 3 — country flags on the waivers players. No DOM/JSX transform
// in the Vitest run, so we guard the load-bearing wiring from source: a single <NationFlag> reuses the
// sole <Flag> surface + toIso2 resolver (Prompts 33/35/36 — never re-derived), it is rendered beside the
// player on every waivers surface, and the loader feeds it a real country (the fifa_team join, since
// player.country is unwritten). Component compilation is covered by tsc --noEmit + next build.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const components = read("./components.tsx");
const composer = read("./BidComposer.tsx");
const loader = read("../../app/waivers/loadWaivers.ts");

describe("components.tsx — NationFlag reuses the sole <Flag> surface", () => {
  it("defines NationFlag over <Flag code={toIso2(...)}>, not a re-derived flag", () => {
    expect(components).toContain('import { Flag } from "../../app/draft/Flag"');
    expect(components).toContain('import { toIso2 } from "../draft/flag"');
    expect(components).toContain("export function NationFlag(");
    expect(components).toContain("<Flag code={toIso2(nation)}");
  });

  it("renders the flag beside the player on the claim + result rows", () => {
    expect(components).toContain("<NationFlag nation={claim.add.nation} />");
    expect(components).toContain("<NationFlag nation={claim.drop.nation} />");
    expect(components).toContain("<NationFlag nation={result.add.nation} />");
  });

  it("keeps the kit chip free of a background-image (the project-wide cover gotcha)", () => {
    // KitChip is a plain tinted code chip — no background shorthand to collapse into a cover bug.
    const kit = components.slice(components.indexOf("export function KitChip"));
    expect(kit.slice(0, 400)).not.toContain("background");
  });
});

describe("BidComposer.tsx — flags on the FA picker, drop picker, and edit panel", () => {
  it("imports NationFlag and renders it beside each player", () => {
    expect(composer).toContain("NationFlag");
    expect(composer).toContain("<NationFlag nation={p.nation} />");
    expect(composer).toContain("<NationFlag nation={editClaim.add.nation} />");
  });
});

describe("loadWaivers.ts — nation comes from the fifa_team join (player.country is unwritten)", () => {
  it("derives nation from the team name with a column fallback", () => {
    expect(loader).toContain("nation: p.team?.name ?? p.country");
  });
});
