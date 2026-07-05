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

/**
 * Time-only sibling of `formatInLeagueTz` (e.g. "1:00 PM EDT") — for compact surfaces where the date is
 * already implied by context (the dashboard matchday row shows today's fixtures). Same determinism
 * contract: identical output on the server and after hydration given (instant, tz).
 */
export function formatInLeagueTzTime(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: timezone,
  }).format(d);
}

/**
 * Compact date+time sibling of `formatInLeagueTz` (e.g. "Jun 12, 1:00 PM EDT") — drops the weekday for
 * tight slots (the banner secondary stat). Same determinism contract as the canon formatter.
 */
export function formatInLeagueTzShort(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: timezone,
  }).format(d);
}

/**
 * Date-only sibling of `formatInLeagueTz` (e.g. "Jul 1, 2026") — for date-granular facts ("frozen since").
 * The tz decides WHICH calendar date the instant falls on (an evening-ET freeze is that ET day, not the
 * next UTC day); no zone suffix because no wall-clock time is shown.
 */
export function formatInLeagueTzDate(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(d);
}
