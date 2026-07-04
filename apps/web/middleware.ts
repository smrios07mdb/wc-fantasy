import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Keep the Supabase session fresh on every navigable request (see lib/supabase/middleware.ts). */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except Next static assets + the image optimizer + common image files, plus the PWA
  // service worker + web manifest (F-P3-A5): neither carries a session, and refreshing Supabase
  // cookies on their fetches is a wasted round-trip per page load.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|site\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
