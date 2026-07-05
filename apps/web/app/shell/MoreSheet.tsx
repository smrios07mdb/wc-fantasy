"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { COMMISH_NAV_ITEM, type NavId, type NavItem } from "@/src/shell/crossNav";
import { useSheetChrome } from "@/components/useSheetChrome";

// Three-dot "more" glyph — distinct from all other NavIcon glyphs.
function MoreIcon() {
  return (
    <svg
      aria-hidden="true"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function MoreSheet({
  active,
  moreHasActive,
  signedInAs,
  isCommissioner,
  moreItems,
}: {
  active: NavId | null;
  moreHasActive: boolean;
  signedInAs?: string;
  /** When true, appends the gated Commissioner console entry to the More sheet (IA §3 slate entry). */
  isCommissioner?: boolean;
  moreItems: readonly NavItem[];
}) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Scroll the active top-nav item into its scroll container (not the document) on mount.
  // Runs once after hydration; the scroll container has overflow-x:auto so scrollIntoView
  // captures it instead of the document scroll root.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('[aria-current="page"].sh-nav-item');
    if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  // Close the sheet when navigating (route change closes automatically via full page load,
  // but guard for any client-side nav future).
  function close() {
    setOpen(false);
  }

  // T15-2 (F-P2-I6 + F-P3-A1): body scroll lock + Escape + focus trap while the sheet is open.
  useSheetChrome(open, close, sheetRef);

  return (
    <>
      <button
        type="button"
        className={
          moreHasActive ? "sh-btnav-item sh-more-btn is-more-active" : "sh-btnav-item sh-more-btn"
        }
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="More navigation options"
      >
        <MoreIcon />
        <span>More</span>
      </button>

      {open && <div className="sh-more-backdrop" aria-hidden="true" onClick={close} />}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="More navigation"
          className="sh-more-sheet"
          ref={sheetRef}
          tabIndex={-1}
        >
          {/* T15-2 (F-P2-A4): reference MobileSheet chrome — grabber + title + explicit ✕
              (dismissal was scrim-tap-only, with no visible affordance). */}
          <div className="sh-sheet-grab" aria-hidden="true" />
          <div className="sh-sheet-head">
            <span className="sh-sheet-title">More</span>
            <button type="button" className="sh-sheet-x" onClick={close} aria-label="Close menu">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="sh-more-sheet-items">
            {/* prefetch={false} per NAV_LATENCY_NOTES §5 (same posture as the bottom-tab Links);
                onClick={close} keeps the sheet-dismiss-on-tap behavior. Link renders a real <a href>
                so pre-hydration taps still navigate as plain MPA anchors. */}
            {moreItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                className={item.id === active ? "sh-more-item is-active" : "sh-more-item"}
                aria-current={item.id === active ? "page" : undefined}
                onClick={close}
              >
                {item.label}
              </Link>
            ))}
            {/* PLAYERS-1 remediation: the mobile reachability entry for the read-only /players browser.
                A standalone additive item (NOT a NavId, so /players stays out of the nav model — a
                first-class Players tab is T15-2's to add); the More sheet is the mobile nav surface. */}
            <Link href="/players" prefetch={false} className="sh-more-item" onClick={close}>
              Browse players
            </Link>
            {/* Gated Commissioner console entry — appended only for commissioners (IA §3 slate entry). */}
            {isCommissioner && (
              <Link
                href={COMMISH_NAV_ITEM.href}
                prefetch={false}
                className={
                  active === "commish"
                    ? "sh-more-item sh-more-commish is-active"
                    : "sh-more-item sh-more-commish"
                }
                aria-current={active === "commish" ? "page" : undefined}
                onClick={close}
              >
                {COMMISH_NAV_ITEM.label}
              </Link>
            )}
          </div>

          <div className="sh-more-footer">
            {signedInAs && (
              <div className="sh-more-identity">
                Signed in as <b>{signedInAs}</b>
              </div>
            )}
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="btn btn-ghost btn-sm sh-more-signout">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
