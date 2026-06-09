/**
 * POST /api/draft/queue — replace the session manager's full draft queue atomically.
 * Auth follows the same gate as POST /api/draft/pick (requireManager-equivalent).
 * The framework-agnostic handler (handleQueue) is unit-tested separately with injected deps.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";
import { handleQueue, type QueueRequestBody } from "@/src/draft/handleQueue";

export const dynamic = "force-dynamic";

function parseBody(raw: unknown): QueueRequestBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.playerIds)) return null;
  if (!b.playerIds.every((id) => typeof id === "string")) return null;
  return { playerIds: b.playerIds as string[] };
}

export async function POST(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const result = await handleQueue(
    {
      resolveManager: getSessionManager,
      getDraftStatus: async () => {
        const draft = await prisma.draft.findFirst({ select: { status: true } });
        return draft?.status ?? null;
      },
      playerIdsExist: async (ids) => {
        const count = await prisma.player.count({ where: { id: { in: ids } } });
        return count === ids.length;
      },
      replaceQueue: async (managerId, playerIds) => {
        await prisma.$transaction(async (tx) => {
          await tx.draftQueue.deleteMany({ where: { managerId } });
          if (playerIds.length > 0) {
            await tx.draftQueue.createMany({
              data: playerIds.map((playerId, position) => ({ managerId, playerId, position })),
            });
          }
        });
      },
    },
    body,
  );
  return NextResponse.json(result.body, { status: result.status });
}
