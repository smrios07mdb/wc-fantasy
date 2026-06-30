import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Source-contract smoke for the /playoffs personality glyph (BRAND.md §6): the parrot is a single
// inline header chip beside the "Guillotine" screenhead title, route-scoped in playoffs.css — not a
// second brand lockup (the AppShell topbar still owns the one mark) and not an avatar surface.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const client = read("playoffs/PlayoffsClient.tsx");
const css = read("playoffs/playoffs.css");

describe("playoffs theater — the parrot personality glyph (BRAND.md §6)", () => {
  it("renders the mascot image once, beside the screenhead title", () => {
    expect(client).toContain('src="/brand/parrot.png"');
    expect(client).toContain('className="po-parrot"');
    const occurrences = client.match(/src="\/brand\/parrot\.png"/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it("is styled route-scoped in playoffs.css, not added to the shared ds.css", () => {
    expect(css).toMatch(/^\.po-parrot\s*\{/m);
  });
});
