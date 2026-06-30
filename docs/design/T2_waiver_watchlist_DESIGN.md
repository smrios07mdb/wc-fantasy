# T2 — Waiver Watchlist ("star a player to track") — DESIGN

> **Status: LOCKED + IMPLEMENTED** (`feat/waiver-watchlist`, 2026-06-30; merge HELD — Sergio owns the
> migration + RLS). The four commissioner decisions in §9 (FA-only star surface but a scope-agnostic write
> API · private-to-owner · no new per-player data · star on the FA row + card + "Watched" filter) were
> settled in Chat and built **as specified**, and the DDL-only / gated-suite test strategy was settled and
> implemented as below.
>
> **One supersession to note:** the in-migration role-switched **self-test** described in §3 ("In-migration
> self-test (Theme-F)") and §8 step 1 was **SUPERSEDED** by the settled test strategy. The shipped migration
> is **DDL-only** (mirroring `group_standing` 20260626120000 + `fix_faab_settled_rls` — no embedded DO-block
> self-test, no `supabase_realtime` entry, no `SECURITY DEFINER` helper); the RLS proof instead lives in the
> gated Postgres integration suite `apps/web/src/manager/watchlistRls.integration.test.ts` (own
> `WATCHLIST_RLS_PG_TEST_URL` var + SAFE guard, uuid-casting `auth.uid()`, 11 tests). Both portability shims
> (`authenticated` role + `auth.uid()`) are still included because the owner-only policies read the JWT via
> `(auth.uid())::text`. The body sections below are the original (read-only discovery) design and otherwise
> hold as built.
>
> **Class:** migration-class (new table + RLS). **Merge authority:** Sergio (per BACKLOG.md → T2 and the
> CLAUDE.md merge policy for migration / RLS changes).
> **Date:** 2026-06-30. **Author:** Claude Code.
>
> The SQL/Prisma/policy blocks below were **proposal sketches for review** at design time; the as-built
> shape is captured in PROJECT/DECISIONS/ARCHITECTURE 2026-06-30 (T2).

---

## 0. Summary (what we're proposing)

A **private, per-manager bookmark** ("star") on players. A manager can star/unstar any player; the
starred set is theirs alone, never visible to rivals. v1 surfaces the star as a toggle on each free-agent
(FA) row of `/waivers` plus a "Watched" filter to view only the starred subset. It is a **pure bookmark**
— it does **not** touch FAAB budget, roster, bids, claims, or scoring. No notifications, no auto-bidding,
no alerts in v1 (deliberately boring scope).

The design mirrors the codebase's existing **strictly-owner-only** per-manager table — `faab_bid` (the
"sealed bids stay secret" table) — for the RLS posture, and uses `pool_pick` as the **migration-structure
scaffold** (the modern, portable, `TO authenticated`, self-tested template). It diverges from both where
a private bookmark differs: no league-visible/settled reveal policy, no Realtime publication entry, no
`SECURITY DEFINER` helper.

---

## 1. Current-state findings (the facts that constrain the design)

All citations are to the real repo, read first-hand this pass.

### 1.1 Identity model (the FKs a per-manager table uses)

- The **manager-identity FK** on every per-manager table is `manager_id TEXT → manager(id)`, not
  `league_membership_id` / `entry_id` / `roster_id` (no such identity column exists). Confirmed on the
  three analog tables:
  - `faab_bid.managerId @map("manager_id")` → `manager` `onDelete: Cascade` — `packages/db/prisma/schema.prisma:627`, `:641`.
  - `pool_pick.managerId @map("manager_id")` → `manager` `onDelete: Cascade` — `schema.prisma:971`, `:978`.
  - `lineup_slot.managerId @map("manager_id")` → `manager` `onDelete: Cascade` — `schema.prisma:472`, `:487`.
- `Manager` PK is `id String @id @default(uuid())` — `schema.prisma:161`. It carries `leagueId @map("league_id")` (`:162`) and the **auth tie**: `userId String? @map("user_id")` → `AppUser` (Supabase auth user), nullable until a real user claims the slot — `schema.prisma:164`, `:189`. Display name is `displayName @map("display_name")` (`:168`).
- **RLS identity idiom** across the codebase: `auth.uid() = manager.user_id` (with a `::text` cast on `auth.uid()`), resolved by a subquery on `manager`. The companion policy `manager_select_own` lets the caller's own `manager` row resolve inside other policies — `packages/db/prisma/migrations/20260605170000_enable_rls_public_tables/migration.sql:55-57`.
- `Player` PK is `id String @id @default(uuid())` — `schema.prisma:308`. **There is NO `name` column** — the display field is `displayName @map("display_name")` (NOT NULL) — `schema.prisma:315`; `firstName`/`lastName` are nullable (`:313-314`). Player FKs on analogs are `player_id TEXT → player(id) onDelete: Cascade` (e.g. `lineup_slot:489`, `faab_bid.playerAddId:642`).
- `League` PK is `id String @id @default(uuid())` — `schema.prisma:131`. Per-manager tables carry a denormalized `league_id` column directly (`faab_bid:626`, `pool_pick:970`); `lineup_slot` does **not** (it scopes via `manager` + `period`).
- Uniqueness convention: a per-manager natural key is a `@@unique` on `(managerId, <natural key>)` — e.g. `pool_pick @@unique([managerId, matchId])` (`schema.prisma:981`), `lineup_slot @@unique([managerId, periodId, playerId])` (`:491`).

> The above identity + RLS facts were **adversarially re-verified** by an independent agent in this pass
> (re-read `schema.prisma` and the migration files directly): managerFk ✅, playerFk ✅, RLS SQL ✅ — no
> corrections.

### 1.2 The free-agent (FA) pool architecture (where star-state hydrates)

- The loader is `loadWaivers(viewerManagerId): Promise<WaiversView | null>` — a thin **RLS-bypassing
  Prisma-OWNER** server edge that assembles the whole `/waivers` snapshot — `apps/web/app/waivers/loadWaivers.ts:67`. It is reached only from `apps/web/app/waivers/page.tsx:22` (auth-gated by `getSessionManager()` at `page.tsx:18`) and reused by `loadPlayoffs` (`apps/web/app/playoffs/loadPlayoffs.ts:141`).
- The FA pool is built as: `excludeIds = listFaIneligiblePlayerIds(prisma, leagueId)` then
  `prisma.player.findMany({ where: { id: { notIn: ... } }, select: PLAYER_SELECT, orderBy: { displayName: "asc" } })`, each row mapped via `toPlayer(p)` plus `opponent` — `loadWaivers.ts:222-238`. "Free agent" = **live-unowned** (no active `roster_player`) AND team-not-eliminated, via `listFaIneligiblePlayerIds → liveOwnedWhere` (`@app/faab`).
- A single FA row's type is **`WvPlayer`** — `apps/web/src/waivers/types.ts:19`. The FA pool is
  `readonly freeAgents: readonly WvPlayer[]` on `WaiversView` (`types.ts:139`). Fields each row already
  carries: `id` (player UUID — **the star key**), `name` (= `displayName`), `shortName`, `position`,
  `nation` (from the `fifa_team` join, `player.country` is unwritten), `teamName`, `kickoffAt`
  (acquisition cutoff = `fifa_match.kickoff_at`), `seasonPoints`, and `opponent?` (next-fixture vs/@ tag,
  FA-rows only) — `types.ts:20-44`, mapper `loadWaivers.ts:193-208`. There is **no owned/unowned boolean**
  on the row — unownedness is implicit (the whole `freeAgents` array IS the unowned pool).
- The bid/claim model: a `FaabBid` is a **sealed blind bid** (`managerId`, `playerAddId`, `playerDropId?`,
  `amount`, `status`) — `schema.prisma:624-649`. Mutations go through `POST/PATCH/DELETE /api/faab/bid`
  (sealed bids) and `POST /api/faab/free-agent` (instant $0 grants). **A star must be fully decoupled from
  all of this** (see §4).

### 1.3 The closest analog RLS tables

- **`faab_bid`** is the only **strictly-owner-only**, per-manager write table — "sealed FAAB bids stay
  secret" — `packages/db/prisma/migrations/20260603223500_invariants/migration.sql:70-145`. Its owner-only
  policy family (`faab_bid_select_own_pending`, `_insert_own`, `_update_own_pending`, `_delete_own_pending`)
  gates purely on ownership: `EXISTS (SELECT 1 FROM manager m WHERE m.id = faab_bid.manager_id AND m.user_id = (auth.uid())::text)` — **no league predicate needed** (ownership alone fully scopes the row). This is exactly the privacy posture a watchlist wants.
  - ⚠️ But `faab_bid`'s policies **predate the `TO authenticated` discipline** — they are bare
    `FOR SELECT USING (...)` (= `TO public`), safe only because the `EXISTS` predicate excludes anon. And
    it has a **league-visible reveal** policy `faab_bid_select_settled` (`status <> 'pending'`) that the
    watchlist must **omit**.
- **`pool_pick`** is the modern **migration-structure scaffold** — `migrations/20260610130000_pool_pick/migration.sql`: DDL as exact `prisma migrate diff` output (`:27-55`), portability shims for the `authenticated` role + `auth.uid()` (`:57-86`), `ENABLE` (not `FORCE`) RLS (`:89`), policies with **`TO authenticated` on every policy** (`:96-135`), and an in-migration **Theme-F role-switched self-test using valid-uuid `sub` literals** (`:154-258`, uuids at `:179-180`). Its SELECT is **league-visible** (a reveal model) — the watchlist must **not** copy that.
- The **SEC-P0 lesson** is baked into `migrations/20260620120000_fix_faab_settled_rls/migration.sql`: the
  original `faab_bid_select_settled` was `USING (status <> 'pending')` with **no identity predicate and
  `TO public`** → because RLS policies OR together (permissive), it leaked every settled bid across all
  leagues to the anon key. The fix added **both** a league-member predicate **and** `TO authenticated`.
  **Lesson for the watchlist: `TO authenticated` on EVERY policy, and every policy carries an identity
  predicate.**
- **`auth.uid()` cast lesson (SEC-P1 / Prompt-13 22P02 class):** the real Supabase `auth.uid()` casts the
  JWT `sub` to `uuid`, so `(auth.uid())::text` round-trips against `manager.user_id` (text). The
  bare-Postgres portability shim returns TEXT, which **masks** that cast. Any in-migration self-test must
  drive `request.jwt.claim.sub` with **valid uuid literals** and be verified against a uuid-returning
  `auth.uid()`, or it 22P02s on real Supabase / passes silently on the shim — `pool_pick:57-62`, `:167-187`.
- **`ENABLE` not `FORCE`:** every RLS migration uses `ENABLE` so the table-owning `postgres` role (Prisma
  app reads/writes, the worker, provisioning, `prisma migrate deploy`) and Supabase `service_role`
  **bypass** RLS — server paths are unaffected; RLS bites only the JWT-scoped anon/authenticated roles via
  the PostgREST Data API + Realtime — `invariants:90-92`, `enable_rls_public_tables:9-13`, `pool_pick:17-20`.

### 1.4 Realtime usage on personal-state tables

- `/waivers` uses **no Realtime**: every mutation is a `fetch(...) → router.refresh()` round-trip (re-runs
  the server component) — `apps/web/src/waivers/WaiversClient.tsx:8`, `:163`, `:174`, `:198`, `:217`;
  loader docstring `loadWaivers.ts:9`.
- Among per-manager tables, **only `pool_pick`** is added to the `supabase_realtime` publication
  (`pool_pick:141-152`). **`faab_bid` and `lineup_slot` are NOT** in it (grep confirms the only
  per-manager `ALTER PUBLICATION ... ADD TABLE` is `pool_pick`). The notify layer also deliberately
  sidesteps Realtime (Web Push, not `postgres_changes`) — see memory `[[notify-transport-layer]]`.

### 1.5 UX surfaces (where a star fits)

- A single FA row renders via **`FaPickRow`** — `apps/web/src/waivers/components.tsx:182`. Its wrapper
  `.wv-comp-fa-wrap` (`:194`) holds **two** controls: the selectable `.wv-comp-fa` button (`onSelect`,
  `:195-210`) and a **sibling** `.wv-comp-fa-info` info button (`onOpen`, with `stopPropagation` so the
  tap doesn't also select-for-acquisition — `:211-221`). `FaPickRow` is rendered by both `FreeAgentPanel`
  (`FreeAgentPanel.tsx:118`) and `BidComposer` (`BidComposer.tsx:153`).
- The view-only player drill-in is **`FaPlayerCardSheet`** (period-less, live/global) — opened via
  `setCardPlayer` and rendered at `WaiversClient.tsx:427` (state at `:69`, imported `:19`).
- There is already a **pure, reusable filter pattern**: `claimableFreeAgents(...)` takes a `nationFilter`
  arg and filters the pool (`waiversLogic.ts:69`); `freeAgentNations(...)` derives the distinct-nation
  chip source (`:102`); the presentation control is `<NationFilter>` (`apps/web/components/NationFilter.tsx:29`,
  pure — parent owns the selected value + `onChange`). A **"Watched" filter** reuses this exact pattern.

---

## 2. Proposed table

**Name:** `watchlist` (table) / `Watchlist` (Prisma model). A neutral name — it is a personal bookmark of
players, not a FAAB concept.

Sketch (for review — **not** applied to `schema.prisma`):

```prisma
model Watchlist {
  id        String   @id @default(uuid())
  leagueId  String   @map("league_id")   // denormalized, mirrors faab_bid/pool_pick; scopes + indexes
  managerId String   @map("manager_id")  // the owner (manager-identity FK)
  playerId  String   @map("player_id")   // the starred player
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  league  League  @relation(fields: [leagueId],  references: [id], onDelete: Cascade)
  manager Manager @relation(fields: [managerId], references: [id], onDelete: Cascade)
  player  Player  @relation(fields: [playerId],  references: [id], onDelete: Cascade)

  @@unique([managerId, playerId], map: "watchlist_manager_player_uq") // one star per (manager, player)
  @@index([managerId])           // the hot read: "this viewer's starred set"
  @@index([leagueId])            // FK hygiene / cascade
  @@index([playerId])            // FK hygiene
  @@map("watchlist")
}
```

Notes:
- **PK:** synthetic `id` (uuid), consistent with every other table.
- **Unique constraint:** `(managerId, playerId)` — a player is either starred or not for a given manager;
  this is the upsert/idempotency key and prevents duplicate stars. Mirrors `pool_pick @@unique([managerId, matchId])`.
- **`leagueId` carried directly** for FK/index hygiene and cheap cascade — matching `faab_bid`/`pool_pick`.
  It is **not** used in the RLS predicate (ownership alone scopes the row — see §3). It is harmless and
  consistent to keep; an alternative (scope via `manager` like `lineup_slot`) is viable but less
  consistent with the two closest analogs. **Recommend: keep `league_id`.**
- **No status, no amount, no period, no FAAB linkage** — a star is a single bit of "I'm watching this
  player." Add reverse relations (`watchlist Watchlist[]`) to `League`, `Manager`, `Player`.
- **`onDelete: Cascade`** on all three FKs: if a manager, league, or player is removed, their stars go too
  (a star has no independent meaning). Matches the analogs.

---

## 3. Proposed RLS model (private-to-owner, `TO authenticated`, league-scoped table)

**Mirror `faab_bid`'s owner-only policy family** (the strictly-private analog) for the *predicate*, and
**`pool_pick`'s migration scaffold** (portability shims + `TO authenticated` + valid-uuid self-test) for
the *structure*. Four policies (one per CRUD verb), each `TO authenticated`, each gating on ownership.

Proposed policy spec (sketch — mirrors `invariants:90-145` + `pool_pick:89-135`; **not** a migration):

| Policy | Verb | Gate (USING / WITH CHECK) |
|---|---|---|
| `watchlist_select_own` | `SELECT TO authenticated` | `USING (EXISTS (SELECT 1 FROM manager m WHERE m.id = watchlist.manager_id AND m.user_id = (auth.uid())::text))` |
| `watchlist_insert_own` | `INSERT TO authenticated` | `WITH CHECK (` same `EXISTS …` `)` |
| `watchlist_update_own` | `UPDATE TO authenticated` | `USING (` same `)` **and** `WITH CHECK (` same `)` |
| `watchlist_delete_own` | `DELETE TO authenticated` | `USING (` same `)` |

Table setup: `ALTER TABLE "watchlist" ENABLE ROW LEVEL SECURITY;` (**ENABLE, never FORCE** — server/Prisma
owner bypasses; RLS bites only the JWT roles). Include the same idempotent portability shims as
`pool_pick:57-86` (create `authenticated` role if absent; create text-returning `auth.uid()` if absent).

**Divergences from the analogs (deliberate):**
- **Drop `faab_bid`'s `status = 'pending'` gate** — a watchlist row has no lifecycle/status.
- **OMIT any league-visible / settled SELECT policy.** This is the single most important divergence: a
  watchlist is private forever, so there is exactly ONE SELECT policy and it is owner-only. (Copying
  `faab_bid_select_settled` or `pool_pick_select_league_member` would leak the bookmark to rivals.)
- **Include a `DELETE` policy** (unstar = delete a row). `pool_pick` has none (upsert-only); the watchlist
  needs delete. (Server still bypasses RLS, but the policy is defence-in-depth + lets the design stay
  honest about who can delete.)
- **`TO authenticated` on EVERY policy** (do NOT copy `faab_bid`'s older bare `TO public` form — that's the
  SEC-P0 lesson). Match `pool_pick`'s later, role-clause-on-all form.
- **No `SECURITY DEFINER` helper** — the owner-only predicate touches only `manager` (resolvable via the
  existing `manager_select_own` policy). Helpers are needed only when a policy must read an RLS-default-deny
  table (e.g. `pool_pick`'s kickoff helper reads `fifa_match`). The watchlist needs none — same reason
  `faab_bid`'s owner-only policies need none.
- **No `supabase_realtime` publication entry** (see §6).

**In-migration self-test (Theme-F):** mirror `pool_pick:154-258`. Seed two `app_user` rows with **valid
uuid `sub` literals** (`00000000-0000-0000-0000-000000000001` / `…0002`), two leagues, three managers
(own / another-in-same-league / another-league), and assert as each driven `auth.uid()`:
- owner **can** SELECT/INSERT/DELETE their **own** star ✅,
- owner **cannot** read **another manager's** stars (even same-league) ❌ — this is the key privacy assertion
  distinguishing a watchlist from `pool_pick`'s league-visible model,
- owner **cannot** write/delete another manager's star ❌.
Always unwind the seed via the sentinel-raise rollback so nothing persists, re-raising a real mismatch
after cleanup (the `pool_pick` pattern).

---

## 4. Proposed write path (star/unstar toggle — NO FAAB coupling)

A new endpoint, **fully decoupled** from FAAB budget / roster / bids / claims. A star is a personal
bookmark, not a claim — it must never read or mutate `faab_bid`, `faab_batch`, `roster_player`,
`lineup_slot`, or the budget.

- **Endpoint:** `POST /api/manager/watchlist` (under `manager`, not `faab`, to signal the decoupling).
  - Body: `{ playerId: string, watched: boolean }`.
  - Auth: `getSessionManager()` exactly like the existing routes (the screen + route are already
    auth-gated; the route resolves the caller's `managerId` server-side — never trusts a client-supplied
    manager id).
  - `watched: true` → idempotent **upsert** on `(managerId, playerId)` (uses the `watchlist_manager_player_uq`
    unique key) → 200. `watched: false` → **delete** the `(managerId, playerId)` row → 200 (idempotent: a
    missing row is still 200).
  - Writes via the Prisma owner (RLS-bypassing, like every other server write); RLS is defence-in-depth.
  - Validation: reject an unknown `playerId` (FK will fail anyway) and a malformed body (400). No budget /
    cap / phase checks — a star is always allowed (it costs nothing and claims nothing).
- **No engine, no recompute, no dirty-marking, no Realtime broadcast** — none of the scoring/FAAB
  machinery is touched.
- Client calls it with the same `fetch → router.refresh()` shape the waivers screen already uses for every
  mutation (`WaiversClient.tsx:163` et al.), so the re-rendered server component re-hydrates the star state.

(Alternative considered: two verbs `POST` star / `DELETE` unstar. A single toggle endpoint with a `watched`
boolean is simpler for the client and matches the boring scope — **recommend the single endpoint**.)

---

## 5. Proposed read path (how star-state hydrates onto FA rows)

`loadWaivers` is the natural and only place to read the star set — it already assembles the FA pool and
runs as the Prisma owner.

- Add one read in `loadWaivers`'s existing `Promise.all` (or alongside it):
  `prisma.watchlist.findMany({ where: { managerId: viewerManagerId }, select: { playerId: true } })`
  → `watchedPlayerIds: string[]` (the viewer's stars, league-implicit via the manager).
- Thread it onto the view as `WaiversView.watchedPlayerIds: readonly string[]` (a new field; cheap, ~tens
  of ids). **Do not** add a boolean to every `WvPlayer` — keep the set separate so the client can compute
  `isWatched = watchedSet.has(player.id)` for any row (FA, claim, card) without re-shaping the row mapper.
- The client (`WaiversClient`) builds `const watchedIds = new Set(view.watchedPlayerIds)` and threads it
  down to `FaPickRow` and `FaPlayerCardSheet` (see §6 UX). Star toggles `→ /api/manager/watchlist →
  router.refresh()` re-reads `watchedPlayerIds`.
- The star key is **`player.id`** (`WvPlayer.id`), already on every row (`loadWaivers.ts:196`).
- The pure filter helper extends the existing pattern: a `watchedFreeAgents(freeAgents, watchedSet)` (or a
  `watchedOnly` arg added to `claimableFreeAgents`) in `waiversLogic.ts`, unit-testable with no DB — same
  shape as `freeAgentNations` / `claimableFreeAgents` (`waiversLogic.ts:69`, `:102`).

---

## 6. Proposed v1 UX (the boring scope)

**Recommendation: a star toggle on each FA row + a "Watched" filter to view the starred subset. Nothing
more** (no alerts, no notifications, no auto-bid).

- **Star toggle on the FA row:** add a **third control** inside `FaPickRow`'s `.wv-comp-fa-wrap`
  (`components.tsx:194`), as a sibling to the existing `.wv-comp-fa-info` button, with the same
  `stopPropagation` so tapping the star never selects-for-acquisition (mirrors the info button at
  `components.tsx:211-221`). Filled star = watched, outline = not. Calls `onToggleStar(player)`.
- **Star in the player card:** also place the toggle in `FaPlayerCardSheet`'s header (the drill-in at
  `WaiversClient.tsx:427`) so a manager can star while reading the box score. Same handler.
- **"Watched" filter:** a small segmented toggle / chip beside the existing `<NationFilter>`
  (`NationFilter.tsx:29`) on the FA panels, driven by a pure `watchedFreeAgents(...)` helper (§5). "All
  free agents" ↔ "Watched only". Reuses the established filter pattern — no new architecture.
- **State:** lives in `WaiversClient` as `watchedIds: Set<string>` hydrated from `view.watchedPlayerIds`,
  threaded down (the ux lane's partial conclusion before it errored: *"state should live in WaiversClient
  and thread down"* — consistent with this).
- Other surfaces (`/lineup`, `/draft`, dashboard) are **out of scope for v1** — `/waivers` is where
  watching players is most meaningful (it's the acquisition screen). Note them as future extensions.

---

## 7. Realtime decision

**v1: NO Realtime. Do NOT add `watchlist` to the `supabase_realtime` publication.**

Rationale:
- The **owner is the sole writer and sole reader** of their own stars — there is no cross-manager event to
  push. A page-load read in `loadWaivers` + the existing `router.refresh()` after a toggle is sufficient
  and is exactly how `/waivers` already works (`WaiversClient.tsx:8`, `:217`).
- This matches the closest analog: **`faab_bid` is not in the publication**; only `pool_pick` is, and only
  because it has a *cross-manager reveal* requirement the watchlist explicitly lacks (`pool_pick:141-152`).
- Adding a private table to the publication only **widens the RLS/leak surface** (the SEC-P0 / pool-pick
  Realtime-RLS class of bug) for zero product benefit. The notify layer made the same call (push, not
  `postgres_changes` — `[[notify-transport-layer]]`).

If a future version wants live multi-device sync of one manager's own stars, it can be revisited — but it
is not warranted for v1 and would require the owner-only SELECT policy to already be airtight first.

---

## 8. Test-plan sketch (for the LATER implementation pass)

1. **RLS self-test (in-migration, Theme-F):** as in §3 — seeded with **valid uuid `sub` literals**,
   role-switched, asserting owner-only read AND write/delete, cross-manager isolation (the privacy
   assertion), rolled back via sentinel raise. Verified on a throwaway Postgres with a **uuid-returning**
   `auth.uid()` (the SEC-P1 / 22P02 trap — see `[[rls-migration-verification]]`).
2. **Gated Postgres integration test** (own `*_PG_TEST_URL` var + SAFE guard, like the FAAB/pool gated
   suites): create a star as manager A; assert A reads it under the `authenticated` role; assert manager B
   (same league) and an anon connection read **zero**; assert the owner (Prisma) reads it (bypass);
   assert delete removes it; assert the `(managerId, playerId)` unique key blocks a duplicate.
3. **Pure logic contract tests** (no DB): `watchedFreeAgents(...)` / the `watchedOnly` filter in
   `waiversLogic.ts` — empty set, partial set, all-watched, watched player no longer in pool.
4. **Route contract test:** `POST /api/manager/watchlist` — 401 unauthenticated; toggling `watched:true`
   then `true` again is idempotent (one row); `watched:false` deletes; malformed body 400; a star **does
   not** alter budget/roster/bids (assert those tables untouched — the decoupling guarantee).
5. **Loader shape:** extend `loadWaivers.contract.test.ts` to assert `watchedPlayerIds` is present and
   correct.
6. **Full DoD gate** (`/gate`): typecheck → lint → format:check → test + `pnpm --filter @app/web build`
   (web/CSS thread) + the gated Postgres RLS integration test. Run `pnpm --filter @app/db generate` first
   (schema changed). **Hold the merge for Sergio** (migration + RLS = user-owned).

---

## 9. OPEN DECISIONS FOR THE COMMISSIONER (lock these in Chat before implementation)

**(a) Star scope — which players can be starred?**
- *Recommend:* **Free agents only** in v1 (the FA pool is what `/waivers` lists, and the star lives on
  `FaPickRow`). Simplest, matches the surface.
- *Alternative:* **Any player** (incl. rostered players and opponents) — broader, but needs a star surface
  outside `/waivers` (lineup / game-detail) and a clear meaning for "watching a player you already own."
  The table design (keyed on `player.id`, no FA constraint) supports either with no schema change — this
  is purely a UX-surface decision.

**(b) Private stars vs. league-visible?**
- *Recommend:* **Private to the owner** (the whole RLS design in §3 is built on this — it's the safe,
  boring default and matches `faab_bid`'s posture). A "watch" is strategic information; revealing it leaks
  intent to rivals.
- *Alternative:* league-visible ("3 managers watching X") would change the RLS to a `pool_pick`-style
  league-scoped SELECT — a materially different (and leakier) design. **Strong recommend: private.**

**(c) Does the watchlist surface anything beyond the saved list (next opponent / availability)?**
- The FA row **already** carries next opponent (`WvPlayer.opponent`), next kickoff/cutoff (`kickoffAt`),
  season points, position, nation — `types.ts:20-44`. So a "Watched" filter that reuses `FaPickRow`
  inherits all of that **for free**.
- *Recommend:* v1 surfaces **just the starred subset of the existing FA rows** — no new per-player data.
  (Availability/injury badges, alerts, "price you'd need to bid" are explicitly out of scope for the boring
  v1.) Confirm this is the intended scope.

**(d) v1 UX placement — confirm the star location(s).**
- *Recommend:* star toggle **on the FA row** (`FaPickRow`, third control in `.wv-comp-fa-wrap`) **and** in
  the **player card** (`FaPlayerCardSheet` header), plus a **"Watched" filter** beside `<NationFilter>`.
- Confirm whether the card-header star is wanted in v1 or row-only is enough.

---

## 10. What this design deliberately does NOT do (v1 non-goals)

- No notifications / alerts / push when a watched player's status changes (that's a separate, larger feature
  — would lean on the existing notify layer).
- No auto-bidding or any FAAB coupling.
- No ordering/priority of the watchlist (no `priority` column) — it's a flat set.
- No Realtime / cross-device live sync.
- No star surfaces outside `/waivers` (lineup / draft / dashboard) — future extension.

---

### Appendix — primary citations

- Identity / FKs: `packages/db/prisma/schema.prisma:131` (League), `:161-209` (Manager), `:307-356` (Player), `:470-494` (LineupSlot), `:624-649` (FaabBid), `:968-985` (PoolPick).
- RLS analogs: `migrations/20260603223500_invariants/migration.sql:70-145` (faab_bid owner-only family), `migrations/20260605170000_enable_rls_public_tables/migration.sql:9-13,55-57` (ENABLE-not-FORCE + manager_select_own), `migrations/20260610130000_pool_pick/migration.sql:17-258` (scaffold + TO authenticated + self-test + realtime block), `migrations/20260620120000_fix_faab_settled_rls/migration.sql` (SEC-P0 fix).
- FA pool / waivers: `apps/web/app/waivers/loadWaivers.ts:67,193-238`, `apps/web/src/waivers/types.ts:19-44,139`, `apps/web/src/waivers/components.tsx:182-224`, `apps/web/src/waivers/WaiversClient.tsx:8,19,69,427`, `apps/web/src/waivers/waiversLogic.ts:69,102`, `apps/web/components/NationFilter.tsx:29`.
- Memory cross-refs: `[[notify-transport-layer]]`, `[[rls-migration-verification]]`, `[[pool-pick-realtime-rls-fix]]`, `[[faab-fa-live-unowned]]`, `[[waivers-ui-layer]]`.
