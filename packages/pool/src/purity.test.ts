import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Purity proof for @app/pool (Prompt 40 §2 — "DB-free, no IO, no clock"). The engine, the error
 * vocabulary, and the entrypoint must carry NO IO: no Prisma / @app/db, no Supabase, no Next, no env,
 * no clock (`now` and kickoffs are always injected), no fetch. Unlike @app/faab/@app/recompute there is
 * no `prismaStore.ts` here at all — the entire Prisma write/read path lives in apps/web (§3).
 *
 * Comments are stripped first so the modules' own prose ("no clock", "no IO") can't mask a real
 * violation in code.
 */
const PURE_MODULES = ["pool.ts", "errors.ts", "index.ts"];

const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: "@app/db", re: /@app\/db/ },
  { label: "@prisma/client", re: /@prisma\/client/ },
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

describe("@app/pool is pure (no IO/clock/env)", () => {
  for (const file of PURE_MODULES) {
    const code = stripComments(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    for (const { label, re } of FORBIDDEN) {
      it(`${file} contains no ${label}`, () => {
        expect(re.test(code)).toBe(false);
      });
    }
  }
});
