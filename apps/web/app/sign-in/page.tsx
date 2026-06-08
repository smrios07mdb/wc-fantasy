"use client";

/**
 * Magic-link sign-in, re-skinned onto the ds split-shell (Prompt 21) per `Join.html` + `auth/*` +
 * BRAND.md §5. Enter email → Supabase sends a passwordless link that returns to /auth/callback. Google
 * OAuth is config-gated (seamed-optional): the button shows only when the env flag is set; magic-link is
 * the required path and never blocks on Google.
 *
 * PRESENTATION ONLY — the auth logic is unchanged from the bare-Tailwind original: the same
 * `signInWithOtp` request (same `emailRedirectTo` → /auth/callback), the same env-gated `signInWithOAuth`,
 * the same `createClient` edge. The one-string `message` became two presentation flags (`error` + `sent`)
 * so the request form and the "check your email" confirmation render as the two distinct designed views —
 * the network/redirect behavior is byte-for-byte identical. There is deliberately NO next/safeNextPath
 * handling here (there never was — that passthrough lives in auth/callback/route.ts, untouched).
 */
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthScreen, IconAlert, IconClock, IconGoogle, IconMail } from "../_auth/AuthChrome";
import "../_auth/auth.css";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED === "true";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    if (otpError) setError(otpError.message);
    else setSent(true);
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <AuthScreen>
      {sent ? (
        // Submitted / confirmation state — the magic link is on its way.
        <div className="au-view au-center">
          <div className="au-icon tone-accent au-pop">
            <IconMail s={26} />
          </div>
          <h1 className="au-title">Check your email</h1>
          <p className="au-sub">
            We sent a sign-in link to
            <br />
            <b className="au-email">{email}</b>
          </p>
          <div className="au-note">
            <IconClock s={14} />
            Open the link on this device to finish signing in. You can close this tab once you’ve
            clicked it.
          </div>
          <div className="au-actions">
            <button
              className="btn btn-ghost btn-block"
              type="button"
              onClick={() => setSent(false)}
            >
              Use a different email
            </button>
          </div>
        </div>
      ) : (
        // Email-input state — request the magic link (+ the env-gated Google option).
        <form className="au-view" onSubmit={sendMagicLink}>
          <div className="au-head">
            <h1 className="au-title">Sign in to your league</h1>
            <p className="au-sub">
              Enter your allowlisted email and we’ll send a secure sign-in link. No password to
              remember.
            </p>
          </div>

          <label className="au-field">
            <span className="au-label">Email address</span>
            <input
              className={"au-input" + (error ? " is-error" : "")}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              spellCheck={false}
              autoFocus
            />
            {error && (
              <span className="au-err">
                <IconAlert s={13} />
                {error}
              </span>
            )}
          </label>

          <button className="btn btn-primary btn-block au-magic" type="submit" disabled={sending}>
            {sending ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                Sending…
              </>
            ) : (
              <>
                <IconMail s={17} />
                Send magic link
              </>
            )}
          </button>

          {GOOGLE_ENABLED && (
            <>
              <div className="au-or">
                <span>or</span>
              </div>
              <button className="au-google" type="button" onClick={signInWithGoogle}>
                <IconGoogle />
                Continue with Google
              </button>
            </>
          )}

          <p className="au-fineprint">
            By continuing you agree to the league rules. Only invited emails can sign in — this
            keeps the league private.
          </p>
        </form>
      )}
    </AuthScreen>
  );
}
