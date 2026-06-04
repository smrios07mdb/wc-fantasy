/**
 * PURE Sofascore rating extraction. Operates on the HTML string the browser returns (no DOM, no
 * network). The single source-of-truth for WHERE the rating lives is `RATING_DATA` below — when
 * Sofascore changes its markup, this one constant + shape is what moves.
 *
 * TODO(confirm): the real Sofascore page embeds player ratings differently (likely a __NEXT_DATA__ blob
 * or a separate JSON API). Confirm the marker + JSON path against the first live page; keep it HERE.
 */
const RATING_DATA = {
  /** Marker bounding the JSON blob carrying per-player ratings. */
  open: '<script id="__SOFA_DATA__" type="application/json">',
  close: "</script>",
};

interface SofaPlayer {
  id: number;
  rating: number | null;
}

export function extractRating(html: string, sofascorePlayerId: number): number | null {
  const start = html.indexOf(RATING_DATA.open);
  if (start < 0) return null;
  const from = start + RATING_DATA.open.length;
  const end = html.indexOf(RATING_DATA.close, from);
  if (end < 0) return null;
  let data: { players?: SofaPlayer[] };
  try {
    data = JSON.parse(html.slice(from, end)) as { players?: SofaPlayer[] };
  } catch {
    return null; // malformed / partial page → no rating (the resolver falls back to balldontlie)
  }
  const player = data.players?.find((p) => p.id === sofascorePlayerId);
  const rating = player?.rating;
  return typeof rating === "number" ? rating : null;
}
