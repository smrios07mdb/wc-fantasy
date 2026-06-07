import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Smoke test for the XI brand identity wiring (Prompt 18). The repo's Vitest run is a pure Node
// environment with no DOM/JSX transform (by design — see vitest.config.ts), so we verify the
// *contracts* from source rather than mounting anything: the brand module exports its documented
// primitives, and every public asset path referenced by the component, the root-layout metadata,
// and the web manifest resolves to a file actually vendored under public/. Component compilation is
// covered by `tsc --noEmit` and `next build`; visual output and placement are Prompt 19's concern.
//
// Why the asset-resolution checks matter: `next build` does NOT fail when a public file referenced
// in metadata is missing (it is served at request time, not bundled), so a typo'd favicon/manifest
// path would otherwise ship broken with no gate catching it.
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const publicDir = resolve(webRoot, "public");

const read = (relPath: string) => readFileSync(resolve(webRoot, relPath), "utf8");
const existsUnderPublic = (publicPath: string) =>
  existsSync(resolve(publicDir, publicPath.slice(1)));

// Every "/brand/*", "/icons/*", or "/site.webmanifest" path literal in a source string.
const publicPathsIn = (source: string): string[] =>
  [...source.matchAll(/["'`](\/(?:brand|icons)\/[^"'`]+|\/site\.webmanifest)["'`]/g)]
    .map((m) => m[1])
    .filter((path): path is string => path !== undefined);

// The full primitive set documented in BRAND.md §4 / the brand HANDOFF.
const PRIMITIVES = [
  "BrandMark",
  "AppIcon",
  "BrandBadge",
  "Wordmark",
  "LockupH",
  "LockupStacked",
  "ParrotMascot",
];

describe("Brand module — exported surface (unmounted, presentational)", () => {
  const brandSource = read("components/Brand.tsx");

  it("exports every documented brand primitive", () => {
    for (const name of PRIMITIVES) {
      // Loose enough to survive a `function`→`const` arrow refactor of the vendored component.
      expect(brandSource, name).toMatch(new RegExp(`export (?:function|const) ${name}\\b`));
    }
  });

  it("references the trophy, app-icon tile, and parrot marks, all vendored under public/brand", () => {
    const refs = publicPathsIn(brandSource);
    expect(refs).toEqual(
      expect.arrayContaining(["/brand/trophy.png", "/brand/icon-tile.png", "/brand/parrot.png"]),
    );
    for (const ref of refs) {
      expect(existsUnderPublic(ref), ref).toBe(true);
    }
  });
});

describe("PWA identity wiring — every referenced public asset resolves", () => {
  it("every manifest + /icons/* path in the root-layout metadata exists under public/", () => {
    const refs = publicPathsIn(read("app/layout.tsx"));
    // Anchor on the manifest + apple-touch icon to prove the wiring is actually present, then
    // require every path the metadata references to resolve (guards against a typo'd icon path).
    expect(refs).toEqual(
      expect.arrayContaining(["/site.webmanifest", "/icons/apple-touch-icon.png"]),
    );
    for (const ref of refs) {
      expect(existsUnderPublic(ref), ref).toBe(true);
    }
  });

  it("every icon src in site.webmanifest exists under public/", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as { icons?: { src?: string }[] };
    const srcs = (manifest.icons ?? [])
      .map((icon) => icon.src)
      .filter((src): src is string => typeof src === "string");
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      expect(existsUnderPublic(src), src).toBe(true);
    }
  });
});
