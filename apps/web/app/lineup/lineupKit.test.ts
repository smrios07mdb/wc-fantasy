import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the T13 lineup flag-kit jerseys. The RENDER behaviour (kit chip
// replaces the disc on starters + bench; flag badge; real-XI medallion; lock states; tap routes) is
// proven in ForfeitConfirm.test.tsx (jsdom). Here we lock the SOURCE contracts the way kitOf.test.ts /
// vsFieldSkin.test.ts do: the shared `.sl-kit` chip never sets `background-size: cover`, the kit gradient
// is wired through the NEUTRAL shared resolver (never app/vsfield/), and the PlayerAvatar disc is gone.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const css = read("./lineup.css");
const components = read("./components.tsx");
const client = read("./SetLineupClient.tsx");

describe("lineup flag-kit jerseys — source contract (T13)", () => {
  it("defines a shared .sl-kit chip: jersey silhouette + global --kit-outline over the surface base", () => {
    expect(css).toMatch(/^\.sl-kit\s*\{/m);
    expect(css).toContain("clip-path: polygon(");
    expect(css).toContain("var(--kit-outline)");
    expect(css).toContain("var(--surface-4)"); // the base behind the inline kit gradient
  });

  it("NEVER sets background-size:cover in any lineup.css declaration (kit gradients would collapse)", () => {
    // Strip /* … */ comments so a comment that NAMES the rule (e.g. the .sl-kit guard) can't trip it —
    // we assert on real declarations only (mirrors the codebase's comment-stripping contract checks).
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toMatch(/background-size:\s*cover/i);
  });

  it("resolves the kit through the NEUTRAL shared module — never reaching into app/vsfield/", () => {
    expect(client).toContain('from "@/src/kit/kitOf"');
    expect(client).toContain("kitOf(");
    expect(client).not.toMatch(/from\s+["'][^"']*vsfield\/kitOf["']/);
  });

  it("renders the kit chip (PlayerKit + FlagBadge), not the PlayerAvatar disc", () => {
    expect(components).toContain("function PlayerKit");
    expect(components).toContain('className="sl-kit"');
    expect(components).toContain("FlagBadge"); // the flag badge is preserved on the jersey
    expect(components).not.toContain("<PlayerAvatar"); // the disc render is removed
  });
});
