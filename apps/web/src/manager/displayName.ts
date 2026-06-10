export type DisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too_long" };

/**
 * Trim + collapse internal whitespace, then enforce the 40-char cap.
 * No charset restriction — real names have accents, apostrophes, non-ASCII.
 * Uniqueness is NOT checked here; it is enforced by the DB index + mapped at the route.
 */
export function validateDisplayName(raw: string): DisplayNameResult {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, reason: "empty" };
  if (value.length > 40) return { ok: false, reason: "too_long" };
  return { ok: true, value };
}
