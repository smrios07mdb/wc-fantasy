/**
 * @app/db — the one place the database is defined.
 *
 * Exports a singleton Prisma client plus the generated types/enums. Run `pnpm db:generate`
 * (or it runs on postinstall) to produce the client before typechecking/building.
 */
import { PrismaClient } from "@prisma/client";

// Reuse a single client across Next.js dev HMR reloads (avoids exhausting the connection pool).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Re-export the generated client, enums, and model types so consumers import one package.
export * from "@prisma/client";
export { PrismaClient } from "@prisma/client";

// Shared low-level DB helpers (the no-clobber dirty invariant, used by @app/ingest).
export * from "./dirty";

// Importing `./parity` is unnecessary at runtime (it is type-only), but it lives under `src/`
// so `tsc --noEmit` checks the schema↔@app/shared enum parity assertions on every typecheck.
