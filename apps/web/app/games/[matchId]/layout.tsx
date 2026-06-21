/**
 * Scoped layout for the single-match Game Detail screen (T5/T6) — wraps the surface in the dark+cobalt
 * App Shell (ds.css is global from the root layout, Prompt 20). It is a DRILL-IN reached from the
 * dashboard matchday list and the Quiniela (/pool) fixtures, so it has no dedicated nav id; the shell
 * highlights "pool" (the dedicated per-match surface). The screen's scoped `.gd-*` rules are imported by
 * `GameDetailClient` itself.
 *
 * The per-player drill-in reuses the shared `<PlayerScoreSheet>` modal (info-only, like /vsfield), so we
 * import its dedicated stylesheet here — the same pattern vsfield's layout uses.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../../shell/AppShell";
import "@/components/PlayerScoreSheet.css";

export const metadata: Metadata = { title: "Match" };

export default function GameDetailLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="pool">{children}</AppShell>
    </div>
  );
}
