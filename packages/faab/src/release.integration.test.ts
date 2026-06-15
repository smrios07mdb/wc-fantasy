/**
 * Real-Postgres integration suite for the drop-only release adapter (`createPrismaFaabReleaseStore`,
 * DECISIONS §D trim-down). The MemoryFaabReleaseStore cannot model the lock-on-play DELETE trigger nor the
 * `app.commish_override` GUC carve-out, so this drives the REAL Prisma store against a live database to pin:
 *   1. the manager path drops the roster row AND releases an UNLOCKED slot;
 *   2. the manager path FAILS LOUD (throws + rolls back) when a drop still holds a LOCKED slot — the
 *      stale-lock / TOCTOU guard (a played starter is never silently left on a dropped player);
 *   3. the commissioner `allowLocked` path releases a LOCKED slot via the GUC (the trigger exempts it);
 *   4. `loadReleaseContext` surfaces the roster, the locked set, the cap, and the D4 participant flag.
 *
 * GATED on FAAB_PG_TEST_URL (a THROWAWAY DB — the suite wipes tables); skipped in normal `pnpm test`. The
 * lock-on-play trigger lives in a RAW-SQL migration, so the DB must be set up with `migrate deploy` (NOT
 * `db push`, which skips raw migrations). To run it:
 *
 *   docker run -d --name wc-faab-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=faab_test -p 5467:5432 postgres:16
 *   export FAAB_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:5467/faab_test"
 *   DATABASE_URL="$FAAB_PG_TEST_URL" DIRECT_URL="$FAAB_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   pnpm vitest run packages/faab/src/release.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import { createPrismaFaabReleaseStore, ReleaseStaleLockError } from "./prismaStore";

const TEST_URL = process.env.FAAB_PG_TEST_URL;

const LEAGUE = "rel-league";
const MGR = "rel-mgr";
const OTHER_MGR = "rel-mgr-2";
const PERIOD = "rel-period";
const TEAM = "rel-team";

describe.skipIf(!TEST_URL)("FAAB release adapter — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Wipe the small FK chain this suite owns, child-first. lineup_slot is TRUNCATEd (a statement-level op
  // that bypasses the per-row lock-on-play DELETE trigger) because a prior test deliberately leaves a
  // LOCKED slot intact (the fail-loud rollback), which a plain deleteMany cannot remove.
  beforeEach(async () => {
    await db.$executeRawUnsafe("TRUNCATE TABLE lineup_slot");
    await db.rosterPlayer.deleteMany({});
    await db.playoffEntry.deleteMany({});
    await db.player.deleteMany({});
    await db.period.deleteMany({});
    await db.manager.deleteMany({});
    await db.fifaTeam.deleteMany({});
    await db.league.deleteMany({});

    await db.league.create({
      data: { id: LEAGUE, name: "Release Test League", status: "playoff" },
    });
    await db.manager.create({ data: { id: MGR, leagueId: LEAGUE, displayName: "Trimmer" } });
    await db.manager.create({ data: { id: OTHER_MGR, leagueId: LEAGUE, displayName: "Other" } });
    await db.period.create({
      data: { id: PERIOD, leagueId: LEAGUE, kind: "knockout_round", label: "R32", status: "open" },
    });
    await db.fifaTeam.create({ data: { id: TEAM, balldontlieId: 7001, name: "Test FC" } });
  });

  /** Seed a player + an ACTIVE roster row for MGR. */
  async function seedRosterPlayer(
    playerId: string,
    position: "GK" | "DEF" | "MID" | "FWD",
    bdl: number,
  ) {
    await db.player.create({
      data: { id: playerId, balldontlieId: bdl, displayName: playerId, position, teamId: TEAM },
    });
    await db.rosterPlayer.create({ data: { leagueId: LEAGUE, managerId: MGR, playerId } });
  }

  /** Seed a lineup slot (born unlocked, the trigger requires it); optionally lock it via a follow-up UPDATE. */
  async function seedSlot(
    playerId: string,
    position: "GK" | "DEF" | "MID" | "FWD",
    locked: boolean,
  ) {
    const slot = await db.lineupSlot.create({
      data: { managerId: MGR, periodId: PERIOD, playerId, role: position, isStarter: true },
    });
    if (locked)
      await db.lineupSlot.update({ where: { id: slot.id }, data: { lockedAt: new Date() } });
    return slot.id;
  }

  const active = (playerId: string) =>
    db.rosterPlayer.findFirst({ where: { managerId: MGR, playerId, droppedAt: null } });
  const slotExists = (playerId: string) =>
    db.lineupSlot.findFirst({ where: { managerId: MGR, periodId: PERIOD, playerId } });

  it("manager path: drops the roster row and releases an unlocked slot", async () => {
    await seedRosterPlayer("p-unlocked", "MID", 8001);
    await seedSlot("p-unlocked", "MID", false);
    const store = createPrismaFaabReleaseStore(db);

    const out = await store.releaseRoster(MGR, ["p-unlocked"], {
      now: new Date(),
      periodId: PERIOD,
      allowLocked: false,
    });

    expect(out.releasedSlots).toBe(1);
    expect(await active("p-unlocked")).toBeNull(); // dropped_at set
    expect(await slotExists("p-unlocked")).toBeNull(); // slot released
  });

  it("manager path: FAILS LOUD and rolls back when a drop still holds a locked slot", async () => {
    await seedRosterPlayer("p-locked", "FWD", 8002);
    await seedSlot("p-locked", "FWD", true); // locked → releaseDroppedPlayerSlots won't touch it
    const store = createPrismaFaabReleaseStore(db);

    await expect(
      store.releaseRoster(MGR, ["p-locked"], {
        now: new Date(),
        periodId: PERIOD,
        allowLocked: false,
      }),
    ).rejects.toBeInstanceOf(ReleaseStaleLockError);

    // The whole transaction rolled back: the player is still owned and the locked slot is intact.
    expect(await active("p-locked")).not.toBeNull();
    expect(await slotExists("p-locked")).not.toBeNull();
  });

  it("commissioner path (allowLocked): releases a locked slot via the GUC", async () => {
    await seedRosterPlayer("p-locked-2", "DEF", 8003);
    await seedSlot("p-locked-2", "DEF", true);
    const store = createPrismaFaabReleaseStore(db);

    const out = await store.releaseRoster(MGR, ["p-locked-2"], {
      now: new Date(),
      periodId: PERIOD,
      allowLocked: true,
    });

    expect(out.releasedSlots).toBe(1);
    expect(await active("p-locked-2")).toBeNull();
    expect(await slotExists("p-locked-2")).toBeNull(); // the locked slot was released under the GUC
  });

  it("loadReleaseContext surfaces roster, locked set, cap, and the alive participant flag", async () => {
    await seedRosterPlayer("c-gk", "GK", 8101);
    await seedRosterPlayer("c-def", "DEF", 8102);
    await seedSlot("c-def", "DEF", true); // c-def is locked-by-play
    await db.playoffEntry.create({
      data: { leagueId: LEAGUE, managerId: MGR, seed: 1, status: "alive" },
    });
    const store = createPrismaFaabReleaseStore(db);

    const ctx = await store.loadReleaseContext(MGR);
    expect(ctx).not.toBeNull();
    expect(ctx!.rosterCap).toBe(9);
    expect(ctx!.isPlayoffPhase).toBe(true);
    expect(ctx!.isPlayoffParticipant).toBe(true);
    expect(ctx!.roster.map((p) => p.playerId).sort()).toEqual(["c-def", "c-gk"]);
    expect([...ctx!.lockedPlayerIds]).toEqual(["c-def"]);
    expect(ctx!.currentPeriodId).toBe(PERIOD);
  });

  it("loadReleaseContext marks an eliminated manager as a non-participant", async () => {
    await seedRosterPlayer("e-gk", "GK", 8201);
    await db.playoffEntry.create({
      data: { leagueId: LEAGUE, managerId: MGR, seed: 9, status: "eliminated" },
    });
    const store = createPrismaFaabReleaseStore(db);

    const ctx = await store.loadReleaseContext(MGR);
    expect(ctx!.isPlayoffParticipant).toBe(false);
  });
});
