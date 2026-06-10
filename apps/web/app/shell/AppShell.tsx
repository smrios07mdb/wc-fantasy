/**
 * AppShell — the global navigation chrome that wraps the AUTHENTICATED screens (the hub `/` + `/draft`
 * + `/lineup` + `/vsfield`). Ported from the canonical design source `App Shell.html` + `shell/` (the
 * `GlobalTopbar` variant of the design's GlobalNav); CSS lives in `./shell.css`. It SUPERSEDES the
 * interim Prompt-17 `CrossNav` (now removed): same top-strip position, fuller chrome.
 *
 * Pure SERVER component — no `"use client"`, no hooks, no JS shipped. Active state is passed EXPLICITLY
 * (`active`) by each consumer, which already knows its own route, instead of CrossNav's client-side
 * `usePathname()`. Every affordance is no-JS: nav items are plain `<a>`, sign-out is a POST `<form>` to
 * the existing `/auth/sign-out` route handler (reused verbatim from CrossNav / the Prompt-16 hub).
 *
 * Brand placement follows BRAND.md §5 ("Desktop sidebar / top bar → trophy badge + 'XI' with the league
 * name as the secondary line"): the `<BrandBadge/>` trophy chip (the Prompt-18 production form of the
 * old `.vf-logo` "W") + the "XI" wordmark + the `WC Fantasy League` placeholder line.
 *
 * SCOPE (deliberately minimal — "boring and reliable", no dead links): the nav lists ONLY the four
 * screens that exist today. The prototype's richer chrome targets screens that aren't built yet, so it
 * is left as flagged seams to add when those ship:
 *   TODO(confirm): the full design IA (My Team · Standings · Free Agents · Waivers · Draft · Playoffs ·
 *     Player Box Score · Notifications · Settings) + the "More" overflow — add nav entries as each route
 *     lands (mirrors the landing's deferred unbuilt-screen links).
 *   TODO(confirm): the persistent bell (→ Notifications) + avatar menu (Profile/Settings) + the slate
 *     commissioner entry — these need their target screens + identity wiring first.
 *   TODO(confirm): the dedicated mobile tab-bar + bottom sheets. For now the top bar wraps responsively
 *     (see shell.css); the design's `MobileTabBar`/`MobileSheet` are a later mobile pass.
 */
import type { ReactNode } from "react";
import { BrandBadge } from "@/components/Brand";
import { NAV_ITEMS, type NavId } from "@/src/shell/crossNav";
import "./shell.css";

// The one nav icon set, ported from `shell/components.jsx` `NavIcon` (the design's `home/draft/lineup/
// field` glyphs), keyed by our NavId. Decorative — labelled by the adjacent text, so aria-hidden.
function NavIcon({ id }: { id: NavId }) {
  const glyph: Record<NavId, ReactNode> = {
    home: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9h5v-5h4v5h5v-9" />
      </>
    ),
    draft: (
      <>
        <path d="M14 4 20 10 9.5 20.5 4 21l.5-5.5L14 4Z" />
        <path d="M12.5 5.5 18.5 11.5" />
      </>
    ),
    lineup: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
        <path d="M3.5 12h17M12 3.5v17" />
        <circle cx="12" cy="12" r="2.4" />
      </>
    ),
    vsfield: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5v17M3.6 9.5h3.4v5H3.6M20.4 9.5H17v5h3.4" />
      </>
    ),
    // Waivers = the sealed-bid padlock (mirrors the design's `WvSealed` FAAB glyph).
    waivers: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    // Scoring = a rulebook / lined document (the in-app scoring reference, Prompt 28).
    scoring: (
      <>
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
      </>
    ),
    // Settings = gear cog (Prompt 39).
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph[id]}
    </svg>
  );
}

export function AppShell({
  active,
  signedInAs,
  children,
}: {
  active: NavId;
  signedInAs?: string;
  children: ReactNode;
}) {
  return (
    <div className="sh-app sh-app-top">
      {/* A <header> maps to a `banner` landmark; the /lineup screen renders its own `sl-topbar` header
          too, so label this one to keep the two landmarks distinguishable (axe landmark-no-duplicate). */}
      <header className="sh-topbar" aria-label="Global">
        {/* Brand → home (BRAND.md §5: trophy badge + "XI" + league-name secondary line). The badge is
            decorative beside the visible "XI" wordmark: hide it (BrandBadge hardcodes aria-label="XI",
            which would otherwise double the link's accessible name — same fix as the landing BrandLink). */}
        <a className="sh-brand" href="/">
          <span aria-hidden="true" style={{ display: "flex" }}>
            <BrandBadge size={28} />
          </span>
          <span className="sh-brand-txt">
            <b className="display">XI</b>
            <span className="t-micro text-tertiary">WC Fantasy League</span>
          </span>
        </a>

        <nav className="sh-topnav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === active;
            return (
              <a
                key={item.id}
                href={item.href}
                className={isActive ? "sh-nav-item is-active" : "sh-nav-item"}
                aria-current={isActive ? "page" : undefined}
              >
                <NavIcon id={item.id} />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="sh-top-r">
          {signedInAs && (
            <span className="sh-top-who">
              Signed in as <b>{signedInAs}</b>
            </span>
          )}
          {/* Sign-out is STATE-CHANGING → a POST form to the existing route handler, not a link. */}
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="btn btn-ghost btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="sh-content">{children}</div>
    </div>
  );
}
