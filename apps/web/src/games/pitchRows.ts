/**
 * Pure pitch-layout helper: split a position band into balanced formation lines so a populous band
 * never overflows the fixed-height pitch (the clip the single-column lane produced for a 5-/6-deep band).
 *
 * Presentation only — it groups players already built into `side.pitch`; it does NOT touch the
 * view-model (`buildGameDetail`), the data contract, or scoring.
 */

/**
 * Max players in one formation line before a band of 5+ wraps. 5+ wrap identically on both axes; the
 * only axis-dependent case is a flat back-4 (see `narrow` below).
 */
const MAX_PER_LINE = 4;

/**
 * Group a band of N players into balanced sub-lines, FULLER line biased toward the FRONT (toward
 * midfield) so the band reads like a formation:
 *
 *   wide (desktop):  ≤4 → one line                · 5 → [2,3] · 6 → [3,3] · 7 → [3,4] · 8 → [4,4]
 *   narrow (mobile): ≤3 → one line · 4 → [2,2]     · 5 → [2,3] · 6 → [3,3] · 7 → [3,4] · 8 → [4,4]
 *
 * The only axis-dependent split is the flat back-4: on the WIDE (desktop) axis it stays a single
 * line, on the NARROW (mobile) axis it wraps to a balanced 2+2 (back 2 | front 2) so it never
 * overflows a phone's width. `narrow` is the same desktop/mobile signal the half uses to flip its
 * flex-direction — the caller derives it from that one breakpoint, not a new one.
 *
 * The returned order is BACK-line first → FRONT-line last. That order is rendered straight into the
 * GK→FWD flex direction each half already uses (home `row` / away `row-reverse` on desktop; away
 * `column` / home `column-reverse` on mobile), so the fuller line lands nearest the halfway line in
 * every orientation without the caller needing to know which side it is.
 *
 * Generic over the element type so it can be unit-tested without the full `PlayerLine` shape.
 */
export function pitchRows<T>(players: readonly T[], narrow = false): T[][] {
  const n = players.length;
  if (n === 0) return [];
  if (n <= 3) return [[...players]];
  if (n === 4) {
    // Flat back-4: one line on the wide axis, a balanced 2+2 (back 2 | front 2) on the narrow axis.
    return narrow ? [players.slice(0, 2), players.slice(2)] : [[...players]];
  }

  const lineCount = Math.ceil(n / MAX_PER_LINE);
  const base = Math.floor(n / lineCount);
  const extra = n % lineCount;

  // Every line gets `base`; the remainder is handed to the lines nearest the FRONT (the last `extra`
  // entries) so the fuller line sits toward midfield.
  const sizes = Array.from({ length: lineCount }, (_, i) =>
    i >= lineCount - extra ? base + 1 : base,
  );

  const lines: T[][] = [];
  let idx = 0;
  for (const size of sizes) {
    lines.push(players.slice(idx, idx + size));
    idx += size;
  }
  return lines;
}
