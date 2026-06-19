import { describe, it, expect } from "vitest";
import { liveOwnedWhere, isLiveUnowned, type OwnershipRow } from "./faEligibility";

/**
 * Live-unowned FA eligibility (DECISIONS §D, commissioner decision Jun 18 2026 — the Prompt-48 batch-clear
 * snapshot + anti-snipe hold are RETIRED). A player is a free agent the moment he holds NO active roster
 * row (`dropped_at IS NULL`), regardless of any earlier dropped rows. `liveOwnedWhere` is the SQL predicate
 * the Prisma adapter counts against (`listFaIneligiblePlayerIds` / `getFaTargetFacts` / `claimFreeAgent`);
 * `isLiveUnowned` is its in-memory twin. Both pinned here so the offered pool, the per-player re-check, and
 * the grant share ONE rule that can never silently drift.
 */
const L = "league-1";
const P = "player-1";
// A batch-clear instant — relevant ONLY to the retired snapshot rule; under live-unowned it is irrelevant.
const BATCH_CLEAR = new Date("2026-06-18T06:00:00Z");

// Apply the REAL `liveOwnedWhere` predicate to fixture rows. It interprets ONLY the live-unowned shape
// ({ leagueId, playerId?, droppedAt: null }); an unexpected key (e.g. a reintroduced snapshot OR/gte term)
// THROWS — a loud drift guard keeping this test honest about what the adapter actually queries.
function rowMatchesLiveOwned(where: ReturnType<typeof liveOwnedWhere>, row: OwnershipRow): boolean {
  for (const k of Object.keys(where)) {
    if (k !== "leagueId" && k !== "playerId" && k !== "droppedAt") {
      throw new Error(`liveOwnedWhere leaked an unexpected predicate key: ${k}`);
    }
  }
  const w = where as { leagueId: string; playerId?: string; droppedAt: null };
  if (w.droppedAt !== null) throw new Error("liveOwnedWhere must gate on droppedAt: null only");
  if (row.leagueId !== w.leagueId) return false;
  if (w.playerId !== undefined && row.playerId !== w.playerId) return false;
  return row.droppedAt === null;
}
// A free agent iff NO row matches the per-player live-owned predicate — exactly the adapter's
// `COUNT(liveOwnedWhere(L, P)) === 0` eligibility test, run against the REAL predicate.
const isFreeAgentViaPredicate = (rows: OwnershipRow[]): boolean =>
  !rows.some((r) => rowMatchesLiveOwned(liveOwnedWhere(L, P), r));

describe("liveOwnedWhere — the single SQL eligibility predicate", () => {
  it("matches ONLY an active ownership row (dropped_at IS NULL); no snapshot OR/gte term", () => {
    expect(liveOwnedWhere(L)).toEqual({ leagueId: L, droppedAt: null });
    expect(liveOwnedWhere(L, P)).toEqual({ leagueId: L, playerId: P, droppedAt: null });
    expect("OR" in liveOwnedWhere(L, P)).toBe(false);
    expect(JSON.stringify(liveOwnedWhere(L, P))).not.toContain("gte");
  });
});

describe("live-unowned FA eligibility — explicit (a)–(d)", () => {
  it("(a) a batch-dropped player (dropped_at set, no active row) is ELIGIBLE", () => {
    const rows: OwnershipRow[] = [{ leagueId: L, playerId: P, droppedAt: BATCH_CLEAR }];
    expect(isLiveUnowned(rows, L, P)).toBe(true);
    expect(isFreeAgentViaPredicate(rows)).toBe(true);
  });

  it("(b) a mid-window manual drop (dropped_at AFTER the batch) is ELIGIBLE", () => {
    const rows: OwnershipRow[] = [
      { leagueId: L, playerId: P, droppedAt: new Date("2026-06-18T09:00:00Z") },
    ];
    expect(isLiveUnowned(rows, L, P)).toBe(true);
    expect(isFreeAgentViaPredicate(rows)).toBe(true);
  });

  it("(c) a currently-rostered player (dropped_at NULL) is NOT eligible", () => {
    const rows: OwnershipRow[] = [{ leagueId: L, playerId: P, droppedAt: null }];
    expect(isLiveUnowned(rows, L, P)).toBe(false);
    expect(isFreeAgentViaPredicate(rows)).toBe(false);
  });

  it("(d) dropped-then-re-added (a NEW active row beside the old dropped one) is NOT eligible", () => {
    const rows: OwnershipRow[] = [
      { leagueId: L, playerId: P, droppedAt: BATCH_CLEAR }, // the old, dropped ownership
      { leagueId: L, playerId: P, droppedAt: null }, // the new, active ownership
    ];
    expect(isLiveUnowned(rows, L, P)).toBe(false);
    expect(isFreeAgentViaPredicate(rows)).toBe(false);
  });

  it("is league-scoped — an active row in ANOTHER league does not make him owned here", () => {
    const rows: OwnershipRow[] = [{ leagueId: "other-league", playerId: P, droppedAt: null }];
    expect(isLiveUnowned(rows, L, P)).toBe(true);
    expect(isFreeAgentViaPredicate(rows)).toBe(true);
  });
});
