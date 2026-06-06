/**
 * @app/lineup — server-authoritative set-lineup legality + persistence (DECISIONS.md → Theme B,
 * incl. the lock-on-play amendment; ARCHITECTURE.md §4).
 *
 * The pure decision core (`validateLineup` + the `LineupError` family) carries NO database dependency
 * and lives here; the Prisma-backed store is imported separately via `@app/lineup/prisma` so this
 * entrypoint stays IO-free (proven by `purity.test.ts`).
 */
export * from "./errors";
export * from "./validate";
export * from "./store";
export * from "./controller";
export { MemoryLineupStore } from "./memoryStore";
