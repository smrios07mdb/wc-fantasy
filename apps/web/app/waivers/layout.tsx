/**
 * Scoped layout for the FAAB waivers screen — wraps the surface in the dark+cobalt themed App Shell
 * (comfortable density, per design/CLAUDE.md) with the `waivers` nav id active. ds.css is global
 * (root layout, Prompt 20); the screen's scoped `.wv-*` rules are imported by `WaiversClient` itself.
 */
import type { ReactNode } from "react";
import { AppShell } from "../shell/AppShell";
import { getViewerIsCommissioner } from "@/lib/auth/manager";

export default async function WaiversLayout({ children }: { children: ReactNode }) {
  const isCommissioner = await getViewerIsCommissioner();
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="waivers" isCommissioner={isCommissioner}>
        {children}
      </AppShell>
    </div>
  );
}
