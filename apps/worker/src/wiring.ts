/**
 * Wires the worker to its dependencies (DB + feed client + ingest store). Constructing these does no
 * I/O: the Prisma client connects lazily on first query, and the feed client only touches the network
 * when an endpoint method is called. The scheduler tick uses these.
 */
import { prisma } from "@app/db";
import { createBalldontlieClient, type FeedClient } from "@app/feed";
import { createPrismaIngestStore } from "@app/ingest/prisma";
import type { IngestStore } from "@app/ingest";
import { createPrismaNotifyStore } from "@app/notify/prisma";
import type { NotifyStore } from "@app/notify";
import { createPrismaDraftStore } from "@app/draft/prisma";
import type { DraftStore } from "@app/draft";
import { createPrismaNotifyTriggerStore } from "./notify/prismaStore";
import type { NotifyTriggerStore } from "./notify/store";
import { config } from "./config";

export const feed: FeedClient = createBalldontlieClient({
  apiKey: config.balldontlieApiKey,
  baseUrl: config.balldontlieBaseUrl,
  requestsPerMinute: config.balldontlieRpm,
});

export const ingestStore: IngestStore = createPrismaIngestStore(prisma);

// Notifications (Prompt 41b). The NotifyStore carries the delivery policy + Web Push transport; the
// trigger store carries the two worker-local trigger reads. The draft store is shared between the
// ticker and the draft_turn trigger so both read the same pointer.
export const notifyStore: NotifyStore = createPrismaNotifyStore(prisma);
export const notifyTriggerStore: NotifyTriggerStore = createPrismaNotifyTriggerStore(prisma);
export const draftStore: DraftStore = createPrismaDraftStore(prisma);

export { prisma };
