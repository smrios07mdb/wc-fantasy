/**
 * Real-Postgres integration suite for the resident-tick WC TEAM-ELIMINATION derivation
 * ({@link dispatchTeamElimination}, feat/auto-team-elimination). The FREEZE-GATED read and the guarded,
 * set-only, GLOBAL write of `fifa_team.eliminated` live ONLY in the Prisma adapter (the Memory double
 * re-implements them), so the real IO behavior can only be pinned against a live DB. This asserts, against
 * the REAL `prismaStore`:
 *
 *   1. FLAG — the loser of a FROZEN, completed knockout match (FT and pens deciders) is flagged
 *      `eliminated = true`; the winners stay alive.
 *   2. FREEZE GATE — the loser of a completed knockout match whose period is NOT yet frozen is left alive.
 *   3. KNOCKOUT-ONLY — a group-stage (`group_md`) loser is left alive, even with a frozen period.
 *   4. PERIOD-LESS — the loser of a `period_id = NULL` 3rd-place-style match is left alive (excluded by the
 *      knockout join).
 *   5. IDEMPOTENT — a second tick flags nothing new and never un-flags an already-eliminated team.
 *   6. GATE OPENS — once the unfrozen round is frozen, the next tick flags ITS loser (the self-healing tick).
 *
 * GATED on ELIM_DERIVE_PG_TEST_URL (a THROWAWAY DB — the suite wipes tables); skipped in normal `pnpm test`.
 * A DISTINCT env var (its own, not shared with the faab/autofire suites) is deliberate so exactly ONE
 * table-wiping suite activates per run; the SAFE guard additionally refuses to run unless DATABASE_URL IS
 * the throwaway test DB. Set up the DB like the other gated suites (docker postgres:16 + `prisma migrate
 * deploy`), then:
 *   ELIM_DERIVE_PG_TEST_URL="$URL" DATABASE_URL="$URL" DIRECT_URL="$URL" \
 *     pnpm exec vitest run apps/worker/src/elimination/dispatch.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import { dispatchTeamElimination } from "./dispatch";
import { createPrismaTeamEliminationStore } from "./prismaStore";

const TEST_URL = process.env.ELIM_DERIVE_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const LEAGUE = "elim-league";
const R32 = "elim-r32"; // knockout, FROZEN
const R16 = "elim-r16"; // knockout, NOT frozen
const GRP = "elim-grp"; // group_md, frozen (must still be ignored)
const FROZEN = new Date("2026-07-03T12:00:00.000Z");

// Teams: two frozen-R32 losers (a FT decider + a pens decider), their winners, an unfrozen-R16 pair, a
// group pair, and a period-less 3rd-place pair.
const W_FT = "elim-win-ft";
const L_FT = "elim-lose-ft";
const W_PK = "elim-win-pk";
const L_PK = "elim-lose-pk";
const U_WIN = "elim-u-win";
const U_LOSE = "elim-u-lose";
const G_WIN = "elim-g-win";
const G_LOSE = "elim-g-lose";
const TP_WIN = "elim-tp-win";
const TP_LOSE = "elim-tp-lose";

const ALL_TEAMS = [W_FT, L_FT, W_PK, L_PK, U_WIN, U_LOSE, G_WIN, G_LOSE, TP_WIN, TP_LOSE];

describe.skipIf(!SAFE)("team elimination — real Postgres", () => {
  let db: PrismaClient;
  let bdl = 9000;
  const nextBdl = () => ++bdl;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Dedicated throwaway DB: wipe the entities this suite owns, child-first (matches → periods/teams; a
  // leftover player would SetNull on team delete, never block).
  beforeEach(async () => {
    await db.fifaMatch.deleteMany({});
    await db.period.deleteMany({});
    await db.player.deleteMany({});
    await db.fifaTeam.deleteMany({});
    await db.league.deleteMany({});

    await db.league.create({ data: { id: LEAGUE, name: "Elim League", status: "playoff" } });
    await db.period.create({
      data: { id: R32, leagueId: LEAGUE, kind: "knockout_round", label: "R32", frozenAt: FROZEN },
    });
    await db.period.create({
      data: { id: R16, leagueId: LEAGUE, kind: "knockout_round", label: "R16", frozenAt: null },
    });
    await db.period.create({
      data: { id: GRP, leagueId: LEAGUE, kind: "group_md", label: "MD3", frozenAt: FROZEN },
    });

    for (const id of ALL_TEAMS) {
      await db.fifaTeam.create({
        data: { id, balldontlieId: nextBdl(), name: id, eliminated: false },
      });
    }

    const koff = new Date("2026-07-02T18:00:00.000Z");
    const match = (
      periodId: string | null,
      home: string,
      away: string,
      scores: Partial<{
        homeScore: number;
        awayScore: number;
        homeScoreEt: number;
        awayScoreEt: number;
        homeScorePens: number;
        awayScorePens: number;
      }>,
    ) =>
      db.fifaMatch.create({
        data: {
          balldontlieId: nextBdl(),
          kickoffAt: koff,
          status: "completed",
          homeTeamId: home,
          awayTeamId: away,
          periodId,
          ...scores,
        },
      });

    // R32 (frozen): a full-time decider and a penalties decider.
    await match(R32, W_FT, L_FT, { homeScore: 3, awayScore: 1 }); // L_FT out
    await match(R32, W_PK, L_PK, {
      homeScore: 1,
      awayScore: 1,
      homeScoreEt: 1,
      awayScoreEt: 1,
      homeScorePens: 4,
      awayScorePens: 2,
    }); // L_PK out on pens
    // R16 (NOT frozen): a completed decider that must NOT flag yet.
    await match(R16, U_WIN, U_LOSE, { homeScore: 2, awayScore: 0 });
    // group_md (frozen): a group loss must NOT eliminate.
    await match(GRP, G_WIN, G_LOSE, { homeScore: 0, awayScore: 1 }); // G_WIN "loses" the group game
    // period-less 3rd-place: must NOT flag (excluded by the knockout join).
    await match(null, TP_WIN, TP_LOSE, { homeScore: 2, awayScore: 1 });
  });

  const isElim = async (id: string): Promise<boolean> =>
    (await db.fifaTeam.findUniqueOrThrow({ where: { id }, select: { eliminated: true } }))
      .eliminated;

  it("flags frozen-KO losers; leaves winners, unfrozen-KO, group, and period-less teams alive", async () => {
    const store = createPrismaTeamEliminationStore(db);

    const res = await dispatchTeamElimination(store);

    expect(new Set(res.flagged)).toEqual(new Set([L_FT, L_PK]));
    // The two frozen-R32 losers are out.
    expect(await isElim(L_FT)).toBe(true);
    expect(await isElim(L_PK)).toBe(true);
    // Everyone else stays alive: winners, the unfrozen-R16 loser, the group loser, both 3rd-place teams.
    for (const id of [W_FT, W_PK, U_WIN, U_LOSE, G_WIN, G_LOSE, TP_WIN, TP_LOSE]) {
      expect(await isElim(id)).toBe(false);
    }
  });

  it("is idempotent — a second tick flags nothing new and never un-flags", async () => {
    const store = createPrismaTeamEliminationStore(db);

    await dispatchTeamElimination(store);
    const second = await dispatchTeamElimination(store);

    expect(second.flagged).toEqual([]);
    expect(await isElim(L_FT)).toBe(true); // stays eliminated
    expect(await isElim(L_PK)).toBe(true);
  });

  it("opens the gate when a round freezes — the newly-frozen round's loser flags on the next tick", async () => {
    const store = createPrismaTeamEliminationStore(db);

    await dispatchTeamElimination(store);
    expect(await isElim(U_LOSE)).toBe(false); // R16 not frozen yet

    // The period-close cron freezes R16 ~result_freeze_hours after its last full-time.
    await db.period.update({ where: { id: R16 }, data: { frozenAt: FROZEN } });
    const afterFreeze = await dispatchTeamElimination(store);

    expect(afterFreeze.flagged).toEqual([U_LOSE]); // now — and only now — the R16 loser is out
    expect(await isElim(U_LOSE)).toBe(true);
    expect(await isElim(U_WIN)).toBe(false);
  });
});
