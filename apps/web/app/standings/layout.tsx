/**
 * Scoped layout for the /standings page (T10) — wraps the surface in the dark+cobalt themed App Shell
 * (comfortable density, per design/CLAUDE.md) with the `standings` nav id active. ds.css is global (root
 * layout, Prompt 20); the screen's scoped `.st-*` rules are imported by `StandingsClient` itself (the
 * playoffs/pool pattern).
 *
 * NAV ENTRY: "standings" is a real `NavId` — wired into the shared `crossNav.ts` (the NavId union +
 * NAV_ITEMS + MORE_SHEET_ITEMS) and `AppShell.tsx` (its exhaustive glyph `Record<NavId, …>`), following
 * the playoffs precedent (More overflow, not a new primary bottom tab).
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../shell/AppShell";

export const metadata: Metadata = { title: "Standings" };

export default function StandingsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="standings">{children}</AppShell>
    </div>
  );
}
