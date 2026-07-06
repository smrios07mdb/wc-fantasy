/**
 * T15-BACKFILL — DB runner core for the one-shot `manager.display_name` PII scrub.
 *
 * Extracted from `../scripts/backfill-display-name-pii.ts` (which is now a thin CLI shell) so the
 * REAL SQL — the shared guarded WHERE, the dry-run preview, and the `--apply` transaction — is
 * exercisable by the gated real-Postgres suite (`backfillDisplayNamePiiRunner.integration.test.ts`).
 * That suite exists because this SQL failed twice in prod (42883) while every mocked unit test was
 * green: raw-SQL binding errors are invisible to anything but a live Postgres.
 *
 * BINDING NOTE (the FIX2 root cause): `manager.id` is a **TEXT** column, not uuid — the Prisma schema
 * declares `id String @id @default(uuid())` with no `@db.Uuid`, and the init migration created
 * `"id" TEXT NOT NULL`. The values are uuid-SHAPED strings in a text column. Prisma raw queries bind
 * JS strings as `text`, so the correct comparison is the bare `id = $n` (text = text). The previous
 * `$n::uuid` cast — added on the false premise that the column was uuid — is what MANUFACTURED the
 * `42883 operator does not exist: text = uuid` (text column on the left, uuid-cast param on the
 * right). No cast of any kind belongs here.
 *
 * Everything else (safety model, Q1/Q4 gates, txn boundary, post-verify, the 2-row map) is unchanged
 * from the original runner — see the script header and audit/T15-BACKFILL_PLAN.md.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { BACKFILL_MAP, EMAIL_SHAPE_SQL, MANAGER_LABEL_SQL } from "./backfillDisplayNamePii";

/** A Prisma client or an interactive-transaction handle — the raw-SQL surface is identical on both. */
type Db = PrismaClient | Prisma.TransactionClient;

/** One manager row as read back for preview / after-image. draft_slot is nullable in the schema. */
export interface ManagerRow {
  id: string;
  draft_slot: number | null;
  display_name: string;
}

/** Runbook Q1 — count of email-shaped `display_name` rows across the whole table (snapshot: 2). */
export async function countEmailShaped(db: Db): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM manager WHERE trim(display_name) ~ '${EMAIL_SHAPE_SQL}'`,
  );
  return rows[0]?.n ?? 0;
}

/** Runbook Q4 — count of existing `Manager N` labels, case-insensitive (collision guard; snapshot: 0). */
export async function countManagerLabels(db: Db): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM manager WHERE display_name ~* '${MANAGER_LABEL_SQL}'`,
  );
  return rows[0]?.n ?? 0;
}

/** Read the two target rows by id (unguarded) so we can show current + decide preview via the guard. */
export async function readTargets(db: Db): Promise<ManagerRow[]> {
  const ids = BACKFILL_MAP.map((t) => t.id);
  // Bare $n placeholders: manager.id is TEXT (see BINDING NOTE above), matching the text bind exactly.
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
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
 * preview (`previewGuarded`) and the `--apply` UPDATE (`UPDATE_SQL`), so the two can never diverge.
 * `idParam` is the bind placeholder for `manager.id` — a TEXT column compared bare against the text
 * bind (see BINDING NOTE in the module header; a `::uuid` cast here is exactly the 42883 bug). The
 * email-shape body is a committed constant (no user input) matched against `trim(display_name)`.
 */
function guardedWhere(idParam: string): string {
  return `id = ${idParam} AND trim(display_name) ~ '${EMAIL_SHAPE_SQL}'`;
}

/**
 * The exact parameterized write `--apply` runs, once per target ($1 = new display_name, $2 = manager id).
 * Single source of truth so the DRY-RUN echo is byte-identical to the statement actually executed; the
 * `id = $2` clause (from the shared `guardedWhere`) scopes each iteration to exactly one row.
 */
export const UPDATE_SQL = `UPDATE manager SET display_name = $1 WHERE ${guardedWhere("$2")}`;

/**
 * Read-only rehearsal of the guarded WHERE for ONE target: runs the SAME `guardedWhere` fragment the
 * UPDATE uses as a SELECT, returning the row iff the guard matches (still email-shaped) and `null`
 * otherwise (a no-op UPDATE — already backfilled, or renamed to a real name). Because the dry-run
 * executes this identical predicate, a broken binding throws HERE exactly where `--apply` would.
 */
export async function previewGuarded(db: Db, id: string): Promise<ManagerRow | null> {
  const rows = await db.$queryRawUnsafe<ManagerRow[]>(
    `SELECT id, draft_slot, display_name FROM manager WHERE ${guardedWhere("$1")}`,
    id,
  );
  return rows[0] ?? null;
}

/** Structured dry-run result, returned so the gated-PG suite can assert on it (console output aside). */
export interface DryRunResult {
  q1: number;
  q4: number;
  /** Per BACKFILL_MAP target: the row the guarded WHERE matched, or null (skip / not found). */
  matched: (ManagerRow | null)[];
}

export async function dryRun(db: PrismaClient): Promise<DryRunResult> {
  console.log("T15-BACKFILL — DRY-RUN (no writes). Pass --apply to perform the UPDATE.\n");

  const [q1, q4, targets] = await Promise.all([
    countEmailShaped(db),
    countManagerLabels(db),
    readTargets(db),
  ]);
  console.log(`Q1 email_shaped_rows (whole table) = ${q1}  (expect 2)`);
  console.log(`Q4 manager_label_rows (collision)  = ${q4}  (expect 0)\n`);

  const byId = new Map(targets.map((r) => [r.id, r]));
  const matched: (ManagerRow | null)[] = [];
  console.log("Rows the guarded WHERE would touch:");
  for (const t of BACKFILL_MAP) {
    const row = byId.get(t.id);
    if (!row) {
      console.log(`  ${t.id}  ·  slot ${t.draftSlot}  ·  (NOT FOUND in prod)`);
      matched.push(null);
      continue;
    }
    // Decide via the EXACT guarded WHERE `--apply` runs (shared `guardedWhere`), executed read-only —
    // so the preview is the write predicate itself, not a JS mirror of it.
    const hit = await previewGuarded(db, t.id);
    matched.push(hit);
    console.log(
      hit === null
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
  return { q1, q4, matched };
}

/** Structured apply result, returned so the gated-PG suite can assert on it. */
export interface ApplyResult {
  applied: number;
  noop: boolean;
}

export async function apply(db: PrismaClient): Promise<ApplyResult> {
  console.log("T15-BACKFILL — APPLY (atomic, guarded). Re-checking live state…\n");

  const result = await db.$transaction(async (tx) => {
    // Q1 gate FIRST. The per-id, shape-guarded WHERE (below) + the global post-verify (further below)
    // make an EXACT pre-count non-critical — the dry-run eyeball is the human gate, not this number. So
    // we only refuse on states that mean the MAP is wrong, and treat any in-range count as "proceed":
    //   Q1 = 0        -> nothing email-shaped left; clean idempotent no-op (already backfilled). MUST be
    //                    checked BEFORE the Q4 collision guard: after a successful backfill the labels
    //                    `Manager 7/8` themselves make Q4 = 2, and a re-run would otherwise REFUSE
    //                    instead of no-op'ing (caught by the gated-PG suite; a write never happens on
    //                    this path, so exiting early weakens no gate).
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

    // Collision guard (plan §3 fallback), gating every path that WRITES: an existing real `Manager N`
    // name must NOT be present. If it is, the plan's `Manager {slot} ({short-id})` disambiguator
    // applies — a human decision, not this script's. Refuse rather than auto-mangle a real name.
    const q4 = await countManagerLabels(tx);
    if (q4 > 0) {
      throw new Error(
        `REFUSING --apply: Q4 collision count = ${q4} (expected 0). An existing 'Manager N' label ` +
          `would collide. Apply the plan's collision fallback (Manager {slot} ({short-id})) by hand.`,
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

  if (result.noop) return result;

  console.log(`Applied — ${result.applied} row(s) relabeled. After-image:\n`);
  const after = await readTargets(db);
  for (const r of after) console.log(fmtRow(r.id, r.draft_slot, r.display_name, "(after)"));
  const q1 = await countEmailShaped(db);
  console.log(`\nPost-verify Q1 email_shaped_rows = ${q1}  (expect 0).`);
  return result;
}
