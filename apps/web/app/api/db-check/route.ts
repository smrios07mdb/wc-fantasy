import { NextResponse } from "next/server";
import { prisma } from "@app/db";

// Readiness probe: proves the typed Prisma client (via @app/db) is wired and the DB is reachable.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, db: "down", error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
