// Pure DATABASE_URL flag parsing for INV-4a (launch-env verification). Never returns the raw
// URL, host, user, or password — only booleans/strings needed to eyeball pooling config.
export type DatabaseUrlFlags = {
  pgbouncer: boolean;
  connectionLimit: string | null;
};

export function parseDatabaseUrlFlags(databaseUrl: string | undefined): DatabaseUrlFlags {
  if (!databaseUrl) {
    return { pgbouncer: false, connectionLimit: null };
  }
  let params: URLSearchParams;
  try {
    params = new URL(databaseUrl).searchParams;
  } catch {
    return { pgbouncer: false, connectionLimit: null };
  }
  const pgbouncer = params.get("pgbouncer") === "true";
  const connectionLimit = params.get("connection_limit");
  return { pgbouncer, connectionLimit };
}
