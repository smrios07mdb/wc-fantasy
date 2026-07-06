/**
 * Real-Postgres integration suite for the T15-BACKFILL runner (`backfillDisplayNamePiiRunner.ts`).
 *
 * WHY THIS EXISTS (FIX2): the backfill's raw SQL threw `42883 operator does not exist: text = uuid`
 * against prod TWICE while every mocked unit test was green — `manager.id` is a TEXT column
 * (`id String @id` with no `@db.Uuid`), so the `$n::uuid` param cast manufactured the mismatch.
 * Binding errors of this class are invisible to anything but a live Postgres, so this suite drives
 * the REAL dry-run preview and the REAL `--apply` transaction (the exact shared `guardedWhere` /
 * `UPDATE_SQL` the prod script executes) against a real database:
 *
 *   1. LIFECYCLE: seed the two mapped ids email-shaped + one bystander with a real name ⇒ dry-run
 *      executes with NO 42883 and its guard matches exactly the 2; `--apply` relabels both to
 *      `Manager 7` / `Manager 8`, leaves the bystander untouched, post-verify Q1 = 0; a second
 *      `--apply` is an idempotent no-op (applied 0, rows unchanged).
 *   2. ANTI-CLOBBER: a mapped id renamed to a real name in the interim is skipped by the guard
 *      (dry-run matched = null; `--apply` relabels only the still-email-shaped row, never the rename).
 *
 * GATED on BACKFILL_PII_PG_TEST_URL (a THROWAWAY DB — the suite wipes the manager/league tables);
 * skipped in normal `pnpm test`. As with the sibling suites (`enforcementCap.integration.test.ts`),
 * SAFE additionally requires DATABASE_URL to BE the throwaway test DB, so the destructive wipe can
 * never hit a real database. Set up exactly like `release.integration.test.ts`:
 *
 *   docker run -d --name wc-bfpii-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=bfpii_test -p 5468:5432 postgres:16
 *   export BACKFILL_PII_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:5468/bfpii_test"
 *   DATABASE_URL="$BACKFILL_PII_PG_TEST_URL" DIRECT_URL="$BACKFILL_PII_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   DATABASE_URL="$BACKFILL_PII_PG_TEST_URL" \
 *     pnpm vitest run packages/db/src/backfillDisplayNamePiiRunner.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { BACKFILL_MAP } from "./backfillDisplayNamePii";
import { apply, countEmailShaped, dryRun, readTargets } from "./backfillDisplayNamePiiRunner";

const TEST_URL = process.env.BACKFILL_PII_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const LEAGUE = "bfpii-league";
const BYSTANDER = "bfpii-bystander";
// The committed prod pre-image (plan Q2 worksheet) — what the two mapped rows leak today.
const EMAIL_7 = "yader.rosales@gmail.com";
const EMAIL_8 = "ahitaon@gmail.com";

const [T7, T8] = BACKFILL_MAP;
if (!T7 || !T8) throw new Error("BACKFILL_MAP must hold exactly the two committed targets");

describe.skipIf(!SAFE)("T15-BACKFILL runner — real Postgres (binding + lifecycle)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Fresh slate per test: this suite creates only league + manager rows; wipe child-first.
  beforeEach(async () => {
    await db.manager.deleteMany({});
    await db.league.deleteMany({});
    await db.league.create({ data: { id: LEAGUE, name: "bfpii test league" } });
  });

  async function seedManager(id: string, displayName: string, draftSlot: number): Promise<void> {
    await db.manager.create({ data: { id, leagueId: LEAGUE, displayName, draftSlot } });
  }

  it("dry-run executes (no 42883), --apply relabels exactly the 2, bystander untouched, re-apply no-ops", async () => {
    await seedManager(T7.id, EMAIL_7, T7.draftSlot);
    await seedManager(T8.id, EMAIL_8, T8.draftSlot);
    await seedManager(BYSTANDER, "Sergio Rios", 1);

    // DRY-RUN: the guarded WHERE (text = text, no cast) must execute cleanly — a 42883 rejects here —
    // and its guard must match exactly the two mapped email-shaped rows.
    const preview = await dryRun(db);
    expect(preview.q1).toBe(2);
    expect(preview.q4).toBe(0);
    expect(preview.matched.map((m) => m?.id)).toEqual([T7.id, T8.id]);
    expect(preview.matched.map((m) => m?.display_name)).toEqual([EMAIL_7, EMAIL_8]);

    // Dry-run wrote nothing.
    expect(await countEmailShaped(db)).toBe(2);

    // APPLY: both mapped rows relabeled atomically; the bystander's real name untouched; Q1 = 0.
    const applied = await apply(db);
    expect(applied).toEqual({ applied: 2, noop: false });
    const after = await readTargets(db);
    expect(after.map((r) => r.display_name)).toEqual([T7.mappedName, T8.mappedName]);
    const bystander = await db.manager.findUniqueOrThrow({ where: { id: BYSTANDER } });
    expect(bystander.displayName).toBe("Sergio Rios");
    expect(await countEmailShaped(db)).toBe(0);

    // RE-APPLY: idempotent no-op — nothing email-shaped remains, rows unchanged.
    const reapplied = await apply(db);
    expect(reapplied).toEqual({ applied: 0, noop: true });
    const afterReapply = await readTargets(db);
    expect(afterReapply.map((r) => r.display_name)).toEqual([T7.mappedName, T8.mappedName]);
  });

  it("anti-clobber: a mapped row renamed to a real name is skipped by the guard, never overwritten", async () => {
    await seedManager(T7.id, EMAIL_7, T7.draftSlot);
    await seedManager(T8.id, "Ahi Renamed Himself", T8.draftSlot); // user self-corrected in the interim

    const preview = await dryRun(db);
    expect(preview.q1).toBe(1);
    expect(preview.matched.map((m) => m?.id ?? null)).toEqual([T7.id, null]);

    const applied = await apply(db);
    expect(applied).toEqual({ applied: 1, noop: false });
    const after = await readTargets(db);
    expect(after.map((r) => r.display_name)).toEqual([T7.mappedName, "Ahi Renamed Himself"]);
    expect(await countEmailShaped(db)).toBe(0);
  });
});
