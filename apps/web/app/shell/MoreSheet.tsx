"use client";
import { useState, useEffect } from "react";
import { COMMISH_NAV_ITEM, type NavId, type NavItem } from "@/src/shell/crossNav";

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
        <div role="dialog" aria-label="More navigation" className="sh-more-sheet">
          <div className="sh-more-sheet-items">
            {moreItems.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={item.id === active ? "sh-more-item is-active" : "sh-more-item"}
                aria-current={item.id === active ? "page" : undefined}
                onClick={close}
              >
                {item.label}
              </a>
            ))}
            {/* Gated Commissioner console entry — appended only for commissioners (IA §3 slate entry). */}
            {isCommissioner && (
              <a
                href={COMMISH_NAV_ITEM.href}
                className={
                  active === "commish"
                    ? "sh-more-item sh-more-commish is-active"
                    : "sh-more-item sh-more-commish"
                }
                aria-current={active === "commish" ? "page" : undefined}
                onClick={close}
              >
                {COMMISH_NAV_ITEM.label}
              </a>
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
