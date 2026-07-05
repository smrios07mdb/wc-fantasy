/**
 * `/games/[matchId]` loading skeleton (F-P2-ERR1, T15-5). Closes the one gap NAV-LAT's loading.tsx
 * sweep left open: this route mounts AppShell INSIDE `page.tsx` (F-P3-A4 — the active tab derives from
 * a validated `?from=` searchParam, which a `layout.tsx`/`loading.tsx` cannot read), so — same as
 * `app/loading.tsx` for `/` — this file renders its own static, inert shell chrome around the content
 * skeleton instead of relying on a layout-mounted `<AppShell>`.
 *
 * Since `?from=` is unreadable here, the active tab can't be derived; the real page's own fallback
 * when `from` is absent/unknown is "pool" (see `page.tsx` `GAME_FROM_TABS` + `active` default), so this
 * skeleton highlights "pool" to match the common case. A tap arriving via `?from=home` or `?from=
 * vsfield` briefly shows the wrong active tab during the streaming window — an accepted cosmetic
 * transient, same class as `app/loading.tsx`'s documented base-label transient.
 *
 * Body reuses the shared `pitch` variant (tab strip + hero band + large field block + legend chips) —
 * the closest existing archetype to the real screen's tab bar + scoreboard + pitch-halves shape. No new
 * RouteSkeleton variant is added (additive-files-only fence for this thread).
 */
import { BOTTOM_TAB_ITEMS, NAV_ITEMS } from "@/src/shell/crossNav";
import { RouteSkeleton } from "../../shell/RouteSkeleton";
import "../../shell/shell.css";

const FALLBACK_ACTIVE = "pool";

/** Decorative placeholder glyph — mirrors `app/loading.tsx`'s inert nav-icon stand-in. */
function DotGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
    >
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

export default function Loading() {
  return (
    <div
      className="sh-app sh-app-top"
      data-theme="dark"
      data-accent="cobalt"
      data-density="comfortable"
    >
      {/* ── Desktop top strip (≥640px) — brand + inert nav labels, "pool" fallback active ── */}
      <header className="sh-topbar" aria-label="Global" aria-busy="true">
        <span className="sh-brand" aria-hidden="true">
          <span
            className="skeleton"
            style={{ width: 28, height: 28, borderRadius: "var(--r-md)" }}
          />
          <span className="sh-brand-txt">
            <b className="display">XI</b>
            <span className="t-micro text-tertiary">WC Fantasy League</span>
          </span>
        </span>
        <div className="sh-topnav-scroll" aria-hidden="true">
          <nav className="sh-topnav">
            {NAV_ITEMS.map((item) => (
              <span
                key={item.id}
                className={item.id === FALLBACK_ACTIVE ? "sh-nav-item is-active" : "sh-nav-item"}
                data-active={item.id === FALLBACK_ACTIVE ? "" : undefined}
              >
                {item.label}
              </span>
            ))}
          </nav>
        </div>
        <div className="sh-top-r" aria-hidden="true">
          <span
            className="skeleton"
            style={{ width: 72, height: 30, borderRadius: "var(--r-md)" }}
          />
        </div>
      </header>

      {/* ── Content — the game-detail body skeleton (pitch archetype: tabs + hero + field + legend) ── */}
      <div className="sh-content">
        <RouteSkeleton variant="pitch" label="Match" />
      </div>

      {/* ── Mobile bottom bar (<640px) — inert slots mirroring the real bar, "pool" fallback active ── */}
      <nav className="sh-btmnav" aria-label="Primary" aria-busy="true" aria-hidden="true">
        {BOTTOM_TAB_ITEMS.map((item) => (
          <span
            key={item.id}
            className={item.id === FALLBACK_ACTIVE ? "sh-btnav-item is-active" : "sh-btnav-item"}
            data-active={item.id === FALLBACK_ACTIVE ? "" : undefined}
          >
            <DotGlyph size={20} />
            <span>{item.label}</span>
          </span>
        ))}
        <span className="sh-btnav-item sh-more-btn">
          <DotGlyph size={20} />
          <span>More</span>
        </span>
      </nav>
    </div>
  );
}
