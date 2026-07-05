import { looksLikeEmail } from "@app/shared";

export type DisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too_long" | "email_like" };

/**
 * Trim + collapse internal whitespace, then enforce the 40-char cap.
 * No charset restriction — real names have accents, apostrophes, non-ASCII.
 * One shape exception: a full-string email is rejected (`email_like`) so a member cannot
 * rename themselves TO an email — the recurrence vector for the manager-name PII leak
 * (T15-14R §3b). A name that merely CONTAINS "@" (e.g. "n@cho") stays legal.
 * Uniqueness is NOT checked here; it is enforced by the DB index + mapped at the route.
 */
export function validateDisplayName(raw: string): DisplayNameResult {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, reason: "empty" };
  if (value.length > 40) return { ok: false, reason: "too_long" };
  if (looksLikeEmail(value)) return { ok: false, reason: "email_like" };
  return { ok: true, value };
}
