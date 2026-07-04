/**
 * Prisma + web-push backed {@link NotifyStore} — the production IO adapter, and the ONLY file in
 * @app/notify that touches the database. Reachable only via `@app/notify/prisma`, keeping the
 * package's `.` surface free of `@app/db` (proven by `purity.test.ts`).
 *
 * Like @app/faab / @app/draft's adapters it has no unit test (it needs a live DB); it is covered by
 * `tsc --noEmit` plus the Memory double's tests, which exercise the dispatcher + handlers against the
 * same port. The load-bearing methods:
 *  - `getPreference` LAZILY upserts the all-`true` default row on first read (no provisioning seed);
 *  - `claimLedger` uses `createMany({ skipDuplicates: true })` so the UNIQUE (manager, kind, subject)
 *    decides the winner WITHOUT exception handling — `count === 1` means THIS call inserted the row;
 *  - `send` delegates to the VAPID transport (`@app/notify/send`).
 */
import type { PrismaClient } from "@app/db";
import { sendPush } from "./send";
import type { NotifyStore } from "./store";
import type {
  LedgerKind,
  NotificationPreference,
  PushPayload,
  PushSubscriptionRecord,
  SendOutcome,
} from "./types";

type Db = PrismaClient;

export function createPrismaNotifyStore(prisma: Db): NotifyStore {
  return {
    async getPreference(managerId: string): Promise<NotificationPreference> {
      const row = await prisma.notificationPreference.upsert({
        where: { managerId },
        create: { managerId },
        update: {},
        select: { draftTurn: true, playerNotStarting: true, matchStarting: true },
      });
      return {
        draftTurn: row.draftTurn,
        playerNotStarting: row.playerNotStarting,
        matchStarting: row.matchStarting,
      };
    },

    async upsertPreferences(
      managerId: string,
      prefs: NotificationPreference,
    ): Promise<NotificationPreference> {
      const row = await prisma.notificationPreference.upsert({
        where: { managerId },
        create: { managerId, ...prefs },
        update: { ...prefs },
        select: { draftTurn: true, playerNotStarting: true, matchStarting: true },
      });
      return {
        draftTurn: row.draftTurn,
        playerNotStarting: row.playerNotStarting,
        matchStarting: row.matchStarting,
      };
    },

    async listSubscriptions(managerId: string): Promise<PushSubscriptionRecord[]> {
      const rows = await prisma.pushSubscription.findMany({
        where: { managerId },
        select: { endpoint: true, p256dh: true, auth: true },
      });
      return rows.map((r) => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
    },

    async addSubscription(managerId: string, sub: PushSubscriptionRecord): Promise<void> {
      // endpoint is globally UNIQUE; re-subscribing (or a device that re-keys) upserts in place and
      // re-points the row at the current manager.
      await prisma.pushSubscription.upsert({
        where: { endpoint: sub.endpoint },
        create: { managerId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        update: { managerId, p256dh: sub.p256dh, auth: sub.auth },
      });
    },

    async removeSubscription(managerId: string, endpoint: string): Promise<void> {
      // Scoped to the caller's manager_id (defence-in-depth) + the endpoint; a missing row is a no-op.
      await prisma.pushSubscription.deleteMany({ where: { managerId, endpoint } });
    },

    async claimLedger(managerId: string, kind: LedgerKind, subjectId: string): Promise<boolean> {
      const result = await prisma.notificationSent.createMany({
        data: [{ managerId, kind, subjectId }],
        skipDuplicates: true,
      });
      return result.count === 1;
    },

    async send(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<SendOutcome> {
      return sendPush(subscription, payload);
    },
  };
}
