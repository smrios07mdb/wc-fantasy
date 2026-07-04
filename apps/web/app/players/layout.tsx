/**
 * Scoped layout for the /players browser — wraps the surface in the dark+cobalt App Shell
 * (comfortable density, per design/CLAUDE.md). ds.css is global (root layout); the screen's scoped
 * `.pl-*` rules are imported by `PlayersClient` itself.
 *
 * `/players` is NOT a nav destination (T15-2 owns the nav; entry is the dashboard tile + the /waivers
 * "Browse all players" link), so `active={null}` — the shell highlights nothing. This relies on the
 * PLAYERS-1 one-line `AppShell` `active: NavId | null` widening.
 */
import type { ReactNode } from "react";
import { AppShell } from "../shell/AppShell";
import { getViewerIsCommissioner } from "@/lib/auth/manager";

export default async function PlayersLayout({ children }: { children: ReactNode }) {
  const isCommissioner = await getViewerIsCommissioner();
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active={null} isCommissioner={isCommissioner}>
        {children}
      </AppShell>
    </div>
  );
}
