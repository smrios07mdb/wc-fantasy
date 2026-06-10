/**
 * Production dependency wiring for the notification handlers — the session→manager edge
 * (`getSessionManager`) + the Prisma+web-push {@link NotifyStore} adapter. Kept out of the route files
 * so the four thin routes stay one-liners (parse → handle → NextResponse), mirroring how the
 * display-name route inlines its deps.
 */
import "server-only";
import { prisma } from "@app/db";
import { createPrismaNotifyStore } from "@app/notify/prisma";
import { getSessionManager } from "@/lib/auth/manager";
import type { NotifyHandlerDeps } from "./handlers";

export function notifyDeps(): NotifyHandlerDeps {
  return { resolveManager: getSessionManager, store: createPrismaNotifyStore(prisma) };
}
