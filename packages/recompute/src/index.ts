/**
 * @app/recompute — the deterministic recompute pipeline (ARCHITECTURE.md §3/§4/§7).
 *
 * Turns stored DB rows into scores by calling the pure @app/scoring engine. The pure pieces
 * (resolver, adapter, orchestration) carry NO database dependency and live here; the Prisma-backed
 * store is imported separately via `@app/recompute/prisma` so this entrypoint stays IO-free.
 */
export * from "./resolver";
export * from "./adapter";
export * from "./store";
export * from "./standing";
export * from "./guillotine";
export * from "./transition";
export * from "./recompute";
export * from "./freeze";
export * from "./forcedRestate";
export { MemoryStore } from "./memoryStore";
