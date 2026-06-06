/**
 * Purity guard for the vs-the-field view-model. The whole package is pure (ARCHITECTURE.md §5):
 * no DB, no Supabase, no Next, no `process.env`, no `fetch`, no wall-clock. The clock (`now`) and
 * every §4 row are INJECTED, so `buildVsField` is a pure function of its inputs — reusable verbatim
 * on the server (the SSR loader + `GET /api/vsfield`) and the client (live re-render on refetch).
 * Comments are stripped first so a module's own prose can't mask a real violation.
 *
 * Unlike @app/lineup, this package has NO prismaStore — it never writes; the IO lives in apps/web.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const PURE_MODULES = ["types.ts", "buildVsField.ts", "index.ts"];

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

describe("@app/vsfield is IO-free", () => {
  for (const file of PURE_MODULES) {
    const code = stripComments(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    for (const { label, re } of FORBIDDEN) {
      it(`${file} contains no ${label}`, () => {
        expect(re.test(code)).toBe(false);
      });
    }
  }
});
