/**
 * render.yaml reconciliation (Prompt 12, pieces 1–2). A config test, not a logic suite: it parses the
 * Blueprint and asserts the deploy contract that the app's env reads (audited across packages/apps)
 * impose — every required key on the correct service, the build-vs-runtime placement, the migrate/
 * runtime pooler split, and `sync: false` on every secret.
 *
 * Self-contained, dependency-free: a tiny YAML-SUBSET parser (the Blueprint is regular 2-space YAML we
 * author) avoids adding a yaml package. A `parses structurally` test guards the parser itself, so a
 * parser regression fails loudly rather than silently green-lighting a broken Blueprint.
 *
 * Source of truth for "required keys" = the process.env reads in the codebase (there is no central env
 * schema; config.ts files read env with intEnv() defaults). The required RUNTIME keys are the ones a
 * service cannot boot without:
 *   web    : DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *            SUPABASE_SERVICE_ROLE_KEY (+ DIRECT_URL for the migrate preDeployCommand)
 *   worker : DATABASE_URL, BALLDONTLIE_API_KEY
 *   cron   : DATABASE_URL
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ── locate render.yaml by walking up from this test (cwd-independent) ──────────────────────────────
function findUp(name: string): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error(`could not locate ${name} walking up from the test file`);
}

// ── minimal YAML-subset parser, scoped to the Blueprint shape we author ────────────────────────────
type EnvEntry = { key?: string; fromGroup?: string; sync?: boolean; value?: string };
type Service = { type: string; name: string; scalars: Record<string, string>; env: EnvEntry[] };
type Group = { name: string; env: EnvEntry[] };
type Blueprint = { groups: Group[]; services: Service[] };

const SCALAR_FIELDS = new Set([
  "name",
  "runtime",
  "plan",
  "region",
  "branch",
  "buildCommand",
  "preDeployCommand",
  "startCommand",
  "healthCheckPath",
  "schedule",
]);

const firstToken = (s: string): string =>
  s
    .replace(/\s+#.*$/, "")
    .trim()
    .split(/\s+/)[0] ?? "";

function parse(text: string): Blueprint {
  const groups: Group[] = [];
  const services: Service[] = [];
  let mode: "groups" | "services" | null = null;
  let curGroup: Group | null = null;
  let curService: Service | null = null;
  let curEntry: EnvEntry | null = null;

  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*#/.test(raw) || /^\s*$/.test(raw)) continue; // comment / blank
    const indent = raw.length - raw.trimStart().length;
    const content = raw.trim();

    if (indent === 0) {
      mode = content.startsWith("envVarGroups:")
        ? "groups"
        : content.startsWith("services:")
          ? "services"
          : mode;
      curGroup = null;
      curService = null;
      curEntry = null;
      continue;
    }

    if (content.startsWith("- ")) {
      const body = content.slice(2).trim();
      if (mode === "groups" && body.startsWith("name:")) {
        curGroup = { name: firstToken(body.slice(5)), env: [] };
        groups.push(curGroup);
        curEntry = null;
      } else if (mode === "services" && body.startsWith("type:")) {
        curService = { type: firstToken(body.slice(5)), name: "", scalars: {}, env: [] };
        services.push(curService);
        curEntry = null;
      } else if (body.startsWith("key:")) {
        curEntry = { key: firstToken(body.slice(4)) };
        (curGroup ?? curService)?.env.push(curEntry);
      } else if (body.startsWith("fromGroup:")) {
        curEntry = { fromGroup: firstToken(body.slice(10)) };
        (curGroup ?? curService)?.env.push(curEntry);
      }
      continue;
    }

    const m = content.match(/^([A-Za-z_][\w]*):\s?(.*)$/);
    if (!m) continue;
    const field = m[1];
    const rest = m[2] ?? "";
    if (!field || field === "envVars") continue;
    if (curEntry && (field === "sync" || field === "value")) {
      if (field === "sync") curEntry.sync = /\btrue\b/.test(rest);
      else
        curEntry.value = rest
          .replace(/\s+#.*$/, "")
          .trim()
          .replace(/^"(.*)"$/, "$1");
      continue;
    }
    if (curService && curGroup === null && SCALAR_FIELDS.has(field)) {
      const v = rest.replace(/^"(.*)"$/, "$1");
      curService.scalars[field] = v;
      if (field === "name") curService.name = v;
    }
  }
  return { groups, services };
}

// ── helpers over the parsed Blueprint ──────────────────────────────────────────────────────────────
const bp = parse(readFileSync(findUp("render.yaml"), "utf8"));
const svc = (name: string): Service => {
  const s = bp.services.find((x) => x.name === name);
  if (!s) throw new Error(`service ${name} not found in render.yaml`);
  return s;
};
const groupKeys = (name: string): string[] =>
  (bp.groups.find((g) => g.name === name)?.env ?? []).flatMap((e) => (e.key ? [e.key] : []));
const inlineKeys = (s: Service): string[] => s.env.flatMap((e) => (e.key ? [e.key] : []));
const effectiveKeys = (s: Service): Set<string> => {
  const keys = new Set(inlineKeys(s));
  for (const e of s.env) if (e.fromGroup) for (const k of groupKeys(e.fromGroup)) keys.add(k);
  return keys;
};
const findEntry = (s: Service, key: string): EnvEntry | undefined => {
  const inline = s.env.find((e) => e.key === key);
  if (inline) return inline;
  for (const e of s.env)
    if (e.fromGroup) {
      const g = bp.groups.find((x) => x.name === e.fromGroup);
      const hit = g?.env.find((x) => x.key === key);
      if (hit) return hit;
    }
  return undefined;
};

const SECRET_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BALLDONTLIE_API_KEY",
];

describe("render.yaml — Blueprint structure & topology", () => {
  it("parses structurally (guards the parser): ≥1 env group + the 3 services", () => {
    // The daily `wc-fantasy-faab-batch` cron was RETIRED (Theme-D per-matchday amendment): FAAB now
    // runs as a per-period trigger inside the worker tick, not a separate cron. The isolated Sofascore
    // `wc-fantasy-scraper` worker was REMOVED (CODE_PROMPT_57 — ratings run on the BALLDONTLIE rating).
    expect(bp.groups.length).toBeGreaterThanOrEqual(1);
    expect(bp.services.map((s) => s.name).sort()).toEqual(
      ["wc-fantasy-period-close", "wc-fantasy-web", "wc-fantasy-worker"].sort(),
    );
  });

  it("defines the Theme E topology: web + resident worker + 1 cron", () => {
    expect(svc("wc-fantasy-web").type).toBe("web");
    expect(svc("wc-fantasy-worker").type).toBe("worker");
    expect(svc("wc-fantasy-period-close").type).toBe("cron");
    // FAAB batch is no longer a cron — see the retired-cron note in render.yaml.
    expect(bp.services.find((s) => s.name === "wc-fantasy-faab-batch")).toBeUndefined();
    // The isolated Sofascore scraper worker was removed — see the retired-service note in render.yaml.
    expect(bp.services.find((s) => s.name === "wc-fantasy-scraper")).toBeUndefined();
  });

  it("every service builds from one repo on `main` with a start command", () => {
    for (const s of bp.services) {
      expect(s.scalars.branch).toBe("main");
      expect(s.scalars.buildCommand).toContain("pnpm install --frozen-lockfile");
      expect(s.scalars.startCommand).toMatch(/^pnpm /);
    }
  });

  it("uses a shared env group for the non-secret shared config, referenced by every service", () => {
    expect(groupKeys("wc-fantasy-shared")).toEqual(
      expect.arrayContaining(["NODE_ENV", "LOG_LEVEL"]),
    );
    for (const s of bp.services) {
      expect(s.env.some((e) => e.fromGroup === "wc-fantasy-shared")).toBe(true);
    }
  });

  it("NO env-group var uses `sync: false` (Render forbids it — group vars carry a literal value)", () => {
    // Render Blueprint spec: a `sync: false` var inside an env group is IGNORED. Putting a secret
    // (e.g. DATABASE_URL) there would silently strand it — no service would receive it. Secrets must
    // be declared per-service. This assertion is the guard that catches that whole failure class.
    for (const group of bp.groups) {
      for (const entry of group.env) {
        expect(entry.sync, `${group.name}.${entry.key} must not be sync:false`).not.toBe(false);
      }
    }
  });
});

describe("render.yaml — env reconciliation (required keys on the right service)", () => {
  it("web carries every runtime + build key it reads", () => {
    const keys = effectiveKeys(svc("wc-fantasy-web"));
    for (const k of [
      "DATABASE_URL",
      "DIRECT_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      expect(keys).toContain(k);
    }
  });

  it("NEXT_PUBLIC_* live INLINE on web (build-time inlined, not via the runtime-shared group)", () => {
    const inline = inlineKeys(svc("wc-fantasy-web"));
    expect(inline).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(inline).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("worker carries the feed key + the self-scheduled roster cadence; NO Supabase keys", () => {
    const keys = effectiveKeys(svc("wc-fantasy-worker"));
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("BALLDONTLIE_API_KEY");
    expect(keys).toContain("WORKER_ROSTERS_SYNC_EVERY_TICKS"); // roster re-pull is in-worker, not a cron
    expect(keys.has("SUPABASE_SERVICE_ROLE_KEY")).toBe(false); // bypasses RLS via Prisma owner
    expect(keys.has("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe(false);
  });

  it("each cron carries the DB (via the shared group) + a schedule", () => {
    for (const name of ["wc-fantasy-period-close"]) {
      expect(effectiveKeys(svc(name))).toContain("DATABASE_URL");
      expect(svc(name).scalars.schedule).toMatch(/\d+\s+/);
    }
  });

  it("web + worker carry the VAPID keypair (Prompt 41a); the private key is a sync:false secret", () => {
    // sendPush needs all three on BOTH services: the public key for setVapidDetails + the browser
    // subscribe (web), the private key + subject to sign. The worker copy is inert until 41b's triggers.
    for (const name of ["wc-fantasy-web", "wc-fantasy-worker"]) {
      const keys = effectiveKeys(svc(name));
      for (const k of ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) {
        expect(keys, `${name} must carry ${k}`).toContain(k);
      }
      // The private key is a secret — never a committed value.
      expect(findEntry(svc(name), "VAPID_PRIVATE_KEY")!.sync).toBe(false);
      expect(findEntry(svc(name), "VAPID_PRIVATE_KEY")!.value).toBeUndefined();
    }
    // The private key must never be exposed to the browser bundle.
    const all = bp.services.flatMap((s) => inlineKeys(s));
    expect(all.some((k) => /^NEXT_PUBLIC_.*VAPID_PRIVATE/.test(k))).toBe(false);
  });
});

describe("render.yaml — migrate/runtime pooler split & secret hygiene", () => {
  it("migrate deploy runs as the web preDeployCommand (it uses DIRECT_URL via the schema)", () => {
    expect(svc("wc-fantasy-web").scalars.preDeployCommand).toContain("db:migrate:deploy");
    // DIRECT_URL must be available to that step.
    expect(effectiveKeys(svc("wc-fantasy-web"))).toContain("DIRECT_URL");
  });

  it("web has a health check the platform can probe", () => {
    expect(svc("wc-fantasy-web").scalars.healthCheckPath).toBe("/api/health");
  });

  it("the service-role key is server-only — never a NEXT_PUBLIC_ key", () => {
    const all = bp.services.flatMap((s) => inlineKeys(s)).concat(groupKeys("wc-fantasy-shared"));
    expect(all.some((k) => /^NEXT_PUBLIC_.*SERVICE_ROLE/.test(k))).toBe(false);
    expect(all).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("every secret is `sync: false` with no committed value", () => {
    for (const key of SECRET_KEYS) {
      const entry =
        findEntry(svc("wc-fantasy-web"), key) ?? findEntry(svc("wc-fantasy-worker"), key);
      expect(entry, `secret ${key} must be declared somewhere`).toBeTruthy();
      expect(entry!.sync, `${key} must be sync: false`).toBe(false);
      expect(entry!.value, `${key} must not commit a value`).toBeUndefined();
    }
  });
});
