import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the Prompt-33 draft-pool flags. The Vitest run has no DOM/JSX
// transform (see draftRoom.test.ts), so the emoji LOGIC is unit-tested in flag.test.ts and here we guard
// the load-bearing wiring of the React layer from source: `<Flag>` is the SOLE render surface, it degrades
// gracefully, the rows + queue + filter chips render flags, and the old gradient flag surface is gone.
// Component compilation is covered by `tsc --noEmit` + `next build`.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const flagComp = read("draft/Flag.tsx");
const components = read("draft/components.tsx");
const css = read("draft/draft.css");

describe("Flag.tsx — the sole emoji render surface", () => {
  it("renders the emoji via flagEmoji and never a broken glyph (graceful empty placeholder)", () => {
    expect(flagComp).toContain('from "../../src/draft/flag"');
    expect(flagComp).toContain("flagEmoji(code)");
    // empty fallback keeps alignment; no raw/broken-glyph path
    expect(flagComp).toContain('{emoji ?? ""}');
    expect(flagComp).toContain('className={"flag-emoji"');
  });

  it("is an emoji surface — no SVG/image flag dependency, no gradient style", () => {
    expect(flagComp).not.toContain("flagStyle");
    expect(flagComp).not.toContain("<img");
    expect(flagComp).not.toContain("<svg");
    expect(flagComp).not.toContain("background");
  });
});

describe("components.tsx — flags on rows + queue + filter chips, mapped through the util", () => {
  it("imports the new <Flag> surface + toIso2 and drops the old gradient flagStyle", () => {
    expect(components).toContain('import { Flag } from "./Flag"');
    expect(components).toContain('import { toIso2 } from "../../src/draft/flag"');
    expect(components).not.toContain("flagStyle");
    // the local gradient Flag component is gone (replaced by the imported emoji surface)
    expect(components).not.toMatch(/export function Flag\b/);
  });

  it("maps country → alpha-2 at the call sites via a single CountryFlag wrapper", () => {
    expect(components).toContain("function CountryFlag(");
    expect(components).toContain("<Flag code={toIso2(country)}");
    // rows and queue use CountryFlag (country value carries code OR name)
    expect(components).toContain("<CountryFlag country={p.country} />");
  });

  it("renders a flag inside each nation filter chip (reusing Prompt-31's derived list, not re-derived)", () => {
    // the chip still maps the SAME derived `nations` list; we only add a flag alongside the name
    expect(components).toContain("{nations.map((code) => (");
    expect(components).toMatch(
      /<Flag code=\{toIso2\(code\)\} label=\{nationName\(code\)\} \/>\s*\n\s*\{nationName\(code\)\}/,
    );
  });
});

describe("draft.css — emoji flag glyph styling (route-scoped, content imagery)", () => {
  it("defines .flag-emoji with a fixed width so unmappable codes keep alignment", () => {
    expect(css).toMatch(/\.flag-emoji\s*\{/);
    expect(css).toMatch(/\.flag-emoji\.flag-lg\s*\{/);
  });
});
