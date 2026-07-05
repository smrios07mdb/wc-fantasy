/**
 * `/games/[matchId]` not-found.tsx (F-P1-ERR1, T15-5). Scoped to this segment so the `notFound()` call
 * in `page.tsx` (`if (!view) notFound()`, for an unknown/inaccessible matchId) resolves to a branded
 * screen instead of the bare root 404 — Next renders the NEAREST `not-found.tsx` in the segment tree,
 * so this one wins for that call while the root file still covers unmatched URLs. Renders inside
 * `GameDetailLayout`'s `.gd-host` wrapper (dark theme + cobalt accent already applied there), so no
 * extra theme attrs are needed here.
 */
import { BoundaryScreen } from "../../_boundaries/BoundaryScreen";

export default function MatchNotFound() {
  return (
    <BoundaryScreen
      eyebrow="404"
      title="Match not found"
      message="This match doesn't exist, or you don't have access to it."
    />
  );
}
