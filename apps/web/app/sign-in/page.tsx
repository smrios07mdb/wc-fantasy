"use client";

/**
 * Minimal, DELIBERATELY UNSTYLED magic-link sign-in (the polished auth UI is the deferred Design+Code
 * deliverable). Enter email → Supabase sends a passwordless link that returns to /auth/callback.
 * Google OAuth is config-gated (seamed-optional): the button shows only when the env flag is set;
 * magic-link is the required path and never blocks on Google.
 */
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED === "true";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    setMessage(error ? error.message : "Check your email for the magic link.");
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {/* text-slate-400/300 (not -600/-700): legible on the global dark body (Prompt 20). This bare
          page stays Tailwind; the full ds skin is the deferred /sign-in follow-up. */}
      <p className="text-sm text-slate-400">
        Private league — enter your allowlisted email and we&rsquo;ll send a magic link.
      </p>
      <form onSubmit={sendMagicLink} className="flex flex-col gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="rounded border border-slate-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send magic link"}
        </button>
      </form>
      {GOOGLE_ENABLED && (
        <button
          type="button"
          onClick={signInWithGoogle}
          className="rounded border border-slate-300 px-3 py-2"
        >
          Continue with Google
        </button>
      )}
      {message && <p className="text-sm text-slate-300">{message}</p>}
    </main>
  );
}
