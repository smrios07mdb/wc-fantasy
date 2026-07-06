# SCHEMA UUID INVENTORY — TEXT-uuid vs @db.Uuid audit

**Thread:** SCHEMA-UUID-AUDIT (read-only). **Base:** origin/main `bea565c`. **Date:** 2026-07-05.
**Scope:** inventory every id/uuid-defaulted column in `packages/db/prisma/schema.prisma`,
flag raw-SQL `::uuid` bind risk, propose a convention. **No schema/migration/code change.**

## TL;DR

- **Zero `@db.Uuid` in the entire schema.** `grep -c '@db.Uuid' schema.prisma` → `0`. Every
  uuid-shaped column — every `String @id @default(uuid())` PK and every `String` FK — is a
  Postgres **TEXT** column holding a uuid-shaped string. There is **no** real `@db.Uuid` column
  anywhere. The `manager.id` landmine that cost T15-BACKFILL three redeploys is **not a special
  case — it is the universal case.**
- **Raw-SQL `::uuid` offenders on id binds: NONE FOUND.** No application query binds a TEXT id
  with `$n::uuid`. Every `::uuid` occurrence in the tree is benign (see §3).
- **Proposal (decision-first, for Chat + Sergio):** adopt a **bare `id = $n` convention** for all
  raw SQL against id/FK columns, codified as a review rule. Do **not** migrate columns to
  `@db.Uuid` before launch — that is migration-class, mid-tournament, whole-schema, and buys
  nothing the convention doesn't. Revisit `@db.Uuid` migration as a post-launch cleanup only.

## 1. Column inventory

### 1a. TEXT-uuid PK columns — `String @id @default(uuid())` (NO `@db.Uuid`)

Every one of these is Postgres TEXT. A raw-SQL `WHERE id = $n::uuid` against any of them raises
`42883 operator does not exist: text = uuid` (the T15-BACKFILL bug); the correct bind is bare `$n`.

| Model | PK column | Declared |
|---|---|---|
| League | id | `String @id @default(uuid())` |
| Manager | id | `String @id @default(uuid())` |
| AppUser | id | `String @id @default(uuid())` |
| AllowlistEmail | id | `String @id @default(uuid())` |
| FifaStage | id | `String @id @default(uuid())` |
| FifaGroup | id | `String @id @default(uuid())` |
| FifaTeam | id | `String @id @default(uuid())` |
| Player | id | `String @id @default(uuid())` |
| FifaMatch | id | `String @id @default(uuid())` |
| RosterPlayer | id | `String @id @default(uuid())` |
| LineupSlot | id | `String @id @default(uuid())` |
| Period | id | `String @id @default(uuid())` |
| Draft | id | `String @id @default(uuid())` |
| DraftPick | id | `String @id @default(uuid())` |
| DraftQueue | id | `String @id @default(uuid())` |
| FaabBatch | id | `String @id @default(uuid())` |
| FaabBid | id | `String @id @default(uuid())` |
| Watchlist | id | `String @id @default(uuid())` |
| EventMatch | id | `String @id @default(uuid())` |
| ShotMatch | id | `String @id @default(uuid())` |
| Standing | id | `String @id @default(uuid())` |
| PlayoffEntry | id | `String @id @default(uuid())` |
| RecomputeDirty | id | `String @id @default(uuid())` |
| PoolPick | id | `String @id @default(uuid())` |
| MatchLineupEntry | id | `String @id @default(uuid())` |
| PushSubscription | id | `String @id @default(uuid())` |
| NotificationSent | id | `String @id @default(uuid())` |
| CommishAudit | id | `String @id @default(uuid())` |

### 1b. TEXT-uuid PK columns that are a bare FK (no `@default`)

Same TEXT type, same `::uuid` hazard — the PK IS a foreign id, defaulted upstream.

| Model | PK column | Declared |
|---|---|---|
| GroupStanding | teamId (`@map("team_id")`) | `String @id` — mirrors FifaTeam.id |
| NotificationPreference | managerId (`@map("manager_id")`) | `String @id` — mirrors Manager.id |

### 1c. Composite-PK tables — TEXT-uuid FK columns as `@@id`

No single id column; the PK is `@@id([...])` over TEXT-uuid FK columns (each a `String` FK).
All the same TEXT hazard on raw-SQL binds.

| Model | Composite PK (TEXT-uuid parts) |
|---|---|
| StatPlayerMatch | matchId, playerId |
| StatTeamMatch | matchId, teamId |
| RatingPlayerMatch | matchId, playerId (+ source = enum, not uuid) |
| ManualStatPlayerMatch | matchId, playerId |
| ScorePlayerMatch | matchId, playerId |
| ScoreManagerPeriod | managerId, periodId |

### 1d. All FK columns are TEXT-uuid too

Every relation FK is a plain `String` (e.g. `leagueId`, `managerId`, `userId`, `playerId`,
`teamId`, `matchId`, `periodId`, `batchId`, `actorUserId`, `enteredByUserId`,
`reversedByUserId`, `claimedByUserId`, `invitedByUserId`, `groupId`, `stageId`). None carries
`@db.Uuid`. Same bare-bind rule applies to every one of them in raw SQL.

### 1e. NOT uuid columns (no hazard — listed for completeness)

Integer external ids and other scalars are unaffected: `balldontlieId` / `balldontlieTeamId` /
`balldontlieMatchId` / `balldontlieEventId` (Int, `@unique`), `sofascoreMatchId` (Int),
`sofascorePlayerId` (Int, where present), `bdlGroupId` (Int), `defaultRank`, `draftSlot`,
`faabBudget`, `waiverOrderPosition`, scores, minutes, seeds, positions, all `Boolean`,
all enums (`PeriodStatus`, `BidStatus`, `PoolPrediction`, `RatingSource`, …), and all
`DateTime @db.Timestamptz(6)`. These bind by their own types; `::uuid` never applies.

## 2. Why the whole schema is TEXT

`String @default(uuid())` tells **Prisma** to generate a v4 uuid string application-side, but
maps to a Postgres **`text`** column unless `@db.Uuid` is added. Since `@db.Uuid` appears
**nowhere** in this schema, every id is stored and compared as `text`. Prisma's own generated
queries are parameterized as text and are unaffected. The hazard is **only** in hand-written raw
SQL (`$queryRaw*` / `$executeRaw*`) that adds an explicit `::uuid` cast on an id parameter or
column — that reintroduces the `text = uuid` type mismatch (42883).

## 3. Raw-SQL `::uuid` audit — offenders: NONE

`grep -rn '::uuid'` across the tree (excluding node_modules + worktrees) returns only benign hits.
No application query binds an id with `$n::uuid`. Breakdown of every match:

**A. `auth.uid()` RLS shim (NOT an id bind — correct as-is).** Integration tests recreate
Supabase's `auth.uid()` as `SELECT (NULLIF(current_setting('request.jwt.claim.sub', true),''))::uuid::text`.
This parses the JWT `sub` claim (a genuine uuid from Supabase auth) to uuid and back to text so it
compares as `text` against the TEXT `manager.user_id` / `app_user.id` columns. Casting to `::uuid::text`
here is deliberate canonicalization of the auth path, not an id bind — leave it.
- `apps/web/src/commish/commishAuditRls.integration.test.ts:49`
- `apps/web/src/manager/watchlistRls.integration.test.ts:45`

**B. Migration + backfill comments (documentation only, no executable bind).** Prose describing the
`sub::uuid` shim trap or the fixed 42883:
- `packages/db/prisma/migrations/20260610130000_pool_pick/migration.sql:60`
- `packages/db/prisma/migrations/20260610140000_notifications/migration.sql:87`
- `packages/db/prisma/migrations/20260611120000_lock_on_play_commish_override/migration.sql:64`
- `packages/db/prisma/migrations/20260612120000_lineup_forfeit_voided_at/migration.sql:95`
- `packages/db/prisma/migrations/20260612220000_lineup_lock_scheduled_unlock/migration.sql:115`
- `packages/db/prisma/migrations/20260614130000_playoff_entry/migration.sql:53`
- `packages/db/prisma/migrations/20260630120000_watchlist/migration.sql:78`
- `packages/db/prisma/migrations/20260701120000_commish_audit/migration.sql:81`
- `packages/db/scripts/backfill-display-name-pii.ts:13` (BINDING NOTE: binds bare, never `::uuid`)
- `packages/db/src/backfillDisplayNamePiiRunner.ts:14,69` (comments; the runner binds bare `$n`)
- `packages/db/src/backfillDisplayNamePiiRunner.integration.test.ts:6`

**Live-write vs read-only classification:** the only application raw-SQL that binds an id on a
**live-write path** is `backfillDisplayNamePiiRunner.ts` — and it already binds **bare** (`$n`),
proven on real PG at main `97649aa`. There are **no `::uuid` id-bind offenders on any path**,
live-write or read-only. Nothing to fix.

## 4. PROPOSAL (decision-first — for Chat + Sergio to choose, not to build)

The §5 launch-audit backfills will write raw SQL against prod. Two mutually-exclusive standards:

### Option A — Bare `id = $n` convention (RECOMMENDED, zero migration)
- **Rule:** in any raw SQL, bind id/FK params bare (`WHERE id = $n`, `id = ANY($n::text[])`);
  **never** append `::uuid` to an id column or param. Cast to `::text[]` for array binds, never
  `::uuid[]`.
- **Cost:** documentation + a review checklist item. No DB change, no downtime, no migration.
- **Matches reality:** the columns *are* text; the convention just stops re-introducing a
  cast that never should have been there. This is exactly what the T15-BACKFILL fix already
  codified for `manager.id`; Option A generalizes it schema-wide.
- **Enforcement seam (optional, cheap):** a repo grep guard (CI or hook) that fails on
  `::uuid` appearing next to a `$n` bind in `*.ts` raw SQL outside the known-benign `auth.uid()`
  shim — catches a future offender before it reaches prod.

### Option B — Migrate TEXT-uuid columns to `@db.Uuid` (NOT before launch)
- Add `@db.Uuid` to every id/FK column and run an `ALTER TABLE ... ALTER COLUMN ... TYPE uuid
  USING (col::uuid)` migration across ~35 tables + every FK.
- **Cost:** migration-class, touches every table, every FK, every RLS policy comparing ids, and
  the `auth.uid()` text-vs-uuid contract. Mid-tournament, against live prod data. High blast
  radius for zero functional gain (Prisma's generated queries already work as text).
- **Verdict:** **post-launch cleanup at best.** Do not attempt before or during the tournament.

**Recommendation:** adopt **Option A** now (convention + optional grep guard); defer Option B
indefinitely / post-launch. Records the `manager.id`-is-TEXT DECISION as a schema-wide invariant:
**every id/uuid column in this schema is Postgres TEXT; raw-SQL id binds are always bare `$n`.**

## 5. Scope note

Read-only audit. No schema, migration, code, test, or verifier was modified. The only file
written is this note.
