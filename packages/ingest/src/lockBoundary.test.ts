import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Structural guard (DECISIONS lock-on-play; the 2026-06-12 recurrence). There is EXACTLY ONE lock-on-play
 * write boundary in @app/ingest — the store's `lockSlot`, which enforces the team + status + now + period
 * gate. No other code may write `lineup_slot.locked_at`. Three premature-lock incidents all came from a
 * lock-write path that skipped the invariant; this test fails the moment a second writer is reintroduced.
 */
const SRC = dirname(fileURLToPath(import.meta.url));
const srcFiles = readdirSync(SRC).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const read = (f: string): string => readFileSync(join(SRC, f), "utf8");

describe("single lock-on-play write boundary (no call sites outside lockSlot)", () => {
  it("the old unguarded setLockedAt writer no longer exists anywhere in @app/ingest", () => {
    for (const f of srcFiles) {
      expect(read(f), `${f} still references the retired setLockedAt`).not.toContain("setLockedAt");
    }
  });

  it("only prismaStore writes lineup_slot, and in exactly one place (inside lockSlot)", () => {
    const writePattern = /lineupSlot\.update(Many)?\s*\(/g;
    for (const f of srcFiles) {
      const hits = read(f).match(writePattern) ?? [];
      if (f === "prismaStore.ts") {
        expect(
          hits.length,
          "prismaStore must write lineup_slot in exactly one place (lockSlot)",
        ).toBe(1);
      } else {
        expect(
          hits.length,
          `${f} must not write lineup_slot directly — route through lockSlot`,
        ).toBe(0);
      }
    }
  });

  it("every lock writer (orchestration + sweep) routes through store.lockSlot", () => {
    for (const f of ["ingest.ts", "lockSweep.ts"]) {
      expect(read(f), `${f} should call the lockSlot boundary`).toContain("store.lockSlot(");
    }
  });
});
