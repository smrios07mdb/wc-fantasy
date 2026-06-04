/** Sign out: clear the Supabase session, then redirect back to sign-in (303 so POST → GET). */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
}
