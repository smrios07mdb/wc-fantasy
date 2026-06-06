/** Sign out: clear the Supabase session, then redirect back to sign-in (303 so POST → GET). */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Public origin (not request.url — the internal localhost:10000 on Render). See @/lib/site-origin.
  return NextResponse.redirect(new URL("/sign-in", siteOrigin(request)), { status: 303 });
}
