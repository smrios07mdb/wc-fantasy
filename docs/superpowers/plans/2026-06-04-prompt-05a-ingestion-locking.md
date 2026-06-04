# Prompt 05a — BALLDONTLIE Ingestion + Polling Scheduler + Lock-on-play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow superpowers:test-driven-development for every code task (RED → GREEN → commit).

**Goal:** Make ingestion real — fetch from BALLDONTLIE over six endpoints, write the raw layer idempotently, set `lineup_slot.locked_at` per lock-on-play, and drive the existing recompute `sweep` — keeping all network/clock at thin edges and every parse/map/decision pure.

**Architecture:** A real HTTP `@app/feed` client (injected `fetch`-shaped transport, cursor pagination, configurable rate limit). A new `@app/ingest` package holding **pure** parse/map, lock-on-play derivation, the structural match→period mapping, and the scheduler mode-decision, plus a thin `IngestStore` port (Memory + Prisma impls) for IO. An additive schema migration pins `fifa_match.period_id` (structural, never time-inferred) as the single match→period source of truth and adds the per-match `kickoff_lock_fallback` flag; the recompute Prisma store is repointed at `period_id` (its only sanctioned edit). The worker replaces its no-op tick with a pure `(matches, now)` mode-decision that dispatches ingestion then calls `sweep`, and emits the poller-silent alert.

**Tech Stack:** TypeScript (ESM, strict), pnpm workspace, Prisma/PostgreSQL, Vitest 4 (fixtures + `vi.useFakeTimers()`), Node ≥20 global `fetch`.

**Locked constraints (do NOT violate):**

- Do NOT change `@app/scoring`, the recompute adapter/resolver/engine/`sweep`/standings **signatures**. The ONLY sanctioned recompute edit is repointing the two window-inference query bodies in `prismaStore.ts` at `period_id`.
- `rating_player_match` writes are `source='balldontlie'` ONLY. No `source='scrape'`, no scraper, no rating comparison (Prompt 05b).
- `locked_at` governs swap-editability ONLY; it must never enter the scoring path.
- Carry `incident_class` through verbatim (no pre-collapsing) so the adapter classifies second-yellow vs red.
- Pure modules (`map.ts`, `lock.ts`, `mode.ts`, period-label derivation) must be grep-clean of `Date.now` / `new Date` / `fetch(` / `process.env`. Inject `now` and the transport.

---

## File Structure

**Create:**

- `packages/db/prisma/migrations/20260604120000_match_period_and_lock_fallback/migration.sql` — additive: `fifa_match.period_id` FK + index, `fifa_match.kickoff_lock_fallback` bool.
- `packages/feed/src/http.ts` — `FetchLike` type + `httpJson` transport wrapper + `BalldontlieHttpError`.
- `packages/feed/src/rateLimiter.ts` — pure min-interval throttle (injected clock + sleep).
- `packages/feed/src/client.ts` — real `createBalldontlieClient` (request + cursor pagination).
- `packages/feed/src/__fixtures__/*.json` — recorded endpoint payloads (match w/ sub, two-yellow cards, penalty shot, team stats, multi-page).
- `packages/feed/src/feed.test.ts` — parse, pagination, rate-limit (fake timer).
- `packages/feed/vitest`-discovered tests (no config needed).
- `packages/ingest/package.json`, `packages/ingest/tsconfig.json`, `packages/ingest/src/index.ts`
- `packages/ingest/src/map.ts` — pure feed→row mappers + `derivePeriodLabel` (structural).
- `packages/ingest/src/lock.ts` — pure lock-on-play derivation (+ fallback mode).
- `packages/ingest/src/mode.ts` — pure scheduler mode-decision + poller-silent detection.
- `packages/ingest/src/store.ts` — `IngestStore` port.
- `packages/ingest/src/memoryStore.ts` — `MemoryIngestStore` test double.
- `packages/ingest/src/prismaStore.ts` — `createPrismaIngestStore` (thin IO; exported via `@app/ingest/prisma`).
- `packages/ingest/src/ingest.ts` — orchestration (feed + store → upserts + dirty + locks).
- `packages/ingest/src/map.test.ts`, `lock.test.ts`, `mode.test.ts`, `store.test.ts`, `ingest.test.ts`

**Modify:**

- `packages/db/prisma/schema.prisma` — `FifaMatch` gains `periodId`/`period` relation + `kickoffLockFallback`; `Period` gains `matches FifaMatch[]` back-relation.
- `packages/feed/src/types.ts` — extend (optional, tolerated) nested ref fields; add `FetchLike`-friendly nothing-breaking. Add `RateLimitConfig`/transport to `FeedClientConfig` (in `index.ts`).
- `packages/feed/src/index.ts` — re-export `client.ts`/`http.ts`/`rateLimiter.ts`; `FeedClientConfig` gains `transport?`, `requestsPerMinute?`.
- `packages/feed/package.json` — add `@app/ingest`? No. Add nothing new (uses global fetch). Keep deps.
- `packages/recompute/src/prismaStore.ts` — repoint `getAffectedManagerPeriods` + `getManagerPeriodSlots` at `fifa_match.period_id`; update the resolved TODO comment.
- `apps/worker/src/config.ts` — add `balldontlieRpm`, `liveWindowGraceMs`, `settleMaxMs`.
- `apps/worker/src/wiring.ts` — assemble the ingest Prisma store + feed (with rate limit).
- `apps/worker/src/scheduler.ts` — async tick: pure mode-decision → dispatch ingestion → `runRecomputeSweep` → poller-silent alert; re-entrancy guard; keep `maxTicks`/`onDrained`.
- `.env.example` — add `BALLDONTLIE_RPM` (default 5 = trial).

---

## Task 0: Schema — pin `fifa_match.period_id` + `kickoff_lock_fallback`, repoint recompute reads

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (`FifaMatch` ~309-349; `Period` ~417-443)
- Create: `packages/db/prisma/migrations/20260604120000_match_period_and_lock_fallback/migration.sql`
- Modify: `packages/recompute/src/prismaStore.ts:175-197` (`getAffectedManagerPeriods`), `:216-248` (`getManagerPeriodSlots`)

- [ ] **Step 1: Edit `schema.prisma` — `FifaMatch`.** Add after `round String?` (line ~318) and into the relations block:

```prisma
  /// Structural fantasy-period link (ARCHITECTURE.md §3 / Prompt 05a). Set at schedule-sync from the
  /// fixture's STRUCTURAL round/matchday — never from kickoff-time inference (a postponement reorders
  /// kickoffs and would corrupt a time-derived matchday). Single source of truth: locking, the
  /// recompute dirty-walk, and period-close all read it. NULL until the matching period row is seeded.
  /// TODO(confirm): assumes one league per fixture-period (the single-league product). Multi-league
  /// would need a per-league match→period link rather than a single FK.
  periodId      String?     @map("period_id")
  /// Per-match lock-on-play fallback (Theme B / §3). false = lock-on-play (default); true = revert to
  /// kickoff-locking when live appearance data is missing. Operator UI that flips it is a later prompt.
  kickoffLockFallback Boolean @default(false) @map("kickoff_lock_fallback")
```

Add to the relations of `FifaMatch` (alongside `stage`/`group`/`homeTeam`):

```prisma
  period   Period?    @relation(fields: [periodId], references: [id], onDelete: SetNull)
```

Add `@@index([periodId])` next to the other `@@index` lines.

- [ ] **Step 2: Edit `schema.prisma` — `Period`.** Add to its relations block (after `lineupSlots LineupSlot[]`):

```prisma
  matches     FifaMatch[]
```

- [ ] **Step 3: Write the migration SQL** (`migration.sql`, matching the manual-SQL style of `20260603223500_invariants`):

```sql
-- Prompt 05a: pin the structural match→period link + the per-match kickoff-lock fallback flag.
ALTER TABLE "fifa_match" ADD COLUMN "period_id" TEXT;
ALTER TABLE "fifa_match" ADD COLUMN "kickoff_lock_fallback" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "fifa_match"
  ADD CONSTRAINT "fifa_match_period_id_fkey"
  FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "fifa_match_period_id_idx" ON "fifa_match"("period_id");
```

- [ ] **Step 4: Regenerate the Prisma client** (no DB needed):

Run: `pnpm db:generate`
Expected: client regenerated; `FifaMatch` now has `periodId` + `kickoffLockFallback`.

- [ ] **Step 5: Repoint `getAffectedManagerPeriods`** in `prismaStore.ts` — replace its body (lines ~175-197) with:

```ts
    async getAffectedManagerPeriods(matchId, playerId): Promise<ManagerPeriodRef[]> {
      // Match→period is the structural `fifa_match.period_id` (Prompt 05a), no longer kickoff-window
      // inference. A (match, player) affects exactly the manager-periods whose lineup_slot is in this
      // match's period and lists this player.
      const match = await prisma.fifaMatch.findUnique({
        where: { id: matchId },
        select: { periodId: true },
      });
      if (!match?.periodId) return [];
      const slots = await prisma.lineupSlot.findMany({
        where: { playerId, periodId: match.periodId },
        select: { managerId: true, periodId: true },
      });
      const seen = new Set<string>();
      const refs: ManagerPeriodRef[] = [];
      for (const s of slots) {
        const k = `${s.managerId} ${s.periodId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        refs.push({ managerId: s.managerId, periodId: s.periodId });
      }
      return refs;
    },
```

- [ ] **Step 6: Repoint `getManagerPeriodSlots`** in `prismaStore.ts` — replace its body (lines ~216-248) with:

```ts
    async getManagerPeriodSlots(managerId, periodId): Promise<SlotScore[]> {
      const slots = await prisma.lineupSlot.findMany({
        where: { managerId, periodId },
        select: { playerId: true, isStarter: true },
      });
      const out: SlotScore[] = [];
      for (const slot of slots) {
        // A player plays at most ONE match per period, resolved by the structural `fifa_match.period_id`
        // (Prompt 05a retired the kickoff-window inference). `orderBy` keeps it DETERMINISTIC if a period
        // ever held 2+ scored matches for one player, so "recompute is a pure function of stored inputs"
        // (§4) holds regardless.
        const row = await prisma.scorePlayerMatch.findFirst({
          where: { playerId: slot.playerId, match: { periodId } },
          orderBy: { match: { kickoffAt: "asc" } },
          select: { breakdownJson: true },
        });
        const score = row ? (row.breakdownJson as unknown as ScoreBreakdown) : null;
        out.push({ isStarter: slot.isStarter, score });
      }
      return out;
    },
```

- [ ] **Step 7: Verify gates** (recompute tests use `MemoryStore`, so they stay green; the change is Prisma-only):

Run: `pnpm db:generate && pnpm -w typecheck && pnpm test`
Expected: typecheck PASS; all existing tests (210) PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/recompute/src/prismaStore.ts
git commit -m "feat(db,recompute): pin fifa_match.period_id (structural) + kickoff-lock fallback; retire recompute window-inference"
```

---

## Task 1: Feed client — rate limiter (pure, fake-timer tested)

**Files:**

- Create: `packages/feed/src/rateLimiter.ts`
- Test: `packages/feed/src/rateLimiter.test.ts`

A min-interval throttle: at most one request per `60000 / requestsPerMinute` ms. Clock + sleep injected so tests use fake timers; no real waiting. "Boring" — no token bucket.

- [ ] **Step 1: Write the failing test** (`rateLimiter.test.ts`):

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter } from "./rateLimiter";

afterEach(() => vi.useRealTimers());

describe("createRateLimiter", () => {
  it("spaces calls to the configured rate (5/min ⇒ ≥12s apart)", async () => {
    vi.useFakeTimers();
    const now = () => Date.now();
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const limiter = createRateLimiter({ requestsPerMinute: 5, now, sleep });
    const stamps: number[] = [];

    const run = async () => {
      for (let i = 0; i < 3; i++) {
        await limiter.acquire();
        stamps.push(now());
      }
    };
    const p = run();
    await vi.runAllTimersAsync();
    await p;

    expect(stamps[0]).toBe(0);
    expect(stamps[1]).toBe(12_000);
    expect(stamps[2]).toBe(24_000);
  });

  it("does not delay when calls are already spaced out", async () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({
      requestsPerMinute: 600, // 100ms apart
      now: () => Date.now(),
      sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    });
    await limiter.acquire(); // t=0
    vi.setSystemTime(5_000); // 5s later — well past the 100ms gap
    const before = Date.now();
    await limiter.acquire();
    expect(Date.now()).toBe(before); // no sleep
  });
});
```

- [ ] **Step 2: Run test → fails** (`createRateLimiter` undefined).

Run: `pnpm vitest run packages/feed/src/rateLimiter.test.ts`
Expected: FAIL (module not found / not a function).

- [ ] **Step 3: Implement `rateLimiter.ts`:**

```ts
/**
 * Min-interval throttle for the BALLDONTLIE rate limit (GOAT 600/min; the 48h dev trial is 5/min).
 * Deliberately simple (no token bucket): at most one acquire per `60000 / requestsPerMinute` ms. The
 * clock + sleep are INJECTED so this is testable with fake timers — no real waiting, no `Date.now`.
 */
export interface RateLimiterDeps {
  requestsPerMinute: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface RateLimiter {
  /** Resolve when it's safe to issue the next request (sleeping if needed). */
  acquire(): Promise<void>;
}

export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  const minIntervalMs = deps.requestsPerMinute > 0 ? 60_000 / deps.requestsPerMinute : 0;
  let nextAllowedAt = -Infinity;
  return {
    async acquire(): Promise<void> {
      const t = deps.now();
      const wait = Math.max(0, nextAllowedAt - t);
      if (wait > 0) await deps.sleep(wait);
      nextAllowedAt = deps.now() + minIntervalMs;
    },
  };
}
```

- [ ] **Step 4: Run test → passes.**

Run: `pnpm vitest run packages/feed/src/rateLimiter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/feed/src/rateLimiter.ts packages/feed/src/rateLimiter.test.ts
git commit -m "feat(feed): min-interval rate limiter (injected clock; fake-timer tested)"
```

---

## Task 2: Feed client — HTTP transport + cursor pagination

**Files:**

- Create: `packages/feed/src/http.ts`, `packages/feed/src/client.ts`
- Modify: `packages/feed/src/index.ts` (extend `FeedClientConfig`, re-export, replace stub)
- Create: `packages/feed/src/__fixtures__/` JSON, `packages/feed/src/feed.test.ts`

The transport is a `fetch`-shaped function injected via config (defaults to global `fetch`). `request()` builds the URL (snake_case query params + auth header), parses JSON to `Paginated<T>`. `paginate()` follows `meta.next_cursor` to exhaustion. `FeedClient` signatures are UNCHANGED.

- [ ] **Step 1: Implement `http.ts`** (transport type + error):

```ts
/** A `fetch`-shaped transport so tests drive the client with recorded payloads (no network). */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class BalldontlieHttpError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
  ) {
    super(`BALLDONTLIE ${endpoint} → HTTP ${status}`);
    this.name = "BalldontlieHttpError";
  }
}
```

- [ ] **Step 2: Write the failing test** (`feed.test.ts`) — drives the client with a fake transport over fixtures, asserts parse + multi-page assembly + rate-limit spacing. Use a transport that serves a 2-page `match_events` fixture and records request URLs:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createBalldontlieClient } from "./index";
import type { FetchLike } from "./http";

afterEach(() => vi.useRealTimers());

const json = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

describe("createBalldontlieClient", () => {
  it("parses match_events and follows the cursor across pages", async () => {
    const urls: string[] = [];
    const transport: FetchLike = (url) => {
      urls.push(url);
      if (url.includes("cursor=2")) {
        return Promise.resolve(
          json({ data: [{ id: 20, match_id: 7, incident_type: "goal" }], meta: {} }),
        );
      }
      return Promise.resolve(
        json({
          data: [
            {
              id: 10,
              match_id: 7,
              incident_type: "substitution",
              player_in_id: 99,
              time_minute: 61,
            },
          ],
          meta: { next_cursor: 2 },
        }),
      );
    };
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    const res = await client.matchEvents({ matchId: 7 });

    expect(res.data.map((e) => e.id)).toEqual([10, 20]); // both pages, in order
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("/fifa/v1/match_events");
    expect(urls[0]).toContain("match_id=7");
    expect(urls[1]).toContain("cursor=2");
  });

  it("sends the API key as the Authorization header", async () => {
    let seenAuth: string | undefined;
    const transport: FetchLike = (_url, init) => {
      seenAuth = init?.headers?.["Authorization"];
      return Promise.resolve(json({ data: [], meta: {} }));
    };
    const client = createBalldontlieClient({ apiKey: "secret", transport, requestsPerMinute: 600 });
    await client.matches();
    expect(seenAuth).toBe("secret");
  });

  it("throws BalldontlieHttpError on a non-ok response", async () => {
    const transport: FetchLike = () =>
      Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    await expect(client.matches()).rejects.toThrow(/HTTP 429/);
  });
});
```

> NOTE: the exact path segment (`/fifa/v1/...`) and the auth header form (`Authorization: <key>`) are **TODO(confirm)** against live GOAT docs — encode them as constants so a single edit fixes them.

- [ ] **Step 3: Run test → fails.**

Run: `pnpm vitest run packages/feed/src/feed.test.ts`
Expected: FAIL (stub throws NotImplemented).

- [ ] **Step 4: Implement `client.ts`** (real client) and rewrite `index.ts` to use it. `client.ts`:

```ts
import { createRateLimiter, type RateLimiter } from "./rateLimiter";
import { BalldontlieHttpError, type FetchLike } from "./http";
import type {
  Paginated,
  CursorMeta,
  FIFAMatch,
  FIFAMatchLineup,
  FIFAMatchEvent,
  FIFAPlayerMatchStats,
  FIFATeamMatchStats,
  FIFAShot,
  MatchListParams,
  MatchScopedParams,
  ListParams,
} from "./types";
import type { FeedClient, FeedClientConfig } from "./index";

// TODO(confirm): verify the API base path + auth scheme against live GOAT docs.
const API_PREFIX = "/fifa/v1";

interface Built {
  transport: FetchLike;
  baseUrl: string;
  apiKey: string;
  limiter: RateLimiter;
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) q.append(`${k}[]`, String(item));
    else q.append(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** snake_case the camelCase request params the typed surface accepts. */
function snakeParams(p: ListParams & Record<string, unknown>): Record<string, unknown> {
  const { perPage, cursor, ...rest } = p;
  return { ...rest, cursor, per_page: perPage };
}

async function getPage<T>(
  b: Built,
  endpoint: string,
  params: Record<string, unknown>,
): Promise<Paginated<T>> {
  await b.limiter.acquire();
  const url = `${b.baseUrl}${API_PREFIX}/${endpoint}${toQuery(params)}`;
  const res = await b.transport(url, { method: "GET", headers: { Authorization: b.apiKey } });
  if (!res.ok) throw new BalldontlieHttpError(endpoint, res.status);
  const body = (await res.json()) as Paginated<T>;
  return { data: body.data ?? [], meta: (body.meta ?? {}) as CursorMeta };
}

/** Follow `meta.next_cursor` to exhaustion, returning all rows. */
async function getAll<T>(
  b: Built,
  endpoint: string,
  params: Record<string, unknown>,
): Promise<Paginated<T>> {
  const all: T[] = [];
  let cursor: number | string | null | undefined = params.cursor as number | string | undefined;
  let lastMeta: CursorMeta = {};
  do {
    const page = await getPage<T>(b, endpoint, { ...params, cursor });
    all.push(...page.data);
    lastMeta = page.meta;
    cursor = page.meta.next_cursor ?? null;
  } while (cursor !== null && cursor !== undefined);
  return { data: all, meta: lastMeta };
}

export function buildClient(config: FeedClientConfig): FeedClient {
  const b: Built = {
    transport: config.transport ?? ((url, init) => fetch(url, init) as ReturnType<FetchLike>),
    baseUrl: config.baseUrl ?? "https://api.balldontlie.io",
    apiKey: config.apiKey,
    limiter: createRateLimiter({
      requestsPerMinute: config.requestsPerMinute ?? 5, // default = dev trial rate
      now: () => Date.now(),
      sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    }),
  };
  return {
    matches: (p?: MatchListParams) =>
      getAll<FIFAMatch>(b, "matches", snakeParams({ ...(p ?? {}) })),
    matchLineups: (p: MatchScopedParams) =>
      getAll<FIFAMatchLineup>(b, "match_lineups", snakeParams({ ...p, match_id: p.matchId })),
    matchEvents: (p: MatchScopedParams) =>
      getAll<FIFAMatchEvent>(b, "match_events", snakeParams({ ...p, match_id: p.matchId })),
    playerMatchStats: (p: MatchScopedParams) =>
      getAll<FIFAPlayerMatchStats>(
        b,
        "player_match_stats",
        snakeParams({ ...p, match_id: p.matchId }),
      ),
    teamMatchStats: (p: MatchScopedParams) =>
      getAll<FIFATeamMatchStats>(b, "team_match_stats", snakeParams({ ...p, match_id: p.matchId })),
    matchShots: (p: MatchScopedParams) =>
      getAll<FIFAShot>(b, "match_shots", snakeParams({ ...p, match_id: p.matchId })),
  };
}
```

> NOTE: `snakeParams` must drop the camelCase `matchId` from the query and emit `match_id`. Adjust `snakeParams` to also delete `matchId`:
> `const { perPage, cursor, matchId, ...rest } = p;` then `return { ...rest, cursor, per_page: perPage };` (matchId is re-added explicitly by each scoped call as `match_id`).

- [ ] **Step 5: Rewrite `index.ts`** — extend `FeedClientConfig`, delegate to `buildClient`, re-export submodules:

```ts
/**
 * @app/feed — BALLDONTLIE FIFA World Cup client. Real HTTP over the six polled endpoints
 * (ARCHITECTURE.md §3): cursor pagination + a configurable rate limit. Transport is injected so
 * tests drive it with recorded fixtures (no network). No DB here — pure transport + parse.
 */
import type {
  Paginated,
  FIFAMatch,
  FIFAMatchLineup,
  FIFAMatchEvent,
  FIFAPlayerMatchStats,
  FIFATeamMatchStats,
  FIFAShot,
  MatchListParams,
  MatchScopedParams,
} from "./types";
import type { FetchLike } from "./http";
import { buildClient } from "./client";

export * from "./types";
export * from "./http";
export * from "./rateLimiter";

export interface FeedClient {
  matches(params?: MatchListParams): Promise<Paginated<FIFAMatch>>;
  matchLineups(params: MatchScopedParams): Promise<Paginated<FIFAMatchLineup>>;
  matchEvents(params: MatchScopedParams): Promise<Paginated<FIFAMatchEvent>>;
  playerMatchStats(params: MatchScopedParams): Promise<Paginated<FIFAPlayerMatchStats>>;
  teamMatchStats(params: MatchScopedParams): Promise<Paginated<FIFATeamMatchStats>>;
  matchShots(params: MatchScopedParams): Promise<Paginated<FIFAShot>>;
}

export interface FeedClientConfig {
  apiKey: string;
  /** Defaults to https://api.balldontlie.io. */
  baseUrl?: string;
  /** Injected transport (defaults to global fetch). */
  transport?: FetchLike;
  /** Rate cap. Default 5 = the 48h dev trial; GOAT is 600. */
  requestsPerMinute?: number;
}

export function createBalldontlieClient(config: FeedClientConfig): FeedClient {
  return buildClient(config);
}
```

(`client.ts` imports `FeedClient`/`FeedClientConfig` from `./index` — this is a type-only cycle, fine under `isolatedModules`.)

- [ ] **Step 6: Run feed tests → pass; then full gate.**

Run: `pnpm vitest run packages/feed && pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/feed/src
git commit -m "feat(feed): real BALLDONTLIE HTTP client — injected transport, cursor pagination, rate limit"
```

---

## Task 3: `@app/ingest` scaffold + pure feed→row mappers (`map.ts`)

**Files:**

- Create: `packages/ingest/package.json`, `packages/ingest/tsconfig.json`, `packages/ingest/src/index.ts`
- Create: `packages/ingest/src/map.ts`, `packages/ingest/src/map.test.ts`

`map.ts` is **pure**: feed objects → plain row shapes keyed by BALLDONTLIE ids (the store resolves FK ids). Includes `derivePeriodLabel` (structural). Mechanical mappers cover EVERY `stat_player_match` column (per ARCHITECTURE §7 — an unpopulated column silently degrades a score to 0).

- [ ] **Step 1: `package.json`:**

```json
{
  "name": "@app/ingest",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
    "./prisma": { "types": "./src/prismaStore.ts", "default": "./src/prismaStore.ts" }
  },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@app/db": "workspace:*",
    "@app/feed": "workspace:*",
    "@app/shared": "workspace:*"
  },
  "devDependencies": { "@types/node": "^22.10.5" }
}
```

- [ ] **Step 2: `tsconfig.json`** (identical to feed/recompute):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Write failing tests** (`map.test.ts`) covering: stat passthrough (all 22 columns coalesced to row), `is_penalty` derived from `situation`, `incident_class` carried verbatim, knockout `derivePeriodLabel`, group `derivePeriodLabel` returning null when no matchday:

```ts
import { describe, it, expect } from "vitest";
import {
  mapStatLine,
  mapEvent,
  mapShot,
  mapTeamStat,
  mapMatchRow,
  mapRating,
  derivePeriodLabel,
} from "./map";

describe("mapStatLine", () => {
  it("maps every consumed column and leaves absent fields null", () => {
    const row = mapStatLine({
      match_id: 1,
      player_id: 2,
      minutes_played: 90,
      goals: 1,
      saves: 3,
      saves_inside_box: 2,
    });
    expect(row).toMatchObject({
      matchBdlId: 1,
      playerBdlId: 2,
      minutesPlayed: 90,
      goals: 1,
      saves: 3,
      savesInsideBox: 2,
    });
    expect(row.assists).toBeNull();
    expect(row.possessionLost).toBeNull();
  });
});

describe("mapShot", () => {
  it("derives is_penalty from situation==='penalty' and preserves shot_type/situation", () => {
    const pen = mapShot({
      id: 5,
      match_id: 1,
      player_id: 2,
      shot_type: "goal",
      situation: "penalty",
      minute: 30,
    });
    expect(pen).toMatchObject({
      bdlId: 5,
      isPenalty: true,
      shotType: "goal",
      situation: "penalty",
      minute: 30,
    });
    const open = mapShot({
      id: 6,
      match_id: 1,
      player_id: 2,
      shot_type: "save",
      situation: "open_play",
    });
    expect(open.isPenalty).toBe(false);
  });
});

describe("mapEvent", () => {
  it("carries incident_class through verbatim (no pre-collapsing)", () => {
    const e = mapEvent({
      id: 9,
      match_id: 1,
      incident_type: "card",
      incident_class: "yellowRed",
      time_minute: 75,
      added_time: 2,
      player_id: 4,
    });
    expect(e).toMatchObject({
      bdlId: 9,
      incidentType: "card",
      incidentClass: "yellowRed",
      timeMinute: 75,
      addedTime: 2,
    });
  });
});

describe("derivePeriodLabel", () => {
  it("maps a knockout round to its canonical label", () => {
    expect(
      derivePeriodLabel({ id: 1, status: "scheduled", datetime: "x", round: "Round of 32" }),
    ).toEqual({ kind: "knockout_round", label: "R32" });
    expect(
      derivePeriodLabel({ id: 1, status: "scheduled", datetime: "x", round: "Final" }),
    ).toEqual({ kind: "knockout_round", label: "Final" });
  });
  it("returns null for a group game with no usable matchday (TODO(confirm))", () => {
    expect(derivePeriodLabel({ id: 1, status: "scheduled", datetime: "x", group: "A" })).toBeNull();
  });
  it("maps a group matchday when the feed provides one", () => {
    expect(
      derivePeriodLabel({
        id: 1,
        status: "scheduled",
        datetime: "x",
        group: "A",
        matchday: 2,
      } as never),
    ).toEqual({ kind: "group_md", label: "MD2" });
  });
});
```

- [ ] **Step 4: Run → fail.** `pnpm vitest run packages/ingest/src/map.test.ts` → FAIL.

- [ ] **Step 5: Implement `map.ts`.** Full code (mechanical mappers enumerate every column; `derivePeriodLabel` is structural, never temporal):

```ts
/**
 * PURE feed→row mappers (ARCHITECTURE.md §4/§7). No IO, no clock. Output rows are keyed by
 * BALLDONTLIE ids; the store resolves them to internal UUIDs. Coalesce-to-null mirrors the loose feed
 * (the adapter coalesces null→0 downstream), but EVERY column the §7 map consumes is mapped — an
 * unmapped column silently undercounts a score.
 */
import type { PeriodKind } from "@app/shared";
import type {
  FIFAMatch,
  FIFAMatchEvent,
  FIFAPlayerMatchStats,
  FIFAShot,
  FIFATeamMatchStats,
} from "@app/feed";

const n = (v: number | null | undefined): number | null => v ?? null;
const s = (v: string | null | undefined): string | null => v ?? null;

export interface StatLineRow {
  matchBdlId: number;
  playerBdlId: number;
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  keyPasses: number | null;
  dribblesAttempted: number | null;
  dribblesCompleted: number | null;
  duelsWon: number | null;
  duelsLost: number | null;
  passesTotal: number | null;
  passesAccurate: number | null;
  longBallsTotal: number | null;
  longBallsAccurate: number | null;
  wasFouled: number | null;
  clearances: number | null;
  interceptions: number | null;
  tacklesWon: number | null;
  blockedShots: number | null;
  saves: number | null;
  savesInsideBox: number | null;
  punches: number | null;
  highClaims: number | null;
  possessionLost: number | null;
}

export function mapStatLine(f: FIFAPlayerMatchStats): StatLineRow {
  return {
    matchBdlId: f.match_id,
    playerBdlId: f.player_id,
    minutesPlayed: n(f.minutes_played),
    goals: n(f.goals),
    assists: n(f.assists),
    keyPasses: n(f.key_passes),
    dribblesAttempted: n(f.dribbles_attempted),
    dribblesCompleted: n(f.dribbles_completed),
    duelsWon: n(f.duels_won),
    duelsLost: n(f.duels_lost),
    passesTotal: n(f.passes_total),
    passesAccurate: n(f.passes_accurate),
    longBallsTotal: n(f.long_balls_total),
    longBallsAccurate: n(f.long_balls_accurate),
    wasFouled: n(f.was_fouled),
    clearances: n(f.clearances),
    interceptions: n(f.interceptions),
    tacklesWon: n(f.tackles_won),
    blockedShots: n(f.blocked_shots),
    saves: n(f.saves),
    savesInsideBox: n(f.saves_inside_box),
    punches: n(f.punches),
    highClaims: n(f.high_claims),
    possessionLost: n(f.possession_lost),
  };
}

/** The native BALLDONTLIE rating → rating_player_match(source='balldontlie'). null when absent. */
export function mapRating(f: FIFAPlayerMatchStats): {
  matchBdlId: number;
  playerBdlId: number;
  rating: number | null;
} {
  return { matchBdlId: f.match_id, playerBdlId: f.player_id, rating: n(f.rating) };
}

export interface EventRowIn {
  bdlId: number;
  matchBdlId: number;
  incidentType: string;
  incidentClass: string | null;
  timeMinute: number | null;
  addedTime: number | null;
  period: string | null;
  playerBdlId: number | null;
  assistPlayerBdlId: number | null;
  playerInBdlId: number | null;
  playerOutBdlId: number | null;
  rescinded: boolean;
}

export function mapEvent(f: FIFAMatchEvent): EventRowIn {
  return {
    bdlId: f.id,
    matchBdlId: f.match_id,
    incidentType: f.incident_type,
    incidentClass: s(f.incident_class), // carried VERBATIM (adapter keys 2nd-yellow vs red off it)
    timeMinute: n(f.time_minute),
    addedTime: n(f.added_time),
    period: s(f.period),
    playerBdlId: n(f.player_id),
    assistPlayerBdlId: n(f.assist_player_id),
    playerInBdlId: n(f.player_in_id),
    playerOutBdlId: n(f.player_out_id),
    rescinded: f.rescinded ?? false,
  };
}

export interface ShotRowIn {
  bdlId: number;
  matchBdlId: number;
  playerBdlId: number | null;
  shotType: string | null;
  situation: string | null;
  isPenalty: boolean;
  minute: number | null;
}

const PENALTY = "penalty"; // TODO(confirm): exact match_shots.situation token for a penalty (live data)
export function mapShot(f: FIFAShot): ShotRowIn {
  const situation = s(f.situation);
  return {
    bdlId: f.id,
    matchBdlId: f.match_id,
    playerBdlId: n(f.player_id),
    shotType: s(f.shot_type),
    situation,
    isPenalty: (situation ?? "").toLowerCase() === PENALTY,
    minute: n(f.minute),
  };
}

export interface TeamStatRowIn {
  matchBdlId: number;
  teamBdlId: number;
  offsides: number | null;
  shotsBlocked: number | null;
  possession: number | null;
}
export function mapTeamStat(f: FIFATeamMatchStats): TeamStatRowIn {
  return {
    matchBdlId: f.match_id,
    teamBdlId: f.team_id,
    offsides: n(f.offsides),
    shotsBlocked: n(f.shots_blocked),
    possession: n(f.possession),
  };
}

export type FeedMatchStatus = "scheduled" | "in_progress" | "completed" | "postponed" | "abandoned";
// TODO(confirm): the exact feed status vocabulary; normalize defensively.
export function normalizeStatus(raw: string): FeedMatchStatus {
  const t = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (t.includes("progress") || t === "live" || t === "inplay") return "in_progress";
  if (t.includes("complete") || t === "finished" || t === "ft") return "completed";
  if (t.includes("postpon")) return "postponed";
  if (t.includes("abandon")) return "abandoned";
  return "scheduled";
}

export interface MatchRowIn {
  bdlId: number;
  kickoffAtIso: string;
  status: FeedMatchStatus;
  round: string | null;
  group: string | null;
  stage: string | null;
  homeTeamBdlId: number | null;
  awayTeamBdlId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreEt: number | null;
  awayScoreEt: number | null;
  homeScorePens: number | null;
  awayScorePens: number | null;
  homeFormation: string | null;
  awayFormation: string | null;
  referee: string | null;
}

export function mapMatchRow(f: FIFAMatch): MatchRowIn {
  return {
    bdlId: f.id,
    kickoffAtIso: f.datetime,
    status: normalizeStatus(f.status),
    round: s(f.round),
    group: s(f.group),
    stage: s(f.stage),
    homeTeamBdlId: n(f.home_team_id),
    awayTeamBdlId: n(f.away_team_id),
    homeScore: n(f.home_score),
    awayScore: n(f.away_score),
    homeScoreEt: n(f.home_score_et),
    awayScoreEt: n(f.away_score_et),
    homeScorePens: n(f.home_score_pens),
    awayScorePens: n(f.away_score_pens),
    homeFormation: s(f.home_formation),
    awayFormation: s(f.away_formation),
    referee: s(f.referee),
  };
}

const KNOCKOUT: Array<[RegExp, string]> = [
  [/roundof32|r32/, "R32"],
  [/roundof16|r16/, "R16"],
  [/quarter|qf/, "QF"],
  [/semi|sf/, "SF"],
  [/final/, "Final"],
];

/**
 * Structural period label for a fixture — from round/matchday, NEVER kickoff time (a postponement
 * would corrupt a time-derived matchday). Knockout: round → canonical label. Group: a usable matchday
 * integer → MD{n}; otherwise null (the caller leaves period_id null + TODO(confirm)).
 */
export function derivePeriodLabel(f: FIFAMatch): { kind: PeriodKind; label: string } | null {
  const round = (f.round ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (round) {
    for (const [re, label] of KNOCKOUT)
      if (re.test(round)) return { kind: "knockout_round", label };
  }
  // Group: look for an explicit matchday integer (loose field — confirm exact key on live data).
  const md = (f as Record<string, unknown>)["matchday"];
  const n = typeof md === "number" ? md : typeof md === "string" ? Number(md) : NaN;
  if (Number.isInteger(n) && n >= 1) return { kind: "group_md", label: `MD${n}` };
  // TODO(confirm): the feed gives stage/group/round but no confirmed matchday integer; derive MD1/2/3
  // structurally once the live shape is known — never by sorting kickoff times.
  return null;
}
```

- [ ] **Step 6: `index.ts`** export `export * from "./map";` (extend as later modules land).

- [ ] **Step 7: Install workspace + run.** `pnpm install` (links `@app/ingest`), then `pnpm vitest run packages/ingest/src/map.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ingest/package.json packages/ingest/tsconfig.json packages/ingest/src/index.ts packages/ingest/src/map.ts packages/ingest/src/map.test.ts pnpm-lock.yaml
git commit -m "feat(ingest): scaffold @app/ingest + pure feed→row mappers and structural period-label derivation"
```

---

## Task 4: Pure lock-on-play derivation (`lock.ts`)

**Files:** Create `packages/ingest/src/lock.ts`, `packages/ingest/src/lock.test.ts`

Pure: derive WHICH player BDL-ids lock and AT WHAT instant, given a kickoff. No DB. Starters@kickoff (any official-XI appearance — starter or bench in the fantasy lineup); subs@entry-minute (`kickoff + (timeMinute + addedTime)` minutes); never-appear → not in the result. Fallback mode (kickoff-lock): lock the fantasy-listed starters at kickoff, ignore subs.

- [ ] **Step 1: Failing test** (`lock.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { lockInstantsFromLineup, lockInstantFromSub, type LineupAppearance } from "./lock";

const kickoff = new Date("2026-06-10T18:00:00Z");

describe("lockInstantsFromLineup", () => {
  it("locks every official-XI player at kickoff; benched-by-real-team players are absent", () => {
    const xi: LineupAppearance[] = [
      { playerBdlId: 1, isStarter: true },
      { playerBdlId: 2, isStarter: true },
    ];
    const locks = lockInstantsFromLineup(xi, kickoff);
    expect(locks).toEqual([
      { playerBdlId: 1, lockedAt: kickoff },
      { playerBdlId: 2, lockedAt: kickoff },
    ]);
    expect(locks.find((l) => l.playerBdlId === 99)).toBeUndefined(); // not in XI → not locked
  });
});

describe("lockInstantFromSub", () => {
  it("locks a substitute at his effective entry minute (incl. added_time)", () => {
    const lock = lockInstantFromSub({ playerInBdlId: 7, timeMinute: 61, addedTime: 2 }, kickoff);
    expect(lock).toEqual({ playerBdlId: 7, lockedAt: new Date("2026-06-10T19:03:00Z") }); // +63 min
  });
  it("returns null for an event with no player_in", () => {
    expect(
      lockInstantFromSub({ playerInBdlId: null, timeMinute: 61, addedTime: null }, kickoff),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement `lock.ts`:**

```ts
/**
 * PURE lock-on-play derivation (Theme B / DECISIONS Data-source Amendment 1). Decides which player
 * BDL-ids lock and at what UTC instant, given the kickoff. No IO. `locked_at` governs swap-editability
 * ONLY — it never enters scoring. Starters lock at kickoff (any official-XI appearance); subs lock at
 * their effective entry minute; players who never appear are simply absent (caller leaves locked_at null).
 */
export interface LineupAppearance {
  playerBdlId: number;
  /** Whether the player is in the official starting XI (true) — bench appearances lock via subs. */
  isStarter: boolean;
}

export interface PlayerLock {
  playerBdlId: number;
  lockedAt: Date;
}

/** Every official-XI starter locks at kickoff (played from minute 1). */
export function lockInstantsFromLineup(
  entries: readonly LineupAppearance[],
  kickoffAt: Date,
): PlayerLock[] {
  return entries
    .filter((e) => e.isStarter)
    .map((e) => ({ playerBdlId: e.playerBdlId, lockedAt: kickoffAt }));
}

export interface SubEvent {
  playerInBdlId: number | null;
  timeMinute: number | null;
  addedTime: number | null;
}

/** A substitute locks at kickoff + (time_minute + added_time) minutes. Null if no player came on. */
export function lockInstantFromSub(sub: SubEvent, kickoffAt: Date): PlayerLock | null {
  if (sub.playerInBdlId == null) return null;
  const minutes = (sub.timeMinute ?? 0) + (sub.addedTime ?? 0);
  return {
    playerBdlId: sub.playerInBdlId,
    lockedAt: new Date(kickoffAt.getTime() + minutes * 60_000),
  };
}
```

> NOTE: the **fallback** (kickoff-lock mode) does not need a new pure function — it is "run `lockInstantsFromLineup` over the _fantasy-listed starters_ at kickoff and skip sub-locking." That branch lives in the orchestration (Task 7) reading `fifa_match.kickoff_lock_fallback`; the pure primitive above is reused. Locking from a `Date` arg keeps `lock.ts` clock-free.

- [ ] **Step 4: Run → pass.** **Step 5: Commit**

```bash
git add packages/ingest/src/lock.ts packages/ingest/src/lock.test.ts
git commit -m "feat(ingest): pure lock-on-play derivation (starters@kickoff, subs@entry incl added_time)"
```

---

## Task 5: Pure scheduler mode-decision + poller-silent detection (`mode.ts`)

**Files:** Create `packages/ingest/src/mode.ts`, `packages/ingest/src/mode.test.ts`

Pure function of `(matches, now)` → the set of per-match actions for this tick. Plus `pollerSilentMatches(matches, lastLivePollByMatch, now)` → matches in a live window with no recent successful poll.

- [ ] **Step 1: Failing test** (`mode.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { decideMatchModes, pollerSilentMatches, type ModeMatch } from "./mode";

const T = (iso: string) => new Date(iso).getTime();
const base = { homeBdlId: 1, awayBdlId: 2 };

describe("decideMatchModes", () => {
  const now = new Date("2026-06-10T19:00:00Z");

  it("a match in_progress → live", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 10,
      status: "in_progress",
      kickoffMs: T("2026-06-10T18:00:00Z"),
      hasRating: false,
      lineupPulled: false,
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 10)?.mode).toBe("live");
  });

  it("a scheduled match past kickoff with no lineup yet → pre_match", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 11,
      status: "scheduled",
      kickoffMs: T("2026-06-10T18:59:00Z"),
      hasRating: false,
      lineupPulled: false,
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 11)?.mode).toBe("pre_match");
  });

  it("a completed match with no rating yet → settle", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 12,
      status: "completed",
      kickoffMs: T("2026-06-10T17:00:00Z"),
      hasRating: false,
      lineupPulled: true,
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 12)?.mode).toBe("settle");
  });

  it("a completed match with a rating and stale FT → idle (dropped)", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 13,
      status: "completed",
      kickoffMs: T("2026-06-09T17:00:00Z"),
      hasRating: true,
      lineupPulled: true,
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 13)).toBeUndefined();
  });

  it("a far-future scheduled match → idle (dropped)", () => {
    const m: ModeMatch = {
      ...base,
      bdlId: 14,
      status: "scheduled",
      kickoffMs: T("2026-06-12T18:00:00Z"),
      hasRating: false,
      lineupPulled: false,
    };
    expect(decideMatchModes([m], now).find((a) => a.bdlId === 14)).toBeUndefined();
  });
});

describe("pollerSilentMatches", () => {
  it("flags an in_progress match whose last successful live poll is older than the grace window", () => {
    const now = new Date("2026-06-10T19:10:00Z");
    const m: ModeMatch = {
      ...base,
      bdlId: 20,
      status: "in_progress",
      kickoffMs: T("2026-06-10T18:00:00Z"),
      hasRating: false,
      lineupPulled: true,
    };
    const last = new Map<number, number>([[20, T("2026-06-10T19:00:00Z")]]); // 10 min ago
    expect(pollerSilentMatches([m], last, now, 5 * 60_000).map((x) => x.bdlId)).toEqual([20]);
  });
  it("does not flag when a recent poll succeeded", () => {
    const now = new Date("2026-06-10T19:10:00Z");
    const m: ModeMatch = {
      ...base,
      bdlId: 21,
      status: "in_progress",
      kickoffMs: T("2026-06-10T18:00:00Z"),
      hasRating: false,
      lineupPulled: true,
    };
    const last = new Map<number, number>([[21, T("2026-06-10T19:08:00Z")]]);
    expect(pollerSilentMatches([m], last, now, 5 * 60_000)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement `mode.ts`:**

```ts
/**
 * PURE scheduler mode-decision (ARCHITECTURE.md §3). A pure function of (matches, now) — the worker
 * supplies the clock. Each tick maps each match to at most one action; idle matches are dropped.
 *
 * Modes: schedule-sync is global (handled by the worker on a slow cadence), so this decides the
 * per-match modes pre_match / live / settle.
 */
export type MatchMode = "pre_match" | "live" | "settle";

export interface ModeMatch {
  bdlId: number;
  status: "scheduled" | "in_progress" | "completed" | "postponed" | "abandoned";
  kickoffMs: number;
  /** Whether a balldontlie rating row already exists (settle stop signal). */
  hasRating: boolean;
  /** Whether the pre-match lineup pull already ran (so pre_match fires ONCE). */
  lineupPulled: boolean;
}

export interface MatchAction {
  bdlId: number;
  mode: MatchMode;
}

/** How long after kickoff a not-yet-live match is still eligible for the pre-match lineup pull. */
const PRE_MATCH_GRACE_MS = 30 * 60_000;
/** How long after kickoff a completed match keeps settling while the rating is still missing. */
const SETTLE_MAX_MS = 12 * 60 * 60_000;

export function decideMatchModes(matches: readonly ModeMatch[], now: Date): MatchAction[] {
  const t = now.getTime();
  const out: MatchAction[] = [];
  for (const m of matches) {
    if (m.status === "in_progress") {
      out.push({ bdlId: m.bdlId, mode: "live" });
      continue;
    }
    if (m.status === "scheduled") {
      // At/after kickoff (within grace) and not yet pulled → pull the confirmed XI once.
      if (!m.lineupPulled && t >= m.kickoffMs && t <= m.kickoffMs + PRE_MATCH_GRACE_MS) {
        out.push({ bdlId: m.bdlId, mode: "pre_match" });
      }
      continue;
    }
    if (m.status === "completed") {
      // Keep settling until the rating lands (or we give up after the max window).
      if (!m.hasRating && t <= m.kickoffMs + SETTLE_MAX_MS) {
        out.push({ bdlId: m.bdlId, mode: "settle" });
      }
      continue;
    }
    // postponed / abandoned → idle (schedule-sync keeps status fresh).
  }
  return out;
}

/** Matches in a live window whose last successful live poll is older than `graceMs` (or never). §8. */
export function pollerSilentMatches(
  matches: readonly ModeMatch[],
  lastLivePollByMatch: ReadonlyMap<number, number>,
  now: Date,
  graceMs: number,
): MatchAction[] {
  const t = now.getTime();
  const out: MatchAction[] = [];
  for (const m of matches) {
    if (m.status !== "in_progress") continue;
    const last = lastLivePollByMatch.get(m.bdlId);
    if (last === undefined || t - last > graceMs) out.push({ bdlId: m.bdlId, mode: "live" });
  }
  return out;
}
```

- [ ] **Step 4: Run → pass. Step 5: Commit**

```bash
git add packages/ingest/src/mode.ts packages/ingest/src/mode.test.ts
git commit -m "feat(ingest): pure scheduler mode-decision + poller-silent detection"
```

---

## Task 6: `IngestStore` port + `MemoryIngestStore` (idempotency + locking, no DB)

**Files:** Create `packages/ingest/src/store.ts`, `packages/ingest/src/memoryStore.ts`, `packages/ingest/src/store.test.ts`

`IngestStore` is the IO port for ingestion: upsert reference rows (team/player/match) resolving BDL ids→internal ids; upsert raw rows (stat/event/shot/team/rating) marking `(match,player)` dirty / enqueuing `recompute_dirty`; set `lineup_slot.locked_at`; read fixtures for the scheduler; resolve a structural label → `period_id`. `MemoryIngestStore` models these for unit tests.

- [ ] **Step 1: `store.ts`** — the port (signatures; impls follow):

```ts
/**
 * The ingestion IO PORT (ARCHITECTURE.md §3/§4). Raw upserts are idempotent on natural keys; every
 * write that affects scoring marks (match, player) dirty so the existing recompute sweep recomputes.
 * Internal UUIDs are resolved from BALLDONTLIE ids here, so the pure mappers stay id-agnostic.
 */
import type { MatchRowIn, StatLineRow, EventRowIn, ShotRowIn, TeamStatRowIn } from "./map";

export interface RefMatchResult {
  /** Internal fifa_match UUID. */ matchId: string;
}

export interface IngestStore {
  // reference rows
  upsertTeamByBdlId(bdlId: number, name: string | null): Promise<string>;
  upsertPlayerByBdlId(
    bdlId: number,
    fields: { displayName: string | null; position: string | null; teamBdlId: number | null },
  ): Promise<string>;
  /** Upsert fifa_match on balldontlie id; set the structural period_id (resolved from `periodLabel`). */
  upsertMatch(
    row: MatchRowIn,
    periodId: string | null,
    opts: { kickoffLockFallback?: boolean },
  ): Promise<RefMatchResult>;
  /** Resolve a structural {kind,label} to the league period id, or null if not seeded. */
  resolvePeriodId(label: { kind: string; label: string } | null): Promise<string | null>;

  // raw layer (idempotent; mark dirty)
  upsertStatLine(row: StatLineRow): Promise<void>;
  upsertRatingBalldontlie(
    matchBdlId: number,
    playerBdlId: number,
    rating: number | null,
  ): Promise<void>;
  upsertEvent(row: EventRowIn): Promise<void>;
  upsertShot(row: ShotRowIn): Promise<void>;
  upsertTeamStat(row: TeamStatRowIn): Promise<void>;
  /** Enqueue a player_match recompute marker for a match-level write (events/shots/team have no dirty col). */
  markPlayersDirty(matchBdlId: number, playerBdlIds: readonly number[]): Promise<void>;

  // locking
  setLockedAt(matchBdlId: number, playerBdlId: number, lockedAt: Date): Promise<void>;

  // scheduler reads
  listSchedulableMatches(): Promise<
    Array<{
      bdlId: number;
      status: string;
      kickoffMs: number;
      hasRating: boolean;
      lineupPulled: boolean;
      kickoffLockFallback: boolean;
    }>
  >;
}
```

- [ ] **Step 2: Failing test** (`store.test.ts`) for idempotency + dirty + locking against `MemoryIngestStore`:

```ts
import { describe, it, expect } from "vitest";
import { MemoryIngestStore } from "./memoryStore";
import { mapStatLine } from "./map";

describe("MemoryIngestStore raw upserts", () => {
  it("is idempotent on the natural key and re-marks dirty on a changed value", async () => {
    const store = new MemoryIngestStore();
    await store.upsertStatLine(mapStatLine({ match_id: 1, player_id: 2, goals: 1 }));
    await store.upsertStatLine(mapStatLine({ match_id: 1, player_id: 2, goals: 1 }));
    expect(store.statLines()).toHaveLength(1); // no dupe
    expect(store.isDirty(1, 2)).toBe(true);

    store.clearDirty(1, 2);
    await store.upsertStatLine(mapStatLine({ match_id: 1, player_id: 2, goals: 2 })); // changed
    expect(store.statLines()[0].goals).toBe(2); // overwritten
    expect(store.isDirty(1, 2)).toBe(true); // re-dirtied
  });

  it("setLockedAt records the lock for (match, player)", async () => {
    const store = new MemoryIngestStore();
    const at = new Date("2026-06-10T18:00:00Z");
    await store.setLockedAt(1, 2, at);
    expect(store.lockedAt(1, 2)).toEqual(at);
  });
});
```

- [ ] **Step 3: Run → fail. Step 4: Implement `memoryStore.ts`** (models maps keyed by `${matchBdlId}:${playerBdlId}` etc., always `dirty=true` on raw write, dedup by key, plus `seed*`/assertion helpers):

```ts
import type { IngestStore, RefMatchResult } from "./store";
import type { MatchRowIn, StatLineRow, EventRowIn, ShotRowIn, TeamStatRowIn } from "./map";

const pk = (a: number, b: number) => `${a}:${b}`;

export class MemoryIngestStore implements IngestStore {
  private stats = new Map<string, StatLineRow>();
  private ratings = new Map<string, number | null>();
  private events = new Map<number, EventRowIn>();
  private shots = new Map<number, ShotRowIn>();
  private teamStats = new Map<string, TeamStatRowIn>();
  private dirty = new Set<string>();
  private locks = new Map<string, Date>();
  private periods = new Map<string, string>(); // `${kind}:${label}` → periodId
  private matches: Array<{
    bdlId: number;
    status: string;
    kickoffMs: number;
    hasRating: boolean;
    lineupPulled: boolean;
    kickoffLockFallback: boolean;
  }> = [];

  // seeding / assertions
  seedPeriod(kind: string, label: string, id: string): void {
    this.periods.set(`${kind}:${label}`, id);
  }
  seedSchedulable(m: {
    bdlId: number;
    status: string;
    kickoffMs: number;
    hasRating?: boolean;
    lineupPulled?: boolean;
    kickoffLockFallback?: boolean;
  }): void {
    this.matches.push({ hasRating: false, lineupPulled: false, kickoffLockFallback: false, ...m });
  }
  statLines(): StatLineRow[] {
    return [...this.stats.values()];
  }
  allEvents(): EventRowIn[] {
    return [...this.events.values()];
  }
  isDirty(m: number, p: number): boolean {
    return this.dirty.has(pk(m, p));
  }
  clearDirty(m: number, p: number): void {
    this.dirty.delete(pk(m, p));
  }
  lockedAt(m: number, p: number): Date | undefined {
    return this.locks.get(pk(m, p));
  }
  ratingFor(m: number, p: number): number | null | undefined {
    return this.ratings.get(pk(m, p));
  }

  upsertTeamByBdlId(bdlId: number): Promise<string> {
    return Promise.resolve(`team-${bdlId}`);
  }
  upsertPlayerByBdlId(bdlId: number): Promise<string> {
    return Promise.resolve(`player-${bdlId}`);
  }
  upsertMatch(row: MatchRowIn): Promise<RefMatchResult> {
    return Promise.resolve({ matchId: `match-${row.bdlId}` });
  }
  resolvePeriodId(label: { kind: string; label: string } | null): Promise<string | null> {
    return Promise.resolve(
      label ? (this.periods.get(`${label.kind}:${label.label}`) ?? null) : null,
    );
  }
  upsertStatLine(row: StatLineRow): Promise<void> {
    this.stats.set(pk(row.matchBdlId, row.playerBdlId), row);
    this.dirty.add(pk(row.matchBdlId, row.playerBdlId));
    return Promise.resolve();
  }
  upsertRatingBalldontlie(m: number, p: number, rating: number | null): Promise<void> {
    this.ratings.set(pk(m, p), rating);
    this.dirty.add(pk(m, p));
    return Promise.resolve();
  }
  upsertEvent(row: EventRowIn): Promise<void> {
    this.events.set(row.bdlId, row);
    return Promise.resolve();
  }
  upsertShot(row: ShotRowIn): Promise<void> {
    this.shots.set(row.bdlId, row);
    return Promise.resolve();
  }
  upsertTeamStat(row: TeamStatRowIn): Promise<void> {
    this.teamStats.set(pk(row.matchBdlId, row.teamBdlId), row);
    return Promise.resolve();
  }
  markPlayersDirty(m: number, ps: readonly number[]): Promise<void> {
    for (const p of ps) this.dirty.add(pk(m, p));
    return Promise.resolve();
  }
  setLockedAt(m: number, p: number, at: Date): Promise<void> {
    this.locks.set(pk(m, p), at);
    return Promise.resolve();
  }
  listSchedulableMatches(): Promise<typeof this.matches> {
    return Promise.resolve(this.matches);
  }
}
```

> NOTE: the `IngestStore` interface signatures with extra params (e.g. `upsertTeamByBdlId(bdlId, name)`) must match — the Memory impl can ignore unused params (prefix `_name`). Keep the interface and impls in lockstep (the `no-unused-vars` lint is `^_`-tolerant).

- [ ] **Step 5: Run → pass.** **Step 6: Add `export * from "./store"; export { MemoryIngestStore } from "./memoryStore";`** to `index.ts`. **Step 7: Commit**

```bash
git add packages/ingest/src/store.ts packages/ingest/src/memoryStore.ts packages/ingest/src/store.test.ts packages/ingest/src/index.ts
git commit -m "feat(ingest): IngestStore port + in-memory test double (idempotent raw upserts + locking)"
```

---

## Task 7: Ingestion orchestration (`ingest.ts`) — feed→map→store→dirty→locks

**Files:** Create `packages/ingest/src/ingest.ts`, `packages/ingest/src/ingest.test.ts`

Orchestration functions take a `FeedClient` + `IngestStore` + injected `now`/clock-derived kickoff and run a mode's work. Each marks dirty; locking reads `kickoffLockFallback`.

- [ ] **Step 1: Failing test** (`ingest.test.ts`) — a fake `FeedClient` returns fixtures; assert store rows + dirty + locks. Cover: live ingest upserts events/stats/shots/team + marks players dirty + locks the sub at entry; pre-match locks all starters at kickoff; fallback mode locks only fantasy starters and skips subs.

```ts
import { describe, it, expect } from "vitest";
import { MemoryIngestStore } from "./memoryStore";
import { ingestLineups, ingestLive } from "./ingest";
import type { FeedClient } from "@app/feed";

function fakeFeed(over: Partial<Record<keyof FeedClient, unknown>>): FeedClient {
  const empty = (data: unknown[] = []) => Promise.resolve({ data, meta: {} });
  return {
    matches: () => empty(),
    matchLineups: () => empty(),
    matchEvents: () => empty(),
    playerMatchStats: () => empty(),
    teamMatchStats: () => empty(),
    matchShots: () => empty(),
    ...(over as object),
  } as FeedClient;
}

const kickoff = new Date("2026-06-10T18:00:00Z");

describe("ingestLineups (pre-match)", () => {
  it("locks every official-XI starter at kickoff", async () => {
    const feed = fakeFeed({
      matchLineups: () =>
        Promise.resolve({
          data: [
            {
              match_id: 50,
              entries: [
                { player_id: 1, is_starter: true },
                { player_id: 2, is_starter: true },
                { player_id: 3, is_starter: false },
              ],
            },
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    await ingestLineups(feed, store, { bdlId: 50, kickoffAt: kickoff, kickoffLockFallback: false });
    expect(store.lockedAt(50, 1)).toEqual(kickoff);
    expect(store.lockedAt(50, 2)).toEqual(kickoff);
    expect(store.lockedAt(50, 3)).toBeUndefined(); // bench (not in real XI) stays unlocked
  });
});

describe("ingestLive", () => {
  it("upserts events/stats and locks the substitute at his entry minute; marks players dirty", async () => {
    const feed = fakeFeed({
      matchEvents: () =>
        Promise.resolve({
          data: [
            {
              id: 900,
              match_id: 50,
              incident_type: "substitution",
              player_in_id: 7,
              player_out_id: 2,
              time_minute: 61,
              added_time: 1,
            },
          ],
          meta: {},
        }),
      playerMatchStats: () =>
        Promise.resolve({
          data: [{ match_id: 50, player_id: 7, minutes_played: 30, rating: 7.1 }],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    await ingestLive(feed, store, { bdlId: 50, kickoffAt: kickoff, kickoffLockFallback: false });
    expect(store.lockedAt(50, 7)).toEqual(new Date("2026-06-10T19:02:00Z")); // +62 min
    expect(store.isDirty(50, 7)).toBe(true);
    expect(store.ratingFor(50, 7)).toBe(7.1);
  });

  it("under kickoff-lock fallback, does NOT lock an entering substitute", async () => {
    const feed = fakeFeed({
      matchEvents: () =>
        Promise.resolve({
          data: [
            {
              id: 901,
              match_id: 50,
              incident_type: "substitution",
              player_in_id: 7,
              time_minute: 61,
              added_time: 0,
            },
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    await ingestLive(feed, store, { bdlId: 50, kickoffAt: kickoff, kickoffLockFallback: true });
    expect(store.lockedAt(50, 7)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement `ingest.ts`:**

```ts
/**
 * Ingestion orchestration (ARCHITECTURE.md §3). Threads a FeedClient + IngestStore: pull → pure map →
 * idempotent upsert → mark dirty → set locked_at. IO lives in the store + feed; the mapping/locking
 * decisions are the pure modules. The worker calls the recompute `sweep` AFTER each pass.
 */
import type { FeedClient } from "@app/feed";
import type { IngestStore } from "./store";
import { mapEvent, mapShot, mapStatLine, mapRating, mapTeamStat } from "./map";
import { lockInstantsFromLineup, lockInstantFromSub, type LineupAppearance } from "./lock";

export interface MatchCtx {
  bdlId: number;
  kickoffAt: Date;
  kickoffLockFallback: boolean;
}

/** Pre-match: pull the confirmed XI and lock every official starter at kickoff. */
export async function ingestLineups(
  feed: FeedClient,
  store: IngestStore,
  ctx: MatchCtx,
): Promise<void> {
  const res = await feed.matchLineups({ matchId: ctx.bdlId });
  for (const lineup of res.data) {
    const entries: LineupAppearance[] = lineup.entries.map((e) => ({
      playerBdlId: e.player_id,
      isStarter: e.is_starter,
    }));
    for (const lock of lockInstantsFromLineup(entries, ctx.kickoffAt)) {
      await store.setLockedAt(ctx.bdlId, lock.playerBdlId, lock.lockedAt);
    }
  }
}

/** Live: upsert events/stats/shots/team stats, mark players dirty, and lock entering subs at their minute. */
export async function ingestLive(
  feed: FeedClient,
  store: IngestStore,
  ctx: MatchCtx,
): Promise<void> {
  const [events, stats, shots, teamStats] = await Promise.all([
    feed.matchEvents({ matchId: ctx.bdlId }),
    feed.playerMatchStats({ matchId: ctx.bdlId }),
    feed.matchShots({ matchId: ctx.bdlId }),
    feed.teamMatchStats({ matchId: ctx.bdlId }),
  ]);

  const touched = new Set<number>();

  for (const f of stats.data) {
    const row = mapStatLine(f);
    await store.upsertStatLine(row);
    const r = mapRating(f);
    await store.upsertRatingBalldontlie(r.matchBdlId, r.playerBdlId, r.rating);
    touched.add(row.playerBdlId);
  }

  for (const f of events.data) {
    const e = mapEvent(f);
    await store.upsertEvent(e);
    for (const id of [e.playerBdlId, e.assistPlayerBdlId, e.playerInBdlId, e.playerOutBdlId]) {
      if (id != null) touched.add(id);
    }
    // Lock-on-play: a substitute locks at entry — UNLESS this match is on the kickoff-lock fallback.
    if (!ctx.kickoffLockFallback && e.incidentType.toLowerCase().includes("substitut")) {
      const lock = lockInstantFromSub(
        { playerInBdlId: e.playerInBdlId, timeMinute: e.timeMinute, addedTime: e.addedTime },
        ctx.kickoffAt,
      );
      if (lock) await store.setLockedAt(ctx.bdlId, lock.playerBdlId, lock.lockedAt);
    }
  }

  for (const f of shots.data) {
    const sh = mapShot(f);
    await store.upsertShot(sh);
    if (sh.playerBdlId != null) touched.add(sh.playerBdlId);
  }

  for (const f of teamStats.data) await store.upsertTeamStat(mapTeamStat(f));

  // events/shots/team_stats have no `dirty` column → enqueue player-match markers explicitly.
  await store.markPlayersDirty(ctx.bdlId, [...touched]);
}

/** Settle: re-pull stats + shots + the rating until values stabilize (same writes as live, no sub-locking). */
export async function ingestSettle(
  feed: FeedClient,
  store: IngestStore,
  ctx: MatchCtx,
): Promise<void> {
  const [stats, shots] = await Promise.all([
    feed.playerMatchStats({ matchId: ctx.bdlId }),
    feed.matchShots({ matchId: ctx.bdlId }),
  ]);
  const touched = new Set<number>();
  for (const f of stats.data) {
    const row = mapStatLine(f);
    await store.upsertStatLine(row);
    const r = mapRating(f);
    await store.upsertRatingBalldontlie(r.matchBdlId, r.playerBdlId, r.rating);
    touched.add(row.playerBdlId);
  }
  for (const f of shots.data) {
    const sh = mapShot(f);
    await store.upsertShot(sh);
    if (sh.playerBdlId != null) touched.add(sh.playerBdlId);
  }
  await store.markPlayersDirty(ctx.bdlId, [...touched]);
}
```

- [ ] **Step 4: Run → pass. Step 5: `index.ts`** add `export * from "./ingest"; export * from "./lock"; export * from "./mode";`. **Step 6: Commit**

```bash
git add packages/ingest/src/ingest.ts packages/ingest/src/ingest.test.ts packages/ingest/src/index.ts
git commit -m "feat(ingest): pull→map→upsert→dirty→lock orchestration (live/pre-match/settle)"
```

---

## Task 8: `createPrismaIngestStore` (thin Prisma IO impl)

**Files:** Create `packages/ingest/src/prismaStore.ts`

The production `IngestStore`: resolve BDL ids ↔ internal UUIDs, idempotent upserts, set `dirty=true`, enqueue `recompute_dirty`, set `lineup_slot.locked_at` across the match's `period_id`. No new unit tests (needs a DB); covered by typecheck + the Memory-store unit tests. Key behaviors:

- [ ] **Step 1: Implement `prismaStore.ts`** (representative; mirror the Prisma patterns in `recompute/src/prismaStore.ts`):

```ts
/**
 * Prisma-backed {@link IngestStore} — the ONLY file in @app/ingest that touches the DB. Thin: resolve
 * BDL ids → internal UUIDs, upsert on natural keys, set `dirty`/enqueue `recompute_dirty`, set
 * `lineup_slot.locked_at`. The clock enters only here (Prisma `updatedAt`); the pure modules are clock-free.
 */
import type { PrismaClient, Position } from "@app/db";
import type { IngestStore, RefMatchResult } from "./store";
import type { MatchRowIn, StatLineRow, EventRowIn, ShotRowIn, TeamStatRowIn } from "./map";

type Db = PrismaClient;

export function createPrismaIngestStore(prisma: Db): IngestStore {
  // resolve a BDL match id → internal id (cache-free; small N)
  const matchIdFor = async (bdlId: number): Promise<string | null> =>
    (await prisma.fifaMatch.findUnique({ where: { balldontlieId: bdlId }, select: { id: true } }))
      ?.id ?? null;
  const playerIdFor = async (bdlId: number): Promise<string | null> =>
    (await prisma.player.findUnique({ where: { balldontlieId: bdlId }, select: { id: true } }))
      ?.id ?? null;

  const enqueuePlayerMatchDirty = async (matchId: string, playerId: string): Promise<void> => {
    // events/shots/team have no row-level dirty col; the player_match marker drives the sweep.
    // (stat/rating/manual upserts already set dirty=true; this is for the others.)
    const exists = await prisma.recomputeDirty.findFirst({
      where: { scope: "player_match", matchId, playerId, processedAt: null },
      select: { id: true },
    });
    if (!exists)
      await prisma.recomputeDirty.create({ data: { scope: "player_match", matchId, playerId } });
  };

  return {
    async upsertTeamByBdlId(bdlId, name): Promise<string> {
      const row = await prisma.fifaTeam.upsert({
        where: { balldontlieId: bdlId },
        create: { balldontlieId: bdlId, name: name ?? `Team ${bdlId}` },
        update: name ? { name } : {},
        select: { id: true },
      });
      return row.id;
    },

    async upsertPlayerByBdlId(bdlId, fields): Promise<string> {
      const teamId =
        fields.teamBdlId != null
          ? ((
              await prisma.fifaTeam.findUnique({
                where: { balldontlieId: fields.teamBdlId },
                select: { id: true },
              })
            )?.id ?? null)
          : null;
      const position = (fields.position ?? "MID") as Position; // TODO(confirm): feed position vocabulary
      const row = await prisma.player.upsert({
        where: { balldontlieId: bdlId },
        create: {
          balldontlieId: bdlId,
          displayName: fields.displayName ?? `Player ${bdlId}`,
          position,
          teamId,
        },
        update: {
          ...(fields.displayName ? { displayName: fields.displayName } : {}),
          ...(teamId ? { teamId } : {}),
        },
        select: { id: true },
      });
      return row.id;
    },

    async upsertMatch(row, periodId, opts): Promise<RefMatchResult> {
      const homeTeamId =
        row.homeTeamBdlId != null ? await this.upsertTeamByBdlId(row.homeTeamBdlId, null) : null;
      const awayTeamId =
        row.awayTeamBdlId != null ? await this.upsertTeamByBdlId(row.awayTeamBdlId, null) : null;
      const data = {
        kickoffAt: new Date(row.kickoffAtIso),
        status: row.status,
        round: row.round,
        homeTeamId,
        awayTeamId,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        homeScoreEt: row.homeScoreEt,
        awayScoreEt: row.awayScoreEt,
        homeScorePens: row.homeScorePens,
        awayScorePens: row.awayScorePens,
        homeFormation: row.homeFormation,
        awayFormation: row.awayFormation,
        referee: row.referee,
        periodId,
        kickoffLockFallback: opts.kickoffLockFallback ?? false,
      };
      const m = await prisma.fifaMatch.upsert({
        where: { balldontlieId: row.bdlId },
        create: { balldontlieId: row.bdlId, ...data },
        update: data,
        select: { id: true },
      });
      return { matchId: m.id };
    },

    async resolvePeriodId(label): Promise<string | null> {
      if (!label) return null;
      // Single-league assumption (one matching period). TODO(confirm): multi-league needs a per-league link.
      const p = await prisma.period.findFirst({
        where: { kind: label.kind as never, label: label.label },
        select: { id: true },
      });
      return p?.id ?? null;
    },

    async upsertStatLine(row: StatLineRow): Promise<void> {
      const matchId = await matchIdFor(row.matchBdlId);
      const playerId = await playerIdFor(row.playerBdlId);
      if (!matchId || !playerId) return; // ref rows must exist first (lineups/schedule-sync upsert them)
      const data = {
        minutesPlayed: row.minutesPlayed,
        goals: row.goals,
        assists: row.assists,
        keyPasses: row.keyPasses,
        dribblesAttempted: row.dribblesAttempted,
        dribblesCompleted: row.dribblesCompleted,
        duelsWon: row.duelsWon,
        duelsLost: row.duelsLost,
        passesTotal: row.passesTotal,
        passesAccurate: row.passesAccurate,
        longBallsTotal: row.longBallsTotal,
        longBallsAccurate: row.longBallsAccurate,
        wasFouled: row.wasFouled,
        clearances: row.clearances,
        interceptions: row.interceptions,
        tacklesWon: row.tacklesWon,
        blockedShots: row.blockedShots,
        saves: row.saves,
        savesInsideBox: row.savesInsideBox,
        punches: row.punches,
        highClaims: row.highClaims,
        possessionLost: row.possessionLost,
        dirty: true,
      };
      await prisma.statPlayerMatch.upsert({
        where: { matchId_playerId: { matchId, playerId } },
        create: { matchId, playerId, ...data },
        update: data,
      });
    },

    async upsertRatingBalldontlie(matchBdlId, playerBdlId, rating): Promise<void> {
      const matchId = await matchIdFor(matchBdlId);
      const playerId = await playerIdFor(playerBdlId);
      if (!matchId || !playerId) return;
      await prisma.ratingPlayerMatch.upsert({
        where: { matchId_playerId_source: { matchId, playerId, source: "balldontlie" } },
        create: { matchId, playerId, source: "balldontlie", rating, dirty: true },
        update: { rating, dirty: true },
      });
    },

    async upsertEvent(row: EventRowIn): Promise<void> {
      const matchId = await matchIdFor(row.matchBdlId);
      if (!matchId) return;
      const playerId = row.playerBdlId != null ? await playerIdFor(row.playerBdlId) : null;
      const assistPlayerId =
        row.assistPlayerBdlId != null ? await playerIdFor(row.assistPlayerBdlId) : null;
      const playerInId = row.playerInBdlId != null ? await playerIdFor(row.playerInBdlId) : null;
      const playerOutId = row.playerOutBdlId != null ? await playerIdFor(row.playerOutBdlId) : null;
      const data = {
        matchId,
        incidentType: row.incidentType,
        incidentClass: row.incidentClass,
        timeMinute: row.timeMinute,
        addedTime: row.addedTime,
        period: row.period,
        playerId,
        assistPlayerId,
        playerInId,
        playerOutId,
        rescinded: row.rescinded,
      };
      await prisma.eventMatch.upsert({
        where: { balldontlieId: row.bdlId },
        create: { balldontlieId: row.bdlId, ...data },
        update: data,
      });
    },

    async upsertShot(row: ShotRowIn): Promise<void> {
      const matchId = await matchIdFor(row.matchBdlId);
      if (!matchId) return;
      const playerId = row.playerBdlId != null ? await playerIdFor(row.playerBdlId) : null;
      const data = {
        matchId,
        playerId,
        shotType: row.shotType,
        situation: row.situation,
        isPenalty: row.isPenalty,
        minute: row.minute,
      };
      await prisma.shotMatch.upsert({
        where: { balldontlieId: row.bdlId },
        create: { balldontlieId: row.bdlId, ...data },
        update: data,
      });
    },

    async upsertTeamStat(row: TeamStatRowIn): Promise<void> {
      const matchId = await matchIdFor(row.matchBdlId);
      const teamId =
        (
          await prisma.fifaTeam.findUnique({
            where: { balldontlieId: row.teamBdlId },
            select: { id: true },
          })
        )?.id ?? null;
      if (!matchId || !teamId) return;
      const data = {
        offsides: row.offsides,
        shotsBlocked: row.shotsBlocked,
        possession: row.possession,
      };
      await prisma.statTeamMatch.upsert({
        where: { matchId_teamId: { matchId, teamId } },
        create: { matchId, teamId, ...data },
        update: data,
      });
    },

    async markPlayersDirty(matchBdlId, playerBdlIds): Promise<void> {
      const matchId = await matchIdFor(matchBdlId);
      if (!matchId) return;
      for (const bdl of playerBdlIds) {
        const playerId = await playerIdFor(bdl);
        if (playerId) await enqueuePlayerMatchDirty(matchId, playerId);
      }
    },

    async setLockedAt(matchBdlId, playerBdlId, lockedAt): Promise<void> {
      const match = await prisma.fifaMatch.findUnique({
        where: { balldontlieId: matchBdlId },
        select: { periodId: true },
      });
      const playerId = await playerIdFor(playerBdlId);
      if (!match?.periodId || !playerId) return; // no period seeded → leave unlocked (TODO(confirm))
      // Monotonic latch: only set when currently NULL (the DB trigger also rejects re-locks).
      await prisma.lineupSlot.updateMany({
        where: { periodId: match.periodId, playerId, lockedAt: null },
        data: { lockedAt },
      });
    },

    async listSchedulableMatches(): Promise<
      Array<{
        bdlId: number;
        status: string;
        kickoffMs: number;
        hasRating: boolean;
        lineupPulled: boolean;
        kickoffLockFallback: boolean;
      }>
    > {
      const rows = await prisma.fifaMatch.findMany({
        where: { status: { in: ["scheduled", "in_progress", "completed"] } },
        select: {
          balldontlieId: true,
          status: true,
          kickoffAt: true,
          kickoffLockFallback: true,
          ratings: { where: { source: "balldontlie" }, select: { matchId: true }, take: 1 },
          _count: { select: { events: true } },
        },
      });
      return rows.map((r) => ({
        bdlId: r.balldontlieId,
        status: r.status,
        kickoffMs: r.kickoffAt.getTime(),
        hasRating: r.ratings.length > 0,
        lineupPulled: r._count.events > 0 || r.status !== "scheduled", // proxy: any event/lock means we pulled
        kickoffLockFallback: r.kickoffLockFallback,
      }));
    },
  };
}
```

> NOTE: `lineupPulled` is a pragmatic proxy (we don't persist a "lineup pulled" flag). It only gates the once-per-match pre-match pull; pre-match is idempotent anyway, so a re-pull is harmless. Refine if a dedicated flag is added later — leave `// TODO(confirm):`.

- [ ] **Step 2: Typecheck** the package and run all ingest tests.

Run: `pnpm db:generate && pnpm --filter @app/ingest typecheck && pnpm vitest run packages/ingest`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ingest/src/prismaStore.ts
git commit -m "feat(ingest): Prisma-backed IngestStore (idempotent upserts, dirty markers, locked_at via period_id)"
```

---

## Task 9: Worker — async mode-dispatch tick + sweep + poller-silent alert + fallback

**Files:**

- Modify: `apps/worker/src/config.ts`, `apps/worker/src/wiring.ts`, `apps/worker/src/scheduler.ts`, `.env.example`

- [ ] **Step 1: `config.ts`** — add fields:

```ts
  /** BALLDONTLIE rate cap (req/min). Default 5 = the 48h dev trial; set 600 for a GOAT key. */
  balldontlieRpm: intEnv("BALLDONTLIE_RPM", 5),
  /** A live match with no successful live poll within this many ms raises the poller-silent alert. */
  pollerSilentGraceMs: intEnv("POLLER_SILENT_GRACE_MS", 5 * 60_000),
```

- [ ] **Step 2: `.env.example`** — add under the BALLDONTLIE block:

```
# Rate cap (req/min). 5 = the 48h dev trial (default); set 600 for a paid GOAT key.
BALLDONTLIE_RPM="5"
```

- [ ] **Step 3: `wiring.ts`** — assemble feed (with rate cap) + the ingest store:

```ts
import { prisma } from "@app/db";
import { createBalldontlieClient, type FeedClient } from "@app/feed";
import { createPrismaIngestStore } from "@app/ingest/prisma";
import type { IngestStore } from "@app/ingest";
import { config } from "./config";

export const feed: FeedClient = createBalldontlieClient({
  apiKey: config.balldontlieApiKey,
  baseUrl: config.balldontlieBaseUrl,
  requestsPerMinute: config.balldontlieRpm,
});

export const ingestStore: IngestStore = createPrismaIngestStore(prisma);
export { prisma };
```

- [ ] **Step 4: `scheduler.ts`** — async, re-entrancy-guarded tick that decides modes (pure), dispatches ingestion, sweeps, and alerts. Add `@app/ingest` dep to `apps/worker/package.json`. Implementation:

```ts
import { config } from "./config";
import { log } from "./logger";
import { feed, ingestStore } from "./wiring";
import { runRecomputeSweep } from "./recompute";
import {
  decideMatchModes,
  pollerSilentMatches,
  ingestLineups,
  ingestLive,
  ingestSettle,
  type ModeMatch,
} from "@app/ingest";

export interface SchedulerHandle {
  stop: () => void;
}

export function startScheduler(onDrained?: () => void): SchedulerHandle {
  log.info("scheduler.start", {
    tickMs: config.tickMs,
    maxTicks: config.maxTicks,
    rpm: config.balldontlieRpm,
  });
  const lastLivePoll = new Map<number, number>();
  let ticks = 0;
  let running = false;
  let stopped = false;

  async function tick(): Promise<void> {
    if (running) {
      log.debug("scheduler.skip", { reason: "overlap" });
      return;
    }
    running = true;
    try {
      const rows = await ingestStore.listSchedulableMatches();
      const matches: ModeMatch[] = rows.map((r) => ({
        bdlId: r.bdlId,
        status: r.status as ModeMatch["status"],
        kickoffMs: r.kickoffMs,
        hasRating: r.hasRating,
        lineupPulled: r.lineupPulled,
      }));
      const now = new Date();

      // Poller-silent alert (§8): a live match with no recent successful live poll.
      for (const a of pollerSilentMatches(matches, lastLivePoll, now, config.pollerSilentGraceMs)) {
        log.warn("poller.silent", { matchBdlId: a.bdlId }); // operator flips kickoff_lock_fallback
      }

      const ctxByBdl = new Map(
        rows.map((r) => [
          r.bdlId,
          {
            bdlId: r.bdlId,
            kickoffAt: new Date(r.kickoffMs),
            kickoffLockFallback: r.kickoffLockFallback,
          },
        ]),
      );
      for (const action of decideMatchModes(matches, now)) {
        const ctx = ctxByBdl.get(action.bdlId)!;
        try {
          if (action.mode === "pre_match") await ingestLineups(feed, ingestStore, ctx);
          else if (action.mode === "live") {
            await ingestLive(feed, ingestStore, ctx);
            lastLivePoll.set(action.bdlId, now.getTime());
          } else if (action.mode === "settle") await ingestSettle(feed, ingestStore, ctx);
        } catch (err) {
          log.error("ingest.error", {
            matchBdlId: action.bdlId,
            mode: action.mode,
            message: (err as Error).message,
          });
        }
      }

      const result = await runRecomputeSweep();
      log.debug("scheduler.swept", result as unknown as Record<string, unknown>);
    } catch (err) {
      log.error("scheduler.tick.error", { message: (err as Error).message });
    } finally {
      running = false;
      ticks += 1;
      if (config.maxTicks !== null && ticks >= config.maxTicks) {
        stopped = true;
        clearInterval(timer);
        log.info("scheduler.drained", { ticks });
        onDrained?.();
      }
    }
  }

  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    void tick();
  }, config.tickMs);

  return {
    stop: () => {
      if (!stopped) clearInterval(timer);
      log.info("scheduler.stop", { ticks });
    },
  };
}
```

> NOTE: schedule-sync (the global `feed.matches()` → upsert + set `period_id`) can run inside the same tick on a slower cadence. For the first cut, fold it into the tick guarded by a counter (every Nth tick) OR document it as the next refinement; the per-match modes above are the load-bearing path. Add a `// TODO(prompt-NN):` if deferring schedule-sync cadence.

- [ ] **Step 5: `apps/worker/package.json`** — add `"@app/ingest": "workspace:*"` to dependencies; run `pnpm install`.

- [ ] **Step 6: Typecheck + full test.**

Run: `pnpm install && pnpm db:generate && pnpm -w typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src apps/worker/package.json .env.example pnpm-lock.yaml
git commit -m "feat(worker): mode-dispatch tick — ingest per mode, drive sweep, poller-silent alert"
```

---

## Task 10: Sweep-wiring + frozen-gate integration test (ingest → standing)

**Files:** Create `packages/ingest/src/sweep.integration.test.ts` (uses `@app/recompute` `MemoryStore` + the sweep, NOT the ingest store — proves an ingest-style dirty write flows through to a standing and a frozen period is not restated).

> Rationale: the real ingest store needs a DB; this test proves the CONTRACT — a dirtied `(match,player)` recomputes through `standing`, and a write into a frozen period does not restate it — using the recompute `MemoryStore` exactly as Prompt 03/04 tests do, seeded to mirror an ingest write.

- [ ] **Step 1: Write the test** mirroring the recompute test style (seed a player-match bundle dirty → `sweep` → assert a `score_player_match`, a `score_manager_period`, and a `standing`; then freeze the period, re-dirty, sweep, assert `skippedFrozen` and unchanged standing). Reuse `MemoryStore` seeding helpers (`seedPlayerMatch`, `seedSlot`, `seedPlaysIn`, `seedManagerLeague`, `seedPeriod`, `freezePeriod`).

```ts
import { describe, it, expect } from "vitest";
import { MemoryStore, sweep } from "@app/recompute";
// build a minimal ScoreInputBundle inline (see recompute.test.ts for the shape) ...
```

(Full bundle construction copied from the existing `recompute.test.ts` patterns; assert `SweepResult.standings >= 1` on the first sweep and `skippedFrozen >= 1` with an unchanged `writtenStanding` after freezing.)

- [ ] **Step 2: Run → (write impl already exists — this is a contract test) → pass.**

Run: `pnpm vitest run packages/ingest/src/sweep.integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ingest/src/sweep.integration.test.ts
git commit -m "test(ingest): contract — dirty write sweeps to standing; frozen period not restated"
```

---

## Task 11: Purity proof + final gates + docs/handoff

- [ ] **Step 1: Purity grep** — assert the pure modules are clock/network/env-free:

Run:

```bash
cd "/Users/sergiorios/Documents/World Cup Fantasy"
grep -nE "Date\\.now|new Date\\(|fetch\\(|process\\.env" packages/ingest/src/map.ts packages/ingest/src/lock.ts packages/ingest/src/mode.ts && echo "IMPURE — FIX" || echo "PURE ✓"
```

Expected: `PURE ✓` (no matches). (`new Date(iso)` is allowed ONLY where a kickoff/ISO is parsed — it must NOT appear in map/lock/mode; lock/mode receive `Date`/number, never construct `now`.)

- [ ] **Step 2: Full gate suite.**

Run: `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test`
Expected: all exit 0; test count = prior 210 + new feed/ingest suites.

- [ ] **Step 3: Update the resolved TODO comment** in `packages/feed/src/types.ts:5` (still a valid confirm) — leave it; and confirm `recompute/src/prismaStore.ts` TODO is updated (Task 0). No brain-file edits (brain files win; the prompt only asks for a summary).

- [ ] **Step 4: Write the handoff** to `.remember/remember.md` (summarize signatures, mapping, locking, match→period resolution, modes, fallback+alert, test counts, purity proof, `// TODO(confirm):` items, exact verify commands).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs(prompt-05a): handoff — ingestion + locking + scheduler; TODO(confirm) enum items for first live data"
```

---

## Self-Review (spec coverage)

- **Feed client (6 endpoints, cursor pagination, rate limit, injected transport):** Tasks 1–2. ✓
- **Raw-layer idempotent upserts (all tables + dirty + incident_class verbatim + is_penalty derive + balldontlie-only rating):** Tasks 3, 6, 8. ✓
- **locked_at lock-on-play (starters@kickoff, subs@entry incl added_time, never-appear→null, decoupled from scoring):** Tasks 4, 7; not entangled with scoring (scoring path untouched). ✓
- **Match→period (period_id, structural, retire window inference, backfill via schedule-sync):** Task 0 + `resolvePeriodId`/`upsertMatch` in Task 8. ✓
- **Scheduler 4 modes, pure (matches, now):** Task 5 (`decideMatchModes`) + Task 9 (dispatch + schedule-sync note). ✓
- **Call existing sweep, respect frozen gate:** Task 9 (`runRecomputeSweep`) + Task 10 (contract test). ✓
- **Fallback flag + poller-silent alert:** Task 0 (column), 5 (`pollerSilentMatches`), 7 (fallback branch), 9 (alert log). ✓
- **Tests (parse, pagination, rate-limit fake-timer, idempotency, locking, mode decision, fallback, sweep+frozen, purity):** Tasks 1,2,3,4,5,6,7,10,11. ✓
- **Out-of-scope untouched (no scraper, no scrape rating, no rating comparison, engine/adapter/resolver/standings signatures untouched):** enforced; only the two recompute prismaStore query bodies change (Task 0, sanctioned). ✓
- **TODO(confirm) enum items (incident_class, situation=penalty, duels aerials, blocked_shots defensive, feed status/position vocab, API path/auth, group matchday):** encoded as constants/comments across Tasks 2,3,8. ✓

## Open `// TODO(confirm):` carried for first live data

1. `match_events.incident_class` own-goal / second-yellow-vs-red strings.
2. `match_shots.situation` penalty token (`mapShot` `PENALTY` const).
3. `duels_won` aerial inclusion; `blocked_shots` defensive (30s sanity check).
4. Feed `status` + `position` vocab (`normalizeStatus` / player position default).
5. API base path (`/fifa/v1`) + auth header form (`Authorization`).
6. Group-stage matchday field for `derivePeriodLabel` (MD1/2/3) — structural, never temporal.
7. Single-league assumption for `fifa_match.period_id` (multi-league would need a per-league link).
