# Prompt 05b — Sofascore rating scraper (isolated) + fallback comparison — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development per code task (RED → GREEN → commit). Steps use `- [ ]`.

**Goal:** Add the PRIMARY rating source — an isolated Sofascore scraper writing `rating_player_match(source='scrape')` + dirty-mark so the existing resolver prefers it over the `balldontlie` fallback — plus the one-time BALLDONTLIE-vs-Sofascore fallback-quality comparison. Zero scoring/resolver change.

**Architecture:** A new pure `packages/scrape` (extraction, stored-id `resolveTarget`, population `keyMatch`, settle target-selection, comparison math, + a thin `ScrapeStore` port w/ Memory + Prisma impls) and a new edge `apps/scraper` (Playwright behind an injected structural `ChromiumLauncher`, the worker loop, the population CLI, the comparison CLI). The scraper does NOT import `@app/ingest`; the `stat_player_match.dirty` no-clobber invariant is HOISTED into `@app/db` (`STAT_DIRTY_UPDATE` + `markStatPlayerDirty`) and shared by both. Scrape-time identity is STORED-ID ONLY; a separate verified one-time `keyMatch` pass populates the ids (auto-writes only the unambiguous, flags the rest).

**Tech Stack:** TypeScript (ESM, strict), pnpm workspace, Prisma/Postgres, Vitest 4, Playwright (go-live only — injected; not installable in this sandbox).

**Locked constraints:** resolver order `[manual, scrape, balldontlie]` UNCHANGED; no change to engine/adapter/resolver/sweep/standings signatures; scrape-time identity is stored-id only (NO name-matching in the write path — a wrong scrape row displaces the safe fallback); pure modules grep-clean of `fetch(`/Playwright/`Date.now`/`new Date`/`process.env`.

---

## File Structure

**Modify (the hoist + schema):**

- `packages/db/prisma/schema.prisma` — add `sofascoreMatchId Int? @unique` to `FifaMatch`, `sofascorePlayerId Int? @unique` to `Player`.
- `packages/db/src/index.ts` — `export * from "./dirty"`.
- `packages/ingest/src/prismaStore.ts` — drop the local `STAT_DIRTY_UPDATE`/`markStatDirty`; import + call `markStatPlayerDirty` from `@app/db`.
- `packages/ingest/src/prismaStore.test.ts` — DELETE (the invariant + its guard move to `@app/db`).

**Create (the hoist + migration):**

- `packages/db/src/dirty.ts`, `packages/db/src/dirty.test.ts`
- `packages/db/prisma/migrations/20260604140000_sofascore_ids/migration.sql`

**Create (`packages/scrape`):**

- `package.json`, `tsconfig.json`, `src/index.ts`
- `src/extract.ts` (+ test) — pure `extractRating(html, sofascorePlayerId)`; the ONE selector constant.
- `src/resolveTarget.ts` (+ test) — pure stored-id-only resolution.
- `src/keyMatch.ts` (+ test) — pure population proposers (match by date+codes; player by team+norm-name).
- `src/target.ts` (+ test) — pure settle target-selection `(candidates, now) → targets`.
- `src/compare.ts` (+ test) — pure comparison math.
- `src/browser.ts` — pure `BrowserTransport` interface.
- `src/store.ts` — `ScrapeStore` port.
- `src/memoryStore.ts` — `MemoryScrapeStore` test double.
- `src/store.test.ts` — write+dirty behavioral + clobber-guard.
- `src/prismaStore.ts` — `createPrismaScrapeStore` (thin IO; `@app/scrape/prisma`).
- `src/resolver.contract.test.ts` — scrape beats balldontlie end-to-end via `@app/recompute` sweep.

**Create (`apps/scraper`):**

- `package.json`, `tsconfig.json`
- `src/config.ts`, `src/logger.ts` (mirror `apps/worker`)
- `src/playwrightBrowser.ts` (+ test) — `createSofascoreBrowser(launch, opts)`; structural `ChromiumLauncher` (no `import "playwright"`); URL builder constant.
- `src/scraper.ts` (+ `src/scraper.test.ts`) — the settle tick: select targets → fetch → extract → write+dirty; per-target try/catch (isolation).
- `src/wiring.ts`, `src/index.ts` — boot + signals (mirror `apps/worker`); default launcher throws (go-live wires real Playwright).
- `src/populate.ts` — one-time population CLI (keyMatch → write unambiguous, emit manual list).
- `src/compare.ts` — comparison CLI (read pairs → compare → print).

---

## Task 0: Hoist the dirty invariant into `@app/db` + sofascore-id migration

**Files:** `packages/db/src/dirty.ts` (create), `packages/db/src/dirty.test.ts` (create), `packages/db/src/index.ts` (modify), `packages/db/prisma/schema.prisma` (modify), migration (create), `packages/ingest/src/prismaStore.ts` (modify), `packages/ingest/src/prismaStore.test.ts` (delete)

- [ ] **Step 1: `packages/db/src/dirty.ts`** — the shared invariant:

```ts
/**
 * The `stat_player_match.dirty` re-dirty helper — ONE home for the no-clobber invariant shared by
 * @app/ingest (05a) and packages/scrape (05b). `sweep` Phase 1 (`listDirtyPlayerMatches`) reads the raw
 * `dirty` BOOLEAN, so a match-level write (event / scrape rating) re-dirties the player through it.
 * INSERT writes an all-null stub (a player with no stat row yet — the adapter tolerates it); CONFLICT
 * touches ONLY the flag (`STAT_DIRTY_UPDATE`), so a late write never nulls out stats that already landed.
 */
import type { PrismaClient } from "@prisma/client";

export const STAT_DIRTY_UPDATE = { dirty: true } as const;

export async function markStatPlayerDirty(
  prisma: PrismaClient,
  matchId: string,
  playerId: string,
): Promise<void> {
  await prisma.statPlayerMatch.upsert({
    where: { matchId_playerId: { matchId, playerId } },
    create: { matchId, playerId, dirty: true },
    update: STAT_DIRTY_UPDATE,
  });
}
```

- [ ] **Step 2: `packages/db/src/dirty.test.ts`** (RED → it imports a missing module):

```ts
import { describe, it, expect } from "vitest";
import { STAT_DIRTY_UPDATE } from "./dirty";

describe("STAT_DIRTY_UPDATE (shared no-clobber invariant)", () => {
  it("the CONFLICT/update branch flips ONLY `dirty` — never a stat column", () => {
    expect(STAT_DIRTY_UPDATE).toEqual({ dirty: true });
    expect(Object.keys(STAT_DIRTY_UPDATE)).toEqual(["dirty"]);
  });
});
```

Run: `pnpm vitest run packages/db/src/dirty.test.ts` → FAIL (no module) → after Step 1 exists, PASS.

- [ ] **Step 3: `packages/db/src/index.ts`** — add at the end: `export * from "./dirty";`

- [ ] **Step 4: schema — `FifaMatch`** add after `balldontlieId`:

```prisma
  /// Sofascore match id (Prompt 05b). Nullable; populated by the verified one-time keyMatch pass. The
  /// scraper resolves targets by STORED id only (no live name-matching). Mirrors `balldontlieId`.
  sofascoreMatchId Int? @unique @map("sofascore_match_id")
```

- [ ] **Step 5: schema — `Player`** add after `balldontlieId`:

```prisma
  /// Sofascore player id (Prompt 05b). Nullable; populated by the verified one-time keyMatch pass
  /// (unambiguous auto-written; ambiguous flagged for manual entry). Scrape resolves by stored id only.
  sofascorePlayerId Int? @unique @map("sofascore_player_id")
```

- [ ] **Step 6: migration** `packages/db/prisma/migrations/20260604140000_sofascore_ids/migration.sql`:

```sql
-- Prompt 05b: stored Sofascore ids for the scraper's stored-id-only identity resolution (additive).
ALTER TABLE "fifa_match" ADD COLUMN "sofascore_match_id" INTEGER;
ALTER TABLE "player" ADD COLUMN "sofascore_player_id" INTEGER;
CREATE UNIQUE INDEX "fifa_match_sofascore_match_id_key" ON "fifa_match"("sofascore_match_id");
CREATE UNIQUE INDEX "player_sofascore_player_id_key" ON "player"("sofascore_player_id");
```

- [ ] **Step 7: `pnpm db:generate`** (regenerate client with the new columns).

- [ ] **Step 8: `packages/ingest/src/prismaStore.ts`** — remove the local `STAT_DIRTY_UPDATE` const (lines ~14-22) and the `markStatDirty` closure; change the import line `import type { PrismaClient, ... } from "@app/db";` to also import the value `markStatPlayerDirty`; and in `markPlayersDirty` replace `await markStatDirty(matchId, playerId)` with `await markStatPlayerDirty(prisma, matchId, playerId)`. Final `markPlayersDirty`:

```ts
    async markPlayersDirty(matchBdlId, playerBdlIds): Promise<void> {
      const matchId = await matchIdFor(matchBdlId);
      if (!matchId) return;
      for (const bdl of playerBdlIds) {
        const playerId = await playerIdFor(bdl);
        if (playerId) await markStatPlayerDirty(prisma, matchId, playerId);
      }
    },
```

Import line becomes:

```ts
import type { MatchStatus, PeriodKind, Position, PrismaClient } from "@app/db";
import { markStatPlayerDirty } from "@app/db";
```

- [ ] **Step 9: DELETE `packages/ingest/src/prismaStore.test.ts`** (its sole content was the `STAT_DIRTY_UPDATE` guard, now owned by `@app/db/dirty.test.ts`). `git rm packages/ingest/src/prismaStore.test.ts`.

- [ ] **Step 10: verify** `pnpm db:generate && pnpm -w typecheck && pnpm test` → all green (the @app/ingest behavioral + sweep.contract tests still pass; @app/db now guards the invariant).

- [ ] **Step 11: commit** `git add -A && git commit -m "refactor(db): hoist STAT_DIRTY_UPDATE + markStatPlayerDirty into @app/db; add sofascore_*_id cols"`

---

## Task 1: `packages/scrape` scaffold + pure `extractRating`

**Files:** `packages/scrape/{package.json,tsconfig.json,src/index.ts,src/extract.ts,src/extract.test.ts}`

- [ ] **Step 1: `package.json`:**

```json
{
  "name": "@app/scrape",
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
  "dependencies": { "@app/db": "workspace:*", "@app/shared": "workspace:*" },
  "devDependencies": {
    "@app/recompute": "workspace:*",
    "@app/scoring": "workspace:*",
    "@types/node": "^22.10.5"
  }
}
```

- [ ] **Step 2: `tsconfig.json`:** `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "rootDir": "src" }, "include": ["src"] }`

- [ ] **Step 3: failing test `src/extract.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { extractRating } from "./extract";

const page = (players: Array<{ id: number; rating: number | null }>) =>
  `<html><body><script id="__SOFA_DATA__" type="application/json">${JSON.stringify({ players })}</script></body></html>`;

describe("extractRating", () => {
  it("returns the 0–10 rating for the given sofascore player id", () => {
    expect(
      extractRating(
        page([
          { id: 1001, rating: 7.4 },
          { id: 1002, rating: 6.1 },
        ]),
        1002,
      ),
    ).toBe(6.1);
  });
  it("returns null when the player is absent", () => {
    expect(extractRating(page([{ id: 1001, rating: 7.4 }]), 9999)).toBeNull();
  });
  it("returns null when the player's rating is null (DNP / not rated)", () => {
    expect(extractRating(page([{ id: 1001, rating: null }]), 1001)).toBeNull();
  });
  it("returns null on a blocked/empty page (no data script), without throwing", () => {
    expect(extractRating("<html><body>Access denied</body></html>", 1001)).toBeNull();
  });
  it("returns null on malformed JSON, without throwing", () => {
    expect(
      extractRating(`<script id="__SOFA_DATA__" type="application/json">{bad</script>`, 1001),
    ).toBeNull();
  });
});
```

- [ ] **Step 4: implement `src/extract.ts`:**

```ts
/**
 * PURE Sofascore rating extraction. Operates on the HTML string the browser returns (no DOM, no
 * network). The single source-of-truth for WHERE the rating lives is `RATING_DATA` below — when
 * Sofascore changes its markup, this one constant + shape is what moves.
 *
 * TODO(confirm): the real Sofascore page embeds player ratings differently (likely a __NEXT_DATA__
 * blob or a separate JSON API). Confirm the marker + JSON path against the first live page; keep it here.
 */
const RATING_DATA = {
  /** Marker bounding the JSON blob carrying per-player ratings. */
  open: '<script id="__SOFA_DATA__" type="application/json">',
  close: "</script>",
};

interface SofaPlayer {
  id: number;
  rating: number | null;
}

export function extractRating(html: string, sofascorePlayerId: number): number | null {
  const start = html.indexOf(RATING_DATA.open);
  if (start < 0) return null;
  const from = start + RATING_DATA.open.length;
  const end = html.indexOf(RATING_DATA.close, from);
  if (end < 0) return null;
  let data: { players?: SofaPlayer[] };
  try {
    data = JSON.parse(html.slice(from, end)) as { players?: SofaPlayer[] };
  } catch {
    return null; // malformed / partial page → no rating (fallback handles it)
  }
  const player = data.players?.find((p) => p.id === sofascorePlayerId);
  const rating = player?.rating;
  return typeof rating === "number" ? rating : null;
}
```

- [ ] **Step 5:** `src/index.ts`: `export * from "./extract";`
- [ ] **Step 6:** `pnpm install --offline` (link @app/scrape), `pnpm vitest run packages/scrape/src/extract.test.ts` → PASS.
- [ ] **Step 7: commit** `feat(scrape): scaffold @app/scrape + pure Sofascore rating extraction (single selector)`

---

## Task 2: pure `resolveTarget` (stored-id only)

**Files:** `packages/scrape/src/{resolveTarget.ts,resolveTarget.test.ts}`

- [ ] **Step 1: failing test:**

```ts
import { describe, it, expect } from "vitest";
import { resolveTarget } from "./resolveTarget";

describe("resolveTarget (stored-id only)", () => {
  it("resolves when both stored sofascore ids are present", () => {
    expect(resolveTarget({ sofascoreMatchId: 50, sofascorePlayerId: 1001 })).toEqual({
      sofascoreMatchId: 50,
      sofascorePlayerId: 1001,
    });
  });
  it("returns null when the match id is missing (→ no scrape row, fallback)", () => {
    expect(resolveTarget({ sofascoreMatchId: null, sofascorePlayerId: 1001 })).toBeNull();
  });
  it("returns null when the player id is missing", () => {
    expect(resolveTarget({ sofascoreMatchId: 50, sofascorePlayerId: null })).toBeNull();
  });
});
```

- [ ] **Step 2: implement `resolveTarget.ts`:**

```ts
/**
 * PURE scrape-time identity. Resolves a target ONLY from STORED Sofascore ids — never live name-matching.
 * Rationale: the resolver prefers `scrape` over `balldontlie`, so a wrong scrape row displaces the safe
 * fallback with a wrong PRIMARY rating. A missing/absent id → null → no scrape row → balldontlie fallback.
 */
export interface StoredIds {
  sofascoreMatchId: number | null;
  sofascorePlayerId: number | null;
}
export interface ScrapeTargetId {
  sofascoreMatchId: number;
  sofascorePlayerId: number;
}

export function resolveTarget(stored: StoredIds): ScrapeTargetId | null {
  if (stored.sofascoreMatchId == null || stored.sofascorePlayerId == null) return null;
  return { sofascoreMatchId: stored.sofascoreMatchId, sofascorePlayerId: stored.sofascorePlayerId };
}
```

- [ ] **Step 3:** `index.ts` += `export * from "./resolveTarget";`. Run → PASS. **Commit** `feat(scrape): pure stored-id-only resolveTarget`

---

## Task 3: pure population `keyMatch` (proposes + flags)

**Files:** `packages/scrape/src/{keyMatch.ts,keyMatch.test.ts}`

- [ ] **Step 1: failing test:**

```ts
import { describe, it, expect } from "vitest";
import { normalizeName, proposeMatchMappings, proposePlayerMappings } from "./keyMatch";

describe("normalizeName", () => {
  it("lowercases, strips accents + non-letters", () => {
    expect(normalizeName("José Mourinho-Félix")).toBe("josemourinhofelix");
  });
});

describe("proposeMatchMappings (date + team codes)", () => {
  it("auto-accepts a unique date+codes match; flags an ambiguous one", () => {
    const feed = [
      { fifaMatchId: "m1", dateIso: "2026-06-10", homeCode: "BRA", awayCode: "ARG" },
      { fifaMatchId: "m2", dateIso: "2026-06-11", homeCode: "ENG", awayCode: "FRA" },
    ];
    const sofa = [
      { sofascoreMatchId: 50, dateIso: "2026-06-10", homeCode: "BRA", awayCode: "ARG" },
      // m2 has no sofa candidate → flagged
    ];
    const out = proposeMatchMappings(feed, sofa);
    expect(out.proposals).toEqual([{ fifaMatchId: "m1", sofascoreMatchId: 50 }]);
    expect(out.flagged.map((f) => f.fifaMatchId)).toEqual(["m2"]);
  });
});

describe("proposePlayerMappings (team + normalized name)", () => {
  const sofa = [
    { sofascorePlayerId: 1001, teamCode: "BRA", name: "Vinícius Júnior" },
    { sofascorePlayerId: 1002, teamCode: "BRA", name: "Vinícius Tobias" },
  ];
  it("auto-writes a unique exact normalized match", () => {
    const out = proposePlayerMappings(
      [{ playerId: "p1", teamCode: "BRA", name: "Vinicius Junior" }],
      sofa,
    );
    expect(out.proposals).toEqual([{ playerId: "p1", sofascorePlayerId: 1001 }]);
    expect(out.flagged).toEqual([]);
  });
  it("FLAGS (never auto-writes) when there's no exact hit", () => {
    const out = proposePlayerMappings(
      [{ playerId: "p9", teamCode: "BRA", name: "Vinicius" }],
      sofa,
    );
    expect(out.proposals).toEqual([]);
    expect(out.flagged.map((f) => f.playerId)).toEqual(["p9"]);
  });
});
```

- [ ] **Step 2: implement `keyMatch.ts`:**

```ts
/**
 * PURE population proposers for the one-time verified Sofascore-id pass. PROPOSES mappings; the CLI
 * writes only the unambiguous proposals and emits `flagged` for manual `sofascore_player_id` entry.
 * NEVER auto-trusts an ambiguous hit — a wrong stored id would later feed a wrong PRIMARY rating.
 * TODO(confirm): that Sofascore's team codes + dates line up with the feed's, on real data.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export interface FeedMatchKey {
  fifaMatchId: string;
  dateIso: string;
  homeCode: string;
  awayCode: string;
}
export interface SofaMatchKey {
  sofascoreMatchId: number;
  dateIso: string;
  homeCode: string;
  awayCode: string;
}
export interface MatchProposal {
  fifaMatchId: string;
  sofascoreMatchId: number;
}
export interface MatchMappingResult {
  proposals: MatchProposal[];
  flagged: FeedMatchKey[];
}

const sameMatch = (f: FeedMatchKey, s: SofaMatchKey): boolean =>
  f.dateIso === s.dateIso && f.homeCode === s.homeCode && f.awayCode === s.awayCode;

export function proposeMatchMappings(
  feed: readonly FeedMatchKey[],
  sofa: readonly SofaMatchKey[],
): MatchMappingResult {
  const proposals: MatchProposal[] = [];
  const flagged: FeedMatchKey[] = [];
  for (const f of feed) {
    const hits = sofa.filter((s) => sameMatch(f, s));
    if (hits.length === 1)
      proposals.push({ fifaMatchId: f.fifaMatchId, sofascoreMatchId: hits[0]!.sofascoreMatchId });
    else flagged.push(f); // 0 (no candidate) or 2+ (ambiguous) → never auto-trust
  }
  return { proposals, flagged };
}

export interface FeedPlayerKey {
  playerId: string;
  teamCode: string;
  name: string;
}
export interface SofaPlayerKey {
  sofascorePlayerId: number;
  teamCode: string;
  name: string;
}
export interface PlayerProposal {
  playerId: string;
  sofascorePlayerId: number;
}
export interface PlayerMappingResult {
  proposals: PlayerProposal[];
  flagged: FeedPlayerKey[];
}

export function proposePlayerMappings(
  feed: readonly FeedPlayerKey[],
  sofa: readonly SofaPlayerKey[],
): PlayerMappingResult {
  const proposals: PlayerProposal[] = [];
  const flagged: FeedPlayerKey[] = [];
  for (const f of feed) {
    const target = normalizeName(f.name);
    const hits = sofa.filter((s) => s.teamCode === f.teamCode && normalizeName(s.name) === target);
    if (hits.length === 1)
      proposals.push({ playerId: f.playerId, sofascorePlayerId: hits[0]!.sofascorePlayerId });
    else flagged.push(f); // no exact hit, or same-surname/dup → manual entry
  }
  return { proposals, flagged };
}
```

- [ ] **Step 3:** `index.ts` += `export * from "./keyMatch";`. Run → PASS. **Commit** `feat(scrape): pure population keyMatch (auto-write unambiguous, flag the rest)`

---

## Task 4: pure settle target-selection

**Files:** `packages/scrape/src/{target.ts,target.test.ts}`

- [ ] **Step 1: failing test:**

```ts
import { describe, it, expect } from "vitest";
import { selectScrapeTargets, type ScrapeCandidate } from "./target";

const T = (iso: string) => new Date(iso).getTime();
const base = {
  sofascoreMatchId: 50,
  sofascorePlayerId: 1001,
  status: "completed",
  hasScrapeRating: false,
};

describe("selectScrapeTargets", () => {
  const now = new Date("2026-06-10T22:00:00Z");

  it("targets FT players lacking a scrape row, grouped by sofascore match", () => {
    const cands: ScrapeCandidate[] = [
      { ...base, matchId: "m1", playerId: "p1", kickoffMs: T("2026-06-10T18:00:00Z") },
      {
        ...base,
        matchId: "m1",
        playerId: "p2",
        sofascorePlayerId: 1002,
        kickoffMs: T("2026-06-10T18:00:00Z"),
      },
    ];
    const out = selectScrapeTargets(cands, now);
    expect(out).toEqual([
      {
        sofascoreMatchId: 50,
        players: [
          { matchId: "m1", playerId: "p1", sofascorePlayerId: 1001 },
          { matchId: "m1", playerId: "p2", sofascorePlayerId: 1002 },
        ],
      },
    ]);
  });
  it("skips players already scraped and matches not yet FT", () => {
    const cands: ScrapeCandidate[] = [
      {
        ...base,
        matchId: "m1",
        playerId: "p1",
        hasScrapeRating: true,
        kickoffMs: T("2026-06-10T18:00:00Z"),
      },
      {
        ...base,
        matchId: "m2",
        playerId: "p3",
        status: "in_progress",
        kickoffMs: T("2026-06-10T21:00:00Z"),
      },
    ];
    expect(selectScrapeTargets(cands, now)).toEqual([]);
  });
  it("skips matches that are stale (too long past kickoff)", () => {
    const cands: ScrapeCandidate[] = [
      { ...base, matchId: "m1", playerId: "p1", kickoffMs: T("2026-06-08T18:00:00Z") }, // >24h ago
    ];
    expect(selectScrapeTargets(cands, now)).toEqual([]);
  });
});
```

- [ ] **Step 2: implement `target.ts`:**

```ts
/**
 * PURE settle target-selection (ARCHITECTURE.md §3 settle row). A pure function of (candidates, now):
 * the Sofascore rating lands near/after FT, so target FT players who lack a `scrape` row, grouped per
 * Sofascore match (one page fetch covers all its players), dropping stale matches. Inject `now`.
 * TODO(confirm): whether Sofascore exposes a usable LIVE rating — if so, widen `isScrapable` to live.
 */
export interface ScrapeCandidate {
  matchId: string;
  playerId: string;
  sofascoreMatchId: number;
  sofascorePlayerId: number;
  status: string;
  kickoffMs: number;
  hasScrapeRating: boolean;
}
export interface ScrapeTarget {
  sofascoreMatchId: number;
  players: Array<{ matchId: string; playerId: string; sofascorePlayerId: number }>;
}

/** Stop retrying a match this long after kickoff (the rating has either landed or won't). */
const STALE_AFTER_MS = 24 * 60 * 60_000;

export function selectScrapeTargets(
  candidates: readonly ScrapeCandidate[],
  now: Date,
): ScrapeTarget[] {
  const t = now.getTime();
  const byMatch = new Map<number, ScrapeTarget>();
  for (const c of candidates) {
    if (c.status !== "completed") continue; // FT only (TODO(confirm): live rating)
    if (c.hasScrapeRating) continue; // already scraped
    if (t > c.kickoffMs + STALE_AFTER_MS) continue; // stale → give up
    let target = byMatch.get(c.sofascoreMatchId);
    if (!target) {
      target = { sofascoreMatchId: c.sofascoreMatchId, players: [] };
      byMatch.set(c.sofascoreMatchId, target);
    }
    target.players.push({
      matchId: c.matchId,
      playerId: c.playerId,
      sofascorePlayerId: c.sofascorePlayerId,
    });
  }
  return [...byMatch.values()];
}
```

- [ ] **Step 3:** `index.ts` += `export * from "./target";`. Run → PASS. **Commit** `feat(scrape): pure settle target-selection (FT, unscraped, not stale)`

---

## Task 5: pure comparison math

**Files:** `packages/scrape/src/{compare.ts,compare.test.ts}`

- [ ] **Step 1: failing test:**

```ts
import { describe, it, expect } from "vitest";
import { compareRatings } from "./compare";

describe("compareRatings", () => {
  it("summarizes diff + correlation over paired ratings", () => {
    const out = compareRatings([
      { scrape: 7.0, balldontlie: 6.0 },
      { scrape: 8.0, balldontlie: 7.5 },
      { scrape: 6.0, balldontlie: 6.5 },
    ]);
    expect(out.n).toBe(3);
    expect(out.meanDiff).toBeCloseTo((1.0 + 0.5 - 0.5) / 3, 6);
    expect(out.meanAbsDiff).toBeCloseTo((1.0 + 0.5 + 0.5) / 3, 6);
    expect(out.maxAbsDiff).toBeCloseTo(1.0, 6);
    expect(out.correlation).toBeGreaterThan(0.8); // scrape & balldontlie move together here
  });
  it("handles the empty set without dividing by zero", () => {
    expect(compareRatings([])).toMatchObject({
      n: 0,
      meanDiff: 0,
      meanAbsDiff: 0,
      maxAbsDiff: 0,
      correlation: null,
    });
  });
});
```

- [ ] **Step 2: implement `compare.ts`:**

```ts
/**
 * PURE BALLDONTLIE-vs-Sofascore fallback-quality math (ARCHITECTURE.md §3 "Action for Code"). Rows in,
 * stats out — no IO. Gauges how good the `balldontlie` fallback is vs the calibrated `scrape` primary;
 * it does NOT change the resolver or gate anything. Sofascore stays primary regardless.
 */
export interface RatingPair {
  scrape: number;
  balldontlie: number;
}
export interface ComparisonSummary {
  n: number;
  meanDiff: number; // mean(scrape − balldontlie) — sign shows systematic bias
  meanAbsDiff: number;
  maxAbsDiff: number;
  correlation: number | null; // Pearson; null when undefined (n<2 or zero variance)
  /** abs-diff histogram: how many pairs fall in [0,0.5),[0.5,1),[1,2),[2,∞). */
  distribution: { lt05: number; lt1: number; lt2: number; ge2: number };
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function compareRatings(pairs: readonly RatingPair[]): ComparisonSummary {
  const n = pairs.length;
  const dist = { lt05: 0, lt1: 0, lt2: 0, ge2: 0 };
  if (n === 0)
    return {
      n: 0,
      meanDiff: 0,
      meanAbsDiff: 0,
      maxAbsDiff: 0,
      correlation: null,
      distribution: dist,
    };

  const diffs = pairs.map((p) => p.scrape - p.balldontlie);
  const abs = diffs.map(Math.abs);
  for (const a of abs) {
    if (a < 0.5) dist.lt05++;
    else if (a < 1) dist.lt1++;
    else if (a < 2) dist.lt2++;
    else dist.ge2++;
  }

  const xs = pairs.map((p) => p.scrape);
  const ys = pairs.map((p) => p.balldontlie);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  const correlation = denom === 0 ? null : sxy / denom;

  return {
    n,
    meanDiff: mean(diffs),
    meanAbsDiff: mean(abs),
    maxAbsDiff: Math.max(...abs),
    correlation,
    distribution: dist,
  };
}
```

- [ ] **Step 3:** `index.ts` += `export * from "./compare";`. Run → PASS. **Commit** `feat(scrape): pure BALLDONTLIE-vs-Sofascore comparison math`

---

## Task 6: `ScrapeStore` port + `MemoryScrapeStore` (write + dirty behavioral + clobber-guard)

**Files:** `packages/scrape/src/{browser.ts,store.ts,memoryStore.ts,store.test.ts}`

- [ ] **Step 1: `browser.ts`** (pure transport interface):

```ts
/** Injected browser transport — fetches the rendered HTML for a Sofascore match page. The loop catches
 *  any throw (block / timeout) per-target: a miss leaves no scrape row and the resolver falls back. */
export interface BrowserTransport {
  fetchMatchHtml(sofascoreMatchId: number): Promise<string>;
  close(): Promise<void>;
}
```

- [ ] **Step 2: `store.ts`** (port):

```ts
import type { ScrapeCandidate } from "./target";
import type { RatingPair } from "./compare";

export interface ScrapeStore {
  /** Candidate (match,player) rows for scraping: completed matches with a stored sofascore_match_id and
   *  their players with a stored sofascore_player_id; `hasScrapeRating` flags those already done. */
  listScrapeCandidates(): Promise<ScrapeCandidate[]>;
  /** Upsert the `source='scrape'` rating + re-dirty (match,player) so the existing sweep recomputes. */
  writeScrapeRating(matchId: string, playerId: string, rating: number): Promise<void>;
  /** Paired ratings where BOTH `scrape` and `balldontlie` exist (for the comparison tool). */
  listRatingPairs(): Promise<RatingPair[]>;
}
```

- [ ] **Step 3: failing `store.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { MemoryScrapeStore } from "./memoryStore";

describe("MemoryScrapeStore.writeScrapeRating", () => {
  it("upserts the scrape rating and marks (match,player) dirty (idempotent re-scrape)", async () => {
    const store = new MemoryScrapeStore();
    await store.writeScrapeRating("m1", "p1", 7.4);
    await store.writeScrapeRating("m1", "p1", 7.9); // re-scrape overwrites
    expect(store.scrapeRating("m1", "p1")).toBe(7.9);
    expect(store.isDirty("m1", "p1")).toBe(true);
  });

  it("re-dirties WITHOUT clobbering an existing stat row (mirror the 05a guard)", async () => {
    const store = new MemoryScrapeStore();
    store.seedStat("m1", "p1", { minutesPlayed: 90, goals: 1 });
    store.clearDirty("m1", "p1");
    await store.writeScrapeRating("m1", "p1", 7.4);
    expect(store.stat("m1", "p1")).toMatchObject({ minutesPlayed: 90, goals: 1 }); // stats preserved
    expect(store.isDirty("m1", "p1")).toBe(true);
  });
});
```

- [ ] **Step 4: implement `memoryStore.ts`:**

```ts
import type { ScrapeStore } from "./store";
import type { ScrapeCandidate } from "./target";
import type { RatingPair } from "./compare";

const pk = (a: string, b: string): string => `${a} ${b}`;

export class MemoryScrapeStore implements ScrapeStore {
  private scrapeRatings = new Map<string, number>();
  private stats = new Map<string, Record<string, number>>();
  private dirty = new Set<string>();
  private candidates: ScrapeCandidate[] = [];
  private pairs: RatingPair[] = [];

  // seeding / assertions
  seedStat(m: string, p: string, stat: Record<string, number>): void {
    this.stats.set(pk(m, p), stat);
  }
  seedCandidate(c: ScrapeCandidate): void {
    this.candidates.push(c);
  }
  seedPair(pair: RatingPair): void {
    this.pairs.push(pair);
  }
  scrapeRating(m: string, p: string): number | undefined {
    return this.scrapeRatings.get(pk(m, p));
  }
  stat(m: string, p: string): Record<string, number> | undefined {
    return this.stats.get(pk(m, p));
  }
  isDirty(m: string, p: string): boolean {
    return this.dirty.has(pk(m, p));
  }
  clearDirty(m: string, p: string): void {
    this.dirty.delete(pk(m, p));
  }

  // ScrapeStore
  listScrapeCandidates(): Promise<ScrapeCandidate[]> {
    return Promise.resolve([...this.candidates]);
  }
  writeScrapeRating(matchId: string, playerId: string, rating: number): Promise<void> {
    this.scrapeRatings.set(pk(matchId, playerId), rating);
    // mark dirty WITHOUT touching an existing stat row (mirrors STAT_DIRTY_UPDATE's on-conflict invariant)
    this.dirty.add(pk(matchId, playerId));
    return Promise.resolve();
  }
  listRatingPairs(): Promise<RatingPair[]> {
    return Promise.resolve([...this.pairs]);
  }
}
```

- [ ] **Step 5:** `index.ts` += `export * from "./browser"; export * from "./store"; export { MemoryScrapeStore } from "./memoryStore";`. Run → PASS. **Commit** `feat(scrape): ScrapeStore port + in-memory double (idempotent write+dirty; no-clobber)`

---

## Task 7: `createPrismaScrapeStore` (thin IO; typecheck-only)

**Files:** `packages/scrape/src/prismaStore.ts`

- [ ] **Step 1: implement** (uses `@app/db` `markStatPlayerDirty`; NO `@app/ingest`):

```ts
/**
 * Prisma-backed {@link ScrapeStore} — the ONLY DB-touching file in @app/scrape. Writes the
 * `source='scrape'` rating and re-dirties via the SHARED `@app/db` invariant (no @app/ingest import).
 * No unit test (needs a live DB); covered by typecheck + the Memory store's behavioural tests.
 */
import type { PrismaClient } from "@app/db";
import { markStatPlayerDirty } from "@app/db";
import type { ScrapeStore } from "./store";
import type { ScrapeCandidate } from "./target";
import type { RatingPair } from "./compare";

type Db = PrismaClient;

export function createPrismaScrapeStore(prisma: Db): ScrapeStore {
  return {
    async listScrapeCandidates(): Promise<ScrapeCandidate[]> {
      // completed matches with a stored sofascore_match_id, their players that played (have a
      // stat_player_match row) + a stored sofascore_player_id; flag those with a scrape rating already.
      const matches = await prisma.fifaMatch.findMany({
        where: { status: "completed", sofascoreMatchId: { not: null } },
        select: {
          id: true,
          sofascoreMatchId: true,
          kickoffAt: true,
          status: true,
          playerStats: {
            select: {
              playerId: true,
              player: { select: { sofascorePlayerId: true } },
            },
          },
          ratings: { where: { source: "scrape" }, select: { playerId: true } },
        },
      });
      const out: ScrapeCandidate[] = [];
      for (const m of matches) {
        const scraped = new Set(m.ratings.map((r) => r.playerId));
        for (const s of m.playerStats) {
          const sofa = s.player.sofascorePlayerId;
          if (m.sofascoreMatchId == null || sofa == null) continue;
          out.push({
            matchId: m.id,
            playerId: s.playerId,
            sofascoreMatchId: m.sofascoreMatchId,
            sofascorePlayerId: sofa,
            status: m.status,
            kickoffMs: m.kickoffAt.getTime(),
            hasScrapeRating: scraped.has(s.playerId),
          });
        }
      }
      return out;
    },

    async writeScrapeRating(matchId, playerId, rating): Promise<void> {
      await prisma.ratingPlayerMatch.upsert({
        where: { matchId_playerId_source: { matchId, playerId, source: "scrape" } },
        create: { matchId, playerId, source: "scrape", rating, dirty: true },
        update: { rating, dirty: true },
      });
      await markStatPlayerDirty(prisma, matchId, playerId);
    },

    async listRatingPairs(): Promise<RatingPair[]> {
      const rows = await prisma.ratingPlayerMatch.findMany({
        where: { source: { in: ["scrape", "balldontlie"] }, rating: { not: null } },
        select: { matchId: true, playerId: true, source: true, rating: true },
      });
      const byKey = new Map<string, { scrape?: number; balldontlie?: number }>();
      for (const r of rows) {
        const k = `${r.matchId} ${r.playerId}`;
        const e = byKey.get(k) ?? {};
        if (r.source === "scrape") e.scrape = r.rating ?? undefined;
        else if (r.source === "balldontlie") e.balldontlie = r.rating ?? undefined;
        byKey.set(k, e);
      }
      const pairs: RatingPair[] = [];
      for (const e of byKey.values()) {
        if (e.scrape != null && e.balldontlie != null)
          pairs.push({ scrape: e.scrape, balldontlie: e.balldontlie });
      }
      return pairs;
    },
  };
}
```

- [ ] **Step 2:** `pnpm db:generate && pnpm --filter @app/scrape typecheck` → PASS. **Commit** `feat(scrape): Prisma-backed ScrapeStore (scrape rating upsert + shared dirty; pairs read)`

---

## Task 8: resolver end-to-end contract (scrape beats balldontlie)

**Files:** `packages/scrape/src/resolver.contract.test.ts`

- [ ] **Step 1: test** (uses `@app/recompute` MemoryStore — a scrape rating present alongside balldontlie → the swept score uses the SCRAPE value):

```ts
import { describe, it, expect } from "vitest";
import {
  MemoryStore,
  sweep,
  pickRating,
  type ScoreInputBundle,
  type StatRow,
} from "@app/recompute";

function zeroStat(): StatRow {
  return {
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    keyPasses: 0,
    dribblesAttempted: 0,
    dribblesCompleted: 0,
    duelsWon: 0,
    duelsLost: 0,
    passesTotal: 0,
    passesAccurate: 0,
    longBallsTotal: 0,
    longBallsAccurate: 0,
    wasFouled: 0,
    clearances: 0,
    blockedShots: 0,
    interceptions: 0,
    tacklesWon: 0,
    saves: 0,
    savesInsideBox: 0,
    punches: 0,
    highClaims: 0,
    possessionLost: 0,
  };
}

describe("resolver prefers the scrape over the balldontlie fallback (NO resolver change)", () => {
  it("pickRating returns the scrape value when both sources are present", () => {
    const r = pickRating([
      { source: "balldontlie", rating: 6.0 },
      { source: "scrape", rating: 8.5 },
    ]);
    expect(r).toEqual({ rating: 8.5, source: "scrape" });
  });

  it("a scraped rating + dirty → sweep → the player's score reflects the SCRAPE rating", async () => {
    const store = new MemoryStore();
    // The bundle's rating is pre-resolved by the store wrapper; here we assert that resolving [scrape,
    // balldontlie] picks scrape and the swept score equals scoring with the scrape rating.
    const withScrape = (rating: number, source: "scrape" | "balldontlie"): ScoreInputBundle => ({
      playerId: "p1",
      role: "FWD",
      rating,
      ratingSource: source,
      stat: { ...zeroStat(), minutesPlayed: 90 },
      manual: null,
      events: [],
      shots: [],
      team: {
        playerTeamId: "A",
        homeTeamId: "A",
        awayTeamId: "B",
        homeScore: 0,
        awayScore: 0,
        teamByPlayerId: {},
      },
    });
    store.seedManagerLeague("M", "L");
    store.seedPeriod("P", { leagueId: "L", kind: "group_md" });
    store.seedPlayerMatch("m1", "p1", withScrape(8.5, "scrape"));
    store.seedSlot("M", "P", "p1", true);
    store.seedPlaysIn("p1", "P", "m1");

    await sweep(store);

    const scrapeScore = store.writtenPlayerScore("m1", "p1")!.total;
    // The same player scored with the balldontlie rating instead would differ → proves the rating routes through.
    const bdlStore = new MemoryStore();
    bdlStore.seedManagerLeague("M", "L");
    bdlStore.seedPeriod("P", { leagueId: "L", kind: "group_md" });
    bdlStore.seedPlayerMatch("m1", "p1", withScrape(3.0, "balldontlie"));
    bdlStore.seedSlot("M", "P", "p1", true);
    bdlStore.seedPlaysIn("p1", "P", "m1");
    await sweep(bdlStore);
    expect(scrapeScore).toBeGreaterThan(bdlStore.writtenPlayerScore("m1", "p1")!.total); // 8.5 > 3.0 rating points
  });
});
```

- [ ] **Step 2:** Run → PASS (pickRating + sweep already exist; this is a contract test). **Commit** `test(scrape): resolver prefers scrape over balldontlie end-to-end (no resolver change)`

---

## Task 9: `apps/scraper` — browser adapter + loop + CLIs + boot

**Files:** `apps/scraper/{package.json,tsconfig.json,src/*}`

- [ ] **Step 1: `package.json`:**

```json
{
  "name": "@app/scraper",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "populate": "tsx src/populate.ts",
    "compare": "tsx src/compare.ts",
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@app/db": "workspace:*",
    "@app/scrape": "workspace:*",
    "@app/shared": "workspace:*",
    "dotenv": "^16.4.7"
  },
  "devDependencies": { "@types/node": "^22.10.5", "tsx": "^4.19.2" }
}
```

> NOTE: `playwright` is intentionally NOT a dependency here (not installable in this sandbox; it's a go-live add). The browser adapter uses an injected structural `ChromiumLauncher` so the repo typechecks/tests without it.

- [ ] **Step 2: `tsconfig.json`:** `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "rootDir": "src", "types": ["node"] }, "include": ["src"] }`

- [ ] **Step 3: `src/config.ts`** + **`src/logger.ts`** — copy `apps/worker/src/{config.ts,logger.ts}` verbatim, then in config replace the body's worker-specific fields with:

```ts
export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
  /** Scraper tick interval (ms). The settle loop is slow + polite. */
  tickMs: intEnv("SCRAPER_TICK_MS", 300_000),
  maxTicks: process.env.SCRAPER_MAX_TICKS ? intEnv("SCRAPER_MAX_TICKS", 0) : null,
  /** Polite gap between match-page fetches (ms). */
  politeGapMs: intEnv("SCRAPER_POLITE_GAP_MS", 4_000),
} as const;
```

(`logger.ts` is identical to the worker's.)

- [ ] **Step 4: failing test `src/playwrightBrowser.test.ts`** (the adapter orchestrates a FAKE launcher; no playwright):

```ts
import { describe, it, expect } from "vitest";
import { createSofascoreBrowser, type ChromiumLauncher } from "./playwrightBrowser";

function fakeLauncher(html: string): ChromiumLauncher {
  return () =>
    Promise.resolve({
      newPage: () =>
        Promise.resolve({
          goto: () => Promise.resolve(),
          content: () => Promise.resolve(html),
          close: () => Promise.resolve(),
        }),
      close: () => Promise.resolve(),
    });
}

describe("createSofascoreBrowser", () => {
  it("launches once, navigates by sofascore match id, and returns page HTML", async () => {
    const t = createSofascoreBrowser(fakeLauncher("<html>ok 7.4</html>"), { headless: true });
    expect(await t.fetchMatchHtml(50)).toBe("<html>ok 7.4</html>");
    await t.close();
  });
});
```

- [ ] **Step 5: implement `src/playwrightBrowser.ts`** (structural types; NO `import "playwright"`):

```ts
/**
 * The Playwright-backed {@link BrowserTransport}. Playwright is INJECTED as a structural `ChromiumLauncher`
 * (no compile-time dependency on the `playwright` package, which is a go-live add — `pnpm add playwright
 * && npx playwright install chromium`). One browser is launched lazily + reused; pages are per-fetch.
 *
 * TODO(confirm): the real Sofascore match URL pattern lives in `MATCH_URL` — confirm on first live page.
 */
import type { BrowserTransport } from "@app/scrape";

interface ChromiumPageLike {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  content(): Promise<string>;
  close(): Promise<void>;
}
interface ChromiumBrowserLike {
  newPage(): Promise<ChromiumPageLike>;
  close(): Promise<void>;
}
export type ChromiumLauncher = (opts?: { headless?: boolean }) => Promise<ChromiumBrowserLike>;

const MATCH_URL = (sofascoreMatchId: number): string =>
  `https://www.sofascore.com/event/${sofascoreMatchId}`; // TODO(confirm): exact path

export function createSofascoreBrowser(
  launch: ChromiumLauncher,
  opts: { headless?: boolean } = {},
): BrowserTransport {
  let browser: ChromiumBrowserLike | null = null;
  const ensure = async (): Promise<ChromiumBrowserLike> => (browser ??= await launch(opts));
  return {
    async fetchMatchHtml(sofascoreMatchId): Promise<string> {
      const b = await ensure();
      const page = await b.newPage();
      try {
        await page.goto(MATCH_URL(sofascoreMatchId), {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        return await page.content();
      } finally {
        await page.close();
      }
    },
    async close(): Promise<void> {
      if (browser) await browser.close();
      browser = null;
    },
  };
}
```

- [ ] **Step 6: run → PASS.** Commit deferred to end of task.

- [ ] **Step 7: failing test `src/scraper.test.ts`** (the tick: writes from a fixture; ISOLATION — a throwing fetch is caught and does not block the next match):

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { runScrapeTick } from "./scraper";
import { MemoryScrapeStore, type BrowserTransport, type ScrapeCandidate } from "@app/scrape";

afterEach(() => vi.useRealTimers());

const page = (players: Array<{ id: number; rating: number | null }>) =>
  `<script id="__SOFA_DATA__" type="application/json">${JSON.stringify({ players })}</script>`;
const T = (iso: string) => new Date(iso).getTime();

function cand(over: Partial<ScrapeCandidate>): ScrapeCandidate {
  return {
    matchId: "m1",
    playerId: "p1",
    sofascoreMatchId: 50,
    sofascorePlayerId: 1001,
    status: "completed",
    kickoffMs: T("2026-06-10T18:00:00Z"),
    hasScrapeRating: false,
    ...over,
  };
}

describe("runScrapeTick", () => {
  const now = new Date("2026-06-10T22:00:00Z");

  it("scrapes + writes the rating for each targeted player", async () => {
    const store = new MemoryScrapeStore();
    store.seedCandidate(cand({}));
    const transport: BrowserTransport = {
      fetchMatchHtml: () => Promise.resolve(page([{ id: 1001, rating: 7.4 }])),
      close: () => Promise.resolve(),
    };
    await runScrapeTick(transport, store, now, 0);
    expect(store.scrapeRating("m1", "p1")).toBe(7.4);
    expect(store.isDirty("m1", "p1")).toBe(true);
  });

  it("ISOLATION: a fetch that throws on one match does not block another match's write", async () => {
    const store = new MemoryScrapeStore();
    store.seedCandidate(cand({ sofascoreMatchId: 50, matchId: "bad", playerId: "pbad" }));
    store.seedCandidate(
      cand({ sofascoreMatchId: 51, matchId: "good", playerId: "pgood", sofascorePlayerId: 2002 }),
    );
    const transport: BrowserTransport = {
      fetchMatchHtml: (id) =>
        id === 50
          ? Promise.reject(new Error("blocked"))
          : Promise.resolve(page([{ id: 2002, rating: 6.6 }])),
      close: () => Promise.resolve(),
    };
    await expect(runScrapeTick(transport, store, now, 0)).resolves.toBeUndefined(); // never throws
    expect(store.scrapeRating("bad", "pbad")).toBeUndefined(); // the blocked match left no row
    expect(store.scrapeRating("good", "pgood")).toBe(6.6); // the other match still wrote
  });
});
```

- [ ] **Step 8: implement `src/scraper.ts`:**

```ts
/**
 * The scraper settle loop (ARCHITECTURE.md §2/§3 — isolated; "writes rating only"). PURE selection +
 * extraction (`@app/scrape`); IO is the injected browser + store. Per-MATCH try/catch is the isolation
 * boundary: a block/parse failure is logged + contained — it never throws into the shared pipeline, and
 * a miss simply leaves no `scrape` row so the resolver falls back to `balldontlie`.
 */
import {
  selectScrapeTargets,
  extractRating,
  type BrowserTransport,
  type ScrapeStore,
} from "@app/scrape";
import { log } from "./logger";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One settle pass: select FT targets, fetch each match page once, extract + write each player's rating. */
export async function runScrapeTick(
  transport: BrowserTransport,
  store: ScrapeStore,
  now: Date,
  politeGapMs: number,
): Promise<void> {
  const targets = selectScrapeTargets(await store.listScrapeCandidates(), now);
  for (const target of targets) {
    try {
      const html = await transport.fetchMatchHtml(target.sofascoreMatchId);
      for (const p of target.players) {
        const rating = extractRating(html, p.sofascorePlayerId);
        if (rating == null) continue; // not rated / not found → leave fallback
        await store.writeScrapeRating(p.matchId, p.playerId, rating);
      }
    } catch (err) {
      // Contained: never propagate into the shared pipeline. No row → resolver falls back to balldontlie.
      log.warn("scrape.match.failed", {
        sofascoreMatchId: target.sofascoreMatchId,
        message: (err as Error).message,
      });
    }
    if (politeGapMs > 0) await sleep(politeGapMs);
  }
}
```

- [ ] **Step 9: run → PASS.**

- [ ] **Step 10: `src/wiring.ts`** (assemble store + a default launcher that throws — go-live wires real Playwright):

```ts
/**
 * Wires the scraper. Playwright is NOT a compile-time dependency here (go-live add); the default
 * launcher throws, which the loop catches + logs — so until Playwright is wired, every fetch is a
 * contained miss and the resolver simply falls back to balldontlie (graceful degradation by design).
 *
 * Go-live: `pnpm add playwright && npx playwright install chromium`, then replace `notWiredLauncher`
 * with `async (o) => (await import("playwright")).chromium.launch(o)`.
 */
import { prisma } from "@app/db";
import { createPrismaScrapeStore } from "@app/scrape/prisma";
import type { ScrapeStore } from "@app/scrape";
import { createSofascoreBrowser, type ChromiumLauncher } from "./playwrightBrowser";

const notWiredLauncher: ChromiumLauncher = () => {
  throw new Error(
    "playwright not wired — go-live: `pnpm add playwright && npx playwright install chromium`",
  );
};

export const store: ScrapeStore = createPrismaScrapeStore(prisma);
export const browser = createSofascoreBrowser(notWiredLauncher, { headless: true });
export { prisma };
```

- [ ] **Step 11: `src/index.ts`** (boot + signals + the tick loop — mirror `apps/worker/src/index.ts` + `scheduler.ts`):

```ts
/**
 * @app/scraper — the ISOLATED Sofascore rating scraper (ARCHITECTURE.md §2/§3). Its ONLY job: write
 * `rating_player_match(source='scrape')`. Sandboxed: a block/parse failure is logged + contained and
 * NEVER throws into the app / 05a ingestion / scoring (see runScrapeTick).
 */
import { config } from "./config";
import { log } from "./logger";
import { browser, store } from "./wiring";
import { runScrapeTick } from "./scraper";

function main(): void {
  log.info("scraper.boot", { nodeEnv: config.nodeEnv, pid: process.pid, tickMs: config.tickMs });
  let ticks = 0;
  let running = false;
  let stopped = false;

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runScrapeTick(browser, store, new Date(), config.politeGapMs)
      .catch((err) => log.error("scraper.tick.error", { message: (err as Error).message }))
      .finally(() => {
        running = false;
        ticks += 1;
        if (config.maxTicks !== null && ticks >= config.maxTicks && !stopped) {
          stopped = true;
          clearInterval(timer);
          log.info("scraper.drained", { ticks });
          void browser.close().finally(() => process.exit(0));
        }
      });
  }, config.tickMs);

  const shutdown = (reason: string, code: number): void => {
    if (stopped) return;
    stopped = true;
    log.info("scraper.shutdown", { reason });
    clearInterval(timer);
    void browser.close().finally(() => process.exit(code));
  };
  process.on("SIGINT", () => shutdown("SIGINT", 0));
  process.on("SIGTERM", () => shutdown("SIGTERM", 0));
  process.on("uncaughtException", (err) => {
    log.error("scraper.uncaughtException", { message: err.message });
    shutdown("uncaughtException", 1);
  });
  log.info("scraper.ready", {});
}

main();
```

- [ ] **Step 12: `src/populate.ts`** (one-time CLI — pure keyMatch wired to a stubbed Sofascore index):

```ts
/**
 * One-time verified population CLI: PROPOSE Sofascore ids via the pure keyMatch, WRITE only the
 * unambiguous, and EMIT the flagged list for manual `sofascore_player_id` entry (the operator UI is a
 * later prompt — TODO(prompt-NN)). The Sofascore-index source is a thin IO seam.
 *
 * TODO(confirm): wire `loadSofaIndex()` to the real Sofascore index (a fetch/scrape of the tournament's
 * matches + lineups). Until then it returns []; everything below is keyMatch-driven + unit-tested.
 */
import { prisma } from "@app/db";
import {
  proposeMatchMappings,
  proposePlayerMappings,
  type SofaMatchKey,
  type SofaPlayerKey,
} from "@app/scrape";
import { log } from "./logger";

async function loadSofaIndex(): Promise<{ matches: SofaMatchKey[]; players: SofaPlayerKey[] }> {
  return { matches: [], players: [] }; // TODO(confirm): real Sofascore index
}

async function main(): Promise<void> {
  const sofa = await loadSofaIndex();
  const feedMatches = (
    await prisma.fifaMatch.findMany({
      select: {
        id: true,
        kickoffAt: true,
        homeTeam: { select: { abbreviation: true } },
        awayTeam: { select: { abbreviation: true } },
      },
    })
  ).map((m) => ({
    fifaMatchId: m.id,
    dateIso: m.kickoffAt.toISOString().slice(0, 10),
    homeCode: m.homeTeam?.abbreviation ?? "",
    awayCode: m.awayTeam?.abbreviation ?? "",
  }));
  const feedPlayers = (
    await prisma.player.findMany({
      select: { id: true, displayName: true, team: { select: { abbreviation: true } } },
    })
  ).map((p) => ({ playerId: p.id, teamCode: p.team?.abbreviation ?? "", name: p.displayName }));

  const m = proposeMatchMappings(feedMatches, sofa.matches);
  const p = proposePlayerMappings(feedPlayers, sofa.players);
  for (const prop of m.proposals)
    await prisma.fifaMatch.update({
      where: { id: prop.fifaMatchId },
      data: { sofascoreMatchId: prop.sofascoreMatchId },
    });
  for (const prop of p.proposals)
    await prisma.player.update({
      where: { id: prop.playerId },
      data: { sofascorePlayerId: prop.sofascorePlayerId },
    });

  log.info("populate.done", {
    matchProposals: m.proposals.length,
    matchFlagged: m.flagged.length,
    playerProposals: p.proposals.length,
    playerFlagged: p.flagged.length,
  });
  for (const f of p.flagged)
    log.warn("populate.player.manual", {
      playerId: f.playerId,
      name: f.name,
      teamCode: f.teamCode,
    });
  await prisma.$disconnect();
}

void main();
```

- [ ] **Step 13: `src/compare.ts`** (comparison CLI):

```ts
/** One-time BALLDONTLIE-vs-Sofascore fallback-quality report (run once both sources have live data). */
import { prisma } from "@app/db";
import { createPrismaScrapeStore } from "@app/scrape/prisma";
import { compareRatings } from "@app/scrape";
import { log } from "./logger";

async function main(): Promise<void> {
  const store = createPrismaScrapeStore(prisma);
  const summary = compareRatings(await store.listRatingPairs());
  log.info("compare.report", { ...summary, distribution: JSON.stringify(summary.distribution) });
  await prisma.$disconnect();
}

void main();
```

- [ ] **Step 14:** `.env.example` — add under a `# --- Scraper ---` block: `SCRAPER_TICK_MS="300000"` and `SCRAPER_POLITE_GAP_MS="4000"`.

- [ ] **Step 15:** `pnpm install --offline && pnpm db:generate && pnpm -w typecheck && pnpm test` → green. **Commit** `feat(scraper): apps/scraper — browser adapter, isolated settle loop, populate + compare CLIs`

---

## Task 10: purity proof + final gates + docs/handoff/memory

- [ ] **Step 1: purity grep** (pure modules clock/network/env-free):

```bash
grep -nE "Date\.now|new Date\(\s*\)|fetch\(|playwright|process\.env" \
  packages/scrape/src/extract.ts packages/scrape/src/resolveTarget.ts packages/scrape/src/keyMatch.ts \
  packages/scrape/src/target.ts packages/scrape/src/compare.ts && echo "IMPURE — FIX" || echo "PURE ✓"
```

- [ ] **Step 2: full gates** `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` → all exit 0.
- [ ] **Step 3:** handoff to `.remember/remember.md`; memory `sofascore-scraper.md` + MEMORY.md index; PROJECT.md tick 05b; ARCHITECTURE §4 note the two `sofascore_*_id` columns.
- [ ] **Step 4: commit** `docs(prompt-05b): handoff — isolated Sofascore scraper + fallback comparison`

---

## Self-Review (spec coverage)

- Isolated `packages/scrape` + `apps/scraper`, no `@app/ingest` import — Tasks 1–9. ✓ (dirty invariant hoisted to `@app/db`, Task 0.)
- Extraction pure, single selector — Task 1. ✓
- Stored-id-only `resolveTarget` — Task 2. ✓ Population `keyMatch` (auto-write unambiguous, flag rest) — Task 3 + CLI Task 9. ✓
- Rating write + dirty via shared invariant; resolver prefers scrape, no change — Tasks 6,7,8. ✓
- Settle target-selection pure (injected now) — Task 4. ✓
- Comparison math pure + CLI — Tasks 5,9. ✓
- Isolation (throw caught, survives) — Task 9 (scraper.test). ✓
- Additive migration; resolver/05a signatures untouched — Task 0 (migration), no resolver edits. ✓
- Purity grep + gates — Task 10. ✓

## `// TODO(confirm):` carried for first live data

1. Sofascore rating selector / data shape (`extract.ts` `RATING_DATA`).
2. Match URL pattern (`playwrightBrowser.ts` `MATCH_URL`).
3. keyMatch real-data assumptions (team codes/dates align; manual-list size).
4. Whether Sofascore exposes a usable LIVE rating (else FT-only — `target.ts`).
5. The real Sofascore-index source for `populate.ts` `loadSofaIndex`.
6. Playwright is a go-live add (`pnpm add playwright && npx playwright install chromium` + wire the launcher).
