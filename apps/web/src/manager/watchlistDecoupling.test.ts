/**
 * Source-contract smoke for T2's locked decoupling guarantee (DESIGN decision a): a watchlist star is a
 * personal bookmark that touches NONE of the FAAB / roster / lineup / scoring machinery. The write path
 * needs a live DB (the gated watchlistRls suite covers runtime), so this pins the SHAPE by grepping the
 * route + handler + store source for forbidden module imports and Prisma accessors. Code-shaped tokens
 * only (camelCase accessors, `@app/*` imports) so prose comments never false-trip the assertions.
 *
 * Pure fs reads — no DOM, no DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("watchlist write path — DECOUPLED from FAAB / roster / lineup / scoring (T2 decision a)", () => {
  const handler = read("./handleWatchlist.ts");
  const store = read("./watchlistStore.ts");
  const route = read("../../app/api/manager/watchlist/route.ts");
  const all = handler + "\n" + store + "\n" + route;

  it("imports no FAAB / lineup / recompute module", () => {
    expect(all).not.toContain("@app/faab");
    expect(all).not.toContain("@app/lineup");
    expect(all).not.toContain("@app/recompute");
  });

  it("references no bid / batch / roster / lineup / budget accessor", () => {
    for (const token of ["faabBid", "faabBatch", "rosterPlayer", "lineupSlot", "faabBudget"]) {
      expect(all).not.toContain(token);
    }
  });

  it("triggers no engine recompute / dirty-mark / realtime broadcast", () => {
    expect(all).not.toContain("markDirty");
    expect(all).not.toContain("RecomputeDirty");
    expect(all).not.toContain("postgres_changes");
    expect(all).not.toContain("supabase_realtime");
  });

  it("the pure handler injects all IO — it imports neither Prisma nor NextResponse", () => {
    expect(handler).not.toContain("@app/db");
    expect(handler).not.toContain("prisma");
    expect(handler).not.toContain("next/server");
  });

  it("the store touches ONLY the manager (leagueId lookup) + watchlist models", () => {
    const models = [...store.matchAll(/prisma\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(models)).toEqual(new Set(["manager", "watchlist"]));
  });

  it("the route body carries no managerId — the managerId is resolved server-side", () => {
    // The parser shape is { playerId, watched } only; a client managerId is never read.
    expect(handler).toContain("playerId");
    expect(handler).toContain("watched");
    expect(route).not.toContain("body.managerId");
  });
});
