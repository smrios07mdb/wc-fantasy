import { describe, expect, it } from "vitest";
import { parseDatabaseUrlFlags } from "./launch-env";

describe("parseDatabaseUrlFlags", () => {
  it("reports pgbouncer=true and connection_limit when both present", () => {
    const flags = parseDatabaseUrlFlags(
      "postgresql://user:pass@host:5432/db?pgbouncer=true&connection_limit=5",
    );
    expect(flags.pgbouncer).toBe(true);
    expect(flags.connectionLimit).toBe("5");
  });

  it("reports pgbouncer=false when the flag is absent", () => {
    const flags = parseDatabaseUrlFlags("postgresql://user:pass@host:5432/db");
    expect(flags.pgbouncer).toBe(false);
    expect(flags.connectionLimit).toBeNull();
  });

  it("reports pgbouncer=false when the flag is present but not 'true'", () => {
    const flags = parseDatabaseUrlFlags("postgresql://user:pass@host:5432/db?pgbouncer=false");
    expect(flags.pgbouncer).toBe(false);
    expect(flags.connectionLimit).toBeNull();
  });

  it("handles a missing DATABASE_URL", () => {
    const flags = parseDatabaseUrlFlags(undefined);
    expect(flags.pgbouncer).toBe(false);
    expect(flags.connectionLimit).toBeNull();
  });

  it("handles an unparseable DATABASE_URL without throwing", () => {
    const flags = parseDatabaseUrlFlags("not-a-url");
    expect(flags.pgbouncer).toBe(false);
    expect(flags.connectionLimit).toBeNull();
  });
});
