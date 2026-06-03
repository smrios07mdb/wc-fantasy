/**
 * Wires the worker to its dependencies (DB + feed client). Constructing these does no I/O:
 * the Prisma client connects lazily on first query, and the feed client only throws when an
 * endpoint method is actually called. Later prompts use these in the scheduler tick.
 */
import { prisma } from "@app/db";
import { createBalldontlieClient, type FeedClient } from "@app/feed";
import { config } from "./config";

export const feed: FeedClient = createBalldontlieClient({
  apiKey: config.balldontlieApiKey,
  baseUrl: config.balldontlieBaseUrl,
});

export { prisma };
