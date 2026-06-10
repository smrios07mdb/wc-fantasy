/**
 * Scoped layout for the /pool pick'em screen (Prompt 42) — wraps the surface in the dark+cobalt themed
 * App Shell (comfortable density, per design/CLAUDE.md). ds.css is global (root layout, Prompt 20); the
 * screen's scoped `.pl-*` rules are imported by `PoolClient` itself.
 *
 * NAV ENTRY DEFERRED (Prompt 42 — parallel staging): "pool" is intentionally NOT a `NavId` yet. Adding it
 * would edit the shared `crossNav.ts` (the NavId union + NAV_ITEMS) AND `AppShell.tsx` (its exhaustive
 * glyph `Record<NavId, …>`), which this branch must not touch while the notifications branch is in flight.
 * `active` is only ever compared (`item.id === active`), never used to index the glyph map, so passing a
 * non-member value highlights NOTHING — which is correct: /pool has no nav entry this prompt (it's
 * reachable by direct URL only). Post-merge, once "pool" joins `NavId`, drop the cast and it lights up.
 */
import type { ReactNode } from "react";
import type { NavId } from "@/src/shell/crossNav";
import { AppShell } from "../shell/AppShell";

export default function PoolLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <AppShell active={"pool" as NavId}>{children}</AppShell>
    </div>
  );
}
