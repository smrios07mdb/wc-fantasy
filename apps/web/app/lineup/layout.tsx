/**
 * Set-lineup route layout. Brings in the design system (ds.css — "linked by every screen") + the
 * set-lineup screen CSS, and wraps the route in the dark, cobalt-accented surface the design specifies
 * (design/CLAUDE.md §3 + the Set Lineup surface notes: dark-first, accent LOCKED cobalt, density LOCKED
 * comfortable). Scoped to this route so the placeholder home/sign-in pages keep their styling.
 */
import type { ReactNode } from "react";
import "./ds.css";
import "./lineup.css";
import { AppShell } from "../shell/AppShell";

export default function LineupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="sl-app" data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="lineup">{children}</AppShell>
    </div>
  );
}
