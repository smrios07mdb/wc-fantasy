/**
 * Real-Postgres integration suite for the ADD-SIDE eliminated-team gate (DECISIONS §D "eliminated-team
 * add gate"). The gate's READ of `fifa_team.eliminated` lives ONLY in the Prisma adapters (the Memory
 * doubles inject the resolved boolean), so the IO behavior can only be exercised against a live DB. This
 * pins, against the REAL `prismaStore`, that a player whose WC team is `eliminated = true` is:
 *
 *   1. POOL — removed from `listFaIneligiblePlayerIds` (the waivers pool subtraction) even while UNOWNED;
 *      an owned player is still excluded (ownership), an alive-team and a NO-team player are NOT excluded.
 *   2. PER-PLAYER RE-CHECK — `getFaTargetFacts(...).faEligible === false` (the gate folds into faEligible,
 *      so `validateFaGrant` rejects with the existing `fa-not-eligible`); alive / no-team ⇒ true.
 *   3. SEALED-BID FACT — `getPlayerFacts(...).addTeamEliminated === true` (drives the bid validator's
 *      `add-team-eliminated`); alive / no-team ⇒ false.
 *   4. GRANT TX RACE BELT — `claimFreeAgent` of an eliminated-team add (window OPEN, so the belt — not the
 *      window guard — is what bites) returns "conflict"; with the commissioner `allowEliminated` override
 *      it is "granted".
 *   5. ADD-SIDE ONLY — a DROP of an eliminated-team player is still allowed (the drop side never reads the
 *      flag), and an alive-team add is unaffected.
 *
 * GATED on FAAB_ELIM_PG_TEST_URL (a THROWAWAY DB — the suite wipes tables); skipped in normal `pnpm test`.
 * Set up the DB exactly as `release.integration.test.ts` documents (docker postgres:16 + `prisma migrate
 * deploy`), then:
 *   FAAB_ELIM_PG_TEST_URL="$URL" DATABASE_URL="$URL" DIRECT_URL="$URL" \
 *     pnpm vitest run packages/faab/src/eliminatedTeam.integration.test.ts
 *
 * A DISTINCT env var (NOT release's FAAB_PG_TEST_URL nor the cap suite's FAAB_CAP_PG_TEST_URL) is
 * deliberate: every gated-PG suite gets its own var so exactly ONE table-wiping suite activates per run.
 * The SAFE guard additionally refuses to run unless DATABASE_URL IS the throwaway test DB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import {
  createPrismaFaGrantStore,
  createPrismaFaabBidStore,
  listFaIneligiblePlayerIds,
} from "./prismaStore";

const TEST_URL = process.env.FAAB_ELIM_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const LEAGUE = "el-league";
const MGR = "el-mgr";
const ELIM_TEAM = "el-team-out";
const ALIVE_TEAM = "el-team-in";
const PERIOD = "el-period";

// Players: free agents (unowned) + owned, across eliminated / alive / no team.
const E1 = "el-elim-free"; // eliminated team, UNOWNED — the key add-side case
const A1 = "el-alive-free"; // alive team, UNOWNED — eligible
const N1 = "el-noteam-free"; // NO team (team_id null), UNOWNED — eligible
const OWNED = "el-alive-owned"; // alive team, OWNED — excluded by ownership
const E_OWNED = "el-elim-owned"; // eliminated team, OWNED — the drop target (drops stay allowed)

describe.skipIf(!SAFE)("FAAB add-side eliminated-team gate — real Postgres", () => {
  let db: PrismaClient;
  let bdl = 7000;
  const nextBdl = () => ++bdl;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Wipe the FK chain this suite owns, child-first (lineup_slot via TRUNCATE — statement-level, bypasses
  // the lock-on-play DELETE trigger), then seed the full graph fresh so each test is isolated.
  beforeEach(async () => {
    await db.$executeRawUnsafe("TRUNCATE TABLE lineup_slot");
    await db.faabBid.deleteMany({});
    await db.faabBatch.deleteMany({});
    await db.rosterPlayer.deleteMany({});
    await db.playoffEntry.deleteMany({});
    await db.fifaMatch.deleteMany({});
    await db.player.deleteMany({});
    await db.period.deleteMany({});
    await db.manager.deleteMany({});
    await db.fifaTeam.deleteMany({});
    await db.league.deleteMany({});

    await db.league.create({
      data: { id: LEAGUE, name: "Eliminated Gate League", status: "group" },
    });
    await db.manager.create({
      data: { id: MGR, leagueId: LEAGUE, displayName: MGR, faabBudget: 100 },
    });
    await db.fifaTeam.create({
      data: { id: ELIM_TEAM, balldontlieId: nextBdl(), name: "Out FC", eliminated: true },
    });
    await db.fifaTeam.create({
      data: { id: ALIVE_TEAM, balldontlieId: nextBdl(), name: "In FC", eliminated: false },
    });

    // An OPEN acquisition window: a period whose batch has CLEARED, with an upcoming fixture for each
    // team. This makes resolveAddPeriodWindow return a non-null T, so claimFreeAgent's belt — not the
    // window guard — is what rejects an eliminated add (isolating the rule under test).
    await db.period.create({
      data: {
        id: PERIOD,
        leagueId: LEAGUE,
        kind: "group_md",
        label: "MD1",
        status: "open",
        batchClearedAt: new Date("2026-06-10T06:00:00Z"),
      },
    });
    const future = new Date("2026-06-12T16:00:00Z");
    await db.fifaMatch.create({
      data: {
        balldontlieId: nextBdl(),
        kickoffAt: future,
        status: "scheduled",
        homeTeamId: ELIM_TEAM,
        periodId: PERIOD,
      },
    });
    await db.fifaMatch.create({
      data: {
        balldontlieId: nextBdl(),
        kickoffAt: future,
        status: "scheduled",
        homeTeamId: ALIVE_TEAM,
        periodId: PERIOD,
      },
    });

    const player = (id: string, teamId: string | null) =>
      db.player.create({
        data: { id, balldontlieId: nextBdl(), displayName: id, position: "MID", teamId },
      });
    await player(E1, ELIM_TEAM);
    await player(A1, ALIVE_TEAM);
    await player(N1, null);
    await player(OWNED, ALIVE_TEAM);
    await player(E_OWNED, ELIM_TEAM);
    // M owns OWNED + E_OWNED (active rows).
    await db.rosterPlayer.create({ data: { leagueId: LEAGUE, managerId: MGR, playerId: OWNED } });
    await db.rosterPlayer.create({ data: { leagueId: LEAGUE, managerId: MGR, playerId: E_OWNED } });
  });

  // ── 1. POOL: listFaIneligiblePlayerIds (the waivers pool subtraction) ───────────────
  it("POOL: excludes an UNOWNED eliminated-team player (and owned), keeps alive + no-team players", async () => {
    const ineligible = await listFaIneligiblePlayerIds(db, LEAGUE);
    // KEY: an unowned eliminated-team player is removed from the pool (the new add gate).
    expect(ineligible.has(E1)).toBe(true);
    // Ownership still excludes (both an alive-team owned player and an eliminated owned player).
    expect(ineligible.has(OWNED)).toBe(true);
    expect(ineligible.has(E_OWNED)).toBe(true);
    // Alive-team and NO-team free agents stay addable.
    expect(ineligible.has(A1)).toBe(false);
    expect(ineligible.has(N1)).toBe(false);
  });

  // ── 2. PER-PLAYER RE-CHECK: getFaTargetFacts.faEligible folds the gate ──────────────
  it("RE-CHECK: getFaTargetFacts folds !eliminated into faEligible (alive + no-team ⇒ eligible)", async () => {
    const store = createPrismaFaGrantStore(db);
    expect((await store.getFaTargetFacts(LEAGUE, E1))?.faEligible).toBe(false); // eliminated
    expect((await store.getFaTargetFacts(LEAGUE, A1))?.faEligible).toBe(true); // alive, unowned
    expect((await store.getFaTargetFacts(LEAGUE, N1))?.faEligible).toBe(true); // no team, unowned
  });

  // ── 3. SEALED-BID FACT: getPlayerFacts.addTeamEliminated ────────────────────────────
  it("SEALED BID: getPlayerFacts surfaces addTeamEliminated (alive + no-team ⇒ false)", async () => {
    const store = createPrismaFaabBidStore(db);
    expect((await store.getPlayerFacts(E1))?.addTeamEliminated).toBe(true);
    expect((await store.getPlayerFacts(A1))?.addTeamEliminated).toBe(false);
    expect((await store.getPlayerFacts(N1))?.addTeamEliminated).toBe(false);
  });

  // ── 4. GRANT TX RACE BELT + commissioner override ──────────────────────────────────
  it("GRANT BELT: claimFreeAgent of an eliminated add is 'conflict' (window OPEN ⇒ the belt bites)", async () => {
    const store = createPrismaFaGrantStore(db);
    const out = await store.claimFreeAgent({
      leagueId: LEAGUE,
      managerId: MGR,
      playerAddId: E1,
      playerDropId: null,
      runAt: new Date("2026-06-10T07:00:00Z"),
    });
    expect(out).toBe("conflict");
    // Not granted: E1 never became owned.
    const owned = await db.rosterPlayer.findFirst({ where: { playerId: E1, droppedAt: null } });
    expect(owned).toBeNull();
  });

  it("OVERRIDE (D2): claimFreeAgent with allowEliminated:true GRANTS the eliminated add", async () => {
    const store = createPrismaFaGrantStore(db);
    const out = await store.claimFreeAgent({
      leagueId: LEAGUE,
      managerId: MGR,
      playerAddId: E1,
      playerDropId: null,
      runAt: new Date("2026-06-10T07:00:00Z"),
      allowEliminated: true,
    });
    expect(out).toBe("granted");
    const owned = await db.rosterPlayer.findFirst({ where: { playerId: E1, droppedAt: null } });
    expect(owned).not.toBeNull();
  });

  // ── 5. ADD-SIDE ONLY: dropping an eliminated player is allowed; alive add unaffected ─
  it("ADD-SIDE ONLY: an alive add DROPPING an eliminated-team player is granted (drop ignores the flag)", async () => {
    const store = createPrismaFaGrantStore(db);
    const out = await store.claimFreeAgent({
      leagueId: LEAGUE,
      managerId: MGR,
      playerAddId: A1, // alive → add allowed
      playerDropId: E_OWNED, // eliminated → drop still allowed
      runAt: new Date("2026-06-10T07:00:00Z"),
    });
    expect(out).toBe("granted");
    // The eliminated player was dropped; the alive player is now owned.
    const droppedElim = await db.rosterPlayer.findFirst({
      where: { playerId: E_OWNED, droppedAt: null },
    });
    expect(droppedElim).toBeNull();
    const addedAlive = await db.rosterPlayer.findFirst({
      where: { playerId: A1, droppedAt: null },
    });
    expect(addedAlive).not.toBeNull();
  });
});
