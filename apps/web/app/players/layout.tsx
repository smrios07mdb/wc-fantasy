/**
 * Scoped layout for the /players browser — wraps the surface in the dark+cobalt App Shell
 * (comfortable density, per design/CLAUDE.md). ds.css is global (root layout); the screen's scoped
 * `.pl-*` rules are imported by `PlayersClient` itself.
 *
 * `/players` is a FIRST-CLASS nav destination (PLAYERS-TAB): the shell's Players tab — desktop top
 * strip + mobile bottom bar, both from the shared crossNav config — highlights here via
 * `active="players"`. This supersedes the PLAYERS-1 URL/tile-only reach; the dashboard tile, the
 * /waivers "Browse all players" link, and the MoreSheet fallback remain as secondary entries.
 */
import type { ReactNode } from "react";
import { AppShell } from "../shell/AppShell";
import { getViewerIsCommissioner } from "@/lib/auth/manager";

export default async function PlayersLayout({ children }: { children: ReactNode }) {
  const isCommissioner = await getViewerIsCommissioner();
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="players" isCommissioner={isCommissioner}>
        {children}
      </AppShell>
    </div>
  );
}
