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
import { loadDashboard } from "./_dashboard/loadDashboard";
import { Dashboard } from "./_dashboard/Dashboard";
import "./_landing/ds.css";
import "./_landing/landing.css";

// Reads the session on every request — never statically cache the front door (matches the feature pages).
export const dynamic = "force-dynamic";

export default async function Home() {
  const outcome = await getSessionManager();
  const view = selectLandingView(outcome);

  // `hub` is reachable only from the `ok` outcome (see selectLandingView), so this narrow always holds.
  if (view === "hub" && outcome.kind === "ok")
    return <Hub displayName={outcome.manager.displayName} managerId={outcome.manager.id} />;
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
 * Signed-in, resolved manager → the phase-aware dashboard home (Prompt 37). Replaces the
 * Prompt-16/19 nav-card hub with `<Dashboard>`. `selectLandingView()`, the four-outcome branch,
 * the session read, and the non-hub renders are byte-for-byte. The AppShell wrap + active="home"
 * stay. The FEATURES constant above is no longer rendered but kept for reference (the dashboard's
 * PrimaryBanner CTAs link the same targets). `/` stays `ƒ` (force-dynamic above).
 *
 * `managerId` is the resolved manager's DB id — passed to `loadDashboard` which reuses
 * `loadDraftRoom` (the same read /draft uses; no second draft source).
 */
async function Hub({ displayName, managerId }: { displayName: string; managerId: string }) {
  const data = await loadDashboard(managerId);
  return (
    <AppShell active="home" signedInAs={displayName}>
      <Dashboard data={data} />
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
