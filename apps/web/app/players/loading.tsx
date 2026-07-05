/**
 * /players route loading skeleton (NAV-LAT). Streams immediately so the tab-switch paints structure
 * instead of freezing on the old screen. Renders inside this route's layout, so AppShell (top strip +
 * bottom nav + the active "Players" highlight) stays painted around it.
 */
import { RouteSkeleton } from "../shell/RouteSkeleton";

export default function Loading() {
  return <RouteSkeleton variant="list" label="Players" />;
}
