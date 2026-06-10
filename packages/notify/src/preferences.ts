/**
 * Pure validator for the `POST /api/notifications/preferences` body. Mirrors the `validateDisplayName`
 * idiom (no IO, returns a discriminated result the handler maps to 400/200). The body is a FULL
 * replace of the three channel flags — the Settings UI always sends all three, so a missing or
 * non-boolean flag is a malformed request, not a partial update. No truthiness coercion: a flag must
 * be a real `boolean`.
 */
import type { NotificationPreference } from "./types";

export type PreferenceResult =
  | { ok: true; value: NotificationPreference }
  | { ok: false; reason: "invalid" };

const INVALID: PreferenceResult = { ok: false, reason: "invalid" };

export function validatePreferenceInput(raw: unknown): PreferenceResult {
  if (typeof raw !== "object" || raw === null) return INVALID;
  const b = raw as Record<string, unknown>;
  if (
    typeof b.draftTurn !== "boolean" ||
    typeof b.playerNotStarting !== "boolean" ||
    typeof b.matchStarting !== "boolean"
  ) {
    return INVALID;
  }
  return {
    ok: true,
    value: {
      draftTurn: b.draftTurn,
      playerNotStarting: b.playerNotStarting,
      matchStarting: b.matchStarting,
    },
  };
}
