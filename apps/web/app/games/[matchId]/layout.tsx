/**
 * Scoped layout for the single-match Game Detail screen (T5/T6). It is a DRILL-IN reached from the
 * dashboard matchday list, the Quiniela (/pool) fixtures, and The Cut's match strip. The App Shell
 * mounts in `page.tsx` now (F-P3-A4, T15-CUT rider) — a LAYOUT cannot read searchParams, and the
 * active tab derives from the validated `?from=` param there. The screen's scoped `.gd-*` rules are
 * imported by `GameDetailClient` itself.
 *
 * The per-player drill-in reuses the shared `<PlayerScoreSheet>` modal (info-only, like /vsfield), so we
 * import its dedicated stylesheet here — the same pattern vsfield's layout uses.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/components/PlayerScoreSheet.css";

export const metadata: Metadata = { title: "Match" };

export default function GameDetailLayout({ children }: { children: ReactNode }) {
  return (
    // `gd-host` is the ONE structural hook for the mobile-lineups pitch height chain: it lets
    // games.css re-establish a DEFINITE height from the viewport down (`:has(.gd-host)` → html/body/
    // this wrapper get `height:100%`), so the shell's `.sh-app{height:100%}` resolves instead of
    // collapsing to `auto`. Without it the pitch's `height:100cqh` (in `.gd-tabwrap{container-type:size}`)
    // resolves against a zero-height container and the pitch renders empty on a real phone. Scoped to
    // this route only — see games.css §"MOBILE PITCH = FORMATION GRID". No other route is affected.
    <div className="gd-host" data-theme="dark" data-accent="cobalt" data-density="comfortable">
      {children}
    </div>
  );
}
