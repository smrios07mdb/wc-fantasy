/**
 * Magic-link / OAuth callback: exchange the returned `code` for a session cookie, then ENFORCE the
 * allowlist at the edge — a non-allowlisted authenticated email is signed out and denied, never
 * silently admitted. (The pure gate is `@app/auth`'s `isEmailAllowed`; the rows come from Prisma.)
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { isEmailAllowed, safeNextPath } from "@app/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Validate `next` to a same-origin, path-absolute reference — `${origin}${next}` would otherwise be
  // an open redirect (origin has no trailing slash, so e.g. `@evil.com` / `//evil.com` escape it).
  const next = safeNextPath(searchParams.get("next"));
  if (!code) return NextResponse.redirect(`${origin}/auth/denied?reason=missing_code`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/auth/denied?reason=exchange_failed`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const allowlist = await prisma.allowlistEmail.findMany({ select: { email: true } });
  if (!user?.email || !isEmailAllowed(user.email, allowlist)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/denied?reason=not_allowlisted`);
  }

  // NOTE: app_user mirroring + manager.user_id linking (the provisioning ceremony) is intentionally
  // NOT performed here — seed/manage via DB for now. TODO(confirm) §4/§6: pin the exact ceremony
  // (commissioner pre-provisions managers + links user_id on first sign-in, vs. seeded directly).
  // Do NOT add a self-serve manager-creation wizard.
  return NextResponse.redirect(`${origin}${next}`);
}
