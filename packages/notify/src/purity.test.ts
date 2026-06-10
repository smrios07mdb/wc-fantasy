import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Purity proof for the @app/notify core. The payload builders, preference validator, delivery policy,
 * store port, types, and the memory double must carry NO IO: no Prisma / @app/db, no web-push, no
 * Supabase, no Next, no env, no clock, no fetch. The IO adapters (`send.ts`, `prismaStore.ts`) are
 * deliberately EXCLUDED — they are reachable only via `@app/notify/send` and `@app/notify/prisma`.
 *
 * Comments are stripped first so the modules' own prose ("web-push", "the clock") can't mask a real
 * violation in code.
 */
const PURE_MODULES = [
  "types.ts",
  "preferences.ts",
  "payload.ts",
  "dispatch.ts",
  "store.ts",
  "memoryStore.ts",
  "index.ts",
];

const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: "@app/db", re: /@app\/db/ },
  { label: "@prisma/client", re: /@prisma\/client/ },
  { label: "web-push", re: /web-push/ },
  { label: "prismaStore import", re: /prismaStore/ },
  { label: "send.ts import", re: /["']\.\/send["']/ },
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

describe("@app/notify core is pure (no IO/clock/env)", () => {
  for (const file of PURE_MODULES) {
    const code = stripComments(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    for (const { label, re } of FORBIDDEN) {
      it(`${file} contains no ${label}`, () => {
        expect(re.test(code)).toBe(false);
      });
    }
  }
});
