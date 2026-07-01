/**
 * Scoped layout for the commissioner console (`/commish`, Thread 1) — wraps the surface in the dark+cobalt
 * themed App Shell (comfortable density, per design/CLAUDE.md). ds.css is global (root layout, Prompt 20); the
 * console's scoped `.adm-*` rules are imported by CommishConsole itself (the pool/playoffs pattern).
 *
 * `isCommissioner` is passed as `true` here: the page gate (resolveCommishAccess) redirects any
 * non-commissioner BEFORE this layout's output is ever sent, so on `/commish` the viewer is always a
 * commissioner and the gated nav entry lights up as active. Surfacing the entry on every OTHER screen is a
 * documented follow-up seam (see DECISIONS.md) — only the hub currently threads the flag.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../shell/AppShell";

export const metadata: Metadata = { title: "Commissioner" };

export default function CommishLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="commish" isCommissioner>
        {children}
      </AppShell>
    </div>
  );
}
