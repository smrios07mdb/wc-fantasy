/**
 * T15-BACKFILL — pure core for the one-shot `manager.display_name` PII scrub (audit/T15-BACKFILL_PLAN.md).
 *
 * Two prod `manager.display_name` values are raw email addresses (T15-14R §3a, config-borne via the
 * provision upsert). The write-path guard (T15-15 / PII-GUARD, `c2b0150`) closed the *recurrence*
 * vector; this backfill closes the *existing data* exposure that predates the guard.
 *
 * This module is PURE (no Prisma, no I/O, no `process`) so it is unit-testable and importable by the
 * runner in `../scripts/backfill-display-name-pii.ts`. It holds exactly three things:
 *   1. BACKFILL_MAP     — the committed, reviewable id → label map (the only rows this backfill knows).
 *   2. the email-shape / collision predicates as SQL-pattern constants (mirrored to the shipped guard).
 *   3. resolveRename()  — the per-row decision, delegating to the SHARED guard `looksLikeEmail` so the
 *                         dry-run preview and the guarded WHERE agree byte-for-byte on "email-shaped".
 *
 * Boring + reliable: no ranges over the whole table, no invented labels. Every write is a single
 * guarded, idempotent UPDATE keyed by a known id AND the email-shape predicate (see the runner).
 */
import { looksLikeEmail } from "@app/shared";

/**
 * A single backfill target: a known manager id, its draft slot (source of the human label), and the
 * label we relabel the leaked email to. Captured from the §1 runbook Q2 worksheet (pre-image below).
 */
export interface BackfillTarget {
  /** manager.id (prod). */
  readonly id: string;
  /** manager.draft_slot — the natural per-league unique number the label derives from. */
  readonly draftSlot: number;
  /** The display-only replacement label. Always `Manager {draftSlot}` (both slots non-null, distinct). */
  readonly mappedName: string;
}

/**
 * The committed source of truth — exactly the two email-shaped rows the §1 prod runbook surfaced
 * (Q1 `email_shaped_rows` = 2). Both slots are non-null and distinct, so each maps to a distinct
 * `Manager {slot}` label; Q4 (`~* '^manager [0-9]+$'`) = 0 confirms neither label already exists as a
 * real name. Pre-image (rollback source), verbatim from the plan:
 *   e9f30e58-… · slot 7 · `yader.rosales@gmail.com`
 *   3a3f75b1-… · slot 8 · `ahitaon@gmail.com`
 */
export const BACKFILL_MAP: readonly BackfillTarget[] = [
  { id: "e9f30e58-3a50-4bea-a51c-0039de3178d9", draftSlot: 7, mappedName: "Manager 7" },
  { id: "3a3f75b1-2bd6-4a2c-8ae5-8691e7fec6de", draftSlot: 8, mappedName: "Manager 8" },
];

/**
 * The email-shape predicate as a Postgres ARE pattern body — the SQL analogue of the shipped write
 * guard's regex (`packages/shared/src/email.ts`, `looksLikeEmail`). Full-string, anchored, applied to
 * `trim(display_name)`, case-sensitive (`~`). This is the byte-for-byte "email-shaped" definition the
 * runner's guarded WHERE uses; `resolveRename` below delegates to the shared `looksLikeEmail` so the
 * dry-run preview cannot drift from it. The JS `\\s` / `\\.` produce the literal SQL `\s` / `\.`.
 * (This exact predicate already ran read-only against prod as runbook Q1, returning 2.)
 */
export const EMAIL_SHAPE_SQL = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

/**
 * The collision predicate (runbook Q4), CASE-INSENSITIVE (`~*`) to mirror the per-league
 * case-insensitive unique index. A match means an assigned `Manager {slot}` label already exists as a
 * real name; the plan's collision fallback (`Manager {slot} ({short-id})`) is NOT auto-applied — the
 * runner refuses `--apply` and reports so a human decides. Q4 = 0 in the snapshot, so it never fires.
 */
export const MANAGER_LABEL_SQL = "^manager [0-9]+$";

/**
 * Per-row decision mirroring the guarded WHERE (`id = <id> AND trim(display_name) ~ <email-shape>`):
 * relabel ONLY while the current value is still email-shaped. If a user/commish renamed the row to a
 * real (non-email) name in the interim, this returns `null` and the runner skips it — the guard, not
 * the id alone, gates the write (anti-clobber). This is also why the write is idempotent: after the
 * first run the value is `Manager {slot}` (not email-shaped), so a re-run resolves to `null`.
 *
 * Delegates to the SHARED guard `looksLikeEmail` (single source of truth), so preview and write agree.
 */
export function resolveRename(currentDisplayName: string, mappedName: string): string | null {
  return looksLikeEmail(currentDisplayName) ? mappedName : null;
}
