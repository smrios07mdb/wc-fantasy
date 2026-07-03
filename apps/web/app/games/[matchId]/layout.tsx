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
import { getViewerIsCommissioner } from "@/lib/auth/manager";

export const metadata: Metadata = { title: "Match" };

export default async function GameDetailLayout({ children }: { children: ReactNode }) {
  const isCommissioner = await getViewerIsCommissioner();
  return (
    // `gd-host` is the ONE structural hook for the mobile-lineups pitch height chain: it lets
    // games.css re-establish a DEFINITE height from the viewport down (`:has(.gd-host)` → html/body/
    // this wrapper get `height:100%`), so the shell's `.sh-app{height:100%}` resolves instead of
    // collapsing to `auto`. Without it the pitch's `height:100cqh` (in `.gd-tabwrap{container-type:size}`)
    // resolves against a zero-height container and the pitch renders empty on a real phone. Scoped to
    // this route only — see games.css §"MOBILE PITCH = FORMATION GRID". No other route is affected.
    <div className="gd-host" data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="pool" isCommissioner={isCommissioner}>
        {children}
      </AppShell>
    </div>
  );
}
