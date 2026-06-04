import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Purity proof for the auth-decision core (the prompt's "grep-clean" requirement). The decision
 * modules must carry NO IO: no Supabase, no @app/db / Prisma, no Next, no env, no clock, no fetch.
 * We strip comments first so the modules' own prose ("the Supabase session read", "the clock, or env")
 * cannot mask a real violation in code.
 */
const PURE_MODULES = [
  "allowlist.ts",
  "resolve.ts",
  "authz.ts",
  "errors.ts",
  "types.ts",
  "index.ts",
];

const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: "@app/db", re: /@app\/db/ },
  { label: "@prisma/client", re: /@prisma\/client/ },
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

describe("auth decision core is pure (no IO/clock/env)", () => {
  for (const file of PURE_MODULES) {
    const code = stripComments(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    for (const { label, re } of FORBIDDEN) {
      it(`${file} contains no ${label}`, () => {
        expect(re.test(code)).toBe(false);
      });
    }
  }
});
