/**
 * Root `not-found.tsx` (F-P1-ERR1, T15-5). Catches unmatched URLs anywhere under the app that don't
 * have a more specific `not-found.tsx` of their own. Without this file, Next injects its own bare
 * `<style>` (white/black system-font page) that wins the cascade tie against ds.css's `body` rule — see
 * the audit finding for the exact mechanism. This renders inside the root layout (ds.css IS loaded
 * here — only `global-error.tsx` bypasses it), so the dark surface + brand fonts apply automatically;
 * no `data-theme`/`data-accent` attrs needed since dark is `:root`'s default.
 *
 * No AppShell: 404s can hit before/without an authenticated nav context, and the bottom nav already
 * gives an escape once a real route is reached — this just needs ONE sensible way back, per the brief.
 */
import { BoundaryScreen } from "./_boundaries/BoundaryScreen";

export default function NotFound() {
  return (
    <BoundaryScreen
      eyebrow="404"
      title="Page not found"
      message="That page doesn't exist, or the link is out of date."
    />
  );
}
