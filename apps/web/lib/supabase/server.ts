/**
 * Supabase SERVER clients for the App Router (separate from `@app/db`'s Prisma client — Supabase Auth
 * owns the session; Prisma owns the relational lookups). Construction is behind this thin module so it
 * is swappable/mockable. Env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (browser-safe);
 * SUPABASE_SERVICE_ROLE_KEY is server-only (never NEXT_PUBLIC_, never shipped to the browser).
 */
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Cookie-bound client for Route Handlers + Server Components. The session lives in cookies; authorize
 * with `getUser()` / `getClaims()` (they validate the JWT) — NEVER `getSession()` in server code, which
 * trusts an unverified cookie. `setAll` is wrapped in try/catch because Server Components can't write
 * cookies — the middleware (lib/supabase/middleware.ts) refreshes the session instead.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component (read-only cookies) — handled by the refresh middleware.
        }
      },
    },
  });
}

/**
 * Server-only SERVICE-ROLE client — bypasses RLS. The thin, swappable seam for the future commissioner
 * admin surface (allowlist editor / manual corrections, ARCHITECTURE §3). No caller yet.
 *   TODO(prompt-NN: admin surface): wire where admin ops need it; NEVER import into a client component.
 */
export function createAdminClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.SUPABASE_URL ?? SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
