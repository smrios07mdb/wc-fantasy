/**
 * Gated Postgres proof for the Thread-3a SAFE repair surface — the handlers driving the REAL Prisma
 * stores (`createCommishRepairStore` / `createCommishRestate`) against a live database with the
 * lock-on-play trigger ARMED. The memory doubles cannot model the DB latch (`enforce_lineup_lock()`)
 * nor the `app.commish_override` GUC carve-out, so this suite pins THE DECISIVE 3a INVARIANT:
 *
 *   Across every 3a path the GUC is NEVER set — proven via a BYSTANDER locked slot on the same
 *   manager that must remain immovable throughout each repair (a real DELETE/UPDATE of it would only
 *   succeed under the GUC), plus a trigger-armed canary (a raw DELETE of the locked slot without the
 *   GUC must be rejected by the trigger in this very database).
 *
 * Also pinned here (B5 gated-PG spine):
 *   • roster add writes `roster_player` + exactly ONE `commish_audit` row (`roster_repair`); an
 *     idempotent re-run SKIPS (no duplicate audit row);
 *   • roster add/drop releases the drop's UNLOCKED slot; ONE audit row;
 *   • trim of unlocked over-cap players releases them; ONE audit row (detail marks trim);
 *   • lineup edit (`allowLockedSlot:false`) saves an XI into a CLOSED period via `relaxPeriodLock`,
 *     the restate re-sums membership into `score_manager_period`; ONE audit row;
 *   • NEGATIVE GUARD: a locked-player drop/move on the 3a path REFUSES (409-class), sets NO GUC,
 *     writes NO mutation (rollback-verified).
 *
 * GATED on COMMISH_REPAIR_PG_TEST_URL — a THROWAWAY DB, DISTINCT from the other wipe-suite URLs
 * (COMMISH_WRITE_PG_TEST_URL / COMMISH_AUDIT_PG_TEST_URL / FAAB_PG_TEST_URL / FAAB_CAP_PG_TEST_URL) so
 * no two wipe-suites ever co-run. The SAFE guard (DATABASE_URL === COMMISH_REPAIR_PG_TEST_URL) refuses
 * any DB that is not the explicitly named throwaway. Set up with `prisma migrate deploy` (NOT `db push`
 * — the trigger lives in raw-SQL migrations). To run:
 *
 *   docker run -d --name wc-commish-repair-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=commish_repair_test -p 55446:5432 postgres:16
 *   export COMMISH_REPAIR_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:55446/commish_repair_test"
 *   DATABASE_URL="$COMMISH_REPAIR_PG_TEST_URL" DIRECT_URL="$COMMISH_REPAIR_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   DATABASE_URL="$COMMISH_REPAIR_PG_TEST_URL" \
 *     pnpm --filter @app/web exec vitest run src/commish/commishRepair.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import type { SessionManagerOutcome } from "@app/auth";
import { handleCommishRosterRepair, handleCommishLineupRepair } from "./handleRosterRepair";
import { createCommishRepairStore, createCommishRestate } from "./commishRepairStore";

const TEST_URL = process.env.COMMISH_REPAIR_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const USER = "00000000-0000-0000-0000-0000000000c3";
const LG = "lg_repair";
const COMMISH_MGR = "mgr_commish";
const MGR = "mgr_target";
const TEAM = "team_repair";
const MD1 = "period_md1";

const OUTCOME: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: COMMISH_MGR,
    userId: USER,
    email: "smrios07@gmail.com",
    isCommissioner: true,
    displayName: "Commish",
  },
  isCommissioner: true,
};

const SQUAD: Array<[string, "GK" | "DEF" | "MID" | "FWD"]> = [
  ["gk1", "GK"],
  ["gk2", "GK"],
  ["d1", "DEF"],
  ["d2", "DEF"],
  ["d3", "DEF"],
  ["d4", "DEF"],
  ["d5", "DEF"],
  ["mm1", "MID"],
  ["mm2", "MID"],
  ["mm3", "MID"],
  ["mm4", "MID"],
  ["mm5", "MID"],
  ["f1", "FWD"],
  ["f2", "FWD"],
  ["f3", "FWD"],
];
const LEGAL_XI = ["gk1", "d1", "d2", "d3", "mm1", "mm2", "mm3", "mm4", "f1", "f2", "f3"];
// d1 stays a starter (the locked bystander is NOT moved); d5 in for d2 — a legal same-shape swap.
const KEEP_LOCKED_XI = ["gk1", "d1", "d5", "d3", "mm1", "mm2", "mm3", "mm4", "f1", "f2", "f3"];
// benches the LOCKED d1 — the 3a path must refuse this cleanly.
const MOVE_LOCKED_XI = ["gk1", "d4", "d2", "d3", "mm1", "mm2", "mm3", "mm4", "f1", "f2", "f3"];

describe.skipIf(!SAFE)("Thread-3a repair surface — real Postgres (GUC-free)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    // Child-first wipe. lineup_slot is TRUNCATEd — a locked row survives deleteMany (the trigger).
    await db.$executeRawUnsafe("TRUNCATE TABLE lineup_slot CASCADE");
    await db.commishAudit.deleteMany({});
    await db.scoreManagerPeriod.deleteMany({});
    await db.standing.deleteMany({});
    await db.recomputeDirty.deleteMany({});
    await db.rosterPlayer.deleteMany({});
    await db.playoffEntry.deleteMany({});
    await db.fifaMatch.deleteMany({});
    await db.player.deleteMany({});
    await db.period.deleteMany({});
    await db.manager.deleteMany({});
    await db.appUser.deleteMany({});
    await db.fifaTeam.deleteMany({});
    await db.league.deleteMany({});

    await db.league.create({ data: { id: LG, name: "Repair Test League", status: "group" } });
    await db.appUser.create({ data: { id: USER, email: "smrios07@gmail.com" } });
    await db.manager.create({
      data: {
        id: COMMISH_MGR,
        leagueId: LG,
        displayName: "Commish",
        userId: USER,
        isCommissioner: true,
      },
    });
    await db.manager.create({ data: { id: MGR, leagueId: LG, displayName: "Repairee" } });
    await db.fifaTeam.create({ data: { id: TEAM, balldontlieId: 9001, name: "Repair FC" } });
    // MD1: batch already cleared (FA phase), edit window CLOSED — the repair target period.
    await db.period.create({
      data: {
        id: MD1,
        leagueId: LG,
        kind: "group_md",
        label: "MD1",
        status: "closed",
        closesAt: new Date("2026-06-10T00:00:00Z"),
        batchClearedAt: new Date("2026-06-09T00:00:00Z"),
      },
    });
  });

  let bdl = 100;
  async function seedPlayer(id: string, position: "GK" | "DEF" | "MID" | "FWD") {
    await db.player.create({
      data: { id, balldontlieId: ++bdl, displayName: `Name ${id}`, position, teamId: TEAM },
    });
  }
  async function seedSquadWithSlots(opts: { lockD1?: boolean } = {}) {
    for (const [id, pos] of SQUAD) {
      await seedPlayer(id, pos);
      await db.rosterPlayer.create({ data: { leagueId: LG, managerId: MGR, playerId: id } });
    }
    for (const [id, pos] of SQUAD) {
      const slot = await db.lineupSlot.create({
        data: {
          managerId: MGR,
          periodId: MD1,
          playerId: id,
          role: pos,
          isStarter: LEGAL_XI.includes(id),
        },
      });
      if (opts.lockD1 && id === "d1") {
        await db.lineupSlot.update({ where: { id: slot.id }, data: { lockedAt: new Date() } });
      }
    }
  }
  /** An OPEN knockout period (R32) with d1 LOCKED by play in it — the live lock the trim path must
   *  respect (a lock in a CLOSED period is historical and legitimately droppable). */
  const R32 = "period_r32";
  async function seedOpenR32WithLockedD1() {
    await db.period.create({
      data: { id: R32, leagueId: LG, kind: "knockout_round", label: "R32", status: "open" },
    });
    const slot = await db.lineupSlot.create({
      data: { managerId: MGR, periodId: R32, playerId: "d1", role: "DEF", isStarter: true },
    });
    await db.lineupSlot.update({ where: { id: slot.id }, data: { lockedAt: new Date() } });
    return slot.id;
  }
  /** A future fixture in MD1 so the pinned kickoff guard reads "not yet kicked off". */
  async function seedFutureMatch() {
    await db.fifaMatch.create({
      data: {
        id: "match_future",
        balldontlieId: 7777,
        homeTeamId: TEAM,
        awayTeamId: TEAM,
        kickoffAt: new Date(Date.now() + 24 * 3600 * 1000),
        status: "scheduled",
        periodId: MD1,
      },
    });
  }

  function deps() {
    return {
      resolveManager: async () => OUTCOME,
      now: () => new Date(),
      store: createCommishRepairStore(db),
      restate: createCommishRestate(db),
    };
  }

  const auditRows = () => db.commishAudit.findMany({ orderBy: { createdAt: "asc" } });
  const activeRoster = (playerId: string) =>
    db.rosterPlayer.findFirst({ where: { managerId: MGR, playerId, droppedAt: null } });
  const slotOf = (playerId: string) =>
    db.lineupSlot.findFirst({ where: { managerId: MGR, periodId: MD1, playerId } });

  it("roster add: roster_player + exactly ONE roster_repair audit row; idempotent re-run skips (no duplicate)", async () => {
    await seedSquadWithSlots();
    await seedPlayer("newguy", "MID");
    await seedFutureMatch();

    const body = {
      kind: "add" as const,
      managerId: MGR,
      addPlayerId: "newguy",
      dropPlayerId: "mm5",
      periodId: MD1,
      reason: "honoring a pre-kickoff swap the FA UI blocked",
      apply: true,
    };
    const r1 = await handleCommishRosterRepair(deps(), body);
    expect(r1.status).toBe(200);
    expect((r1.body as { status: string }).status).toBe("applied");

    expect(await activeRoster("newguy")).not.toBeNull();
    expect(await activeRoster("mm5")).toBeNull(); // dropped
    expect(await slotOf("mm5")).toBeNull(); // his UNLOCKED slot was released

    const rows1 = await auditRows();
    expect(rows1).toHaveLength(1);
    expect(rows1[0]!.actionType).toBe("roster_repair");
    expect(rows1[0]!.targetRef).toEqual({ managerId: MGR });
    expect(rows1[0]!.reversible).toBe(true);

    // idempotent re-run: end state holds → skipped, STILL exactly one audit row
    const r2 = await handleCommishRosterRepair(deps(), body);
    expect(r2.status).toBe(200);
    expect((r2.body as { status: string }).status).toBe("skipped");
    expect(await auditRows()).toHaveLength(1);
  });

  it("restate lands: the lineup repair re-sums membership into score_manager_period (allowFrozen path)", async () => {
    await seedSquadWithSlots();
    // freeze the period — the 3a restate must go through the commissioner allowFrozen override
    await db.period.update({ where: { id: MD1 }, data: { frozenAt: new Date() } });

    const r = await handleCommishLineupRepair(deps(), {
      managerId: MGR,
      periodId: MD1,
      starterIds: KEEP_LOCKED_XI,
      reason: "lineup lock hit before they could save",
      apply: true,
    });
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.status).toBe("applied");
    expect(body.restatePending).toBeUndefined();

    // the XI persisted through the CLOSED window (relaxPeriodLock) and the restate wrote the rollup
    const starters = await db.lineupSlot.findMany({
      where: { managerId: MGR, periodId: MD1, isStarter: true },
      select: { playerId: true },
    });
    expect(starters.map((s) => s.playerId).sort()).toEqual([...KEEP_LOCKED_XI].sort());
    const rollup = await db.scoreManagerPeriod.findFirst({
      where: { managerId: MGR, periodId: MD1 },
    });
    expect(rollup).not.toBeNull(); // re-summed (0 pts — no score rows — but PRESENT)

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actionType).toBe("lineup_repair");
    expect(rows[0]!.targetRef).toEqual({ managerId: MGR, periodId: MD1 });
  });

  it("THE DECISIVE 3a INVARIANT — GUC-free: a locked bystander slot is immovable through a 3a lineup repair", async () => {
    await seedSquadWithSlots({ lockD1: true });
    const before = await slotOf("d1");
    expect(before!.lockedAt).not.toBeNull();

    // Canary: the trigger is ARMED in this DB — a raw DELETE of the locked slot WITHOUT the GUC throws.
    await expect(
      db.$executeRawUnsafe(`DELETE FROM lineup_slot WHERE id = '${before!.id}'`),
    ).rejects.toThrow();

    // The 3a repair keeps d1 a starter (does not move him) — it must succeed WITHOUT the GUC, leaving
    // the locked row byte-untouched (same id, same locked_at, same is_starter).
    const r = await handleCommishLineupRepair(deps(), {
      managerId: MGR,
      periodId: MD1,
      starterIds: KEEP_LOCKED_XI,
      reason: "swap d2 out for d5; the locked d1 stays put",
      apply: true,
    });
    expect(r.status).toBe(200);
    expect((r.body as { status: string }).status).toBe("applied");

    const after = await slotOf("d1");
    expect(after!.id).toBe(before!.id);
    expect(after!.isStarter).toBe(true);
    expect(after!.lockedAt?.getTime()).toBe(before!.lockedAt?.getTime());
  });

  it("NEGATIVE GUARD — lineup: benching the DB-LOCKED starter hits the store latch → 409 conflict, zero writes, no audit", async () => {
    await seedSquadWithSlots({ lockD1: true });

    // d1 carries `locked_at` but no score row: the pure validator (hasPlayed keys on score_player_match)
    // passes, so THIS refusal is the store's own latch re-check — the server-authoritative lock the GUC
    // would bypass. The 3a path must surface it as a clean conflict and write NOTHING.
    const r = await handleCommishLineupRepair(deps(), {
      managerId: MGR,
      periodId: MD1,
      starterIds: MOVE_LOCKED_XI,
      reason: "attempt to bench a played player",
      apply: true,
    });
    expect(r.status).toBe(409);
    const body = r.body as { error: string; message: string };
    expect(body.error).toBe("conflict");
    expect(body.message).toMatch(/deferred|dangerous|CLI/i);

    // ZERO writes: the XI is unchanged, the locked slot intact, no audit row, no rollup restate.
    const starters = await db.lineupSlot.findMany({
      where: { managerId: MGR, periodId: MD1, isStarter: true },
      select: { playerId: true },
    });
    expect(starters.map((s) => s.playerId).sort()).toEqual([...LEGAL_XI].sort());
    expect((await slotOf("d1"))!.lockedAt).not.toBeNull();
    expect(await auditRows()).toHaveLength(0);
    expect(await db.scoreManagerPeriod.count()).toBe(0);
  });

  it("NEGATIVE GUARD — trim: a LIVE-locked player in the drop set refuses, sets NO GUC, writes NO mutation", async () => {
    // playoff-phase fixture: alive entries flip the phase; d1 is locked by play in the OPEN R32 period.
    await seedSquadWithSlots();
    const lockedSlotId = await seedOpenR32WithLockedD1();
    await db.league.update({ where: { id: LG }, data: { status: "playoff" } });
    await db.playoffEntry.create({
      data: { leagueId: LG, managerId: MGR, seed: 1, status: "alive" },
    });

    const r = await handleCommishRosterRepair(deps(), {
      kind: "trim",
      managerId: MGR,
      dropPlayerIds: ["d1", "f3"], // d1 is LOCKED by play in the open R32
      reason: "force-trim including a played player",
      apply: true,
    });
    expect(r.status).toBe(409);
    expect((r.body as { error: string }).error).toBe("repair_refused");
    expect((r.body as { message: string }).message).toContain("release-locked");
    expect((r.body as { message: string }).message).toMatch(/deferred|dangerous|CLI/i);

    // NOTHING happened: both players still actively owned, the locked slot intact, no audit.
    expect(await activeRoster("d1")).not.toBeNull();
    expect(await activeRoster("f3")).not.toBeNull();
    expect(await db.lineupSlot.findUnique({ where: { id: lockedSlotId } })).not.toBeNull();
    expect(await auditRows()).toHaveLength(0);
  });

  it("trim of UNLOCKED over-cap players releases them; the LIVE-locked bystander survives; ONE audit row marked trim", async () => {
    await seedSquadWithSlots(); // 15 owned, cap 9
    const lockedSlotId = await seedOpenR32WithLockedD1(); // d1 locked in R32 but NOT in the drop set
    await db.league.update({ where: { id: LG }, data: { status: "playoff" } });
    await db.playoffEntry.create({
      data: { leagueId: LG, managerId: MGR, seed: 1, status: "alive" },
    });

    const r = await handleCommishRosterRepair(deps(), {
      kind: "trim",
      managerId: MGR,
      dropPlayerIds: ["gk2", "d5", "mm5", "f3", "d4", "mm4"], // 15 → 9, all unlocked
      reason: "cutting to the playoff cap",
      apply: true,
    });
    expect(r.status).toBe(200);
    expect((r.body as { status: string }).status).toBe("applied");

    expect(await activeRoster("gk2")).toBeNull();
    expect(await activeRoster("f3")).toBeNull();
    expect(await activeRoster("d1")).not.toBeNull(); // the locked bystander is untouched
    expect(await db.lineupSlot.findUnique({ where: { id: lockedSlotId } })).not.toBeNull();

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actionType).toBe("roster_repair");
    expect(rows[0]!.detail).toContain("trim");
  });
});
