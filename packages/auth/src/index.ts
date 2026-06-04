/**
 * @app/auth — the PURE auth-decision core (ARCHITECTURE.md §6 + §4).
 *
 * Allowlist gate, session→manager resolution, and the act-as authz assertion — all DB/Supabase/clock/
 * env-free, mirroring @app/scoring / @app/draft. The Supabase session read + the Prisma fetch are thin
 * edges in apps/web that feed plain rows into these functions; nothing here imports IO.
 */
export * from "./types";
export * from "./errors";
export * from "./allowlist";
export * from "./resolve";
export * from "./authz";
