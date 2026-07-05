/**
 * `/` (Dashboard tab) loading skeleton (NAV-LAT).
 *
 * Unlike the 11 feature routes, `/` mounts the AppShell INSIDE `page.tsx` (not a layout — see
 * `app/page.tsx` Hub), so this fallback replaces the whole page, shell and all. To keep the brief's
 * invariant — the app shell + bottom nav stay visible and the active tab stays highlighted while
 * loading — this file renders its OWN static, synchronous shell chrome around the dashboard skeleton.
 *
 * It is deliberately NOT the real `<AppShell>`: AppShell is async (it awaits `loadNavPhase()`), and an
 * async fallback would itself suspend and defeat the point. This chrome is inert (no `<a>`/`<button>`,
 * no JS) and reuses the real `shell.css` classes + `crossNav` labels so it can't drift from the bar it
 * mirrors. Labels are the GROUP-phase base set; during a live knockout the real bar relabels two slots
 * (vsfield→"The Cut", playoffs→"Theater"), so this transient skeleton may show the base labels for the
 * brief streaming window before the real shell paints — an accepted cosmetic transient on a loading state.
 *
 * The Dashboard tab is only ever reached from the authenticated bottom bar (the `hub` outcome), so the
 * dashboard-in-shell skeleton is the correct match for the dead-tap case this thread fixes. A logged-out
 * cold load of `/` (the marketing/unlinked/denied outcomes, which have no shell) would flash this
 * skeleton for the brief `getSessionManager()` window before the real page paints — accepted + noted.
 */
import { BOTTOM_TAB_ITEMS, NAV_ITEMS } from "@/src/shell/crossNav";
import { RouteSkeleton } from "./shell/RouteSkeleton";
import "./shell/shell.css";

/** Decorative placeholder glyph — real nav uses per-id icons; the skeleton needs only a shape. */
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
      {/* ── Desktop top strip (≥640px) — brand + inert nav labels, Dashboard active ── */}
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
                className={item.id === "home" ? "sh-nav-item is-active" : "sh-nav-item"}
                data-active={item.id === "home" ? "" : undefined}
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

      {/* ── Content — the dashboard body skeleton (its own banner leads, so `bare`) ── */}
      <div className="sh-content">
        <RouteSkeleton variant="dashboard" label="Dashboard" bare />
      </div>

      {/* ── Mobile bottom bar (<640px) — inert slots mirroring the real bar, Dashboard active ── */}
      <nav className="sh-btmnav" aria-label="Primary" aria-busy="true" aria-hidden="true">
        {BOTTOM_TAB_ITEMS.map((item) => (
          <span
            key={item.id}
            className={item.id === "home" ? "sh-btnav-item is-active" : "sh-btnav-item"}
            data-active={item.id === "home" ? "" : undefined}
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
