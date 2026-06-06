/**
 * Scoped layout for the "vs the field" screen — imports the design system + the screen's `.vf-*` rules
 * and wraps the surface in the dark+cobalt themed shell (comfortable density, per the live-surface
 * notes in design/CLAUDE.md). Scoped so other routes keep their own styling.
 *
 * TODO(prompt-NN): once the global App Shell is ported to apps/web, this screen nests into it under the
 * `field` nav id (design/design_reference/shell) instead of carrying its own top bar.
 */
import type { ReactNode } from "react";
import "./ds.css";
import "./vsfield.css";

export default function VsFieldLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      {children}
    </div>
  );
}
