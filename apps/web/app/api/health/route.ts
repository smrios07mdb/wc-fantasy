import { NextResponse } from "next/server";

// Liveness probe. No dependencies — always cheap, always fresh.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}
