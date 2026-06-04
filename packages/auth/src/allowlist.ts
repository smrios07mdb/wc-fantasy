/**
 * The allowlist gate — a PURE predicate (email + allowlist rows → allowed?). ARCHITECTURE §6
 * ("private by allowlist") + the §4 `allowlist_email` table. Enforced at the edge (post-callback +
 * in session→manager resolution); a non-allowlisted authenticated email is rejected, never admitted.
 */
import type { AllowlistEntry } from "./types";

/** Canonical form for case-insensitive comparison: trim surrounding whitespace + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailAllowed(email: string, allowlist: readonly AllowlistEntry[]): boolean {
  const target = normalizeEmail(email);
  return allowlist.some((entry) => normalizeEmail(entry.email) === target);
}
