/**
 * Deterministic player initials (P46). Pure, no React, no IO. Used by `<PlayerAvatar>`.
 *
 * Rules (in priority order):
 *   1. firstName + lastName both present → first char each
 *   2. displayName has ≥2 whitespace-separated words → first char of word 0 + word 1
 *   3. Single-word name → first 2 chars (e.g. "Rodri" → "RO")
 *   4. Edge: 1-char display name → return as-is
 */
export function playerInitials(
  displayName: string,
  firstName?: string | null,
  lastName?: string | null,
): string {
  if (firstName && lastName) {
    return (firstName[0]! + lastName[0]!).toUpperCase();
  }
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  const word = parts[0] ?? "";
  return word.slice(0, 2).toUpperCase() || "?";
}
