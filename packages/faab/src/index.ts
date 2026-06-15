/**
 * @app/faab — the FAAB (waivers) engine (ARCHITECTURE.md §4; DECISIONS.md → Theme D).
 *
 * The pure pieces — the batch resolver (the locked 8-step clearing algorithm), the submission
 * validator, the typed error/outcome vocabularies, and the store-port-driven batch controller — carry
 * NO database dependency and live here. The Prisma-backed stores are imported separately via
 * `@app/faab/prisma` so this entrypoint stays IO-free (proven by `purity.test.ts`).
 */
export * from "./resolve";
export * from "./validate";
export * from "./release";
export * from "./errors";
export * from "./store";
export * from "./window";
export * from "./batchTime";
export * from "./controller";
export {
  MemoryFaabBatchStore,
  MemoryFaabBidStore,
  MemoryFaGrantStore,
  MemoryFaabReleaseStore,
} from "./memoryStore";
