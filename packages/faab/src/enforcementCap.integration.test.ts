/**
 * Real-Postgres integration suite for the FAAB ENFORCEMENT cap migration (CONTRACT-P3, Option B). The
 * roster-cap derivation lives ONLY in the Prisma adapters (the Memory doubles inject `rosterCap`), so the
 * behavioral red→green can only be exercised against a live DB. This pins, for each of the four enforcement
 * loads, that the cap + the playoff-phase participant signal derive from playoff_entry EXISTENCE
 * (`loadPlayoffPhaseActive`), NOT the `league.status` field:
 *
 *   1. DISAGREEMENT (the red key): `alive` playoff_entry rows exist but `league.status` reads 'group'
 *      (the field lags the data) ⇒ cap 9 + the alive participant set. RED on the old status read (cap 15,
 *      participant set null). In prod the applyTransition $transaction writes status + entries together, so
 *      this divergence only occurs under a lagging field — exactly what the data-existence contract reads past.
 *   2. CHAMPION (post-tournament arm P2 left untested): entries incl. a `champion` (+ eliminated, zero
 *      alive), status 'playoff' ⇒ cap still 9 (NOT re-opened to 15). status-form and data-form agree here;
 *      the test pins that an all-decided league keeps the trim cap.
 *   3. GROUP BASELINE: no entries + status 'group' ⇒ cap 15 (regression guard; both forms agree).
 *   4. SPEND e2e: a full 9-man squad in the disagreement state ⇒ a no-drop bid is rejected by the
 *      DB-derived cap (`drop-required`, which `handleBid` maps to HTTP 409). RED today: cap 15 leaves room
 *      for a 10th, so the bid is legal (no error).
 *
 * GATED on FAAB_CAP_PG_TEST_URL (a THROWAWAY DB — the suite wipes tables); skipped in normal `pnpm test`. Set
 * up the DB exactly as `release.integration.test.ts` documents (docker postgres:16 + `prisma migrate deploy`),
 * then:  FAAB_CAP_PG_TEST_URL="$URL" DATABASE_URL="$URL" DIRECT_URL="$URL" \
 *          pnpm vitest run packages/faab/src/enforcementCap.integration.test.ts
 *
 * A DISTINCT env var (NOT release's FAAB_PG_TEST_URL) is deliberate: every gated-PG suite in this repo gets
 * its own var so exactly ONE table-wiping suite activates per run — two doing global `beforeEach` wipes
 * against the same DB in parallel would clobber each other. The SAFE guard (used by several sibling suites)
 * additionally refuses to run unless DATABASE_URL IS the throwaway test DB, so the destructive wipe can never
 * hit a real database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import {
  createPrismaFaabBidStore,
  createPrismaFaGrantStore,
  createPrismaFaabBatchStore,
  createPrismaFaabReleaseStore,
} from "./prismaStore";
import { validateBidSubmission, type BidSubmission } from "./validate";

const TEST_URL = process.env.FAAB_CAP_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const LEAGUE = "ec-league";
const MGR = "ec-mgr";
const OTHER = "ec-mgr-2";
const TEAM = "ec-team";

describe.skipIf(!SAFE)(
  "FAAB enforcement cap — playoff_entry existence, not league.status (real PG)",
  () => {
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

    // Wipe the FK chain this suite owns, child-first (lineup_slot via TRUNCATE — statement-level, bypasses
    // the lock-on-play DELETE trigger). No lineup_slot rows are created here, but the truncate is harmless.
    beforeEach(async () => {
      await db.$executeRawUnsafe("TRUNCATE TABLE lineup_slot");
      await db.faabBid.deleteMany({});
      await db.faabBatch.deleteMany({});
      await db.rosterPlayer.deleteMany({});
      await db.playoffEntry.deleteMany({});
      await db.player.deleteMany({});
      await db.period.deleteMany({});
      await db.manager.deleteMany({});
      await db.fifaTeam.deleteMany({});
      await db.league.deleteMany({});
      await db.fifaTeam.create({ data: { id: TEAM, balldontlieId: nextBdl(), name: "Test FC" } });
    });

    // ── seed helpers ──────────────────────────────────────────────────────────────────
    const seedLeague = (status: "draft" | "group" | "playoff" | "complete") =>
      db.league.create({ data: { id: LEAGUE, name: "Enforcement Cap League", status } });
    const seedManager = (id: string) =>
      db.manager.create({ data: { id, leagueId: LEAGUE, displayName: id, faabBudget: 100 } });
    const seedEntry = (
      managerId: string,
      status: "alive" | "eliminated" | "champion",
      seed: number,
    ) => db.playoffEntry.create({ data: { leagueId: LEAGUE, managerId, seed, status } });
    async function seedRosterPlayer(
      managerId: string,
      playerId: string,
      position: "GK" | "DEF" | "MID" | "FWD",
    ) {
      await db.player.create({
        data: {
          id: playerId,
          balldontlieId: nextBdl(),
          displayName: playerId,
          position,
          teamId: TEAM,
        },
      });
      await db.rosterPlayer.create({ data: { leagueId: LEAGUE, managerId, playerId } });
    }
    /** An UNOWNED player (seeded but never rostered) — a legal add target. */
    async function seedFreePlayer(playerId: string, position: "GK" | "DEF" | "MID" | "FWD") {
      await db.player.create({
        data: {
          id: playerId,
          balldontlieId: nextBdl(),
          displayName: playerId,
          position,
          teamId: TEAM,
        },
      });
    }

    // ── 1. loadManagerBidContext (the bid-submission validator's cap) ───────────────────
    describe("loadManagerBidContext", () => {
      it("DISAGREEMENT: alive entry + status='group' ⇒ cap 9 (RED on the old status read: 15)", async () => {
        await seedLeague("group");
        await seedManager(MGR);
        await seedRosterPlayer(MGR, "b-p1", "MID");
        await seedEntry(MGR, "alive", 1);

        const ctx = await createPrismaFaabBidStore(db).loadManagerBidContext(MGR);
        expect(ctx).not.toBeNull();
        expect(ctx!.rosterCap).toBe(9);
      });

      it("CHAMPION: champion+eliminated entries, status='playoff' ⇒ cap still 9 (not re-opened to 15)", async () => {
        await seedLeague("playoff");
        await seedManager(MGR);
        await seedManager(OTHER);
        await seedEntry(MGR, "champion", 1);
        await seedEntry(OTHER, "eliminated", 2);

        const ctx = await createPrismaFaabBidStore(db).loadManagerBidContext(MGR);
        expect(ctx!.rosterCap).toBe(9);
      });

      it("GROUP BASELINE: no entries + status='group' ⇒ cap 15 (both forms agree)", async () => {
        await seedLeague("group");
        await seedManager(MGR);

        const ctx = await createPrismaFaabBidStore(db).loadManagerBidContext(MGR);
        expect(ctx!.rosterCap).toBe(15);
      });
    });

    // ── 2. loadManagerFaContext (the $0 FA-grant validator's cap) ───────────────────────
    describe("loadManagerFaContext", () => {
      it("DISAGREEMENT: alive entry + status='group' ⇒ cap 9 (RED: 15)", async () => {
        await seedLeague("group");
        await seedManager(MGR);
        await seedRosterPlayer(MGR, "f-p1", "DEF");
        await seedEntry(MGR, "alive", 1);

        const ctx = await createPrismaFaGrantStore(db).loadManagerFaContext(MGR);
        expect(ctx).not.toBeNull();
        expect(ctx!.rosterCap).toBe(9);
      });

      it("CHAMPION: champion entry, status='playoff' ⇒ cap still 9", async () => {
        await seedLeague("playoff");
        await seedManager(MGR);
        await seedEntry(MGR, "champion", 1);

        const ctx = await createPrismaFaGrantStore(db).loadManagerFaContext(MGR);
        expect(ctx!.rosterCap).toBe(9);
      });

      it("GROUP BASELINE: no entries + status='group' ⇒ cap 15", async () => {
        await seedLeague("group");
        await seedManager(MGR);

        const ctx = await createPrismaFaGrantStore(db).loadManagerFaContext(MGR);
        expect(ctx!.rosterCap).toBe(15);
      });
    });

    // ── 3. loadBatchContext (the blind-bid resolver's cap + participant filter) ─────────
    describe("loadBatchContext", () => {
      it("DISAGREEMENT: alive entry + status='group' ⇒ cap 9 AND participant set {MGR} (RED: 15 + null)", async () => {
        await seedLeague("group");
        await seedManager(MGR);
        await seedEntry(MGR, "alive", 1);

        const ctx = await createPrismaFaabBatchStore(db).loadBatchContext(LEAGUE);
        expect(ctx).not.toBeNull();
        expect(ctx!.rosterCap).toBe(9);
        // The participant gate (line 162-172) also migrates to the phase boolean: phase-active ⇒ the alive set.
        expect(ctx!.participantManagerIds).toEqual(new Set([MGR]));
      });

      it("CHAMPION: champion+eliminated, status='playoff' ⇒ cap 9 AND participant set is non-null (phase-active path)", async () => {
        await seedLeague("playoff");
        await seedManager(MGR);
        await seedManager(OTHER);
        await seedEntry(MGR, "champion", 1);
        await seedEntry(OTHER, "eliminated", 2);

        const ctx = await createPrismaFaabBatchStore(db).loadBatchContext(LEAGUE);
        expect(ctx!.rosterCap).toBe(9);
        // playoff_entry rows exist ⇒ the phase-active branch is taken (a Set, not null). Its alive-only
        // membership (here empty — champion/eliminated are not 'alive') is the unchanged D4 rule, out of P3 scope.
        expect(ctx!.participantManagerIds).not.toBeNull();
      });

      it("GROUP BASELINE: no entries + status='group' ⇒ cap 15 AND participant set null (everyone competes)", async () => {
        await seedLeague("group");
        await seedManager(MGR);

        const ctx = await createPrismaFaabBatchStore(db).loadBatchContext(LEAGUE);
        expect(ctx!.rosterCap).toBe(15);
        expect(ctx!.participantManagerIds).toBeNull();
      });
    });

    // ── 4. listOverCapPlayoffSurvivors (commish:trim --report) ──────────────────────────
    describe("listOverCapPlayoffSurvivors", () => {
      it("DISAGREEMENT: alive entry + status='group' + 10-man roster ⇒ lists the over-cap survivor (RED: [])", async () => {
        await seedLeague("group");
        await seedManager(MGR);
        await seedEntry(MGR, "alive", 1);
        for (let i = 0; i < 10; i++) await seedRosterPlayer(MGR, `o-p${i}`, "MID");

        const out = await createPrismaFaabReleaseStore(db).listOverCapPlayoffSurvivors(LEAGUE);
        expect(out).toEqual([{ managerId: MGR, rosterCount: 10, rosterCap: 9 }]);
      });

      it("GROUP BASELINE: no entries + status='group' ⇒ [] (not in the playoff phase)", async () => {
        await seedLeague("group");
        await seedManager(MGR);
        for (let i = 0; i < 10; i++) await seedRosterPlayer(MGR, `g-p${i}`, "MID");

        const out = await createPrismaFaabReleaseStore(db).listOverCapPlayoffSurvivors(LEAGUE);
        expect(out).toEqual([]);
      });
    });

    // ── 5. SPEND e2e: the DB-derived cap actually rejects a real no-drop bid ─────────────
    it("SPEND e2e: full 9-man squad in the disagreement state ⇒ no-drop bid is 'drop-required' (RED: legal at cap 15)", async () => {
      await seedLeague("group");
      await seedManager(MGR);
      await seedEntry(MGR, "alive", 1); // MGR is a participant ⇒ the cap (not the participant gate) is what bites
      const positions: Array<"GK" | "DEF" | "MID" | "FWD"> = [
        "GK",
        "GK",
        "DEF",
        "DEF",
        "DEF",
        "MID",
        "MID",
        "FWD",
        "FWD",
      ];
      for (let i = 0; i < positions.length; i++)
        await seedRosterPlayer(MGR, `s-p${i}`, positions[i]!);
      await seedFreePlayer("s-add", "MID"); // the unowned 10th add target

      const ctx = await createPrismaFaabBidStore(db).loadManagerBidContext(MGR);
      expect(ctx!.squadSize).toBe(9);

      const now = new Date("2026-06-15T00:00:00Z");
      const future = new Date("2026-07-01T00:00:00Z"); // add target's period kickoff is upcoming ⇒ sealed-bid window
      const submission: BidSubmission = {
        managerId: MGR,
        playerAddId: "s-add",
        addPosition: "MID",
        playerDropId: null, // NO drop — the cap is the only rule that can bite
        dropPosition: null,
        amount: 0,
      };
      const error = validateBidSubmission(submission, {
        now,
        faabBudget: ctx!.faabBudget,
        counts: ctx!.counts,
        squadSize: ctx!.squadSize,
        rosterCap: ctx!.rosterCap, // ← the DB-derived cap under test (9 after migration, 15 before)
        ownedByManager: ctx!.ownedByManager,
        ownedByLeague: ctx!.ownedByLeague,
        acquisitionCutoffAt: future,
        batchClearedAt: null,
        dropLocked: false,
        isPlayoffParticipant: ctx!.isPlayoffParticipant,
      });

      // cap 9 ⇒ squadSize(9) >= cap ⇒ drop-required (handleBid maps this to HTTP 409). RED today: cap 15
      // leaves room for a 10th, so the no-drop bid is legal (error is null).
      expect(error?.code).toBe("drop-required");
    });
  },
);
