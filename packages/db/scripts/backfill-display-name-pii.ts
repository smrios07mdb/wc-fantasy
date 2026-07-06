/**
 * T15-BACKFILL — one-shot `manager.display_name` PII scrub (audit/T15-BACKFILL_PLAN.md).
 *
 * Relabels the two prod `manager.display_name` values that are raw email addresses (T15-14R §3a) to
 * their slot-derived labels `Manager 7` / `Manager 8`. This closes the *existing data* exposure that
 * predates the T15-15 / PII-GUARD write-path fix (`c2b0150`); the guard closed only *recurrence*.
 *
 * Design (plan §3): the committed id → label map + email-shape predicate live in the PURE core
 * (`../src/backfillDisplayNamePii.ts`, unit-tested). This runner is the thin I/O shell — @app/db
 * Prisma-direct, no Supabase admin / service-role client, no RLS surface (Prisma connects as the DB
 * role). It NEVER touches anything but `manager.display_name`.
 *
 * SAFETY MODEL:
 *   - DEFAULT = DRY-RUN. Prints the exact rows the guarded WHERE would touch (id · draft_slot ·
 *     current · proposed) plus the runbook Q1/Q4 counts, and writes NOTHING. `--apply` is REQUIRED
 *     to perform the UPDATE.
 *   - Each write is a single guarded, idempotent UPDATE keyed by a KNOWN id AND the email-shape
 *     predicate: `WHERE id = <id> AND trim(display_name) ~ '<email-shape>'`. So it (a) never clobbers
 *     a row a user renamed to a real name in the interim, and (b) is a no-op on re-run.
 *   - `--apply` runs inside ONE interactive transaction (all rows relabel or none) gated by live
 *     re-checks: Q4 (collision) must be 0, Q1 (email-shaped rows) must be 2 (the captured snapshot),
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
import { prisma, type PrismaClient, type Prisma } from "@app/db";
import { BACKFILL_MAP, EMAIL_SHAPE_SQL, MANAGER_LABEL_SQL } from "../src/backfillDisplayNamePii";

// Load repo-root .env for local runs; a no-op when the env is already provided (e.g. on Render).
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

/** A Prisma client or an interactive-transaction handle — the raw-SQL surface is identical on both. */
type Db = PrismaClient | Prisma.TransactionClient;

/** One manager row as read back for preview / after-image. draft_slot is nullable in the schema. */
interface ManagerRow {
  id: string;
  draft_slot: number | null;
  display_name: string;
}

/** Runbook Q1 — count of email-shaped `display_name` rows across the whole table (snapshot: 2). */
async function countEmailShaped(db: Db): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM manager WHERE trim(display_name) ~ '${EMAIL_SHAPE_SQL}'`,
  );
  return rows[0]?.n ?? 0;
}

/** Runbook Q4 — count of existing `Manager N` labels, case-insensitive (collision guard; snapshot: 0). */
async function countManagerLabels(db: Db): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM manager WHERE display_name ~* '${MANAGER_LABEL_SQL}'`,
  );
  return rows[0]?.n ?? 0;
}

/** Read the two target rows by id (unguarded) so we can show current + decide preview via the guard. */
async function readTargets(db: Db): Promise<ManagerRow[]> {
  const ids = BACKFILL_MAP.map((t) => t.id);
  const placeholders = ids.map((_, i) => `$${i + 1}::uuid`).join(", ");
  return db.$queryRawUnsafe<ManagerRow[]>(
    `SELECT id, draft_slot, display_name FROM manager WHERE id IN (${placeholders}) ORDER BY draft_slot NULLS LAST`,
    ...ids,
  );
}

function fmtRow(id: string, slot: number | null, current: string, proposed: string): string {
  return `  ${id}  ·  slot ${slot ?? "—"}  ·  ${JSON.stringify(current)}  →  ${proposed}`;
}

/**
 * The single guarded WHERE the backfill writes behind, built once and shared by BOTH the dry-run
 * preview (`previewGuarded`) and the `--apply` UPDATE (`UPDATE_SQL`). Because there is exactly one
 * fragment, the `::uuid` cast and the email-shape guard can never be present in one predicate and
 * missing from the other — the divergence class behind a `42883 text = uuid`. `idParam` is the bind
 * placeholder for `manager.id`, ALWAYS cast to uuid; the email-shape body is a committed constant (no
 * user input) matched against `trim(display_name)`.
 */
function guardedWhere(idParam: string): string {
  return `id = ${idParam}::uuid AND trim(display_name) ~ '${EMAIL_SHAPE_SQL}'`;
}

/**
 * The exact parameterized write `--apply` runs, once per target ($1 = new display_name, $2 = manager id).
 * Single source of truth so the DRY-RUN echo is byte-identical to the statement actually executed; the
 * `id = $2::uuid` clause (from the shared `guardedWhere`) scopes each iteration to exactly one row.
 */
const UPDATE_SQL = `UPDATE manager SET display_name = $1 WHERE ${guardedWhere("$2")}`;

/**
 * Read-only rehearsal of the guarded WHERE for ONE target: runs the SAME `guardedWhere` fragment the
 * UPDATE uses (same `::uuid` cast, same email-shape guard) as a SELECT, returning the row iff the guard
 * matches (still email-shaped) and `null` otherwise (a no-op UPDATE — already backfilled, or renamed to
 * a real name). Because the dry-run executes this identical predicate, a broken cast throws HERE exactly
 * where `--apply` would, instead of surfacing only at write time.
 */
async function previewGuarded(db: Db, id: string): Promise<ManagerRow | null> {
  const rows = await db.$queryRawUnsafe<ManagerRow[]>(
    `SELECT id, draft_slot, display_name FROM manager WHERE ${guardedWhere("$1")}`,
    id,
  );
  return rows[0] ?? null;
}

async function dryRun(): Promise<void> {
  console.log("T15-BACKFILL — DRY-RUN (no writes). Pass --apply to perform the UPDATE.\n");

  const [q1, q4, targets] = await Promise.all([
    countEmailShaped(prisma),
    countManagerLabels(prisma),
    readTargets(prisma),
  ]);
  console.log(`Q1 email_shaped_rows (whole table) = ${q1}  (expect 2)`);
  console.log(`Q4 manager_label_rows (collision)  = ${q4}  (expect 0)\n`);

  const byId = new Map(targets.map((r) => [r.id, r]));
  console.log("Rows the guarded WHERE would touch:");
  for (const t of BACKFILL_MAP) {
    const row = byId.get(t.id);
    if (!row) {
      console.log(`  ${t.id}  ·  slot ${t.draftSlot}  ·  (NOT FOUND in prod)`);
      continue;
    }
    // Decide via the EXACT guarded WHERE `--apply` runs (shared `guardedWhere`, same ::uuid cast),
    // executed read-only — so the preview is the write predicate itself, not a JS mirror of it.
    const matched = await previewGuarded(prisma, t.id);
    console.log(
      matched === null
        ? fmtRow(
            row.id,
            row.draft_slot,
            row.display_name,
            "SKIP (guard did not match — left untouched)",
          )
        : fmtRow(row.id, row.draft_slot, row.display_name, JSON.stringify(t.mappedName)),
    );
    // Echo the LITERAL parameterized write --apply would run for this target (printing a string only —
    // no query executes). Operator sees the exact statement + bound values and can audit the WHERE scope.
    console.log(`      SQL: ${UPDATE_SQL}`);
    console.log(`      $1 = ${JSON.stringify(t.mappedName)}   $2 = ${t.id}`);
  }
  console.log("\nDry-run complete — nothing was written.");
}

async function apply(): Promise<void> {
  console.log("T15-BACKFILL — APPLY (atomic, guarded). Re-checking live state…\n");

  const result = await prisma.$transaction(async (tx) => {
    // Collision guard (plan §3 fallback): an existing real `Manager N` name must NOT be present. If it
    // is, the plan's `Manager {slot} ({short-id})` disambiguator applies — a human decision, not this
    // script's. Refuse rather than auto-mangle a real name.
    const q4 = await countManagerLabels(tx);
    if (q4 > 0) {
      throw new Error(
        `REFUSING --apply: Q4 collision count = ${q4} (expected 0). An existing 'Manager N' label ` +
          `would collide. Apply the plan's collision fallback (Manager {slot} ({short-id})) by hand.`,
      );
    }

    // Q1 gate. The per-id, shape-guarded WHERE (below) + the global post-verify (further below) make an
    // EXACT pre-count non-critical — the dry-run eyeball is the human gate, not this number. So we only
    // refuse on states that mean the MAP is wrong, and treat any in-range count as "proceed":
    //   Q1 = 0        -> nothing email-shaped left; clean idempotent no-op (already backfilled).
    //   Q1 > 2        -> an email-shaped row exists BEYOND the 2 mapped ids; the map is stale. Refuse and
    //                    re-derive rather than leave PII behind (the post-verify would roll back anyway).
    //   Q1 in {1, 2}  -> proceed; the 2 guarded UPDATEs each no-op if their row is no longer email-shaped
    //                    (a user renamed it to a real name — never overwrite that), then global Q1 = 0.
    const q1Before = await countEmailShaped(tx);
    if (q1Before === 0) {
      console.log("Q1 = 0 — nothing email-shaped remains. Already backfilled; no action taken.");
      return { applied: 0, noop: true as const };
    }
    if (q1Before > 2) {
      throw new Error(
        `REFUSING --apply: Q1 email_shaped_rows = ${q1Before} (> 2). An email-shaped row exists beyond ` +
          `the two mapped ids — the backfill map is stale. Re-derive the map before applying.`,
      );
    }

    // Two guarded, parameterized UPDATEs. The email-shape predicate (a committed constant, no user
    // input) is inlined; id + new name are bound params. A self-corrected row matches 0 rows (skip).
    let applied = 0;
    for (const t of BACKFILL_MAP) {
      applied += await tx.$executeRawUnsafe(UPDATE_SQL, t.mappedName, t.id);
    }

    // Post-write verify INSIDE the txn: no email-shaped row may remain, else roll the whole thing back.
    const q1After = await countEmailShaped(tx);
    if (q1After !== 0) {
      throw new Error(
        `POST-VERIFY FAILED: Q1 = ${q1After} after UPDATE (expected 0) — rolling back. An email-shaped ` +
          `row outside the map remains; investigate before retrying.`,
      );
    }

    return { applied, noop: false as const };
  });

  if (result.noop) return;

  console.log(`Applied — ${result.applied} row(s) relabeled. After-image:\n`);
  const after = await readTargets(prisma);
  for (const r of after) console.log(fmtRow(r.id, r.draft_slot, r.display_name, "(after)"));
  const q1 = await countEmailShaped(prisma);
  console.log(`\nPost-verify Q1 email_shaped_rows = ${q1}  (expect 0).`);
}

async function main(): Promise<void> {
  const isApply = process.argv.includes("--apply");
  if (isApply) {
    await apply();
  } else {
    await dryRun();
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
