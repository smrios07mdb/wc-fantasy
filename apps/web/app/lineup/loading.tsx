/**
 * /lineup route loading skeleton (NAV-LAT). Streams the instant the response opens so a bottom-tab
 * tap paints structure immediately instead of the frozen previous screen. Renders inside this route's
 * layout, so AppShell (top strip + bottom nav + the active "Set lineup" highlight) stays around it.
 */
import { RouteSkeleton } from "../shell/RouteSkeleton";

export default function Loading() {
  return <RouteSkeleton variant="pitch" label="Set lineup" />;
}
