# LANE P4 — Routing / per-tenant client (session→DB routing under per-league)
_Per-league-DB spec pass, 2026-07-06. Lane model: Fable 5. Inputs: DESIGN_NOTES.md §1 pt 2 + §2, DEC0_DEPENDENCY_MAP.md:9, AUDIT_LAUNCH_readiness.md (F-A07 161–167, F-A20 460–465, Lane A3 1077–1090 + F-A15 424–429), render.yaml, packages/db/src/index.ts, targeted greps (importer count, league.findFirst sites, route dirs, NEXT_PUBLIC consumers). Verifier verdict appended at bottom after the independent re-check._

Branch-spec: everything below is "under per-league →". Nothing here recommends a D-DB fork. Variant labels V-a/V-b/V-c and deployment axis R-1/R-2 per the pinned taxonomy. This lane specs the "new session→DB routing problem" named in DESIGN_NOTES §1 pt 2.

## 1. The singleton today (what routing must replace — or keep)

- `packages/db/src/index.ts:12-16` — module-singleton `PrismaClient`, config solely from env `DATABASE_URL` (no datasource override, no `connection_limit` in code = F-A07, AUDIT:161–167). `index.ts:10,18-19` — `globalThis.prisma` HMR-reuse pattern (dev only).
- **93 files** import `from "@app/db"` (grep verified 2026-07-06, apps+packages, .ts/.tsx). Every one is implicitly single-tenant: the tenant is whatever `DATABASE_URL` points at.
- **`league.findFirst` singleton sites — 7 verified** (input map said 8; grep across apps+packages finds 7, incl. one `findFirstOrThrow`):

| # | Site | Context |
|---|------|---------|
| 1 | apps/worker/src/provision/cli.ts:62 | provisioning idempotency probe |
| 2 | apps/worker/src/period/prismaStore.ts:18 | period-close cron store |
| 3 | apps/worker/src/commish/cli.ts:111 | commish CLI |
| 4 | apps/worker/src/autofire/prismaStore.ts:82 | autofire round-cut store |
| 5 | apps/worker/src/jobs/recompute.ts:47 | recompute job |
| 6 | apps/worker/src/jobs/periodClose.ts:55 | period-close job |
| 7 | packages/db/scripts/seed-allowlist.ts:57 | allowlist seeder (`findFirstOrThrow`) |

- **KEY STRUCTURAL FACT:** under per-league (any variant), each DB contains exactly one `league` row, so `league.findFirst` is **correct by construction** — the F-C11-class remediation evaporates, exactly mirroring how F-C01's 56 rewires evaporate (DESIGN_NOTES §1 pt 2). Under one-DB, all 7 sites need league-context threading. Web-side league reads are already threaded (`league.findUnique({where:{id:leagueId}})` at apps/web/app/players/loadPlayers.ts:92, commish/loadCommish.ts:94, waivers/loadWaivers.ts:89, packages/faab/src/prismaStore.ts:70) — those need no change under either fork.

## 2. Tenant resolution under R-1 (shared app instances, N league targets)

R-1 needs a request→league resolver that runs before any Prisma call. Mechanisms:

| Mech | How | Resolvable before auth? | Blast radius (anchored) | Admissible under |
|---|---|---|---|---|
| (i) hostname/subdomain | `liga1.example.com` → registry lookup by host in middleware | **Yes** — solves P3's auth chicken-and-egg (under V-a the manager row lives inside the league DB; you must pick the DB before you can look up the user) | Near-zero route changes; needs wildcard domain on the web service (Render supports wildcard custom domains — render.com/docs/custom-domains, retrieved 2026-07-06; count/cert handling plan-dependent → parameter `R_dom`) + host-header middleware (~1 new file + apps/web/middleware.ts edit) | V-a, V-b |
| (ii) path prefix `/l/[slug]` | App Router restructure: every league-implicit route moves under `app/l/[slug]/` | Yes (slug in URL) | **13 of 15 page routes** (all but sign-in, auth/denied; 15 `page.tsx` counted) + **31 of 33 API routes** (all but api/health, api/db-check) relocate — plus **2 auth route handlers outside both counts** (apps/web/app/auth/callback/route.ts, auth/sign-out/route.ts), which under V-a are league-scoped anyway (each league's Supabase project has its own redirect allowlist); note the sign-in/auth exclusions hold under V-b only — under V-a those surfaces are tenant-scoped regardless of mechanism. Every internal `<Link>`/`router.push`/fetch path rewrites; CrossNav + bottom-nav constants too. Largest-touch option — comparable in file count to the one-DB junction waves it was supposed to avoid | V-a, V-b |
| (iii) session-derived | auth cookie → user id → membership → league | **No** — circular under V-a (membership row is inside the league DB; needs P1's control-plane registry to break the loop). Under V-b needs a control/global schema holding user→league | V-b natively; V-a only with control-plane assist, and still can't route the *sign-in* request itself | V-b; V-a partially |

- **V-a effectively requires tenant-before-auth**: each league project has its own Auth + anon key, so the app must know the league before it can even build the Supabase client → hostname (i) or an explicit league-picker page against the P1 registry. (iii) alone is inadmissible under V-a.
- **V-a + R-1 has a build-time landmine the one-DB notes never mention:** the browser Supabase client is constructed from `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` (apps/web/lib/supabase/client.ts:9-10; the server/middleware copy of the same NEXT_PUBLIC coupling is `createServerClient` in apps/web/lib/supabase/middleware.ts:13-14 — full path to disambiguate from apps/web/middleware.ts), inlined into the client bundle at `next build` (render.yaml:64 comment). One shared build can carry exactly ONE project's URL/anon key → browser Auth + Realtime (draft room, vsfield, standings, playoffs) break for every other league (pool has NO Realtime by explicit design — poolLive.ts:4,21). Fix = runtime config injection (per-hostname config endpoint or SSR-provided props feeding `createBrowserClient`) — a real refactor of the Supabase client layer, or V-a forces R-2. Under V-b (one project, one anon key) this problem does not exist.
- **Server-side Supabase layer is equally coupled under R-1+V-a:** `apps/web/lib/supabase/server.ts:15-16` builds server clients from module-scope env constants (SUPABASE_URL/ANON_KEY plus the per-league SUPABASE_SERVICE_ROLE_KEY), and `apps/web/middleware.ts:6` runs `updateSession` (lib/supabase/middleware.ts:12-14, same env) on EVERY request before any tenant resolution exists. Under R-1+V-a the session cannot even be refreshed until the tenant is known → the middleware pipeline must resolve tenant BEFORE session refresh, and server.ts's module-constant construction must become registry-driven (URL + anon + service-role per league). Consequence worth naming: the N service-role keys then live in the P1 registry (control plane) — secrets-in-registry.
- SUB-DECISION (for the D-DB brief): **R-1 tenant-resolution mechanism** — A: hostname/subdomain (smallest code delta, works for V-a and V-b, ops = DNS wildcard + registry row per league; local dev needs /etc/hosts or `*.localhost`); B: path prefix (no DNS ops, single origin, but 13-page + 31-API-route restructure and URL churn); C (V-b only): session-derived with league-picker (no URL/DNS change, but auth-first ordering and no deep-linkable league URLs).

## 3. R-2 (deployment-per-league): zero runtime routing, ops-side cost

- Under R-2 there is **no routing problem at all**: each league gets its own Render service set pinned to one league's `DATABASE_URL`/Supabase keys. Today's code — singleton `index.ts:12-16`, all 93 importers, all 7 `findFirst` sites, the `NEXT_PUBLIC` build-time inlining (each service builds itself with its own env, so each league's bundle gets the right keys) — runs **byte-unchanged**. At N=1 this IS the status quo (INV-11, AUDIT:1002).
- The cost moves to IaC. Facts that price it:
  - render.yaml defines 4 services (web :44, worker :87, cron period-close :153, cron group-standings :189). **Secrets are per-service `sync:false`, NOT in the env group** — render.yaml:33-34 states Render forbids `sync:false` in groups; `wc-fantasy-shared` (:35) carries only NODE_ENV/LOG_LEVEL. So "own env group per league" is really **N×4 services each with hand-entered dashboard secrets** (DATABASE_URL, DIRECT_URL, Supabase keys…): ~`4 services × S secrets × N leagues` manual entries unless driven via Render API.
  - Blueprint scaling — SUB-DECISION (for the D-DB brief): A: static duplication (copy the 4-service block per league in one render.yaml; `apps/web/lib/deploy/renderBlueprint.test.ts` pins the current blueprint contract and would need per-league parameterization); B: generated render.yaml (script emits N×4 services from the P1 registry; blueprint stays reviewable, secrets still manual); C: Render API provisioning (fully scriptable incl. env vars, but leaves declarative-IaC — the repo's render.yaml stops being the source of truth).
  - **Deploy fan-out:** every push to main triggers N×4 independent autodeploys with **no ordering barrier** (Lane A3, AUDIT:1077-1090 — esp. :1080, no `autoDeploy` override → all four services auto-deploy independently on push; finding-level wiring F-A15 :424-429; only web runs `preDeployCommand db:migrate:deploy` render.yaml:55; worker/crons never migrate). Caveat: INV-2 — cross-service deploy-ordering semantics are dashboard-unverified. Under R-2 that becomes N concurrent migration runs against N DBs with N×3 non-migrating services racing them — the existing single-league skew window (cross-ref P1 §4) multiplied by N, plus partial-fleet states (league 3 deployed, league 7 build-failed) that don't exist today.
- Stated neutrally: R-2 is the zero-code-change pole; its price is N×4 service sprawl, N-fold deploy/migration fan-out, per-league dashboard secret entry, and F-A20 breach (§5).

## 4. Client factory under R-1 (the @app/db change)

Shape (needed for R-1 under V-a or V-b; NOT needed under R-2):

- `createLeagueClient(dsn: string): PrismaClient` — `new PrismaClient({ datasources: { db: { url: dsn } } })`, with `connection_limit` + `pgbouncer=true` **appended in code** to the DSN. This is where F-A07 (AUDIT:161-167: no code-level connection_limit today; note `apps/web/lib/launch-env.ts:4-19` already parses these params for a readiness check, so a canonical param-injector has a natural home) must be fixed *before* multi-client, not after.
- Bounded cache: `Map<leagueId, PrismaClient>` with LRU eviction calling `$disconnect()` on evict. Extend the existing `globalThis` HMR pattern (index.ts:10,18-19) to hold the Map, not a single client, so dev HMR doesn't leak N pools per reload.
- **Connection budget is the cache bound** (cross-ref P2's math): per app instance, `cache_size × connection_limit ≤ instance_share` of the Supavisor pool. Under V-b all N leagues share ONE project's pooler → the budget divides by resident leagues; under V-a each league has its own pooler → per-client limits are independent but the app instance still holds `cache_size × connection_limit` sockets. Formula: `instance_sockets = min(N, cache_size) × connection_limit`; instantiate against P2's pooled ceiling.
- **Import-contract migration (93 importers):** keep `export const prisma` as-is for N=1 compatibility (it simply reads env `DATABASE_URL`), add the factory + `getLeagueClient(leagueId)` alongside. Consumers migrate incrementally; the export is deleted (or aliased to `getLeagueClient(THE_LEAGUE)`) only at cutover.
- SUB-DECISION (for the D-DB brief): **how the tenant client reaches call sites** — A: explicit client parameter (stores/loaders take `db: PrismaClient`; the repo's store pattern — e.g. period/autofire prismaStores — already wraps Prisma behind constructors, so injection is mostly constructor-arg threading, but the long tail of the 93 importers is a mechanical wave comparable to L4's W-waves); B: AsyncLocalStorage tenant context (middleware sets ALS, `@app/db` export becomes a Proxy resolving per-request; near-zero call-site churn, but implicit magic, ALS/runtime edge cases in Next.js route handlers vs middleware, and worker jobs need explicit `als.run()` wrappers anyway). A is boring-and-reliable; B minimizes diff.

## 5. Worker/cron under R-1 vs R-2

- **R-1:** one worker fleet; scheduler tick (apps/worker/src/index.ts:18 `tickMs`) wraps its body in `for (league of registry)` — serial per league, one cached client each (same factory as §4; the 7 `findFirst` sites in §1 then DO need threading under R-1+V-b since one DB… no — under any per-league variant each league DB still has one league row, so `findFirst` against the *per-league client* stays correct; only the loop selects the client). The scheduler is NOT the whole worker: the process boots a SECOND independent loop, `startDraftTicker` (index.ts:22-30), on its own seconds cadence — it too needs a per-league registry loop, and it is latency-sensitive (autopick fires within seconds of `pick_deadline_at`; a serial N-league sweep adds up to N×tick latency to autopick deadlines). The two cron processes (render.yaml:153 period-close, :189 group-standings) are also per-league consumers and must iterate the registry under R-1. Parameter: per-league tick duration vs the `tickMs` budget — at N leagues a serial sweep can overrun the tick. Feed ingest pulls GOAT **once per tick** and writes ×N (reference data player/fifa_team is per-DB — cross-ref P1's reference-data SUB-DECISION). Under R-1 the feed-consuming process count stays at today's TWO (resident worker + group-standings cron, each with its own limiter instance — F-A20, AUDIT:462-463) and does NOT scale with N, so F-A20's per-process limiter is no worse than status quo.
- **R-2:** N workers each pull the feed independently = **F-A20 breach by construction** — one upstream API key, N uncoordinated in-process limiters, N× feed volume. AUDIT:460 already forbids scaling the worker >1 instance while F-A20 stands; R-2 does exactly that, cross-league. Mitigations (each non-trivial): per-league feed keys (provider-dependent), a shared fetch-cache tier (new infra), or accepting N× quota (parameter `Q_feed` vs provider limit). Stated honestly: R-2's "zero code change" does not survive contact with F-A20 unless the feed quota covers N×.

## 6. Migration path from today (N=1, INV-11)

Ordered, zero-behavior-change until the decision lands:

| Step | Action | Behavior change | Useful under one-DB too? |
|---|---|---|---|
| 0 | (pre-work) F-A07 fix: code-level `connection_limit`+`pgbouncer=true` injection in @app/db | none (matches runbook intent) | **Yes** — needed regardless |
| 1 | Introduce P1 registry with 1 row (control plane: league→DSN/keys) | none | Partially — degenerates to config |
| 2 | Factory behind the existing export: `prisma` becomes `getLeagueClient(defaultLeague)` reading the same env | none (same DSN, same pool) | **Mostly dead weight** — see below |
| 3 | D-DB lands | — | — |
| 4a | R-1 path: tenant middleware (§2 mechanism) + store threading (§4 sub-decision) + worker registry loop (§5) | league #2 = provision (P1) + registry row + DNS/subdomain | n/a |
| 4b | R-2 path: blueprint scaling (§3 sub-decision) | league #2 = provision (P1) + 4 new services + secrets | n/a |

Honest answer on pre-building: **step 2 (the factory) is one-DB dead weight.** Under one-DB there is exactly one DSN forever; a factory wrapping one client adds indirection with no consumer. The only genuinely fork-neutral pieces are step 0 (F-A07) and injectable-client store signatures (marginal test-ergonomics value). Recommendation-free consequence: do not build §4 before D-DB lands; it is cheap enough (~2–4 files core + incremental threading) to build after.

---
## V-P4 verifier verdict (independent re-check)

_Independent verifier (Fable 5), 2026-07-06. Scope: every load-bearing anchor re-read (packages/db/src/index.ts, all 7 findFirst sites, findUnique sites, render.yaml :33-35/:44/:55/:64/:87/:153/:189, AUDIT F-A07 :161-167 / F-A20 :460-465 / F-A15 :424-429 / Lane A3 :1077-1090 / INV-11 :1002, supabase client/middleware/server, launch-env.ts, worker index.ts, renderBlueprint.test.ts, DESIGN_NOTES:20, DEC0 D-DB row); greps rerun (93 importers, findFirst, page.tsx/route.ts); 1 platform fact re-fetched (Render wildcard custom domains)._

**Overall: CORRECTIONS** — the structural argument (R-1 vs R-2 axis, tenant-before-auth under V-a, F-A20 as the R-2 breaker, factory shape, dead-weight verdict on pre-building) survives adversarial re-check; the corrections are example-level facts, one anchor offset, and two §5/§2 completeness gaps.

- **F1 (CORRECTED, §5)** — worker R-1 spec covers only the scheduler tick; the worker boots a SECOND loop, `startDraftTicker` (index.ts:22-30, seconds-cadence autopick — latency-sensitive under a serial N-league sweep), and the two crons also need registry loops. Add both + a tick-budget parameter.
- **F2 (CORRECTED, §2/§4)** — server-side Supabase layer unspecced under R-1+V-a: server.ts:15-16 module-scope env constants, and middleware refreshes the session BEFORE any tenant resolution exists; tenant-resolve-before-updateSession ordering + registry-driven server config (incl. N service-role keys) must be named.
- **F3 (REFUTED, §5)** — "stays coherent because there is still exactly one puller": F-A20's own text (AUDIT:462-463) counts TWO feed-consuming processes today (worker + group-standings cron, each with its own limiter). Correct claim: puller count doesn't scale with N under R-1. Contrast with R-2 unchanged.
- **F4 (CORRECTED, §2)** — "pool reveal" is not a Realtime casualty (poolLive.ts:4,21: NO Realtime subscription by design); the list should be draft room, vsfield, standings, playoffs. middleware.ts:13-14 cite = createServerClient in lib/supabase/middleware.ts, not the browser client; disambiguate path.
- **F5 (CORRECTED, §2 mech ii)** — page/API counts reproduce (15 / 33), but the 2 auth route handlers (auth/callback, auth/sign-out) sit outside both counts and are league-scoped under V-a; sign-in's exclusion is V-b-only reasoning.
- **F6 (CORRECTED, §3)** — "Lane A3, AUDIT ~976+" anchor is actually :1077-1090 (":1080 no autoDeploy override → no ordering barrier" is verbatim there) + F-A15 :424-429; content fully confirmed; INV-2 (dashboard ordering semantics unverified) is the honest caveat to append.
- **F7 (CONFIRMED)** — 93 importers exact; 7 findFirst sites line-exact (input map's 8th hit = comment at period/prismaStore.ts:17); findUnique anchors exact.
- **F8 (CONFIRMED)** — F-A07 grounding exact (index.ts:12-16/:10/:18-19; AUDIT:161-167; launch-env.ts param parsing); Prisma ^6.2.1 supports the datasources override.
- **F9 (CONFIRMED)** — all render.yaml anchors exact; renderBlueprint.test.ts exists; Render wildcard custom domains re-verified live (auto TLS incl. wildcards; per-plan domain quotas) — `R_dom` parameterization is the right call.

**Discipline: clean.** No sentence recommends a D-DB fork; all three genuine sub-choices carry SUB-DECISION markers (R-1 mechanism, blueprint scaling, client threading); plan-dependent platform numbers are parameterized (R_dom, Q_feed, S, N). "Do not build §4 before D-DB lands" is fork-neutral sequencing, not a fork recommendation.

Folded: 6 corrections applied in place.
