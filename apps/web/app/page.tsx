/**
 * The landing hub — the auth-aware front door (ARCHITECTURE §6). Replaces the Prompt-01 scaffold and
 * closes the go-live navigation gap: `/` is the magic-link callback's default post-login target
 * (`safeNextPath(null) === "/"`), so this page is BOTH the front door (logged-out → sign-in) and the
 * post-login signpost (signed-in → the feature screens).
 *
 * It reuses `getSessionManager()` UNCHANGED (the Prompt-07 `getUser()`-backed primitive, the thin IO
 * edge) and defers the branch to the pure `selectLandingView()` helper. Four states:
 *   - signin   → logged-out visitor: the XI marketing landing with a "Sign in" CTA → /sign-in.
 *   - hub      → resolved league manager: nav to /draft, /lineup, /vsfield + POST sign-out.
 *   - unlinked → allowlisted + signed in but manager.user_id not yet linked (the Prompt-07
 *                provisioning seam): "contact the commissioner". This is NOT a denial — never /auth/denied.
 *   - denied   → not allowlisted (defensive; the callback already signs these out) → link to /auth/denied.
 *
 * Prompt 19 — VISUAL re-skin only. `selectLandingView()`, the four-outcome branch, the session read, and
 * the route set are byte-for-byte as Prompt 16 left them; only the presentational bodies changed. The
 * design system + landing CSS are imported here (per-route, NOT global — they layer over the root-layout
 * Tailwind without a double reset, and the feature screens keep their own per-route ds.css). The XI
 * `<Brand/>` mark sits in every state's header via `BrandLink`. The marketing-page body (the `signin`
 * state) lives in `_landing/MarketingLanding`. `/sign-in` itself stays unstyled — its design (`Join.html`)
 * was NOT in this handoff bundle, so skinning it is a flagged follow-up.
 */
import { getSessionManager } from "@/lib/auth/manager";
import { selectLandingView } from "@/src/landing/selectLandingView";
import { BrandLink, LpRoot, SignOutButton } from "./_landing/chrome";
import { MarketingLanding } from "./_landing/MarketingLanding";
import { AppShell } from "./shell/AppShell";
import "./_landing/ds.css";
import "./_landing/landing.css";

// Reads the session on every request — never statically cache the front door (matches the feature pages).
export const dynamic = "force-dynamic";

const FEATURES = [
  {
    href: "/draft",
    label: "Draft room",
    blurb: "Make your picks when the draft is live.",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path d="M3 7h18v12H3zM3 7l3-4h12l3 4M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/lineup",
    label: "Set lineup",
    blurb: "Choose your formation and starters each matchday.",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
  },
  {
    href: "/vsfield",
    label: "Vs the field",
    blurb: "Live scores and standings across the league.",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      </svg>
    ),
  },
];

export default async function Home() {
  const outcome = await getSessionManager();
  const view = selectLandingView(outcome);

  // `hub` is reachable only from the `ok` outcome (see selectLandingView), so this narrow always holds.
  if (view === "hub" && outcome.kind === "ok")
    return <Hub displayName={outcome.manager.displayName} />;
  if (view === "unlinked") return <Unlinked />;
  if (view === "denied") return <Denied />;
  // view === "signin" (plus the unreachable hub-without-ok) → the logged-out front door.
  return <SignIn />;
}

/** Logged-out front door → the full XI marketing landing (its "Sign in" CTA routes to /sign-in). */
function SignIn() {
  return <MarketingLanding />;
}

/**
 * Signed-in, resolved manager → the post-login signpost into the three live screens. Prompt 20 nests
 * this into the global `AppShell` (the `home` nav id): the shell's top bar supersedes the hub's own
 * `.lp-nav` (Brand + sign-out now live there; "Signed in as …" rides the shell's right cluster). The
 * welcome body below is the Prompt-19 `.lp-section` content unchanged — the shell wraps it, it isn't
 * re-skinned. This is the only landing state the shell wraps: the others (`signin`/`unlinked`/`denied`)
 * are not authenticated feature surfaces, so they keep their landing chrome.
 */
function Hub({ displayName }: { displayName: string }) {
  return (
    <AppShell active="home" signedInAs={displayName}>
      <section className="lp-section" style={{ borderTop: "none" }}>
        <div className="lp-container">
          <div className="lp-section-head">
            <p className="lp-eyebrow">Your league</p>
            <h2>Welcome back.</h2>
            <p>Jump straight in — draft your squad, name your XI, and follow the league live.</p>
          </div>
          <div className="lp-peek-grid">
            {FEATURES.map((feature) => (
              <a className="lp-peek" href={feature.href} key={feature.href}>
                <span className="lp-peek-ic">{feature.icon}</span>
                <span className="lp-peek-txt">
                  <h4>
                    {feature.label} <span className="arr">↗</span>
                  </h4>
                  <p>{feature.blurb}</p>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

/** Allowlisted + signed in but not yet linked to a manager — points at the commissioner, NOT a denial. */
function Unlinked() {
  return (
    <LpRoot>
      <nav className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <BrandLink />
          <div className="lp-nav-cta">
            <SignOutButton />
          </div>
        </div>
      </nav>
      <section className="lp-cta">
        <div className="lp-container lp-cta-card">
          <p className="lp-eyebrow">Almost there</p>
          <h2>You&rsquo;re in — almost.</h2>
          <p>
            You&rsquo;re signed in, but your account isn&rsquo;t linked to a manager yet. Contact
            the commissioner to get set up, then refresh this page.
          </p>
        </div>
      </section>
    </LpRoot>
  );
}

/** Not on the allowlist (defensive; the callback already signs these out) → the short denied state. */
function Denied() {
  return (
    <LpRoot>
      <nav className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <BrandLink />
          <div className="lp-nav-cta">
            <a className="btn btn-ghost btn-sm" href="/sign-in">
              Log in
            </a>
          </div>
        </div>
      </nav>
      <section className="lp-cta">
        <div className="lp-container lp-cta-card">
          <p className="lp-eyebrow">Private league</p>
          <h2>We can&rsquo;t sign you in.</h2>
          <p>
            This is a private, invite-only league and your email isn&rsquo;t on the allowlist. If
            you think that&rsquo;s a mistake, ask the commissioner for an invite.
          </p>
          <a className="btn btn-ghost" href="/auth/denied" style={{ marginTop: 8 }}>
            More info
          </a>
        </div>
      </section>
    </LpRoot>
  );
}
