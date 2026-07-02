/**
 * Pure write-side helpers for the 2b general stat-line editor — no Prisma, no clock, so they are unit-tested
 * without a database. Three concerns:
 *
 *  1. `validateStatOverrides` — the write-boundary guard: rejects any key outside the 23-key allowlist
 *     (`unknown_stat_key`) and any value that is not a non-negative integer (`bad_request`). Because the
 *     adapter's `n(v) = v ?? 0` does NOT clamp, a negative/fractional value would flow straight into scoring —
 *     so this is load-bearing, not cosmetic.
 *  2. `mergeStatOverridesIntoExtra` — the READ-MODIFY-WRITE merge: sets/removes the `statOverrides` sub-key of
 *     `manual_stat_player_match.extra` while PRESERVING every other key (notably `rolePlayed`). Returns `null`
 *     when the resulting object is empty, so the store can store SQL NULL.
 *  3. `formatStatOverrideDelta` — the audit strings: a raw field-change list ("goals feed→2 · assists 1→feed"),
 *     NOT a points total (the engine owns points; the re-score restates them).
 */
import { OVERRIDABLE_STAT_KEYS, type OverridableStatKey, type StatOverrides } from "@app/recompute";

const KEY_ORDER = new Map<string, number>(OVERRIDABLE_STAT_KEYS.map((k, i) => [k, i]));
const isAllowed = (k: string): k is OverridableStatKey => KEY_ORDER.has(k);

export type ValidateStatOverridesResult =
  | { ok: true; overrides: StatOverrides }
  | { ok: false; error: "unknown_stat_key" | "bad_request" };

/**
 * Validate the request's `{ key: value }` override map against the allowlist + Int≥0. An unknown key is
 * REJECTED (not silently dropped) so a typo can never inject a phantom stat; a non-integer or negative value
 * is a `bad_request`. Returns the bounded overlay on success.
 */
export function validateStatOverrides(raw: Record<string, number>): ValidateStatOverridesResult {
  const overrides: Partial<Record<OverridableStatKey, number>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isAllowed(k)) return { ok: false, error: "unknown_stat_key" };
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0)
      return { ok: false, error: "bad_request" };
    overrides[k] = v;
  }
  return { ok: true, overrides };
}

/**
 * Merge a new (absolute) overlay into the existing `extra` object, preserving all non-`statOverrides` keys.
 * An empty overlay drops the `statOverrides` key entirely (clear-all). Returns `null` when nothing remains,
 * signalling the store to persist SQL NULL. Pure — the caller maps `null` → `Prisma.DbNull`.
 */
export function mergeStatOverridesIntoExtra(
  existing: unknown,
  overrides: StatOverrides,
): Record<string, unknown> | null {
  const base: Record<string, unknown> =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (Object.keys(overrides).length > 0) {
    base.statOverrides = { ...overrides };
  } else {
    delete base.statOverrides;
  }
  return Object.keys(base).length > 0 ? base : null;
}

export interface StatOverrideDelta {
  changed: boolean;
  /** Raw field-change string, e.g. "goals feed→2 · assists 1→feed"; "no change" when nothing moved. */
  delta: string;
  summary: string;
}

/** A value label for the delta: a number, or "feed" when the field falls back to the feed value. */
const label = (v: number | undefined): string => (v === undefined ? "feed" : String(v));

/**
 * Build the audit summary + delta from the prior and next override maps. Deterministic (fields ordered by
 * the allowlist). Records what changed at the OVERLAY level (`feed→N`, `N→M`, `N→feed`), so the log reads as
 * the action taken rather than a points total.
 */
export function formatStatOverrideDelta(
  prior: StatOverrides,
  next: StatOverrides,
): StatOverrideDelta {
  const keys = [...new Set([...Object.keys(prior), ...Object.keys(next)])]
    .filter(isAllowed)
    .sort((a, b) => (KEY_ORDER.get(a) ?? 0) - (KEY_ORDER.get(b) ?? 0));
  const changes: string[] = [];
  for (const k of keys) {
    const before = prior[k];
    const after = next[k];
    if (before !== after) changes.push(`${k} ${label(before)}→${label(after)}`);
  }
  if (changes.length === 0) {
    return { changed: false, delta: "no change", summary: "Stat correction (no change)" };
  }
  const clearedAll = Object.keys(next).length === 0;
  const summary = clearedAll
    ? "Stat correction: cleared all overrides"
    : `Stat correction: ${changes.length} field${changes.length === 1 ? "" : "s"}`;
  return { changed: true, delta: changes.join(" · "), summary };
}
