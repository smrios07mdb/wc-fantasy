# T15-14R — N2/N6 Root Cause + Data-Fix Design (read-only; nothing built)

Supersedes the render-mask framing of `T15-13_NOTES.md` §7(a) **for N2/N6 only** (N3 and N4 unchanged,
still their own threads). Anchored at origin/main `64eee81`. This thread traced every write path to
`manager.displayName`, confirmed the root cause, and designed — but did not build — the data fix
(backfill + write-time guard). No DB touched; no code edited; only this doc written.

## 1. Write-path table — every code path that sets `manager.displayName`

`manager.display_name` is `String` NOT NULL (`packages/db/prisma/schema.prisma:170`), case-insensitively
unique per league via `manager_league_id_lower_display_name_key`
(`packages/db/prisma/migrations/20260610120000_manager_display_name_unique/migration.sql:5-6`).

Exhaustive sweep of `prisma.manager.{create,update,upsert,updateMany,createMany}` across `apps/` +
`packages/` (non-test):

| # | Path | file:line | Writes displayName? | Value source | Can it write an email? |
|---|------|-----------|---------------------|--------------|------------------------|
| 1 | **Provisioning upsert** (create AND update branches) | `apps/worker/src/provision/cli.ts:110-120` | YES (both branches) | `plan.managers[].displayName` ← `provision.config.json` verbatim (plan is pass-through; `buildProvisionPlan` in `apps/worker/src/provision/plan.ts` copies it untransformed) | **YES — sole validation is non-empty** (`plan.ts` validateConfig: `!m.displayName.trim()` → error; no shape check) |
| 2 | **Self-serve rename** POST `/api/manager/display-name` | `apps/web/app/api/manager/display-name/route.ts:31-34` via `handleDisplayNameRename` → `validateDisplayName` (`apps/web/src/manager/displayName.ts:10-15`) | YES | user input from `/settings` | **YES — validator only checks non-empty + ≤40 chars**, deliberately no charset restriction |
| 3 | Provisioning `bind` | `cli.ts:208` | no (userId only) | — | — |
| 4 | Group→playoff transition | `apps/worker/src/commish/transitionStore.ts:140,145` | no (waiverOrderPosition only) | — | — |
| 5 | FAAB batch | `packages/faab/src/prismaStore.ts:251,270,276` | no (budget/waiver order) | — | — |
| 6 | Migration RLS self-tests | e.g. `20260606170000_rls_realtime_vsfield/migration.sql:158` | inserts literal `'in'/'other'` fixtures, then **deliberately rolls back** (`RAISE EXCEPTION 'rls_selftest_rollback'` at `:199`) | — | no (never persists) |

Not writers, checked and cleared: `seed-allowlist.ts` (allowlist_email only — "this script never touches
`manager`", `packages/db/scripts/seed-allowlist.ts:8`); auth callback / `getSessionManager` (read-only,
no manager creation anywhere in web); the `mirror_auth_user_to_app_user` trigger (app_user only). There
is **no commissioner-rename path** ("no commissioner-renames path",
`apps/web/src/manager/handleDisplayNameRename.ts:54`) and **no seed/import** that persists managers.
**Manager rows are created in exactly one place: the provisioning upsert.**

## 2. Root cause — CONFIRMED: config-borne via provisioning (§7(a) suspicion correct)

- No code path defaults `displayName` to an email. `plan.ts` requires a non-empty `displayName` per
  manager and passes it verbatim; `cli.ts` writes it verbatim on both create and update.
- Therefore every email-shaped `displayName` in prod was **typed into the provisioning config** —
  the commissioner filled `displayName` with the member's email for people whose preferred name he
  didn't have, and validateConfig accepted it (non-empty is the only check).
- Corroboration from this checkout: the local gitignored `provision.config.json` (mtime 2026-06-10) is
  a 4-manager **dev** config (names "Sergio"/"Chele"/"Sergio2"/"Chele2", none email-shaped) — prod (9
  members per the committed allowlist constant in `seed-allowlist.ts`) was provisioned from a
  different config instance, unavailable to git. The code-level conclusion is unaffected: the only
  creation path is verbatim-from-config, so the prod config used emails.
- The self-serve rename (path #2) *could* also write an email but there is no reason to believe any
  member renamed themselves TO an email; it is the recurrence vector, not the origin.

## 3. Proposed data fix (NOT built)

### 3(a) Backfill

**What identity exists to backfill FROM (step-2 finding):** effectively nothing automatic.
`app_user.display_name` is nullable and **never written by any code path** (the mirror trigger writes
only id/email; no other writer exists — grep clean), so it is NULL for everyone. There is no team-name
field on `manager`, and invites are bare emails (`allowlist_email`). The only stable per-manager scalars
are `draft_slot` (1..N, the provisioning upsert key, immutable since draft) and `waiver_order_position`
(**mutable** — FAAB move-to-bottom + transition reseed — unusable as a label). This forces the product
decision: either the commissioner supplies real names, or the label is synthetic.

**Candidate backfill values** (unique-index constraint: values must be distinct per league,
case-insensitive):

1. **Real names supplied by the commissioner** (RECOMMENDED — 9-person friends league; Sergio knows
   everyone). Delivered as a committed constant map keyed by `draft_slot` in a one-off script (same
   pattern as `seed-allowlist.ts`: repo-reviewable constant, idempotent, `@app/db` Prisma direct).
2. **`Manager {draft_slot}`** fallback for any slot the commissioner leaves unnamed — stable, unique
   (draft_slot is unique per league), zero PII. This is the canonical un-named label; T15-13 §5's
   "ordinal must be threaded" concern disappears because the ordinal becomes the *stored value*.
3. Email local-part (e.g. `yader.rosales`) — REJECTED: still identifying, defeats the no-PII goal,
   collision-prone.
4. Do nothing + rely on self-rename — REJECTED: doesn't remove existing PII.

**Mechanism options:**
- **Preferred: one-off operator script** (`packages/db/scripts/` pattern) that updates ONLY
  `display_name` for rows matching the email shape, using the constant map with the `Manager {slot}`
  fallback. Small, reviewable, no other columns touched.
- **Viable but NOT recommended: corrected config + `provision provision` re-run.** The upsert's update
  branch (`cli.ts:119`) would refresh every displayName by draftSlot, and the waiver-order reseed is
  gated on `league.status === 'draft'` (`cli.ts:122`; live status is `playoff`) so it would be skipped,
  and `status` is create-only. BUT the re-run also updates the league row (name/timezone/
  faabBatchLocalTime/resultFreezeHours/draftPickSeconds) and upserts periods (kind/cutCount) and
  `isCommissioner` — a stale config field silently clobbers live settings mid-tournament. Too much
  blast radius for a rename.
- Plain SQL `UPDATE` run by the operator — acceptable, but the script version is reviewable + re-runnable.

**Count queries for the operator to RUN (not executed by this thread):**

```sql
-- 1. How many manager rows hold an email-shaped display_name (the backfill target set)?
SELECT count(*) FROM manager
WHERE display_name ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

-- 2. The rows themselves (to build the slot→real-name map):
SELECT draft_slot, display_name FROM manager
WHERE display_name ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
ORDER BY draft_slot;

-- 3. Is the stored email the member's own sign-in email (vs. an invite alias)?
SELECT count(*) FROM manager m JOIN app_user u ON u.id = m.user_id
WHERE lower(m.display_name) = lower(u.email);

-- 4. Collision pre-check for the fallback label (has anyone self-renamed to "Manager N"?):
SELECT count(*) FROM manager WHERE display_name ~* '^manager [0-9]+$';

-- 5. RESIDUAL (not fixed by the manager backfill — see §4): durable audit rows that
--    embedded email-shaped names into free text at write time:
SELECT count(*) FROM commish_audit
WHERE summary ~* '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+'
   OR detail  ~* '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+'
   OR reason  ~* '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+';
```

### 3(b) Ingestion guard (write-time; prevents recurrence)

One shared pure predicate, applied at BOTH writers found in §1:

- **Predicate:** `looksLikeEmail(value: string): boolean` — full-string email shape on the
  trimmed/whitespace-collapsed value (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). Full-string only: a name merely
  *containing* `@` stays legal (the validator's "real names have accents" ethos). Home:
  `packages/shared` (`@app/shared`) — already imported by both `apps/worker` (plan.ts) and `apps/web`.
- **Guard site 1 — provisioning:** `validateConfig` in `apps/worker/src/provision/plan.ts` (the pure,
  unit-tested layer): new error when `looksLikeEmail(m.displayName)` — message shape
  `manager <email> has an email-shaped displayName — use a real name or "Manager <slot>"`. Rejecting
  (not silently normalizing) is right here: the config is operator-authored and re-runnable; a loud
  error at plan time beats a silent rewrite.
- **Guard site 2 — self-serve rename:** `validateDisplayName` in
  `apps/web/src/manager/displayName.ts` — new reject reason `"email_like"` (result union gains it;
  route already passes `validated.reason` through as the 400 body). Blocks the recurrence vector.
- **Tests (TDD, RED first):**
  - `plan.test.ts`: config with `displayName === email` → error; email-shaped-but-different-address
    displayName → error; name containing a bare `@` (e.g. `n@cho`) → OK; existing valid configs → no
    new errors.
  - `displayName.test.ts`: `"a@b.co"` → `{ok:false, reason:"email_like"}`; `"  a@b.co  "` (trims
    first) → rejected; `"n@cho"` → ok; 40-char + empty behavior unchanged.
  - The predicate's own table test in `packages/shared`.
- NOT guarded: DB-level CHECK constraint — possible (`display_name !~* email-regex`) but a migration
  mid-tournament for a display column is over-engineering; the two app-level gates cover both writers.
  Note it as an option if a third writer ever appears.

## 4. Timing — live-mid-tournament vs post-tournament (~07-19)

**Verdict: safe to run LIVE, and live is preferable** (every day live shows emails to all members;
post-tournament the leak has already run its course).

Coupling evidence — `displayName` is display-only everywhere; nothing keys on it:

- All viewer/"You" checks compare **manager ids**, not names (e.g.
  `apps/web/app/waivers/loadWaivers.ts:320` `m.id === viewerManagerId`). All name maps are keyed by
  manager id with the name as value (`loadPlayoffs.ts`, `loadPlayers.ts:105`, autofire
  `loadTeamNames` at `apps/worker/src/autofire/prismaStore.ts:119-126`, commish
  `commishAdvanceStore.ts:38-40`).
- The only `displayName ===` comparisons in the tree are **Player/FifaTeam** lookups in the commish
  stat-correction search (`packages/commish-core/src/core.ts:59,85`) — different tables, unaffected.
- The unique index is the sole DB constraint: backfill values must be pairwise distinct (real names +
  `Manager {slot}` fallback satisfy it; query 4 above pre-checks collisions).
- **Fences unaffected (checked at source):** `verify-page-fit.mjs` builds a **synthetic HTML fixture**
  with hard-coded fake emails as width stressors (`:200-205`) and asserts on element bounds — it never
  reads the DB, so the stressor stays valid post-fix. `verify-the-cut.mjs`, `verify-players.mjs`, and
  `verify-playoffs-hero.mjs` contain no manager-name/email assertions (grep clean) — the-cut pins
  ghost-row class markers, players pins counts/structure. This also answers T15-13 §6's open
  playoffs-hero question for the *data* fix: no name text pinned.
- **No durable caches of names on the wire:** pages are SSR force-dynamic; draft is over (Realtime
  broadcast carries pick rows, names come from fresh snapshots); push payloads embed **player** names
  (`apps/worker/src/notify/prismaStore.ts:46`), not manager names.
- **One true residual:** `commish_audit.summary/detail/reason` are free text built via `nameOf` at
  write time (`packages/commish-core/src/advance.ts:88`, `advanceAudit.ts:47`, `trim.ts:86`; autofire
  threads the same map, `apps/worker/src/autofire/dispatch.ts:133`). Historical audit rows written
  while names were emails **keep the emails** after the manager backfill. Query 5 counts them; if
  nonzero, decide separately whether to scrub audit text (commissioner-only surface — T15-13 row 12 /
  N4-adjacent territory) — out of scope for the manager-row backfill.

## 5. Defense-in-depth render guard — recommendation (not built)

**Keep a thin secondary guard, demoted from T15-13's primary fix to belt-and-braces.** After the data
fix, T15-13's 12-site `safeManagerName()` render sweep is no longer *necessary* — but a minimal version
is still worth having because (a) historical `commish_audit` text and the `commishView.ts:372`
`name ?? email` AppUser fallback can still surface emails, and (b) it costs one shared helper. Shape:
apply `safeManagerName(displayName)` (email-shaped → `"Manager"`/neutral label) at the **loader
boundary** (the handful of `select { displayName }` mapping points), not at every JSX site — one choke
point per surface, no contract change. Priority: LOW, after backfill + guard land; it should almost
never fire, and a fence-free display helper can ship any time.

## 6. Recommended sequence (for the build thread — nothing started)

1. Operator runs queries 1-4 (and 5 for the residual count); builds the slot→name map with Sergio.
2. Guard first (3b — pure validators + tests; no DB risk), then backfill script (3a) — so the fixed
   data can't regress between steps.
3. Optional last: thin `safeManagerName` loader guard (§5) + audit-text scrub decision if query 5 > 0.
4. N3 and N4 proceed as planned in T15-13 §7 — unchanged by this thread.
