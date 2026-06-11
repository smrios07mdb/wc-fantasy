import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for Part 2 — the collapsible country filter on the waivers FA pool.
// The Vitest run has no DOM/JSX transform (see waivers.test.ts), so the filter LOGIC is unit-tested in
// waiversLogic.test.ts and here we guard that the REUSED component is actually wired in: the BidComposer
// mounts the shared <NationFilter>, and <NationFilter> reuses the existing <Flag>/toIso2 resolver rather
// than reinventing flag logic. Component compilation is covered by tsc --noEmit + next build.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const composer = read("./BidComposer.tsx");
const nationFilter = read("../../components/NationFilter.tsx");
const css = read("./waivers.css");

describe("BidComposer — mounts the shared NationFilter over the FA pool", () => {
  it("imports the shared component + the derived-nations helper (reuse, not reinvention)", () => {
    expect(composer).toContain('import { NationFilter } from "@/components/NationFilter"');
    expect(composer).toContain("freeAgentNations");
  });

  it("threads the selected nation into the claimable-FA filter and renders the control", () => {
    expect(composer).toContain('const [nation, setNation] = useState<string | "ALL">("ALL")');
    expect(composer).toContain("freeAgentNations(freeAgents)");
    // the nation reaches the same pure filter the logic test covers
    expect(composer).toMatch(/claimableFreeAgents\([^)]*nation[^)]*\)/s);
    expect(composer).toContain(
      "<NationFilter nations={nations} value={nation} onChange={setNation} />",
    );
  });
});

describe("NationFilter — the reused collapsible filter", () => {
  it("defaults collapsed and toggles open (mirrors the draft pool)", () => {
    expect(nationFilter).toContain("const [open, setOpen] = useState(false)");
    expect(nationFilter).toContain("setOpen((o) => !o)");
    expect(nationFilter).toContain("{open && (");
  });

  it("reuses the sole <Flag> render surface + toIso2 resolver (no re-derived flag logic)", () => {
    expect(nationFilter).toContain('import { Flag } from "../app/draft/Flag"');
    expect(nationFilter).toContain('import { toIso2 } from "../src/draft/flag"');
    expect(nationFilter).toContain("<Flag code={toIso2(");
  });

  it("offers an active-nation chip + clear control while collapsed", () => {
    expect(nationFilter).toContain('{value !== "ALL" && !open && (');
    expect(nationFilter).toContain('className="nf-clear"');
    expect(nationFilter).toContain('onChange("ALL")');
  });
});

describe("waivers.css — country-filter styles exist", () => {
  it("defines .nf-filter, .nf-toggle, .nf-grid, and .nf-clear", () => {
    expect(css).toMatch(/\.nf-filter\s*\{/);
    expect(css).toMatch(/\.nf-toggle\s*\{/);
    expect(css).toMatch(/\.nf-grid\s*\{/);
    expect(css).toMatch(/\.nf-clear\s*\{/);
  });
});
