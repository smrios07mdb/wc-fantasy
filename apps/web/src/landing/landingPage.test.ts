import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Source-contract smoke for the Prompt-19 landing re-skin. The repo's Vitest run is a pure Node
// environment with no DOM/JSX transform (by design — see components/Brand.test.ts), so we verify the
// re-skin's load-bearing CONTRACTS from source rather than mounting anything. Component compilation is
// covered by `tsc --noEmit` and `next build`; the four-outcome MAPPING itself is unit-tested in
// selectLandingView.test.ts. Here we guard that the *visual* re-skin didn't regress the page's branch,
// each state's key affordance, the unlinked≠denied invariant, or the per-route CSS scoping.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const page = read("page.tsx");
const marketing = read("_landing/MarketingLanding.tsx");
const chrome = read("_landing/chrome.tsx");
const landingCss = read("_landing/landing.css");
const landingDs = read("_landing/ds.css");
const draftDs = read("draft/ds.css");

describe("landing page — four-outcome branch is preserved (visual re-skin only)", () => {
  it("maps every view to its own state component and keeps the IO edge unchanged", () => {
    expect(page).toContain('view === "hub"');
    expect(page).toContain("<Hub displayName=");
    expect(page).toContain('view === "unlinked"');
    expect(page).toContain("<Unlinked />");
    expect(page).toContain('view === "denied"');
    expect(page).toContain("<Denied />");
    expect(page).toContain("<SignIn />");
    // The session read stays the Prompt-07 `getSessionManager()` primitive (unchanged thin IO edge).
    expect(page).toContain("getSessionManager()");
  });
});

describe("landing page — each state still renders its key affordance", () => {
  it("signin → the designed Sign in CTA → /sign-in, with NO self-serve join form", () => {
    expect(marketing).toContain('href="/sign-in"');
    expect(marketing).not.toContain("Join.html");
    // The prototype's inline email-capture forms are replaced by the CTA — the signin state has no <form>.
    expect(marketing).not.toMatch(/<form\b/);
  });

  it("hub → POST sign-out + the three live screens, with the brand mark in the header", () => {
    expect(chrome).toContain('action="/auth/sign-out"');
    expect(chrome).toContain('method="post"');
    // The hub cards bind `href={feature.href}`, so the routes live as string values in FEATURES.
    for (const route of ["/draft", "/lineup", "/vsfield"]) {
      expect(page, route).toContain(`"${route}"`);
    }
    expect(chrome).toContain("BrandMark"); // <Brand/> in the header (the prompt's required placement)
  });

  it("unlinked is NOT a denial — only the denied state references /auth/denied", () => {
    // Isolate each component body (the header comment legitimately documents /auth/denied, so split on
    // the function boundaries, not on a bare substring): Unlinked must NOT route to the denial page.
    const unlinkedBody = page.split(/function Unlinked\(/)[1]?.split(/function Denied\(/)[0] ?? "";
    const deniedBody = page.split(/function Denied\(/)[1] ?? "";
    expect(unlinkedBody, "Unlinked component must exist").toBeTruthy();
    expect(deniedBody, "Denied component must exist").toBeTruthy();
    expect(unlinkedBody).not.toContain("/auth/denied");
    expect(deniedBody).toContain('href="/auth/denied"');
    // unlinked still points the member at the commissioner.
    expect(page.toLowerCase()).toContain("commissioner");
  });
});

describe("landing CSS — vendored per-route, scoped, no drift", () => {
  it("keeps ds.css byte-identical to the shared design system (no fork)", () => {
    expect(landingDs).toBe(draftDs);
  });

  it("imports both stylesheets in page.tsx (per-route, not global)", () => {
    expect(page).toContain('import "./_landing/ds.css"');
    expect(page).toContain('import "./_landing/landing.css"');
  });

  it("scopes the dark surface to a `.lp` wrapper — the design's body.lp selector would leak", () => {
    expect(landingCss).not.toMatch(/body\.lp\s*\{/); // the body-level selector was re-scoped
    expect(landingCss).toMatch(/^\.lp\s*\{/m); // ...onto the .lp wrapper
  });
});
