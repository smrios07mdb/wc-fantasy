/**
 * Wires the worker to its dependencies (DB + feed client + ingest store). Constructing these does no
 * I/O: the Prisma client connects lazily on first query, and the feed client only touches the network
 * when an endpoint method is called. The scheduler tick uses these.
 */
import { prisma } from "@app/db";
import { createBalldontlieClient, type FeedClient } from "@app/feed";
import { createPrismaIngestStore } from "@app/ingest/prisma";
import type { IngestStore } from "@app/ingest";
import { config } from "./config";

export const feed: FeedClient = createBalldontlieClient({
  apiKey: config.balldontlieApiKey,
  baseUrl: config.balldontlieBaseUrl,
  requestsPerMinute: config.balldontlieRpm,
});

export const ingestStore: IngestStore = createPrismaIngestStore(prisma);

export { prisma };
