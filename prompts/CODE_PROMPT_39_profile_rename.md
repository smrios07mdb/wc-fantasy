# Claude Code — Prompt 39: Self-service display-name rename (`/settings` profile + `POST /api/manager/display-name`)

> Paste with the four brain files (PROJECT.md, ARCHITECTURE.md, DECISIONS.md, SCORING.md) + BRAND.md in
> the repo root, Prompts 01–38 on main. Branch off current main: `feat/profile-rename`.
> Touches ONLY: one new pure helper + its test (`apps/web/src/manager/`), one new API route
> (`app/api/manager/display-name/route.ts`), one new minimal route (`app/(…)/settings/`), one additive
> raw-SQL migration (functional unique index), the AppShell avatar-menu Settings seam, and the four brain
> files. NO engine, NO scoring, NO draft/lineup/vsfield surface, NO worker, NO new env, NO Realtime/
> publication change, NO new name columns.

## Context (read first)

Read **ARCHITECTURE §4** (the `manager` table — `display_name` is TEXT NOT NULL and the ONLY manager
name field; there is no `team_name`/`handle` column — those exist only in the `design/.../settings`
mock and are explicitly OUT of scope here), **ARCHITECTURE §1** (ds.css ↔ Tailwind coexistence + the
AppShell boundary), the **DECISIONS → App Shell** entry (the live nav lists only the built routes;
Settings/Notifications/Commissioner/etc. are `TODO(confirm)` seams pointing at unbuilt screens — this
prompt converts the *Settings* seam into a real, minimal route and nothing else), and **BRAND.md §1**
(the one color rule — no gold; accent only marks "you" + primary actions).

Reuse, do not re-invent, the existing auth/authz primitives: the pure `canActAsManager({ … , scope:
"self" })` assertion and `getSessionManager()` / `requireManager()`, and the **edge pattern in
`apps/web/src/draft/handlePick.ts`** (resolve manager → assert self → mutate; reject 401 no-session /
403 not-your-manager BEFORE the mutation). The rename route is the same shape with a different mutation.

**Reconcile against current main first.** Project knowledge here only reflects up to Prompt 32. If a
later prompt already created a `/settings` route, added a `team_name`/`handle` column, or added a
manager-profile API, **STOP and report** what exists before building — do not duplicate or fork it.

Guiding constraint, non-negotiable: **boring and reliable over clever.** Brain files win over this prompt.

---

## Decision being implemented (single theme)

`display_name` is the one user-editable identity. A manager may rename **only themselves**, at any phase
(including mid-draft), via a minimal Settings → Profile surface. Names are **case-insensitively unique
within a league**. No new name fields; team-name/@handle remain prototype-only.

---

## Scope (all boring/reliable; server is authoritative)

### 1. Pure validation/decision helper — `apps/web/src/manager/displayName.ts` (+ test)
A DB/Supabase-free pure function (mirrors the `@app/scoring` / `handlePick` pure-core pattern), unit-
testable with no IO:

```ts
export type DisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too_long" };

export function validateDisplayName(raw: string): DisplayNameResult;
```

Rules: trim leading/trailing whitespace; collapse internal runs of whitespace to single spaces;
reject empty-after-trim (`"empty"`); cap length at **40** chars after normalization (`"too_long"`).
No charset restriction beyond that (real names have accents, apostrophes, etc. — do NOT strip them; the
`handle`-style `[^a-z0-9_]` filter from the mock does NOT apply, there is no handle here). Uniqueness is
NOT decided here (it needs the DB) — it is enforced at the index + mapped at the route.

### 2. API route — `app/api/manager/display-name/route.ts` (`POST`)
Same edge shape as `handlePick`:
1. Resolve `getSessionManager()`. No session → **401**.
2. The body carries the new name only; the **target manager is always the session manager** — assert
   `canActAsManager({ sessionManagerId, targetManagerId: sessionManagerId, isCommissioner, scope:
   "self" })`. (Self-only; there is no commissioner "rename another manager" path in this prompt.)
3. `validateDisplayName(body.name)` → on `!ok`, **400** with the reason.
4. Update `manager.display_name` for the session manager via the existing Prisma client. **Write ONLY
   `manager.display_name`** — do NOT touch `app_user.display_name` (separate, vestigial field; leave it).
5. Map a Postgres unique-violation (code `23505`) from the index in step 3-below → **409**
   `{ error: "name_taken" }`. Success → **200** with the normalized name.

### 3. Migration — additive functional unique index (raw SQL)
Project convention puts cross-row invariants in a raw-SQL migration (cf. the `roster_player` partial
unique index). Add:

```sql
-- Prompt 39: a manager's display_name is case-insensitively unique within its league.
CREATE UNIQUE INDEX "manager_league_id_lower_display_name_key"
  ON "manager" ("league_id", lower("display_name"));
```

If creation **fails on existing duplicates**, STOP — do not auto-rename anyone; surface the colliding
rows in your summary as an **operator decision** (this is data, not code). Regenerate the Prisma client;
the index is enforcement-only (no schema-model field change needed — note it in `schema.prisma` as a
`/// Prompt 39:` comment near the model if you add no `@@` mapping, so it's discoverable).

### 4. Minimal `/settings` route — profile name edit ONLY
- Route lives **inside the AppShell** (same mounting as `/draft` `/lineup` `/vsfield`; per-layout, not a
  route group — match the existing pattern, no directory moves). Server-rendered, auth-gated via
  `getSessionManager()` (no manager → the existing unlinked/denied handling, same as other gated routes).
- Renders **one** section: a `SubCard` "Public profile" containing a single `Field` "Display name"
  pre-filled with the current name, a primary **Save** button, and a "changes saved" / error toast.
  Reuse ds.css `SubCard`/`Field`/`.btn`/`.btn-primary`/`.toast`/`.alert` styling from the design
  reference — copy the minimal CSS you need into a scoped `settings.css` that layers on ds.css (do NOT
  fork ds.css). No gold; Save is the only accent element (BRAND §1).
- The form is a **small client island** that POSTs to `/api/manager/display-name`, shows the inline
  error on 400/409 (`name_taken` → "That name is taken in your league."), and on 200 updates the field +
  shows the saved toast. Keep JS minimal; everything else on the page is server-rendered.
- **Build ONLY the profile-name section.** Do NOT build Account, Notifications, Appearance, League, or
  Danger sections — leave them as explicit `TODO(confirm)` seams (same treatment the AppShell already
  uses). This is a deliberately thin route, not the full 6-section Settings surface.

### 5. Wire the AppShell Settings seam
The avatar menu / More entry for **Settings** is currently a `TODO(confirm)` seam → point it at
`/settings`. Touch ONLY that one entry; leave every other seam (Notifications, Commissioner, Waivers,
Playoffs, Box Score) untouched and still flagged.

---

## Hard constraints
- **No new name columns.** `team_name` / `handle` are not added. If the product later wants them, that
  is a separate migration + rendering theme.
- **Self-only.** No commissioner-renames-another path.
- **No Realtime change.** A rename propagates to other clients on their next server render / navigation;
  do NOT add `manager` to a `postgres_changes` publication (scope creep + the documented RLS-publication
  trap). Note the propagation behavior in your summary; it is acceptable (a rename is not time-sensitive
  like a pick).
- **No churn** to the scoring engine, recompute, draft/lineup/vsfield surfaces, worker, ingestion,
  middleware, or any other API route.

---

## Explicitly OUT of scope
- The other five Settings sections (Account / Notifications / Appearance / League / Danger).
- Team name, @handle, favorite-team flag, bio, avatar — all prototype-only.
- Commissioner-side rename of other managers; any admin surface.
- Live Realtime propagation of renames; any publication/RLS edit.
- Deploy, seeding, provisioning.

---

## Tests
`pnpm -w typecheck && lint && format:check && test` + `pnpm --filter web build` all exit 0. Required:
- **Pure helper** (`displayName.test.ts`): trims; collapses internal whitespace; rejects empty/
  whitespace-only (`"empty"`); accepts a 40-char name; rejects 41 (`"too_long"`); preserves accents/
  apostrophes/non-ASCII.
- **Route handler**: 401 (no session); 403 (self-assert path — exercise via the reused `canActAsManager`
  contract, mirroring `handlePick`'s test); 400 (invalid name, each reason); 200 (valid → normalized
  name returned + `manager.display_name` updated); 409 mapping from a simulated `23505`.
- **Migration smoke**: the unique index exists and a second manager in the same league cannot take an
  existing name differing only in case; the SAME name is fine across different leagues.
- Light smoke that `/settings` renders the profile field pre-filled and the Settings nav entry resolves
  to `/settings`. Do NOT over-test static markup or ds class names.

Note (test shim): per the known plain-Postgres shim gap (`auth.uid()` stubbed text-returning), any RLS
self-test here is advisory — the load-bearing self-check is the `canActAsManager` assertion at the
route, which is pure and fully tested. Flag anything only verifiable on the live Render deploy (the
actual avatar-menu link, the toast, cross-client propagation) as an **inference to confirm**.

---

## Brain-file updates (you do these on this branch — part of the handoff)
- **DECISIONS.md** — new entry: `display_name` is the single user-editable manager identity (team_name/
  handle remain prototype-only and why); self-only rename; case-insensitive per-league uniqueness via a
  raw-SQL functional index (+409 mapping); the Settings seam is now a real *minimal* route (profile-only;
  other sections still deferred and why).
- **PROJECT.md** — Prompt 39 entry in the running log (what shipped, the new route + API + index, test
  delta, the Realtime-propagation caveat, branch/merge note).
- **ARCHITECTURE.md** — §4: `manager.display_name` is now user-editable + the new per-league case-
  insensitive uniqueness invariant (raw-SQL index). §1 (or the routes section): the new `/settings`
  route (minimal, AppShell-mounted) + the `POST /api/manager/display-name` route + which auth primitives
  it reuses. Update the Settings seam status (was TODO → minimal route exists; remaining sections still
  seams).
- **SCORING.md** — **untouched**; state explicitly in your summary that scoring is unaffected.

---

## Definition of done
- [ ] `validateDisplayName` pure helper + test (all cases above) green.
- [ ] `POST /api/manager/display-name` — 401/403/400/200/409 paths, self-only, writes only
      `manager.display_name`.
- [ ] Raw-SQL functional unique index migration applied; Prisma client regenerated; no existing-dup
      failure (or surfaced as an operator note if it does).
- [ ] Minimal `/settings` route (profile-name section only) renders inside AppShell, auth-gated,
      pre-filled, with save/error toast; other sections left as flagged seams.
- [ ] AppShell Settings seam points at `/settings`; all other seams untouched.
- [ ] Full gate + `pnpm --filter web build` exit 0; `/settings` builds dynamic (`ƒ`), gated like peers.
- [ ] Four brain files updated as above (SCORING untouched).
- [ ] No out-of-scope churn (engine/scoring/draft/lineup/vsfield/worker/ingestion/other-routes/Realtime
      all untouched).

---

## When done
Summarise: the exact new files + the one AppShell line changed; the pure-helper signature + which cases
are tested; the route's status-code map and that it writes only `manager.display_name` (not
`app_user.display_name`); the migration SQL verbatim + whether any existing duplicates were found
(operator note if so); confirmation `/settings` is server-rendered, AppShell-mounted, auth-gated, and
that only the profile section was built (other sections still seams); the Realtime-propagation caveat
(renames appear on next render, no publication change); explicit confirmation scoring/engine/draft/
lineup/vsfield/worker are untouched; which items are live-deploy-only inferences to confirm. Report
`git log --oneline -1` and `git status` post-commit. Branch `feat/profile-rename` off current main,
conventional commits, no force-push. **Hold the merge for Chat's clearance. Do not start the next prompt.**
