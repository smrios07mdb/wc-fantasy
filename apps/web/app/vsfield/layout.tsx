/**
 * Scoped layout for the "vs the field" screen — imports the design system + the screen's `.vf-*` rules
 * and wraps the surface in the dark+cobalt themed shell (comfortable density, per the live-surface
 * notes in design/CLAUDE.md). Scoped so other routes keep their own styling.
 *
 * Prompt 20 closed the earlier TODO: this screen now nests into the global App Shell (the `vsfield` nav
 * id) instead of carrying the interim CrossNav.
 */
import type { ReactNode } from "react";
import "./ds.css";
import "./vsfield.css";
// Shared box-score modal styles — the drill-in opens <PlayerScoreSheet> (info-only) on this route.
import "@/components/PlayerScoreSheet.css";
import { AppShell } from "../shell/AppShell";

export default function VsFieldLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="vsfield">{children}</AppShell>
    </div>
  );
}
