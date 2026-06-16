/**
 * Scoped layout for the /playoffs guillotine theater (Phase 4) — wraps the surface in the dark+cobalt themed
 * App Shell (comfortable density, per design/CLAUDE.md). ds.css is global (root layout, Prompt 20); the
 * screen's scoped `.po-*` / `.mpo-*` rules are imported by `PlayoffsClient` itself (the pool pattern).
 *
 * NAV: "playoffs" is a real `NavId` — wired into `crossNav.ts` (the union + NAV_ITEMS + MORE_SHEET_ITEMS)
 * and `AppShell.tsx` (its exhaustive glyph `Record<NavId, …>`), following the cross-nav pattern. Guillotine
 * Playoffs lives in the More overflow (IA §3), not a primary bottom tab.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../shell/AppShell";

export const metadata: Metadata = { title: "Guillotine" };

export default function PlayoffsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="playoffs">{children}</AppShell>
    </div>
  );
}
