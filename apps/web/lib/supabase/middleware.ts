/**
 * Session-refresh middleware (the App Router "Proxy"). Server Components can't write cookies, so this
 * runs on each request to refresh the Supabase auth token and rewrite the cookies onto the response.
 * It performs NO authorization — authz lives in the routes (`getSessionManager` / `handleDraftPick`).
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the token. Do not insert logic between createServerClient and here.
  await supabase.auth.getUser();
  return response;
}
