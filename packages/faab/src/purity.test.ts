import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Purity proof for the @app/faab core (the prompt's "grep-clean that packages/faab imports no
 * Prisma/Supabase"). The resolver, validator, window predicate, controller, store ports, error
 * vocabulary, and the memory doubles must carry NO IO: no Prisma / @app/db, no Supabase, no Next, no
 * env, no clock, no fetch. (`now` and kickoffs are always injected.) The Prisma adapter lives in
 * `prismaStore.ts`, which is deliberately EXCLUDED from this list and reachable only via `@app/faab/prisma`.
 *
 * Comments are stripped first so the modules' own prose ("no Prisma", "the clock") can't mask a real
 * violation in code.
 */
const PURE_MODULES = [
  "resolve.ts",
  "validate.ts",
  "errors.ts",
  "store.ts",
  "window.ts", // the acquisition-window predicate (Prompt 48) — security-critical, gates the $0 FA window
  "faEligibility.ts", // the live-unowned FA-eligibility rule (Jun 18 2026) — pure, shared by the adapter
  "controller.ts",
  "memoryStore.ts",
  "index.ts",
];

const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: "@app/db", re: /@app\/db/ },
  { label: "@prisma/client", re: /@prisma\/client/ },
  { label: "@app/lineup/prisma (IO)", re: /@app\/lineup\/prisma/ },
  { label: "prismaStore import", re: /prismaStore/ },
  { label: "@supabase import", re: /@supabase/ },
  { label: "next import", re: /from\s+["']next/ },
  { label: "process.env", re: /process\.env/ },
  { label: "fetch(", re: /\bfetch\s*\(/ },
  { label: "new Date(", re: /new\s+Date\s*\(/ },
  { label: "Date.now", re: /Date\.now/ },
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("@app/faab core is pure (no IO/clock/env)", () => {
  for (const file of PURE_MODULES) {
    const code = stripComments(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    for (const { label, re } of FORBIDDEN) {
      it(`${file} contains no ${label}`, () => {
        expect(re.test(code)).toBe(false);
      });
    }
  }
});
