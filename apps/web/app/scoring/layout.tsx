/**
 * Scoped layout for the /scoring rules reference — wraps the surface in the dark+cobalt App Shell with
 * the `scoring` nav id active (Prompt 28). ds.css is global (root layout, Prompt 20); the page's scoped
 * `.sc-*` rules are imported by `page.tsx` itself.
 */
import type { ReactNode } from "react";
import { AppShell } from "../shell/AppShell";

export default function ScoringLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active="scoring">{children}</AppShell>
    </div>
  );
}
