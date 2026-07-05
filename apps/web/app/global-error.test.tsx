// @vitest-environment jsdom
/**
 * `global-error.tsx` (F-P1-ERR2, T15-5). Two concerns:
 *
 * 1. Structural contract: it renders branded content and surfaces `reset()`, same as the route-level
 *    `error.tsx`.
 * 2. SELF-CONTAINMENT (the reason this file is separate from `error.tsx` at all): when it fires, Next
 *    swaps out the root layout entirely, so this file cannot lean on `layout.tsx`'s imports (ds.css,
 *    globals.css) or any app-shell component. We pin that at the SOURCE level — reading the real file
 *    and asserting its only import is `react` — so a future edit that reaches for `BoundaryScreen`,
 *    `Brand`, or a stylesheet import breaks this test instead of silently reintroducing the themeless
 *    crash page the finding describes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GlobalError from "./global-error";

afterEach(cleanup);

describe("global-error.tsx — self-contained import graph (anti-drift)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "global-error.tsx"), "utf8");
  const imports = [...source.matchAll(/^import\s+.*?\s+from\s+["']([^"']+)["'];?$/gm)].map(
    (m) => m[1],
  );

  it("imports nothing but react — no ds.css/globals.css, no @/ app modules, no next/image", () => {
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier, `unexpected import: ${specifier}`).toBe("react");
    }
  });

  it("does not reference ds.css, globals.css, or var(--...) design tokens", () => {
    // Strip comments first — the file's own docblock legitimately discusses ds.css/var(--...) in
    // prose (explaining what it deliberately avoids); only CODE must stay clean of them.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/ds\.css|globals\.css/);
    expect(code).not.toMatch(/var\(--/);
  });

  it("renders its own <html>/<body> (it replaces the root layout, not a child of it)", () => {
    expect(source).toMatch(/<html/);
    expect(source).toMatch(/<body/);
  });
});

describe("global-error.tsx — rendered content", () => {
  it("renders branded, hardcoded-styled error copy", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
  });

  it("calls reset() when the retry button is pressed", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
