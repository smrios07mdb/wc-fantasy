/**
 * Pure pitch-layout helper: split a position band into the formation lines a real lineup view draws,
 * so a populous band reads as the formation AND never overflows the pitch. Presentation only — it groups
 * players already built into `side.pitch`; it does NOT touch the view-model (`buildGameDetail`), the data
 * contract, or scoring.
 *
 * The split follows FOOTBALL CONVENTION, keyed on the BAND (not a viewport axis), with the DEEPER line —
 * the one toward the team's own goal — listed FIRST so it renders nearest the back in every orientation:
 *
 *   GK / any band ≤ 4 → one line               (a flat back-4 and a flat mid-4 are SINGLE lines that
 *                                                shrink to fit, never a 2+2 — the locked real-app rule)
 *   DEF 5            → [3, 2]                   (a back three + a wing-back pair)
 *   MID 5            → [2, 3]                   (two holding deep + three ahead; the 4-2-3-1 / 4-5-1 case)
 *   FWD 5            → [2, 3]                   (front-loaded; only reachable by an anomalous XI)
 *   any band ≥ 6     → balanced lines of ≤ 4, fuller toward the FRONT (anomaly safety net; an 11-man XI
 *                       can't field 6 in one band — this only fires when the kickoff-XI reconciliation
 *                       could not resolve to 11, see {@link SquadSide.pitch})
 *
 * Returned order is BACK-line first → FRONT-line last. The half renders that straight into the GK→FWD
 * flex direction it already uses (desktop `row`/`row-reverse`; mobile `column`/`column-reverse`), so the
 * deeper line always lands toward own goal without the caller knowing which side it is. There is no
 * longer an axis-dependent split: the flat-4 reads identically on phone and desktop (it just shrinks on
 * the phone), which is what removed the old wide/narrow dual-render.
 *
 * Generic over the element type so it can be unit-tested without the full `PlayerLine` shape.
 */

/** The four pitch bands. Only DEF vs MID/FWD changes the n = 5 split; GK never reaches a multi-line n. */
export type PitchBand = "GK" | "DEF" | "MID" | "FWD";

/** Max players in one formation line before a band of 6+ (anomaly only) wraps into balanced lines. */
const MAX_PER_LINE = 4;

export function pitchRows<T>(players: readonly T[], band: PitchBand): T[][] {
  const n = players.length;
  if (n === 0) return [];
  // ≤ 4 is always a single line: GK, a back/mid three, a flat back-4 / mid-4 (shrinks to fit, no 2+2),
  // a front 2/3, etc. This is the formation line you'd see on Sofascore / FotMob / the FIFA app.
  if (n <= MAX_PER_LINE) return [[...players]];

  // 5 is the only convention-split case. DEF reads as a back three behind a wing-back pair (deeper line
  // = 3, listed first); MID/FWD read as a holding pair behind a forward trio (deeper line = 2, first).
  if (n === 5) {
    return band === "DEF"
      ? [players.slice(0, 3), players.slice(3)]
      : [players.slice(0, 2), players.slice(2)];
  }

  // 6+ never happens for a legal XI; balance into ≤4 lines with the remainder biased toward the FRONT so
  // the wider line sits nearest midfield (keeps a reconciliation-anomaly band from clipping the pitch).
  const lineCount = Math.ceil(n / MAX_PER_LINE);
  const base = Math.floor(n / lineCount);
  const extra = n % lineCount;
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
