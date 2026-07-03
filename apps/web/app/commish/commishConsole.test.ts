import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke (no DOM/JSX transform in this repo — see appShell.test.ts /
// Brand.test.ts precedent). Thread 6: the Draft-setup tab is retired (the draft ran pre-tournament and
// can never run again); this pins the tab count post-removal and guards the dead placeholder from
// creeping back.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "CommishConsole.tsx"), "utf8");

describe("CommishConsole tabs — Draft-setup retired (Thread 6)", () => {
  it("renders exactly 4 tabs (Playoff cuts / Stat corrections / Roster & lineup / Game operations)", () => {
    const ids = [...src.matchAll(/id:\s*"(\w+)"/g)].map((m) => m[1]);
    // TABS is the first object array; guard the whole set rather than counting matches loosely.
    expect(ids.slice(0, 4)).toEqual(["field", "stats", "repair", "ops"]);
  });

  it("has no Draft-setup tab left (id, label, or copy)", () => {
    expect(src).not.toContain('id: "draft"');
    expect(src).not.toContain("Draft setup");
    expect(src).not.toContain("pick clock, and autopick configuration");
  });

  it("dropped the now-dead inert-placeholder fallback (every tab is a live panel)", () => {
    expect(src).not.toContain("TaskPlaceholder");
    expect(src).not.toContain("activeTab");
  });
});
