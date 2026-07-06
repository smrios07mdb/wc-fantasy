/**
 * UUID-BIND FENCE (SCHEMA-UUID-AUDIT class-killer) — a real-file grep over the monorepo product
 * source that FAILS CI when hand-written raw SQL casts an id/FK bind to `::uuid`.
 *
 * The audit (`audit/SCHEMA_UUID_INVENTORY.md`, origin/main `4591963`) proved every uuid-shaped
 * column in the schema — every `String @id @default(uuid())` PK, every bare-FK PK, every relation
 * FK — is Postgres **TEXT** (zero `@db.Uuid`). So a raw-SQL `WHERE id = $n::uuid` mismatches the
 * text column against a uuid param and raises `42883 operator does not exist: text = uuid` (the bug
 * that cost T15-BACKFILL three redeploys). The correct bind is always bare `$n`; arrays use
 * `::text[]`, never `::uuid[]`. See DECISIONS "Schema-wide: EVERY uuid-shaped id/FK column is TEXT".
 *
 * Zero offenders exist today (the one live-write raw-SQL id bind, backfillDisplayNamePiiRunner,
 * binds bare and is PG-proven at `97649aa`). This fence is PREVENTION before the §5 launch-audit
 * backfills start writing raw SQL against prod — the analog of the /scoring §9 engine-probe and the
 * time-truth fence: a re-introduced `::uuid` can't land green.
 *
 * WHY A BARE `::uuid` GREP SUFFICES: `::` is a Postgres cast operator with NO TypeScript meaning, so
 * any `::uuid` in executable (non-comment) TS is necessarily inside a raw-SQL string literal — the
 * predicate needs no call-site tracking. And because no column is uuid-typed, there is no legitimate
 * `::uuid` cast anywhere in product source; the sole deliberate `::uuid::text` use is the Supabase
 * `auth.uid()` RLS shim, which lives ONLY in integration TESTS (excluded from this scan) — there is
 * no product-source `auth.uid()` executable site. Comments (the audit's benign `::uuid` prose in the
 * backfill runner) are stripped before scanning; migration `.sql` is never scanned.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// apps/web/src/fences/ → repo root is four levels up.
const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");

/** Monorepo product-source roots (raw SQL lives in packages/db|lineup|faab AND apps/web). */
const SCAN_ROOTS = ["packages", "apps"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".git",
  ".claude", // worktrees live under .claude/ — never scan a sibling branch's copy
  "screenshots",
]);

/** Raw-SQL call markers — a file with one of these is a genuine raw-SQL site. */
const RAW_SQL_MARKER = /\$(queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe)\b/;
/** Banned: a `::uuid` (or `::uuid[]`) cast in executable raw SQL. */
const UUID_CAST = /::uuid/i;
/** A raw-SQL id/FK bind to a positional/interpolated param — the shape the fence protects. */
const ID_BIND = /\bid\s*=\s*\$|\bid\s+in\s*\(\s*\$/i;

interface Scanned {
  file: string; // repo-relative path
  raw: string[]; // original lines
  stripped: string[]; // comment-stripped lines, index-aligned with raw
  hasRawSql: boolean;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a root may not exist; the others still scan
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.(ts|tsx)$/.test(name)) continue; // tests excluded (they hold the auth.uid() shim + fixtures)
    out.push(full);
  }
  return out;
}

/**
 * Strip `//` line comments and `/* ... *␦/` block comments (including multi-line JSDoc) so prose
 * that MENTIONS `::uuid` — as the backfill runner's BINDING NOTE does — is not mistaken for code.
 * Line-by-line with block-comment carry-over, preserving line count for accurate `:line` reporting.
 * Deliberately simple (not a full JS lexer): the only thing that matters is whether `::uuid`
 * survives in executable text, and a `::uuid` cast never shares a line with a `//` before it.
 */
function stripComments(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const line of source.split("\n")) {
    let result = "";
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) {
          i = line.length;
        } else {
          i = end + 2;
          inBlock = false;
        }
        continue;
      }
      const blockStart = line.indexOf("/*", i);
      const lineStart = line.indexOf("//", i);
      if (lineStart !== -1 && (blockStart === -1 || lineStart < blockStart)) {
        result += line.slice(i, lineStart);
        break; // rest of line is a `//` comment
      }
      if (blockStart !== -1) {
        result += line.slice(i, blockStart);
        i = blockStart + 2;
        inBlock = true;
        continue;
      }
      result += line.slice(i);
      break;
    }
    out.push(result);
  }
  return out;
}

const scanned: Scanned[] = SCAN_ROOTS.flatMap((root) =>
  sourceFiles(join(repoRoot, root)).map((file) => {
    const text = readFileSync(file, "utf8");
    const raw = text.split("\n");
    return {
      file: relative(repoRoot, file),
      raw,
      stripped: stripComments(text),
      hasRawSql: RAW_SQL_MARKER.test(text),
    };
  }),
);

/** `::uuid` casts in comment-stripped code, reported as `path:line  <code>`. */
function uuidCastOffenders(): string[] {
  const hits: string[] = [];
  for (const { file, stripped } of scanned) {
    stripped.forEach((line, i) => {
      if (UUID_CAST.test(line)) hits.push(`${file}:${i + 1}  ${line.trim()}`);
    });
  }
  return hits;
}

/** Non-comment raw-SQL id-bind sites (id = $n / id IN ($n)) in files that contain raw SQL. */
function idBindSites(): string[] {
  const hits: string[] = [];
  for (const { file, stripped, hasRawSql } of scanned) {
    if (!hasRawSql) continue;
    stripped.forEach((line, i) => {
      if (ID_BIND.test(line)) hits.push(`${file}:${i + 1}  ${line.trim()}`);
    });
  }
  return hits;
}

describe("uuid-bind fence — raw-SQL id/FK binds are bare $n, never ::uuid (every uuid column is TEXT)", () => {
  it("scans a non-empty product tree with ≥1 real raw-SQL id-bind site (no vacuous green scan)", () => {
    // If the roots move or the raw-SQL sites vanish, this fails loudly instead of scanning nothing.
    const sites = idBindSites();
    expect(scanned.length).toBeGreaterThan(0);
    expect(
      sites.length,
      "expected at least one raw-SQL id-bind site (e.g. backfillDisplayNamePiiRunner) — a moved/emptied tree would green-scan nothing",
    ).toBeGreaterThan(0);
  });

  it("bans ::uuid casts in raw-SQL product source (::uuid[] → ::text[]; the 42883 bug class)", () => {
    const hits = uuidCastOffenders();
    expect(
      hits,
      `::uuid cast found in raw-SQL product source — bind id/FK params bare ($n), never ::uuid:\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  it("excludes comments from the scan (the backfill runner's ::uuid BINDING NOTE is prose, not a bind)", () => {
    // Proves the stripper is doing real work: the benign ::uuid prose exists in the raw source but
    // must NOT count as an offender — otherwise the green above would be false comfort.
    const rawUuidMentions = scanned.filter(({ raw }) => raw.some((l) => UUID_CAST.test(l)));
    expect(
      rawUuidMentions.length,
      "expected ≥1 file whose raw text mentions ::uuid in a comment (the audit's benign sites) — if none, the exclusion is untested",
    ).toBeGreaterThan(0);
    // None of those raw mentions survive comment-stripping into the offender set.
    expect(uuidCastOffenders()).toEqual([]);
  });
});
