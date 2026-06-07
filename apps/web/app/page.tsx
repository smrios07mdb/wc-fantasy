/**
 * The landing hub — the auth-aware front door (ARCHITECTURE §6). Replaces the Prompt-01 scaffold and
 * closes the go-live navigation gap: `/` is the magic-link callback's default post-login target
 * (`safeNextPath(null) === "/"`), so this page is BOTH the front door (logged-out → sign-in) and the
 * post-login signpost (signed-in → the feature screens).
 *
 * It reuses `getSessionManager()` UNCHANGED (the Prompt-07 `getUser()`-backed primitive, the thin IO
 * edge) and defers the branch to the pure `selectLandingView()` helper. Four states:
 *   - signin   → logged-out visitor: a single "Sign in" CTA → /sign-in.
 *   - hub      → resolved league manager: nav to /draft, /lineup, /vsfield + POST sign-out.
 *   - unlinked → allowlisted + signed in but manager.user_id not yet linked (the Prompt-07
 *                provisioning seam): "contact the commissioner". This is NOT a denial — never /auth/denied.
 *   - denied   → not allowlisted (defensive; the callback already signs these out) → link to /auth/denied.
 *
 * Deliberately minimal/unstyled (matches the placeholder auth-page convention); polish is the deferred
 * Design deliverable. No redirect change, no new routes/env, no admin surface, no shared cross-nav strip.
 */
import { getSessionManager } from "@/lib/auth/manager";
import { selectLandingView } from "@/src/landing/selectLandingView";

// Reads the session on every request — never statically cache the front door (matches the feature pages).
export const dynamic = "force-dynamic";

const FEATURES = [
  { href: "/draft", label: "Draft room", blurb: "Make your picks when the draft is live." },
  {
    href: "/lineup",
    label: "Set lineup",
    blurb: "Choose your formation and starters each matchday.",
  },
  {
    href: "/vsfield",
    label: "Vs the field",
    blurb: "Live scores and standings across the league.",
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

function SignIn() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">WC Fantasy</h1>
      <p className="text-sm text-slate-600">
        Private World Cup fantasy league. Sign in with your allowlisted email to set your lineup and
        follow the league live.
      </p>
      <a href="/sign-in" className="rounded bg-blue-600 px-3 py-2 text-center text-white">
        Sign in
      </a>
    </main>
  );
}

function Hub({ displayName }: { displayName: string }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">WC Fantasy</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-slate-600">Signed in as {displayName}.</p>
      <ul className="flex flex-col gap-3">
        {FEATURES.map((feature) => (
          <li key={feature.href}>
            <a
              href={feature.href}
              className="block rounded border border-slate-200 bg-white px-4 py-3 hover:border-slate-300"
            >
              <span className="font-medium text-slate-900">{feature.label}</span>
              <span className="block text-sm text-slate-600">{feature.blurb}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Unlinked() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Almost there</h1>
      <p className="text-sm text-slate-600">
        You&rsquo;re signed in, but your account isn&rsquo;t linked to a manager yet. Contact the
        commissioner to get set up, then refresh this page.
      </p>
      <SignOutButton />
    </main>
  );
}

function Denied() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Can&rsquo;t sign you in</h1>
      <p className="text-sm text-slate-600">
        This is a private league and your email isn&rsquo;t on the allowlist.
      </p>
      <a className="text-blue-600 underline" href="/auth/denied">
        More info
      </a>
    </main>
  );
}

/** Sign-out is a STATE-CHANGING action → a POST form to the existing route handler, not a link. */
function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className="text-sm text-slate-500 underline">
        Sign out
      </button>
    </form>
  );
}
