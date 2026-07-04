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
// T15-CUT: knockout ("The Cut") styles — marquee/YOU band/cut line/fallen/ceremony/sheet. Loads
// after vsfield.css; every rule is scoped under ko-/koc- (plus the two is-block row states).
import "./knockout.css";
// Shared box-score modal styles — the drill-in opens <PlayerScoreSheet> (info-only) on this route.
import "@/components/PlayerScoreSheet.css";
import { AppShell } from "../shell/AppShell";
import { getViewerIsCommissioner } from "@/lib/auth/manager";

export default async function VsFieldLayout({ children }: { children: ReactNode }) {
  const isCommissioner = await getViewerIsCommissioner();
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="vsfield" isCommissioner={isCommissioner}>
        {children}
      </AppShell>
    </div>
  );
}
