/** Minimal denied page (functional placeholder; the polished UI is the deferred deliverable). Reached
 *  when the sign-in link was invalid/expired or the authenticated email is not on the allowlist. */
export default function DeniedPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Can&rsquo;t sign you in</h1>
      {/* text-slate-400 (not -600): legible on the global dark body (Prompt 20). Bare page stays
          Tailwind; the full ds skin is the deferred /auth/denied follow-up. */}
      <p className="text-sm text-slate-400">
        This is a private league. Your email may not be on the allowlist, or the sign-in link
        expired.
      </p>
      <a className="text-blue-600 underline" href="/sign-in">
        Back to sign in
      </a>
    </main>
  );
}
