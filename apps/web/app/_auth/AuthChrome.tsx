// _auth/AuthChrome.tsx — the shared chrome for the logged-out auth surface (Prompt 21), vendored from
// `design/design_reference/Join.html` + `auth/components.jsx`. Provides ONE split-shell + brand panel so
// `/sign-in` and `/auth/denied` are visually identical chrome with different content in the form column
// (the SignInView/CheckEmailView vs the DeniedView). Parallels `_landing/chrome.tsx`.
//
// Reuses the Prompt-18 `LockupStacked` brand mark (trophy · "XI" · tagline) — NOT a redrawn mark. Gold
// (BRAND.md §1) lives ONLY inside that trophy PNG; "XI" is --text-primary, and every accent below is the
// ds cobalt token. No "use client": this is pure presentational markup (next/image is server+client safe),
// so the client `/sign-in` and the server `/auth/denied` can both render it. The App Shell does NOT wrap
// these routes (Prompt 20 boundary) — the brand here IS the auth chrome, replacing the shell topbar.
import type { ReactNode } from "react";
import { LockupStacked } from "@/components/Brand";

// League/season: the SAME "WC Fantasy League" placeholder the Prompt-20 shell renders (no new source, no
// SHELL_LEAGUE_NAME wiring — that env swap is a separate COMPONENT_MAP §0 task); season = the World Cup year.
const LEAGUE_NAME = "WC Fantasy League";
const LEAGUE_SEASON = "World Cup 2026";

// ---- icons (decorative; from auth/components.jsx, verbatim paths) ----
type IconProps = { s?: number };

export function IconMail({ s = 22 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

export function IconAlert({ s = 22 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function IconClock({ s = 22 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconShield({ s = 22 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    </svg>
  );
}

// The Google "G" — its own brand colors (NOT XI gold); standard on a "Continue with Google" button.
export function IconGoogle() {
  return (
    <svg viewBox="0 0 24 24" width={17} height={17} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-2 3.2-4.9 3.2-7.9z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23z"
      />
      <path fill="#FBBC05" d="M6 14.4a6.6 6.6 0 0 1 0-4.2V7.4H2.3a11 11 0 0 0 0 9.8L6 14.4z" />
      <path
        fill="#EA4335"
        d="M12 5.5c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 12 1 11 11 0 0 0 2.3 7.4L6 10.2c.9-2.6 3.2-4.7 6-4.7z"
      />
    </svg>
  );
}

/** The "Private league · invite only" tag — slate `--locked`, never accent (it's a state, not an action). */
export function PrivateTag() {
  return (
    <span className="au-private">
      <IconShield s={12} />
      Private league · invite only
    </span>
  );
}

/**
 * The split auth shell: brand-panel splash (left/top) + a form column whose body is `children`. Both auth
 * routes render through this, so the chrome stays identical; only the view in the slot differs.
 */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="au-bw">
      <div className="au-shell is-split">
        <aside className="au-brandpanel">
          <div className="au-brandpanel-top">
            {/* The trophy + "XI" wordmark are a decorative brand splash here; hide the lockup from the
                a11y tree so the trophy's image alt="XI" and the visible "XI" wordmark don't double-announce
                (the landing applies the same aria-hidden to its BrandMark — _landing/chrome.tsx). The
                accessible brand name comes from the visible league name below + each view's <h1>. */}
            <div aria-hidden="true" style={{ display: "flex", justifyContent: "center" }}>
              <LockupStacked h={96} />
            </div>
            <div>
              <div className="au-brand-name">{LEAGUE_NAME}</div>
              <div className="au-brand-season">{LEAGUE_SEASON}</div>
            </div>
            <PrivateTag />
          </div>
          {/* Static value props (verbatim from auth/components.jsx) — the league's real mechanics; no data fetch. */}
          <ul className="au-values">
            <li>
              <span className="au-valdot" />
              All-play-all power record — scored vs every manager, every week
            </li>
            <li>
              <span className="au-valdot" />
              Guillotine playoffs — lowest score is cut each round
            </li>
            <li>
              <span className="au-valdot" />
              Live lock-on-play scoring as the matches kick off
            </li>
          </ul>
        </aside>
        <div className="au-formcol">
          <div className="au-card">{children}</div>
          {/* Prose, NOT a link (confirmed Prompt 21): no commissioner-contact route exists app-wide, so we
              never emit a dead mailto/href="#". Wiring a real contact destination is a later prompt. */}
          <div className="au-foot">
            Private, invite-only league. Trouble signing in? Ask your commissioner.
          </div>
        </div>
      </div>
    </main>
  );
}
