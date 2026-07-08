/**
 * REAL-Postgres proof of the `faab_bid.priority` write paths (§D amendment) — the pieces a unit
 * double cannot vouch for:
 *
 *   1. `createBid` APPENDS at MAX(priority)+1 over the manager's own pending bids, inside its
 *      interactive transaction (per-manager queues independent; a cancel's gap never re-fills).
 *   2. `reorderPendingBids` — the raw `SELECT … ORDER BY id FOR UPDATE` + rewrite — persists the
 *      permutation as contiguous 1..N, refuses a stale/duplicated/foreign permutation with NOTHING
 *      written, and never touches another manager's rows.
 *   3. The migration's backfill statement (replayed verbatim) numbers PENDING rows per manager by
 *      created_at ASC 1..N and leaves settled rows NULL.
 *
 * GATED on FAAB_PRIORITY_PG_TEST_URL (a THROWAWAY DB — the suite wipes tables); skipped in normal
 * `pnpm test`. Set up the DB exactly as `release.integration.test.ts` documents (docker postgres:16 +
 * `prisma migrate deploy`), then:
 *   FAAB_PRIORITY_PG_TEST_URL="$URL" DATABASE_URL="$URL" DIRECT_URL="$URL" \
 *     pnpm vitest run packages/faab/src/claimPriority.integration.test.ts
 *
 * A DISTINCT env var (not FAAB_PG_TEST_URL / FAAB_CAP_PG_TEST_URL / FAAB_ELIM_PG_TEST_URL /
 * FAAB_RLS_PG_TEST_URL) is deliberate: every gated-PG suite gets its own var so exactly ONE
 * table-wiping suite activates per run. The SAFE guard additionally refuses to run unless
 * DATABASE_URL IS the throwaway test DB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import { createPrismaFaabBidStore } from "./prismaStore";

const TEST_URL = process.env.FAAB_PRIORITY_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const LEAGUE = "pr-league";
const MGR_A = "pr-mgr-a";
const MGR_B = "pr-mgr-b";
const P1 = "pr-player-1";
const P2 = "pr-player-2";
const P3 = "pr-player-3";

describe.skipIf(!SAFE)("faab_bid.priority — real Postgres (append / reorder / backfill)", () => {
  let db: PrismaClient;
  let store: ReturnType<typeof createPrismaFaabBidStore>;
  let bdl = 8000;
  const nextBdl = () => ++bdl;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
    store = createPrismaFaabBidStore(db);
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    await db.faabBid.deleteMany({});
    await db.faabBatch.deleteMany({});
    await db.player.deleteMany({});
    await db.manager.deleteMany({});
    await db.league.deleteMany({});

    await db.league.create({ data: { id: LEAGUE, name: "Priority League", status: "group" } });
    for (const id of [MGR_A, MGR_B]) {
      await db.manager.create({ data: { id, leagueId: LEAGUE, displayName: id, faabBudget: 100 } });
    }
    for (const id of [P1, P2, P3]) {
      await db.player.create({
        data: { id, balldontlieId: nextBdl(), displayName: id, position: "MID" },
      });
    }
  });

  async function seedBid(managerId: string, playerAddId: string) {
    const bid = await store.createBid({
      leagueId: LEAGUE,
      managerId,
      playerAddId,
      playerDropId: null,
      amount: 5,
      note: null,
      submittedAt: new Date("2026-06-10T06:00:00Z"),
    });
    return bid.bidId;
  }

  async function priorities(managerId: string): Promise<Record<string, number | null>> {
    const rows = await db.faabBid.findMany({
      where: { managerId },
      select: { id: true, priority: true },
    });
    return Object.fromEntries(rows.map((r) => [r.id, r.priority]));
  }

  it("createBid appends MAX+1 per manager; queues are independent; a cancel's gap is never re-filled", async () => {
    const a1 = await seedBid(MGR_A, P1);
    const a2 = await seedBid(MGR_A, P2);
    const b1 = await seedBid(MGR_B, P1); // B's queue starts at 1, independent of A's
    expect(await priorities(MGR_A)).toEqual({ [a1]: 1, [a2]: 2 });
    expect(await priorities(MGR_B)).toEqual({ [b1]: 1 });

    await store.cancelBid(a1); // leaves a gap at 1 …
    const a3 = await seedBid(MGR_A, P3); // … and the next append still goes to MAX+1 = 3
    expect(await priorities(MGR_A)).toEqual({ [a2]: 2, [a3]: 3 });
  });

  it("reorderPendingBids persists the permutation as contiguous 1..N and leaves other managers untouched", async () => {
    const a1 = await seedBid(MGR_A, P1);
    const a2 = await seedBid(MGR_A, P2);
    const a3 = await seedBid(MGR_A, P3);
    const b1 = await seedBid(MGR_B, P1);

    expect(await store.reorderPendingBids(MGR_A, [a3, a1, a2])).toBe(true);
    expect(await priorities(MGR_A)).toEqual({ [a3]: 1, [a1]: 2, [a2]: 3 });
    expect(await priorities(MGR_B)).toEqual({ [b1]: 1 });
  });

  it("refuses a stale / duplicated / foreign permutation with NOTHING written", async () => {
    const a1 = await seedBid(MGR_A, P1);
    const a2 = await seedBid(MGR_A, P2);
    const b1 = await seedBid(MGR_B, P1);

    expect(await store.reorderPendingBids(MGR_A, [a2])).toBe(false); // stale (missing a1)
    expect(await store.reorderPendingBids(MGR_A, [a2, a2])).toBe(false); // duplicate
    expect(await store.reorderPendingBids(MGR_A, [a2, b1])).toBe(false); // foreign bid smuggled in
    expect(await priorities(MGR_A)).toEqual({ [a1]: 1, [a2]: 2 }); // untouched
    expect(await priorities(MGR_B)).toEqual({ [b1]: 1 });
  });

  it("a SETTLED bid falls out of the pending set: reorder of the remaining pending rows succeeds without it", async () => {
    const a1 = await seedBid(MGR_A, P1);
    const a2 = await seedBid(MGR_A, P2);
    const a3 = await seedBid(MGR_A, P3);
    await db.faabBid.update({ where: { id: a1 }, data: { status: "lost" } });

    expect(await store.reorderPendingBids(MGR_A, [a1, a2, a3])).toBe(false); // settled id → stale
    expect(await store.reorderPendingBids(MGR_A, [a3, a2])).toBe(true);
    expect(await priorities(MGR_A)).toEqual({ [a1]: 1, [a3]: 1, [a2]: 2 }); // settled row untouched
  });

  it("the migration's backfill statement numbers PENDING rows per manager by created_at ASC, settled stay NULL", async () => {
    // Seed rows in the PRE-COLUMN shape (priority NULL), with created_at spelling the expected order.
    const mk = (id: string, managerId: string, createdAt: string, status: "pending" | "lost") =>
      db.faabBid.create({
        data: {
          id,
          leagueId: LEAGUE,
          managerId,
          playerAddId: P1,
          amount: 1,
          status,
          priority: null,
          createdAt: new Date(createdAt),
        },
      });
    await mk("bf-a-late", MGR_A, "2026-06-10T08:00:00Z", "pending");
    await mk("bf-a-early", MGR_A, "2026-06-10T06:00:00Z", "pending");
    await mk("bf-a-lost", MGR_A, "2026-06-10T05:00:00Z", "lost");
    await mk("bf-b-only", MGR_B, "2026-06-10T09:00:00Z", "pending");

    // Replay the migration's backfill UPDATE verbatim (20260708120000_faab_bid_priority).
    await db.$executeRawUnsafe(`
      UPDATE "faab_bid" b
      SET "priority" = r.rn
      FROM (
        SELECT "id", ROW_NUMBER() OVER (PARTITION BY "manager_id" ORDER BY "created_at" ASC, "id" ASC) AS rn
        FROM "faab_bid"
        WHERE "status" = 'pending'
      ) r
      WHERE b."id" = r."id"
    `);

    expect(await priorities(MGR_A)).toEqual({
      "bf-a-early": 1,
      "bf-a-late": 2,
      "bf-a-lost": null, // settled rows never numbered
    });
    expect(await priorities(MGR_B)).toEqual({ "bf-b-only": 1 });
  });
});
