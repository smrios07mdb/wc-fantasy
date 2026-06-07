/**
 * Shared landing chrome (Prompt 19) — the dark, cobalt-accented surface + the brand header used by all
 * four landing states (`signin` marketing page + the `hub` / `unlinked` / `denied` panels). Pure
 * presentational server components: no hooks, no data, no client boundary.
 *
 * `LpRoot` is the per-route scoping wrapper that replaces the design's `body.lp` (the root-layout <body>
 * is shared by every route, so the dark surface lives on a `.lp` wrapper instead — see _landing/landing.css).
 * `data-theme="dark" data-accent="cobalt"` are the ds.css defaults; set explicitly to mirror the design
 * reference's <html> and survive any future change to those defaults.
 *
 * `BrandLink` is the prompt's required `<Brand/>` placement in the landing header: the trophy mark
 * (above the fold → `<BrandMark/>` with next/image priority) + the "XI" wordmark + the league-name line.
 */
import type { ReactNode } from "react";
import { BrandMark } from "@/components/Brand";

export function LpRoot({ children }: { children: ReactNode }) {
  return (
    <div className="lp" data-theme="dark" data-accent="cobalt" data-density="comfortable">
      <div className="lp-wrap">{children}</div>
    </div>
  );
}

export function BrandLink({ href = "/" }: { href?: string }) {
  return (
    <a className="lp-brand" href={href}>
      {/* The trophy mark sits beside the visible "XI" wordmark, so it is decorative here: hide it from the
          a11y tree (BrandMark hardcodes alt="XI", which would otherwise double the link's accessible name). */}
      <span aria-hidden="true" style={{ display: "flex" }}>
        <BrandMark h={30} />
      </span>
      <span className="lp-brand-txt">
        <span className="lp-brand-xi">XI</span>
        <span className="lp-brand-league">WC Fantasy League</span>
      </span>
    </a>
  );
}

/** Sign-out is a STATE-CHANGING action → a POST form to the existing route handler, not a link. */
export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className="btn btn-ghost btn-sm">
        Sign out
      </button>
    </form>
  );
}
