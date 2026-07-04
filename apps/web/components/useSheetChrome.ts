"use client";
/**
 * useSheetChrome — the ONE modal/sheet behavior kit (T15-2, F-P2-I6 + F-P3-A1).
 *
 * Every overlay surface (More sheet, bid composer, FA player card, score sheet, pool drill-in)
 * gets the same three behaviors from one hook instead of five hand-rolled variants:
 *
 *  1. BODY SCROLL LOCK — while any sheet is open the page behind the scrim must not scroll
 *     (iOS scroll-chaining detaches the sheet from its background state; rubber-banding can
 *     trigger pull-to-refresh in PWA standalone). Module-level count so STACKED sheets (the FA
 *     card opened from inside the bid composer) don't unlock the body when the top one closes.
 *     The lock is the boring `body{overflow:hidden}` form — combined with per-scroller
 *     `overscroll-behavior: contain` (CSS side) this is the standard containment pair.
 *  2. ESCAPE dismiss — keyboard/switch-control users get the same out as the scrim tap.
 *  3. FOCUS containment — focus moves into the panel on open, Tab cycles inside it, and focus
 *     returns to the opener on close (aria-modal is only honest if focus is actually scoped).
 *
 * Callers that mount-only-while-open (composer, cards) pass `open: true` and rely on
 * mount/unmount; MoreSheet passes its `open` state. No portal assumptions — works on the
 * conditional-render pattern every sheet here uses.
 */
import { useEffect, useRef, type RefObject } from "react";

let lockCount = 0;
let prevBodyOverflow = "";

function lockBody() {
  if (++lockCount === 1) {
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function unlockBody() {
  if (lockCount > 0 && --lockCount === 0) {
    document.body.style.overflow = prevBodyOverflow;
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useSheetChrome(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
) {
  // Latest-onClose ref: the effect below deliberately runs once per open-cycle (re-running on
  // every parent render would re-lock/re-focus), but Escape must still call the CURRENT close
  // handler, not the one captured when the sheet opened.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    lockBody();

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // Move focus INTO the sheet: first focusable control, else the panel itself.
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const p = panelRef.current;
      if (!p) return;
      // No visibility filter: our sheets render no hidden focusables (conditional-render
      // pattern), and offsetParent/getClientRects are layout-dependent — always empty in jsdom,
      // which would degenerate the trap in the DOM tests.
      const focusables = Array.from(p.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) {
        e.preventDefault();
        p.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement;
      // Wrap at the edges; recapture focus that escaped the panel entirely.
      if (e.shiftKey && (active === first || !p.contains(active))) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && (active === last || !p.contains(active))) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      unlockBody();
      // Best-effort focus restore — the opener may have unmounted (e.g. a navigating item).
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
    // One run per open-cycle by design (re-running would re-lock/re-focus on every parent
    // render); onCloseRef + panelRef stay current without being deps.
  }, [open]);
}
