/**
 * League-timezone formatting — the single source shared by every surface that shows an instant in the
 * league's local wall clock (the waivers "next batch" element; the per-player kickoff/lock deadline on the
 * set-lineup screen). Lifted here from `apps/web/src/waivers/waiversLogic.ts` so the lineup screen reuses
 * the EXACT same rendering instead of duplicating it.
 */

/**
 * Format an instant in the league's IANA tz so it reads as the local wall clock with a zone abbreviation
 * (e.g. "Thu, Jun 11, 1:00 PM EDT") — `timeZoneName: "short"` is what surfaces the ET/EDT the manager
 * thinks in. Deterministic given (instant, tz), so it formats identically on the server and after
 * hydration (no SSR mismatch).
 */
export function formatInLeagueTz(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: timezone,
  }).format(d);
}
