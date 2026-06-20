/**
 * Deep-link seed for the live "vs the field" cockpit. The dashboard links each standings row to
 * `/vsfield?manager=<id>` (T3); this maps that raw query param to an initial H2H selection (`effSel`),
 * GUARDED so a missing / malformed / unknown id can never seed a non-existent manager — that would
 * render an empty/broken head-to-head. Returns `null` when the param can't be trusted, so the client
 * falls back to its existing default selection.
 *
 * Mirrors the client `select` collapse: deep-linking to your OWN row resolves to `"field"` (the
 * aggregate cockpit), exactly as clicking your own leaderboard row does — never to your managerId.
 *
 * Pure (no Next / React / IO) so the validation guard is unit-tested directly.
 */
export interface SeedFieldEntry {
  managerId: string;
  isMe: boolean;
}

export function seedManagerSelection(
  rawManager: string | string[] | undefined,
  field: readonly SeedFieldEntry[],
): string | null {
  // Absent, or duplicated (`?manager=a&manager=b` → string[]): ignore.
  if (typeof rawManager !== "string" || rawManager === "") return null;
  const match = field.find((e) => e.managerId === rawManager);
  if (!match) return null; // Unknown manager → never seed a bad value.
  return match.isMe ? "field" : match.managerId;
}
