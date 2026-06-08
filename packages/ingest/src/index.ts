/**
 * @app/ingest — BALLDONTLIE ingestion + lock-on-play (ARCHITECTURE.md §3/§4; Prompt 05a).
 *
 * The pure pieces (feed→row mappers, lock-on-play derivation, scheduler mode-decision) carry NO IO and
 * live here; the Prisma-backed store is imported separately via `@app/ingest/prisma` so this entrypoint
 * stays IO-free and unit-testable with fixtures.
 */
export * from "./errors";
export * from "./map";
export * from "./lock";
export * from "./mode";
export * from "./store";
export * from "./ingest";
export { MemoryIngestStore } from "./memoryStore";
