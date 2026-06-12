/**
 * IO-free guard for @app/player-box — same pattern as @app/vsfield/src/purity.test.ts.
 * No DB, Supabase, Next, process.env, fetch, or wall-clock. Clock (now) is injected.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const PURE_MODULES = ["types.ts", "buildPlayerBox.ts", "index.ts"];

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

describe("@app/player-box is IO-free", () => {
  for (const file of PURE_MODULES) {
    const code = stripComments(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    for (const { label, re } of FORBIDDEN) {
      it(`${file} contains no ${label}`, () => {
        expect(re.test(code)).toBe(false);
      });
    }
  }
});
