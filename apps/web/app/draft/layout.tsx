/**
 * Draft-route layout. Brings in the design system (ds.css — "linked by every screen") + the draft
 * screen CSS, and wraps the route in the dark, cobalt-accented surface the design specifies
 * (design/CLAUDE.md §3: dark-first, accent LOCKED cobalt, density compact). Scoped to this route so the
 * placeholder home/sign-in pages keep their current styling.
 */
import type { ReactNode } from "react";
import "./ds.css";
import "./draft.css";

export default function DraftLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dr-app" data-theme="dark" data-accent="cobalt" data-density="compact">
      {children}
    </div>
  );
}
