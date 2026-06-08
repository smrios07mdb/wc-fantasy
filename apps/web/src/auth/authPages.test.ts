import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Source-contract smoke for the Prompt-21 auth re-skin (/sign-in + /auth/denied off Tailwind onto ds).
// The repo's Vitest run is a pure Node environment with no DOM/JSX transform (by design — see
// components/Brand.test.ts), so we verify the re-skin's load-bearing CONTRACTS from source rather than
// mounting anything. Component compilation is covered by `tsc --noEmit` and `next build`. Here we guard
// the two things the prompt pins: (1) the routes migrated OFF Tailwind onto the ds split-shell + the XI
// brand mark, and (2) every auth FUNCTION is preserved byte-for-byte — the Supabase magic-link/Google
// wiring, the /auth/callback redirect target, the env-gated Google button, the denied affordance, and
// the deliberate ABSENCE of any next/safeNextPath handling in /sign-in (preserving "exactly" = leaving
// it absent — that passthrough lives in auth/callback/route.ts, which this prompt does not touch).
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const signIn = read("sign-in/page.tsx");
const denied = read("auth/denied/page.tsx");
const chrome = read("_auth/AuthChrome.tsx");
const authCss = read("_auth/auth.css");

// Absence guards must inspect actual CODE/STYLES, not prose: these files legitimately *discuss* the
// gold rule and the (deliberately absent) next/safeNextPath passthrough in their comments, so strip
// comments before asserting a token never appears as real syntax.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const signInCode = stripComments(signIn);
const authCssRules = stripComments(authCss);

describe("auth re-skin — both routes are on the ds split-shell with the XI brand mark", () => {
  it("/sign-in + /auth/denied render through the shared AuthScreen chrome + import the route-scoped auth.css", () => {
    for (const [name, src] of [
      ["sign-in", signIn],
      ["denied", denied],
    ] as const) {
      expect(src, name).toContain("AuthScreen");
      // route-scoped stylesheet, vendored alongside the routes (the shell.css convention) — NOT global.
      expect(src, name).toMatch(/import "\.{1,2}(?:\/\.\.)*\/_auth\/auth\.css"/);
    }
  });

  it("the chrome reuses the Prompt-18 LockupStacked brand mark (trophy · XI · tagline), not a redrawn mark", () => {
    expect(chrome).toMatch(/import\s*\{[^}]*LockupStacked[^}]*\}\s*from\s*"@\/components\/Brand"/);
    expect(chrome).toContain("LockupStacked");
    // The {league} · {season} row per BRAND.md §5, sourced from the same placeholder the shell uses.
    expect(chrome).toContain("WC Fantasy League");
  });

  it("uses the ds split layout + brand panel (au-shell is-split / au-brandpanel), not Tailwind utilities", () => {
    expect(chrome).toContain("au-shell");
    expect(chrome).toContain("is-split");
    expect(chrome).toContain("au-brandpanel");
  });
});

describe("auth re-skin — /sign-in preserves the full magic-link flow (presentation only)", () => {
  it("keeps the Supabase magic-link request wired to /auth/callback, unchanged", () => {
    expect(signIn).toContain("signInWithOtp");
    expect(signIn).toContain("emailRedirectTo");
    expect(signIn).toContain("/auth/callback");
  });

  it("keeps the env-gated Google button wired to signInWithOAuth", () => {
    expect(signIn).toContain("GOOGLE_ENABLED");
    expect(signIn).toContain("signInWithOAuth");
  });

  it("renders the email-input affordance (type=email + a submit) AND the submitted/confirmation state", () => {
    expect(signIn).toContain('type="email"');
    expect(signIn).toMatch(/Send (a )?magic link|Send magic link/);
    // the distinct "check your email" confirmation view (a state swap on a successful send).
    expect(signIn).toContain("Check your email");
  });

  it("introduces NO next/safeNextPath handling — that passthrough stays in auth/callback (out of scope)", () => {
    expect(signInCode).not.toContain("safeNextPath");
    expect(signInCode).not.toMatch(/searchParams|useSearchParams/);
  });

  it("is OFF Tailwind — the Prompt-20 text-slate legibility repair + bare Tailwind utilities are gone", () => {
    expect(signIn).not.toContain("text-slate-400");
    expect(signIn).not.toContain("text-slate-300");
    expect(signIn).not.toContain("bg-blue-600");
  });
});

describe("auth re-skin — /auth/denied keeps its denied message + back-to-sign-in affordance", () => {
  it("renders the denied messaging and the existing back-to-sign-in affordance", () => {
    expect(denied).toContain('href="/sign-in"');
    // the dual-cause copy (allowlist OR expired link) the route has always carried.
    expect(denied.toLowerCase()).toMatch(/allowlist|invite|sign you in|can.?t sign/);
  });

  it("is OFF Tailwind — the Prompt-20 legibility repair + bare Tailwind utilities are gone", () => {
    expect(denied).not.toContain("text-slate-400");
    expect(denied).not.toContain("text-blue-600");
  });
});

describe("auth re-skin — route-scoped auth.css layers on the GLOBAL ds.css (no fork, no leak)", () => {
  it("scopes every rule to the au-* classes — never restyles the shared <body> (would leak globally)", () => {
    expect(authCss).not.toMatch(/^\s*body\s*\{/m);
    expect(authCss).toContain(".au-shell");
  });

  it("the cobalt accent rule holds — the CTA uses the ds accent token, and no gold leaks in", () => {
    expect(authCssRules.toLowerCase()).not.toContain("gold");
    // the functional accent is the ds cobalt token (gold lives ONLY in the trophy PNG, never in CSS).
    expect(authCssRules).toContain("var(--accent)");
  });
});
