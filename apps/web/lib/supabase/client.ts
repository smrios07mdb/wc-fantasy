/**
 * Supabase BROWSER client (client components). Anon/publishable key only — safe to ship in the bundle.
 * Used by the sign-in page to send the magic link (and, if config-gated, start Google OAuth).
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
