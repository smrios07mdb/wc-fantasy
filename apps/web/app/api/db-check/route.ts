import { NextResponse } from "next/server";
import { prisma } from "@app/db";

// Readiness probe. Two steps, because connectivity alone is a false "healthy": a bare `SELECT 1` stays
// green even when DATABASE_URL points at the WRONG project/empty DB (the failure where the app connects
// fine but `public.draft` doesn't exist). So we also touch a core table.
//   1. db "down"            → can't reach Postgres at all.
//   2. db "up" + schema     → connected, but our schema isn't there → DATABASE_URL points at the wrong
//      "missing"              database (counts a core table; works on an empty table, errors if absent).
//   3. db "up" + schema "present" → connected to the right database. The count exercises the typed
//      Prisma client too (server connects as the owner role, so RLS doesn't affect this).
export const dynamic = "force-dynamic";

export async function GET() {
  // The body stays COARSE (no raw error string): this route is unauthenticated, and a raw Prisma/
  // Postgres error can leak the DB host or internals. The full exception is logged server-side (Render
  // logs) for the operator; the JSON status (db + schema) is enough to diagnose the wrong-DB case.

  // Step 1 — connectivity.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("[db-check] connectivity check failed:", error);
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }

  // Step 2 — is this the RIGHT database? A missing relation here means DATABASE_URL is misconfigured,
  // not that Postgres is down.
  try {
    await prisma.league.count();
    return NextResponse.json({ ok: true, db: "up", schema: "present" });
  } catch (error) {
    console.error(
      "[db-check] schema check failed — DATABASE_URL may point at the wrong database:",
      error,
    );
    return NextResponse.json({ ok: false, db: "up", schema: "missing" }, { status: 503 });
  }
}
