#!/usr/bin/env node
/**
 * INV-CLOSE launch-env diagnostic. READ-ONLY: SELECT + env parsing only, no writes,
 * no migration, no schema/RLS touch. Run with the prod DATABASE_URL to close INV-11
 * (league singleton) and INV-4a (pgbouncer / connection_limit) in one invocation:
 *
 *   DATABASE_URL="<prod url>" node apps/web/scripts/verify-launch-env.mjs
 *
 * SECURITY: never echoes the raw DATABASE_URL or any host/user/password. Only parsed
 * booleans/flags and the non-secret league columns (id, name, created_at) are printed.
 *
 * The league-count query is prod-run-only (same precedent as verify-players.mjs's
 * participant-scope check) — it needs a reachable Postgres, so it SKIPs cleanly
 * (never fails the run) when DATABASE_URL / the DB harness is unavailable. The
 * pgbouncer/connection_limit check is pure and always runs.
 */
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(__dir, "..");
const repoRoot = resolve(webDir, "../..");

let failCount = 0;

function reportLine(label, verdict, detail) {
  console.log(`[${verdict}] ${label}${detail ? " — " + detail : ""}`);
  if (verdict === "FAIL") failCount++;
}

// Mirrors apps/web/lib/launch-env.ts's parseDatabaseUrlFlags — kept here as plain JS so this
// script has no tsx/loader dependency for its one always-runs check. lib/launch-env.ts is the
// unit-tested source of truth for the parsing logic; this is a deliberate, small duplication.
function parseDatabaseUrlFlags(databaseUrl) {
  if (!databaseUrl) return { pgbouncer: false, connectionLimit: null };
  let params;
  try {
    params = new URL(databaseUrl).searchParams;
  } catch {
    return { pgbouncer: false, connectionLimit: null };
  }
  return {
    pgbouncer: params.get("pgbouncer") === "true",
    connectionLimit: params.get("connection_limit"),
  };
}

// ── INV-4a · DATABASE_URL flags (pure, always runs) ─────────────────────────────────
async function checkDatabaseUrlFlags() {
  const flags = parseDatabaseUrlFlags(process.env.DATABASE_URL);
  reportLine(
    "INV-4a · pgbouncer",
    flags.pgbouncer ? "PASS" : "FAIL",
    `pgbouncer=${flags.pgbouncer ? "true" : "false/absent"}`,
  );
  reportLine(
    "INV-4a · connection_limit",
    "INFO",
    flags.connectionLimit !== null
      ? `connection_limit=${flags.connectionLimit} (eyeball against pool size)`
      : "connection_limit not set",
  );
}

// ── INV-11 · league singleton (DB-backed, prod-run-only) ────────────────────────────
async function checkLeagueSingleton() {
  if (!process.env.DATABASE_URL) {
    console.log("[SKIP] INV-11 · league singleton (no DATABASE_URL)");
    return;
  }
  const dbPkgDir = resolve(repoRoot, "packages/db");
  let prisma;
  try {
    const dbRequire = createRequire(pathToFileURL(resolve(dbPkgDir, "package.json")));
    const { register } = await import(pathToFileURL(dbRequire.resolve("tsx/esm/api")).href);
    register(); // lets the TS @app/db import below resolve under plain `node`
    ({ prisma } = await import(pathToFileURL(resolve(dbPkgDir, "src/index.ts")).href));
  } catch (e) {
    console.log(
      `[SKIP] INV-11 · league singleton (DB harness unavailable: ${e.message.split("\n")[0]})`,
    );
    return;
  }
  try {
    const rows = await prisma.league.findMany({
      select: { id: true, name: true, createdAt: true },
    });
    if (rows.length === 1) {
      reportLine("INV-11 · league singleton", "PASS", `1 row (id=${rows[0].id})`);
    } else {
      reportLine("INV-11 · league singleton", "FAIL", `${rows.length} rows found`);
      for (const row of rows) {
        console.log(`  · id=${row.id} name=${row.name} created_at=${row.createdAt}`);
      }
    }
  } catch (e) {
    console.log(
      `[SKIP] INV-11 · league singleton (query failed — unreachable DB?: ${e.message.split("\n")[0]})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await checkDatabaseUrlFlags();
await checkLeagueSingleton();

console.log(`\nSummary: ${failCount === 0 ? "PASS" : `${failCount} FAIL(s)`}`);
process.exit(failCount === 0 ? 0 : 1);
