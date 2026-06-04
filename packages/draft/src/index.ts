/**
 * @app/draft — the server-authoritative draft controller (ARCHITECTURE.md §5; DECISIONS.md → Theme C).
 *
 * The pure pieces (snake order, roster legality, autopick selection) and the store-backed controller
 * (startDraft / submitPick / tickDraft) carry NO database dependency and live here; the Prisma-backed
 * store is imported separately via `@app/draft/prisma` so this entrypoint stays IO-free.
 */
export * from "./snake";
export * from "./roster";
export * from "./autopick";
export * from "./errors";
export * from "./store";
export * from "./controller";
export { MemoryDraftStore } from "./memoryStore";
