import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the App Shell chrome (Prompt 20). The repo's Vitest run has no
// DOM/JSX transform (by design — see components/Brand.test.ts), so — as with the Brand + landing smokes
// — we verify the load-bearing CONTRACTS from source rather than mounting. Component compilation is
// covered by `tsc --noEmit` + `next build`; visual fidelity is manual. The nav config + active-path
// logic are unit-tested in crossNav.test.ts; here we guard the SHELL's load-bearing wiring: it carries
// the Brand mark + a no-JS sign-out, reuses the shared nav config, and wraps the authenticated screens
// (and ONLY those). Plus a guard on the mandatory global dark-surface fix (collision A).
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const shell = read("shell/AppShell.tsx");
const shellCss = read("shell/shell.css");

describe("AppShell — the global nav chrome (server component, pure-presentational)", () => {
  it("is a Server Component — ships no client JS (no 'use client' directive)", () => {
    expect(shell).not.toMatch(/^\s*["']use client["']/m);
  });

  it("places the <Brand/> mark per BRAND.md §5 — trophy badge + 'XI' + league-name line", () => {
    expect(shell).toContain('from "@/components/Brand"');
    expect(shell).toContain("<BrandBadge");
    expect(shell).toContain("WC Fantasy League");
  });

  it("reuses the shared nav config instead of forking the link set", () => {
    expect(shell).toContain('from "@/src/shell/crossNav"');
    expect(shell).toContain("NAV_ITEMS");
  });

  it("renders the nav with an active highlight + the no-JS POST sign-out", () => {
    expect(shell).toContain("sh-nav-item");
    expect(shell).toContain("is-active");
    expect(shell).toContain('action="/auth/sign-out"');
    expect(shell).toContain('method="post"');
  });

  it("imports its own chrome CSS, which defines the load-bearing shell classes", () => {
    expect(shell).toContain('import "./shell.css"');
    for (const cls of [".sh-app", ".sh-topbar", ".sh-topnav", ".sh-nav-item", ".sh-content"]) {
      expect(shellCss, cls).toContain(cls);
    }
  });

  it("defines a glyph for every NavId — including the Prompt-42 pool + T10 standings entries", () => {
    // The glyph map is `Record<NavId, ReactNode>` (exhaustive), so a missing key is a tsc error too;
    // this guards the source-level contract that adding "pool"/"standings" to the union added its glyph.
    expect(shell).toMatch(/pool:\s*\(/);
    expect(shell).toMatch(/standings:\s*\(/);
  });

  it("labels the topbar banner so it's distinguishable from a screen's own <header>", () => {
    // /lineup renders its own `sl-topbar` <header> (also a `banner`); the shell's must be labelled.
    expect(shell).toMatch(/<header className="sh-topbar" aria-label=/);
  });

  it("keeps the design's flex height model so the fixed-height /draft surface can't clip", () => {
    // Regression guard: `.sh-app{height:100%}` propagates /draft's definite 100dvh; `.sh-content`'s
    // `min-height:0`+`overflow-y:auto` lets that internal-scroll chain resolve. (min-height:100dvh-only
    // + a content-less `.sh-content` clipped ~3300px of the draft board.)
    expect(shellCss).toMatch(/\.sh-app\s*\{[^}]*height:\s*100%/);
    expect(shellCss).toMatch(/\.sh-content\s*\{[^}]*min-height:\s*0/);
    expect(shellCss).toMatch(/\.sh-content\s*\{[^}]*overflow-y:\s*auto/);
  });
});

describe("AppShell mounting — wraps the authenticated screens ONLY", () => {
  const featureLayouts: Record<string, string> = {
    "/draft": read("draft/layout.tsx"),
    "/lineup": read("lineup/layout.tsx"),
    "/vsfield": read("vsfield/layout.tsx"),
  };
  for (const [route, src] of Object.entries(featureLayouts)) {
    it(`mounts the shell on the ${route} layout (CrossNav absorbed)`, () => {
      expect(src).toMatch(/<AppShell active=/);
      // The interim CrossNav must be gone as CODE (a doc comment may still mention it historically).
      expect(src, "no CrossNav import survives").not.toMatch(/import\s+\{[^}]*\bCrossNav\b/);
      expect(src, "no CrossNav element survives").not.toContain("<CrossNav");
    });
  }

  it("mounts the shell on the /pool layout with a real NavId — no `as NavId` cast", () => {
    const poolLayout = read("pool/layout.tsx");
    expect(poolLayout).toMatch(/<AppShell active=/);
    // feat/pool-nav: now that "pool" is a real NavId, the Prompt-42 escape-hatch cast must be gone.
    expect(poolLayout, "the `as NavId` cast must be dropped").not.toMatch(/as NavId/);
    expect(poolLayout).toContain('active="pool"');
  });

  it("wraps the signed-in hub state — and ONLY that landing state", () => {
    const page = read("page.tsx");
    const hubBody = page.split(/function Hub\(/)[1]?.split(/function Unlinked\(/)[0] ?? "";
    expect(hubBody, "Hub must exist").toBeTruthy();
    expect(hubBody).toContain('<AppShell active="home"');
    expect(hubBody, "the hub drops its own landing nav chrome").not.toContain("LpRoot");
    // The other three states keep the landing chrome (LpRoot) and are NOT shell-wrapped.
    const tail = page.split(/function Unlinked\(/)[1] ?? "";
    expect(tail).toContain("LpRoot");
    expect(tail).not.toContain("AppShell");
  });

  it("leaves the auth/marketing routes bare (sign-in + denied are NOT shell-wrapped)", () => {
    expect(read("sign-in/page.tsx")).not.toContain("AppShell");
    expect(read("auth/denied/page.tsx")).not.toContain("AppShell");
  });
});

describe("global surface — collision A resolved (Prompt 20, mandatory)", () => {
  const layout = read("layout.tsx");

  it("imports the canonical ds.css globally, AFTER globals.css so ds wins cascade ties", () => {
    const globals = layout.indexOf('import "./globals.css"');
    const ds = layout.indexOf('import "./styles/ds.css"');
    expect(globals).toBeGreaterThanOrEqual(0);
    expect(ds).toBeGreaterThan(globals);
  });

  it("drops the Tailwind light body classes so the ds dark surface takes effect", () => {
    // Assert on the <body> element itself — a doc comment may quote the old classes historically.
    expect(layout).toContain('<body className="min-h-screen antialiased">');
    expect(layout).not.toMatch(/<body className="[^"]*(?:bg-slate-50|text-slate-900)/);
  });

  it("keeps the global ds.css byte-identical to ALL per-route copies (one canonical, no fork)", () => {
    const canonical = readFileSync(resolve(appDir, "styles/ds.css"), "utf8");
    for (const route of ["draft", "vsfield", "_landing", "lineup"]) {
      const perRoute = readFileSync(resolve(appDir, `${route}/ds.css`), "utf8");
      expect(perRoute, `${route}/ds.css must match styles/ds.css byte-for-byte`).toBe(canonical);
    }
  });
});
