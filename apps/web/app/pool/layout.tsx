/**
 * Scoped layout for the /pool pick'em screen (Prompt 42) — wraps the surface in the dark+cobalt themed
 * App Shell (comfortable density, per design/CLAUDE.md). ds.css is global (root layout, Prompt 20); the
 * screen's scoped `.pl-*` rules are imported by `PoolClient` itself.
 *
 * NAV ENTRY (feat/pool-nav): "pool" is now a real `NavId` — wired into the shared `crossNav.ts` (the
 * NavId union + NAV_ITEMS) and `AppShell.tsx` (its exhaustive glyph `Record<NavId, …>`), following the
 * Prompt-17 cross-nav pattern. The Prompt-42 escape-hatch cast (added while the notifications branch
 * was in flight) is gone, so the Pool tab highlights when this route is active.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../shell/AppShell";
import { getViewerIsCommissioner } from "@/lib/auth/manager";

// User-facing page title (Prompt 45 copy rename): the browser tab reads "XI · Quiniela" (root template).
// Display copy only — the route path, NavId key, and identifiers are unchanged.
export const metadata: Metadata = { title: "Quiniela" };

export default async function PoolLayout({ children }: { children: ReactNode }) {
  const isCommissioner = await getViewerIsCommissioner();
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="pool" isCommissioner={isCommissioner}>
        {children}
      </AppShell>
    </div>
  );
}
