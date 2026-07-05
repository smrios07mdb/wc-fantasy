/**
 * TIME-TRUTH FENCE (T15-6, F-P3-TZ1 class-killer) — a real-file grep over the apps/web source tree
 * that FAILS CI when a screen hand-rolls instant formatting instead of using the shared league-tz
 * formatters in `packages/shared/src/time.ts`.
 *
 * The consolidation retired every ad-hoc formatter (Dashboard, PrimaryBanner, buildGameDetail,
 * PoolClient), but nothing STRUCTURAL stops the next screen from writing `getUTCHours()` again — this
 * fence is that structure, the analog of the /scoring §9 engine-probe: drift can't land green.
 *
 * Two banned patterns in apps/web product source (tests excluded — they legitimately pin tz fixtures):
 *   1. `.getUTC*(…)` — UTC string-building renders the stored instant, not the league wall clock.
 *   2. `timeZone: "<literal>"` — a hardcoded zone freezes one league's tz into the codebase (the /pool
 *      "America/New_York" bug class). Dynamic values (`timeZone: view.timezone`) remain allowed for
 *      Intl uses that take the loader-threaded tz (e.g. WaiversClient's formatRunAt).
 *
 * Every manager-visible instant must flow: loader selects `league.timezone` → view carries
 * `timezone ?? "UTC"` → render via `formatInLeagueTz` / `formatInLeagueTzTime` / `formatInLeagueTzShort`
 * / `formatInLeagueTzDate` (all in packages/shared — the ONLY module allowed to name a timeZone).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

/** Product-source roots scanned (mirrors the vitest include set, minus tests). */
const SCAN_DIRS = ["app", "src", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "screenshots"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.(ts|tsx)$/.test(name)) continue; // tests may pin tz fixtures/assertions
    out.push(full);
  }
  return out;
}

function offenders(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const dir of SCAN_DIRS) {
    let files: string[];
    try {
      files = sourceFiles(join(webRoot, dir));
    } catch {
      continue; // a root may not exist; the others still scan
    }
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (pattern.test(line)) hits.push(`${relative(webRoot, file)}:${i + 1}  ${line.trim()}`);
      });
    }
  }
  return hits;
}

describe("time-truth fence — apps/web renders instants ONLY via the shared league-tz formatters", () => {
  it("scans a non-empty product tree (the fence is aimed at real files, not a moved directory)", () => {
    // If the roots ever move, this fails loudly instead of green-scanning nothing.
    expect(offenders(/formatInLeagueTz/).length).toBeGreaterThan(0);
  });

  it("bans getUTC* string-building (UTC wall clock is not the league wall clock)", () => {
    const hits = offenders(/\.getUTC\w+\s*\(/);
    expect(hits, `getUTC* found in apps/web product source:\n${hits.join("\n")}`).toEqual([]);
  });

  it('bans literal timeZone strings (hardcoded zones — the /pool "America/New_York" bug class)', () => {
    const hits = offenders(/timeZone:\s*["'`]/);
    expect(hits, `literal timeZone found in apps/web product source:\n${hits.join("\n")}`).toEqual(
      [],
    );
  });
});
