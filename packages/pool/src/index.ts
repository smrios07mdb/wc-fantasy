/**
 * @app/pool — the PURE per-match pick'em pool engine (Prompt 40; DECISIONS.md → Pool). DB-free, no IO,
 * no clock (proven by `purity.test.ts`): result derivation, pick scoring, the weight seam, the
 * leaderboard, the lock predicate, and the submission validator. The server-authoritative write/read
 * path (the Prisma loader that resolves `period.kind`, the gated route, the anti-copying read) lives in
 * apps/web (Prompt 40 §3); the UI + Realtime subscription are Prompt 41.
 */
export * from "./pool";
export * from "./errors";
