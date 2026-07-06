/**
 * T15-BACKFILL — one-shot `manager.display_name` PII scrub (audit/T15-BACKFILL_PLAN.md).
 *
 * Relabels the two prod `manager.display_name` values that are raw email addresses (T15-14R §3a) to
 * their slot-derived labels `Manager 7` / `Manager 8`. This closes the *existing data* exposure that
 * predates the T15-15 / PII-GUARD write-path fix (`c2b0150`); the guard closed only *recurrence*.
 *
 * Design (plan §3): the committed id → label map + email-shape predicate live in the PURE core
 * (`../src/backfillDisplayNamePii.ts`, unit-tested). The DB runner — the shared guarded WHERE, the
 * dry-run preview, and the atomic `--apply` — lives in `../src/backfillDisplayNamePiiRunner.ts`,
 * proven against real Postgres by the gated suite `backfillDisplayNamePiiRunner.integration.test.ts`
 * (FIX2: the SQL binding failed twice in prod while mocked tests were green; see the runner's
 * BINDING NOTE — `manager.id` is a TEXT column, so params bind bare, never `::uuid`). This file is
 * only the CLI shell: env loading + flag dispatch. It NEVER touches anything but
 * `manager.display_name`.
 *
 * SAFETY MODEL (enforced in the runner):
 *   - DEFAULT = DRY-RUN. Prints the exact rows the guarded WHERE would touch (id · draft_slot ·
 *     current · proposed) plus the runbook Q1/Q4 counts, and writes NOTHING. `--apply` is REQUIRED
 *     to perform the UPDATE.
 *   - Each write is a single guarded, idempotent UPDATE keyed by a KNOWN id AND the email-shape
 *     predicate: `WHERE id = <id> AND trim(display_name) ~ '<email-shape>'`. So it (a) never clobbers
 *     a row a user renamed to a real name in the interim, and (b) is a no-op on re-run.
 *   - `--apply` runs inside ONE interactive transaction (all rows relabel or none) gated by live
 *     re-checks: Q4 (collision) must be 0, Q1 (email-shaped rows) must be ≤ 2 (the captured snapshot),
 *     and a post-write Q1 must be 0 or the whole transaction rolls back.
 *
 * HOLD-class: run this in the Render worker shell under DIRECT_URL. Dry-run first, eyeball the two
 * rows, then `--apply`, then confirm Q1 = 0. See the plan §4/§6 for rollback (the pre-image is the
 * committed Q2 worksheet — two rows, revert by id).
 *
 * Run (DB URL from the env / repo-root .env, never this file):
 *   pnpm --filter @app/db tsx scripts/backfill-display-name-pii.ts            # dry-run (writes nothing)
 *   pnpm --filter @app/db tsx scripts/backfill-display-name-pii.ts --apply    # atomic guarded UPDATE
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { prisma } from "@app/db";
import { apply, dryRun } from "../src/backfillDisplayNamePiiRunner";

// Load repo-root .env for local runs; a no-op when the env is already provided (e.g. on Render).
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

async function main(): Promise<void> {
  const isApply = process.argv.includes("--apply");
  if (isApply) {
    await apply(prisma);
  } else {
    await dryRun(prisma);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
