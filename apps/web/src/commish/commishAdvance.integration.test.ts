/**
 * Gated Postgres proof for the Thread-5 round-cut surface — `handleAdvance` driving the REAL web store
 * (`createCommishAdvanceStore`, whose reads are the relocated commish-core adapter VERBATIM) against a
 * live database. Pins, per the thread spec:
 *
 *   • APPLY flips exactly `cut_count` playoff_entry rows (`alive → eliminated`, round + instant stamped)
 *     plus exactly ONE `round_advance` commish_audit row (reversible:false) — atomically;
 *   • ATOMICITY: a failing audit insert (FK-violating leagueId) rolls the entry flips back — no
 *     unaudited cut can exist;
 *   • a SECOND apply → 409 `skipped` with ZERO new audit rows (the conditional alive-claim no-op);
 *   • a residual boundary tie: apply without breakTie → 409 `needs-commissioner` (nothing written),
 *     then apply WITH breakTie resolves end-to-end (adjudication recorded in the audit detail);
 *   • the Final round produces the champion (`alive → champion`) and the audit names them;
 *   • a DRY-RUN (apply:false) writes nothing — no entry flip, no audit row.
 *
 * GATED on COMMISH_ADVANCE_PG_TEST_URL — a THROWAWAY DB, DISTINCT from the other wipe-suite URLs
 * (COMMISH_FREEZE_PG_TEST_URL / COMMISH_REPAIR_PG_TEST_URL / COMMISH_WRITE_PG_TEST_URL /
 * COMMISH_AUDIT_PG_TEST_URL / PLAYOFF_PG_TEST_URL / FAAB_PG_TEST_URL / FAAB_CAP_PG_TEST_URL) so no two
 * wipe-suites ever co-run. The SAFE guard (DATABASE_URL === COMMISH_ADVANCE_PG_TEST_URL) refuses any DB
 * that is not the explicitly named throwaway. Set up with `prisma migrate deploy`. To run:
 *
 *   docker run -d --name wc-commish-advance-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=commish_advance_test -p 55448:5432 postgres:16
 *   export COMMISH_ADVANCE_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:55448/commish_advance_test"
 *   DATABASE_URL="$COMMISH_ADVANCE_PG_TEST_URL" DIRECT_URL="$COMMISH_ADVANCE_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   DATABASE_URL="$COMMISH_ADVANCE_PG_TEST_URL" \
 *     pnpm --filter @app/web exec vitest run src/commish/commishAdvance.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import type { SessionManagerOutcome } from "@app/auth";
import { handleAdvance } from "./handleAdvance";
import { createCommishAdvanceStore } from "./commishAdvanceStore";

const TEST_URL = process.env.COMMISH_ADVANCE_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const USER = "00000000-0000-0000-0000-0000000000c5";
const LG = "lg_advance";
const COMMISH_MGR = "mgr_adv_commish";
const FIELD = [
  { id: "mgr_adv_1", name: "Alpha FC", seed: 1 },
  { id: "mgr_adv_2", name: "Bravo XI", seed: 2 },
  { id: "mgr_adv_3", name: "Charlie United", seed: 3 },
  { id: "mgr_adv_4", name: "Delta Town", seed: 4 },
] as const;
const R32 = "period_adv_r32";
const FINAL = "period_adv_final";

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

describe.skipIf(!SAFE)("Thread-5 round-cut surface — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    await db.$executeRawUnsafe("TRUNCATE TABLE lineup_slot CASCADE");
    await db.commishAudit.deleteMany({});
    await db.playoffEntry.deleteMany({});
    await db.scoreManagerPeriod.deleteMany({});
    await db.standing.deleteMany({});
    await db.recomputeDirty.deleteMany({});
    await db.rosterPlayer.deleteMany({});
    await db.fifaMatch.deleteMany({});
    await db.player.deleteMany({});
    await db.period.deleteMany({});
    await db.manager.deleteMany({});
    await db.appUser.deleteMany({});
    await db.fifaTeam.deleteMany({});
    await db.league.deleteMany({});

    await db.league.create({ data: { id: LG, name: "Advance Test League", status: "playoff" } });
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
    for (const m of FIELD) {
      await db.manager.create({ data: { id: m.id, leagueId: LG, displayName: m.name } });
    }
    // R32: frozen, cut 2 — the canonical cuttable round (no prior rounds to order-guard).
    await db.period.create({
      data: {
        id: R32,
        leagueId: LG,
        kind: "knockout_round",
        label: "R32",
        status: "closed",
        cutCount: 2,
        frozenAt: new Date("2026-07-09T22:00:00Z"),
      },
    });
  });

  function webDeps() {
    return {
      resolveManager: async () => OUTCOME,
      now: () => new Date(),
      store: createCommishAdvanceStore(db),
    };
  }

  async function seedField(entries: { id: string; seed: number }[] = [...FIELD]) {
    for (const e of entries) {
      await db.playoffEntry.create({
        data: { leagueId: LG, managerId: e.id, seed: e.seed, status: "alive" },
      });
    }
  }

  async function seedScores(periodId: string, points: Record<string, number>) {
    for (const [managerId, pts] of Object.entries(points)) {
      await db.scoreManagerPeriod.create({ data: { managerId, periodId, points: pts } });
    }
  }

  /** Clean gaps: mgr_adv_1(1) mgr_adv_2(2) cut · mgr_adv_3(5) mgr_adv_4(9) survive. */
  async function seedDeterminedR32() {
    await seedField();
    await seedScores(R32, { mgr_adv_1: 1, mgr_adv_2: 2, mgr_adv_3: 5, mgr_adv_4: 9 });
  }

  it("APPLY flips exactly cut_count entries + ONE round_advance audit row", async () => {
    await seedDeterminedR32();

    const res = await handleAdvance(webDeps(), {
      roundLabel: "R32",
      reason: "R32 frozen — applying the scheduled cut",
      breakTie: null,
      apply: true,
    });
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("applied");

    const entries = await db.playoffEntry.findMany({ orderBy: { managerId: "asc" } });
    const byId = new Map(entries.map((e) => [e.managerId, e]));
    expect(byId.get("mgr_adv_1")).toMatchObject({ status: "eliminated", eliminatedRound: "R32" });
    expect(byId.get("mgr_adv_2")).toMatchObject({ status: "eliminated", eliminatedRound: "R32" });
    expect(byId.get("mgr_adv_1")!.eliminatedAt).not.toBeNull();
    expect(byId.get("mgr_adv_3")).toMatchObject({ status: "alive", eliminatedRound: null });
    expect(byId.get("mgr_adv_4")).toMatchObject({ status: "alive", eliminatedRound: null });

    const audits = await db.commishAudit.findMany({});
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actionType: "round_advance",
      leagueId: LG,
      actorUserId: USER,
      reversible: false,
      reason: "R32 frozen — applying the scheduled cut",
    });
    expect(audits[0]!.summary).toContain("Alpha FC");
    expect(audits[0]!.summary).toContain("Bravo XI");
    expect(audits[0]!.targetRef).toMatchObject({
      roundLabel: "R32",
      eliminated: ["mgr_adv_1", "mgr_adv_2"],
      champion: null,
    });
  });

  it("a SECOND apply → 409 skipped with ZERO new audit rows", async () => {
    await seedDeterminedR32();
    const deps = webDeps();

    const first = await handleAdvance(deps, {
      roundLabel: "R32",
      reason: "first",
      breakTie: null,
      apply: true,
    });
    expect(first.status).toBe(200);

    const second = await handleAdvance(deps, {
      roundLabel: "R32",
      reason: "second — should no-op",
      breakTie: null,
      apply: true,
    });
    expect(second.status).toBe(409);
    expect((second.body as { status: string }).status).toBe("skipped");

    expect(await db.commishAudit.count()).toBe(1);
    expect(await db.playoffEntry.count({ where: { status: "eliminated" } })).toBe(2);
  });

  it("ATOMICITY: a failing audit insert (FK-violating leagueId) rolls the entry flips back", async () => {
    await seedDeterminedR32();
    const store = createCommishAdvanceStore(db);
    const { store: advStore } = store.forAdvance(() => ({
      leagueId: "lg_does_not_exist", // FK violation on commish_audit.league_id
      actorUserId: USER,
      actionType: "round_advance",
      summary: "will roll back",
      reason: "atomicity proof",
      reversible: false,
    }));

    await expect(
      advStore.applyRoundCut({
        leagueId: LG,
        roundLabel: "R32",
        eliminated: ["mgr_adv_1", "mgr_adv_2"],
        champion: null,
        at: new Date(),
      }),
    ).rejects.toThrow();

    // The flips did NOT survive the failed audit insert — no unaudited cut exists.
    expect(await db.playoffEntry.count({ where: { status: "eliminated" } })).toBe(0);
    expect(await db.playoffEntry.count({ where: { status: "alive" } })).toBe(4);
    expect(await db.commishAudit.count()).toBe(0);
  });

  it("boundary tie: apply → 409 needs-commissioner (nothing written), then breakTie resolves end-to-end", async () => {
    await seedField();
    // mgr_adv_1(1) cut outright; mgr_adv_2(2) and mgr_adv_3(2) tie for the last slot with equal
    // cumulative totals (one period ⇒ cumulative == round points).
    await seedScores(R32, { mgr_adv_1: 1, mgr_adv_2: 2, mgr_adv_3: 2, mgr_adv_4: 9 });
    const deps = webDeps();

    const tied = await handleAdvance(deps, {
      roundLabel: "R32",
      reason: "cut",
      breakTie: null,
      apply: true,
    });
    expect(tied.status).toBe(409);
    const tiedBody = tied.body as {
      status: string;
      plan: { resolution: { kind: string; tied: string[]; cutsRemaining: number } };
    };
    expect(tiedBody.status).toBe("needs-commissioner");
    expect(tiedBody.plan.resolution.tied.sort()).toEqual(["mgr_adv_2", "mgr_adv_3"]);
    expect(tiedBody.plan.resolution.cutsRemaining).toBe(1);
    expect(await db.playoffEntry.count({ where: { status: "eliminated" } })).toBe(0);
    expect(await db.commishAudit.count()).toBe(0);

    const resolved = await handleAdvance(deps, {
      roundLabel: "R32",
      reason: "tie adjudicated — cutting Bravo XI",
      breakTie: ["mgr_adv_2"],
      apply: true,
    });
    expect(resolved.status).toBe(200);
    expect((resolved.body as { status: string }).status).toBe("applied");

    const byId = new Map(
      (await db.playoffEntry.findMany({})).map((e) => [e.managerId, e.status] as const),
    );
    expect(byId.get("mgr_adv_1")).toBe("eliminated");
    expect(byId.get("mgr_adv_2")).toBe("eliminated");
    expect(byId.get("mgr_adv_3")).toBe("alive");
    expect(byId.get("mgr_adv_4")).toBe("alive");

    const audits = await db.commishAudit.findMany({});
    expect(audits).toHaveLength(1);
    expect(audits[0]!.detail).toContain("tie adjudicated by the commissioner");
  });

  it("the Final round produces the champion, named in the audit", async () => {
    // Two alive finalists; every earlier round already stamped (the ordering guard reads the marks).
    await seedField([
      { id: "mgr_adv_1", seed: 1 },
      { id: "mgr_adv_2", seed: 2 },
    ]);
    const priors: [string, string][] = [
      ["mgr_adv_3", "R32"],
      ["mgr_adv_4", "R16"],
    ];
    for (const [mgrId, round] of priors) {
      await db.playoffEntry.create({
        data: {
          leagueId: LG,
          managerId: mgrId,
          seed: 9,
          status: "eliminated",
          eliminatedRound: round,
          eliminatedAt: new Date("2026-07-01T00:00:00Z"),
        },
      });
    }
    // QF + SF marks need managers too — reuse extra rows via new managers.
    await db.manager.create({ data: { id: "mgr_adv_5", leagueId: LG, displayName: "Echo City" } });
    await db.manager.create({ data: { id: "mgr_adv_6", leagueId: LG, displayName: "Foxtrot" } });
    for (const [mgrId, round] of [
      ["mgr_adv_5", "QF"],
      ["mgr_adv_6", "SF"],
    ] as const) {
      await db.playoffEntry.create({
        data: {
          leagueId: LG,
          managerId: mgrId,
          seed: 9,
          status: "eliminated",
          eliminatedRound: round,
          eliminatedAt: new Date("2026-07-01T00:00:00Z"),
        },
      });
    }
    await db.period.create({
      data: {
        id: FINAL,
        leagueId: LG,
        kind: "knockout_round",
        label: "Final",
        status: "closed",
        cutCount: 1,
        frozenAt: new Date("2026-07-18T22:00:00Z"),
      },
    });
    await seedScores(FINAL, { mgr_adv_1: 3, mgr_adv_2: 9 });

    const res = await handleAdvance(webDeps(), {
      roundLabel: "Final",
      reason: "crowning the champion",
      breakTie: null,
      apply: true,
    });
    expect(res.status).toBe(200);

    const byId = new Map(
      (await db.playoffEntry.findMany({})).map((e) => [e.managerId, e.status] as const),
    );
    expect(byId.get("mgr_adv_1")).toBe("eliminated");
    expect(byId.get("mgr_adv_2")).toBe("champion");

    const audits = await db.commishAudit.findMany({});
    expect(audits).toHaveLength(1);
    expect(audits[0]!.detail).toContain("Bravo XI is the champion");
    expect(audits[0]!.targetRef).toMatchObject({ champion: "mgr_adv_2" });
  });

  it("a DRY-RUN (apply:false) writes nothing — no entry flip, no audit row", async () => {
    await seedDeterminedR32();

    const res = await handleAdvance(webDeps(), {
      roundLabel: "R32",
      reason: "",
      breakTie: null,
      apply: false,
    });
    expect(res.status).toBe(200);
    const out = res.body as { status: string; plan: { resolution: { kind: string } } };
    expect(out.status).toBe("planned");
    expect(out.plan.resolution.kind).toBe("determined");

    expect(await db.playoffEntry.count({ where: { status: "eliminated" } })).toBe(0);
    expect(await db.commishAudit.count()).toBe(0);
  });
});
