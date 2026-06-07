/**
 * Deploy-safety guard (Prompt 12, piece 3). The service-role admin client lives in `server.ts` and
 * reads SUPABASE_SERVICE_ROLE_KEY — which BYPASSES RLS (DECISIONS.md Theme F). If that module is ever
 * pulled into a client bundle, the key ships to the browser and the whole RLS model collapses.
 *
 * Two assertions, both static (no network, no build):
 *   1. `server.ts` carries `import "server-only"` — the canonical Next server/client boundary guard
 *      that makes the bundler THROW if a client module imports it (transitive cases included).
 *   2. No client entrypoint (`"use client"`) imports the server module directly.
 *
 * (1) is the load-bearing backstop for transitive imports; (2) is a fast, direct-reachability check.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..", ".."); // apps/web
const serverModule = path.join(here, "server.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("supabase/server.ts deploy-safety guard", () => {
  it("imports 'server-only' so the RLS-bypassing client can never reach a client bundle", () => {
    const src = readFileSync(serverModule, "utf8");
    // Accept either quote style; the side-effect import must be present.
    expect(src).toMatch(/import\s+["']server-only["'];?/);
  });

  it("is not imported by any client entrypoint ('use client')", () => {
    const offenders: string[] = [];
    for (const file of walk(webRoot)) {
      const src = readFileSync(file, "utf8");
      const isClient = /^\s*["']use client["']/m.test(src);
      if (!isClient) continue;
      // Direct import of the server module (alias `@/lib/supabase/server` or a relative path to it).
      if (/from\s+["'][^"']*lib\/supabase\/server["']/.test(src)) {
        offenders.push(path.relative(webRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
