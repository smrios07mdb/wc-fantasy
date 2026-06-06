/**
 * Purity guard for the lineup decision core. The pure modules (everything except the Prisma adapter)
 * must carry NO IO: no DB, no Supabase, no Next, no `process.env`, no `fetch`, no wall-clock. The clock
 * and the lock state are INJECTED, so the core is a pure function of its inputs and reusable verbatim on
 * the server (the write path) and the client (live "save disabled + why"). Comments are stripped first
 * so a module's own prose ("the Supabase session read", "the wall clock") can't mask a real violation.
 *
 * `prismaStore.ts` is intentionally NOT in this list — it is the ONE IO edge (reachable via
 * `@app/lineup/prisma`), kept out of the package's `.` surface.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const PURE_MODULES = [
  "errors.ts",
  "validate.ts",
  "store.ts",
  "controller.ts",
  "memoryStore.ts",
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

describe("@app/lineup core is IO-free", () => {
  for (const file of PURE_MODULES) {
    const code = stripComments(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    for (const { label, re } of FORBIDDEN) {
      it(`${file} contains no ${label}`, () => {
        expect(re.test(code)).toBe(false);
      });
    }
  }
});
