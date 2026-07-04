/**
 * Commissioner-console shared primitives — the single source of truth for BOTH the web `/commish` surface
 * and the worker commish CLI, so the two never drift.
 *
 * Two things live here:
 *  1. `CommishActionType` — the closed set of commissioner audit action strings. It is DELIBERATELY a
 *     code-level `as const` union, NOT a Prisma enum: `commish_audit.action_type` is a free TEXT column, so
 *     a later write slice adding a new action needs NO migration — just extend this array. (Contrast the
 *     enums in ./enums.ts, whose values MUST mirror Prisma enums; this one is intentionally the opposite.)
 *  2. `resolveCommissioner` + `COMMISSIONER_EMAIL` — the commissioner gate predicate. Access is granted by
 *     the `manager.is_commissioner` flag OR the known commissioner email (case-insensitive). The worker CLI
 *     (`apps/worker/src/commish/core.ts` → `isCommissionerActor`) and the web `/commish` gate both delegate
 *     here, so "the gate the CLI uses" and "the gate the page uses" are LITERALLY the same function.
 */

/** The league commissioner's email (also flagged `manager.is_commissioner`); the gate's hard fallback. */
export const COMMISSIONER_EMAIL = "smrios07@gmail.com";

/**
 * The acting identity is a commissioner iff the `is_commissioner` flag is set OR the email is the known
 * commissioner email (case-insensitive, whitespace-trimmed). Pure — the only commissioner predicate; the
 * worker CLI and the web console both call it. Note this is a broader grant than `manager.is_commissioner`
 * alone; the `commish_audit` RLS policy is flag-only (it never sees this email fallback) — see the migration
 * header + DECISIONS.md for why that asymmetry is safe (RLS is defense-in-depth behind an owner-bypass read).
 */
export function resolveCommissioner(input: {
  isCommissioner: boolean;
  email: string | null | undefined;
}): boolean {
  if (input.isCommissioner) return true;
  return (input.email ?? "").trim().toLowerCase() === COMMISSIONER_EMAIL;
}

/**
 * The closed set of commissioner audit action strings. Persisted to `commish_audit.action_type` as free
 * TEXT (not a pg enum — a new slice's action needs no migration, just an entry here). Seeded to cover the
 * console's four write domains (playoff field, stat corrections, game operations, draft setup) + reverse,
 * so the audit-log renderer has a label/tone ready the moment a slice writes its first row. Later threads
 * MAY extend this array.
 */
export const COMMISH_ACTION_TYPES = [
  "penalty_applied",
  "stat_correction",
  "rating_override",
  "roster_repair",
  "lineup_repair",
  "period_freeze",
  "period_unfreeze",
  "round_advance",
  // The UNATTENDED playoff round auto-cut (feat/autofire-round-cut) — a distinct action_type so the
  // governance ledger legibly separates auto-fired cuts from operator-run `round_advance`. Free TEXT
  // (this array, NOT a pg enum), so it needs NO migration. Written with a NULL actor (the system row).
  "auto_advance",
  "field_locked",
  "playoff_config",
  "lock_fallback_changed",
  "scoring_source_changed",
  "draft_config",
  "action_reversed",
] as const;
export type CommishActionType = (typeof COMMISH_ACTION_TYPES)[number];

/**
 * Structured pointer to the entity a commissioner action affected, stored in `commish_audit.target_ref`
 * (JSONB, nullable). A loose union — the DB column accepts any JSON; these are the shapes later slices emit.
 */
export type CommishAuditTargetRef =
  | { matchId: string; playerId?: string }
  | { managerId: string }
  | { periodId: string }
  | Record<string, unknown>;
