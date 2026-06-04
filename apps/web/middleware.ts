import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Keep the Supabase session fresh on every navigable request (see lib/supabase/middleware.ts). */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except Next static assets + the image optimizer + common image files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
