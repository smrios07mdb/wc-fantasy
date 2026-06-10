/**
 * Scoped layout for the /settings screen — wraps the surface in the dark+cobalt App Shell
 * (comfortable density) with the `settings` nav id active (Prompt 39). ds.css is global
 * (root layout, Prompt 20); the screen's scoped `.se-*` rules are imported by `page.tsx`.
 */
import type { ReactNode } from "react";
import { AppShell } from "../shell/AppShell";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="settings">{children}</AppShell>
    </div>
  );
}
