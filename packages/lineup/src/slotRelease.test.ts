import { describe, it, expect } from "vitest";
import type { Prisma } from "@app/db";
import { releaseDroppedPlayerSlots, findLockedSlotPlayerIds } from "./slotRelease";

/**
 * Unit tests for the FAAB-drop ↔ lineup reconciliation helpers. They run against a FAITHFUL fake client
 * that applies whatever `where` the function passes (only the keys present), so the tests genuinely
 * verify the functions send the right filters: release targets UNLOCKED slots only; the lock reader
 * keys on locked_at + a non-closed matchday.
 */

interface FakeSlot {
  managerId: string;
  playerId: string;
  lockedAt: Date | null;
  period: { leagueId: string; status: string };
}

/** Apply only the where-keys the function actually set — so omitting `lockedAt: null` would be caught. */
function matches(row: FakeSlot, where: Record<string, unknown>): boolean {
  if (where.managerId !== undefined && row.managerId !== where.managerId) return false;
  if (where.playerId !== undefined) {
    const w = where.playerId as { in?: string[] } | string;
    if (typeof w === "string") {
      if (row.playerId !== w) return false;
    } else if (w.in && !w.in.includes(row.playerId)) return false;
  }
  if ("lockedAt" in where) {
    const w = where.lockedAt as null | { not: null };
    if (w === null && row.lockedAt !== null) return false;
    if (w && typeof w === "object" && "not" in w && row.lockedAt === null) return false;
  }
  if (where.period !== undefined) {
    const p = where.period as { leagueId?: string; status?: { not?: string } };
    if (p.leagueId !== undefined && row.period.leagueId !== p.leagueId) return false;
    if (p.status?.not !== undefined && row.period.status === p.status.not) return false;
  }
  return true;
}

function fakeClient(rows: FakeSlot[]) {
  return {
    lineupSlot: {
      async deleteMany({ where }: { where: Record<string, unknown> }) {
        let count = 0;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (matches(rows[i]!, where)) {
            rows.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return rows.filter((r) => matches(r, where)).map((r) => ({ playerId: r.playerId }));
      },
    },
  } as unknown as Prisma.TransactionClient;
}

describe("releaseDroppedPlayerSlots", () => {
  it("releases a dropped player's UNLOCKED slot but leaves a LOCKED slot untouched", async () => {
    const rows: FakeSlot[] = [
      // unlocked slot for the dropped player → released
      {
        managerId: "A",
        playerId: "DROP",
        lockedAt: null,
        period: { leagueId: "L", status: "open" },
      },
      // locked (already played) slot for the SAME player → kept (historical, still scores)
      {
        managerId: "A",
        playerId: "DROP",
        lockedAt: new Date("2026-06-10T12:00:00Z"),
        period: { leagueId: "L", status: "open" },
      },
      // a different player's unlocked slot → untouched
      {
        managerId: "A",
        playerId: "KEEP",
        lockedAt: null,
        period: { leagueId: "L", status: "open" },
      },
    ];
    const released = await releaseDroppedPlayerSlots(fakeClient(rows), {
      leagueId: "L",
      managerId: "A",
      playerId: "DROP",
    });
    expect(released).toBe(1);
    // The locked DROP slot and the unrelated KEEP slot survive.
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.playerId === "DROP" && r.lockedAt !== null)).toBe(true);
    expect(rows.some((r) => r.playerId === "KEEP")).toBe(true);
    expect(rows.some((r) => r.playerId === "DROP" && r.lockedAt === null)).toBe(false);
  });
});

describe("findLockedSlotPlayerIds", () => {
  it("returns players locked in a non-closed matchday, ignoring unlocked and closed-matchday locks", async () => {
    const rows: FakeSlot[] = [
      // locked + open matchday → LOCKED (cannot be dropped)
      {
        managerId: "A",
        playerId: "PLAYED",
        lockedAt: new Date("2026-06-10T12:00:00Z"),
        period: { leagueId: "L", status: "open" },
      },
      // locked but the matchday already CLOSED → droppable again (historical lock)
      {
        managerId: "A",
        playerId: "HISTORIC",
        lockedAt: new Date("2026-06-08T12:00:00Z"),
        period: { leagueId: "L", status: "closed" },
      },
      // owned but UNLOCKED (hasn't played) → droppable
      {
        managerId: "A",
        playerId: "BENCH",
        lockedAt: null,
        period: { leagueId: "L", status: "open" },
      },
    ];
    const locked = await findLockedSlotPlayerIds(fakeClient(rows), {
      managerId: "A",
      playerIds: ["PLAYED", "HISTORIC", "BENCH", "UNSEEN"],
    });
    expect([...locked]).toEqual(["PLAYED"]);
  });

  it("short-circuits to an empty set when no playerIds are given", async () => {
    const locked = await findLockedSlotPlayerIds(fakeClient([]), { managerId: "A", playerIds: [] });
    expect(locked.size).toBe(0);
  });
});
