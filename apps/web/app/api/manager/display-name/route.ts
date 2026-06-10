/**
 * POST /api/manager/display-name — self-service display name rename (Prompt 39).
 * Mirrors the POST /api/draft/pick shape: thin wrapper that wires real deps and maps the
 * framework-agnostic `handleDisplayNameRename` result to a NextResponse.
 *
 * Status map: 401 no session · 403 not allowlisted / no manager · 400 invalid name ·
 *             409 name taken (case-insensitive per-league unique index) · 200 normalized name.
 * Writes ONLY `manager.display_name` — does NOT touch `app_user.display_name`.
 */
import { NextResponse } from "next/server";
import { Prisma, prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";
import {
  handleDisplayNameRename,
  NameTakenError,
  type RenameRequestBody,
} from "@/src/manager/handleDisplayNameRename";

export const dynamic = "force-dynamic";

function parseBody(raw: unknown): RenameRequestBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.name !== "string") return null;
  return { name: b.name };
}

/** Map a Prisma unique-violation (P2002) to the domain NameTakenError. */
async function updateDisplayName(managerId: string, displayName: string): Promise<void> {
  try {
    await prisma.manager.update({
      where: { id: managerId },
      data: { displayName },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new NameTakenError();
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const result = await handleDisplayNameRename(
    { resolveManager: getSessionManager, update: updateDisplayName },
    body,
  );
  return NextResponse.json(result.body, { status: result.status });
}
