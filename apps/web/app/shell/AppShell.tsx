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
 * Responsive nav (Prompt 40):
 *   ≥640px — contained top strip (`.sh-topnav-scroll` scroll box with `min-width:0` ancestors;
 *             active-tab scroll stays inside the container via the `MoreSheet` client island).
 *   <640px — fixed bottom tab bar (Dashboard · Set lineup · Vs the field · Pool · More).
 *   Both navs rendered in the DOM; swap is pure CSS at 640px (no matchMedia, no hydration fork),
 *   following the §18 vsfield precedent. 640px is intentionally distinct from vsfield's 760px.
 *
 * SCOPE (deliberately minimal — "boring and reliable", no dead links): the nav lists ONLY the four
 * screens that exist today. The prototype's richer chrome targets screens that aren't built yet, so it
 * is left as flagged seams to add when those ship:
 *   TODO(confirm): the persistent bell (→ Notifications) + avatar menu (Profile/Settings) + the slate
 *     commissioner entry — these need their target screens + identity wiring first.
 */
import type { ReactNode } from "react";
import { BrandBadge } from "@/components/Brand";
import {
  NAV_ITEMS,
  BOTTOM_TAB_ITEMS,
  MORE_SHEET_ITEMS,
  selectMobileNavPartition,
  type NavId,
} from "@/src/shell/crossNav";
import { MoreSheet } from "./MoreSheet";
import "./shell.css";

// The one nav icon set, ported from `shell/components.jsx` `NavIcon` (the design's `home/draft/lineup/
// field` glyphs), keyed by our NavId. Decorative — labelled by the adjacent text, so aria-hidden.
function NavIcon({ id, size = 18 }: { id: NavId; size?: number }) {
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
    // Pool = a pick'em ballot card with a check (the match pick'em pool, Prompt 42) — distinct from
    // scoring's lined doc and vsfield's goal-circle.
    pool: (
      <>
        <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
        <path d="M8.5 12.5 11 15l4.5-5.5" />
      </>
    ),
    // Playoffs = the guillotine: two posts + a dropping blade wedge (the screen's signature, Phase 4).
    playoffs: (
      <>
        <path d="M5 3v18M19 3v18" />
        <path d="M5 4h14v6l-14 4z" />
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
      width={size}
      height={size}
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
  const { moreHasActive } = selectMobileNavPartition(active);

  return (
    <div className="sh-app sh-app-top">
      {/* ── Top strip (≥640px) ── A <header> maps to a `banner` landmark; the /lineup screen renders
          its own `sl-topbar` header too, so label this one to keep the two landmarks distinguishable. */}
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

        {/* Contained scroll box — never widens its parent (Prompt 40 overflow fix). min-width:0
            overrides the flex-item default `min-width:auto` so the box can shrink/scroll instead
            of expanding the document. The active-tab scroll-into-view is handled by MoreSheet's
            useEffect, which scrolls the [aria-current="page"] item into this container. */}
        <div className="sh-topnav-scroll">
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
        </div>

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

      {/* ── Mobile bottom bar (<640px) ── Both navs are in the DOM; the 640px CSS media query
          switches between them — no matchMedia, no hydration fork (§18 precedent). The More
          button and sheet are the only stateful piece; they live in the MoreSheet client island. */}
      <nav className="sh-btmnav" aria-label="Primary">
        {BOTTOM_TAB_ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <a
              key={item.id}
              href={item.href}
              className={isActive ? "sh-btnav-item is-active" : "sh-btnav-item"}
              aria-current={isActive ? "page" : undefined}
            >
              <NavIcon id={item.id} size={20} />
              <span>{item.label}</span>
            </a>
          );
        })}
        {/* MoreSheet: client island for open/close + scroll-into-view side-effect */}
        <MoreSheet
          active={active}
          moreHasActive={moreHasActive}
          signedInAs={signedInAs}
          moreItems={MORE_SHEET_ITEMS}
        />
      </nav>
    </div>
  );
}
