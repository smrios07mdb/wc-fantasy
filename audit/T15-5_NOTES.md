# T15-5 thread notes — error/404/loading boundaries

Branch: `feat/error-loading-boundaries` (off `origin/main` @ `0508a7a`, isolated worktree). Merge:
**HOLD** — Sergio's merge gate per the thread brief. Fences: additive files only, zero edits to any
existing file, `packages/*` / T15-CUT / T15-2 surfaces byte-untouched.

Derive-status check (standing rule): `git ls-remote origin main` → `0508a7a0dfd2fc42f3e4020f414b5be9ebb1827d`
— matched the expected tip (the docs commit atop `c12427a`). No drift; branched here. Re-verified on the
follow-up confirmation round (same session, later): `origin/main` still `0508a7a`, and
`git merge-base --is-ancestor 0508a7a HEAD` on the feature branch confirms it as the direct parent of
`b32bbb8` — no rebase/drift between the two rounds.

## 0. Scope correction found before writing any code

The brief's finding text (F-P2-ERR1) and the audit's own §7 opener both say "Zero `loading.tsx`
anywhere," and F-P2-ERR1's own body additionally claims "13/13 pages export `dynamic='force-dynamic'`."
Both are now **stale** — the separate **NAV-LAT** thread (`a1eace3`, already on `main`) shipped
`loading.tsx` for every force-dynamic route but one.

**Correction to the audit's own route count, not just its "zero loaders" framing:** a fresh
`grep -rl "dynamic = \"force-dynamic\"" apps/web/app --include="page.tsx"` against the current tree
(re-run on the confirmation round, not assumed) returns **12** matches, not 13: `/`, `/commish`,
`/draft`, `/games/[matchId]`, `/lineup`, `/players`, `/playoffs`, `/pool`, `/settings`, `/standings`,
`/vsfield`, `/waivers`. The audit's own line-number citations for this finding (`games/[matchId]/
page.tsx:16`, `waivers/page.tsx:15`) don't match current source either (now `:23` and `:15`
respectively — waivers held, games drifted), consistent with the audit predating some later edit to
that file rather than a miscount on my part. I'm not aware of a 13th force-dynamic page ever existing
in this repo's history; flagging rather than adopting the "13" figure, per the standing "verify before
trusting a recalled/audited claim" rule — a requested correction that itself doesn't check out against
current source shouldn't be written into the docs as fact.

Of the verified 12: **11 already had a `loading.tsx` from NAV-LAT** before this thread — 10
layout-mounted route loaders (`/commish`, `/draft`, `/lineup`, `/players`, `/playoffs`, `/pool`,
`/settings`, `/standings`, `/vsfield`, `/waivers`, each a thin wrapper around a shared `RouteSkeleton`
component with 6 archetype variants — `list`/`pitch`/`cockpit`/`board`/`form`/`dashboard`) plus the home
route's own hand-mirrored-shell-chrome loader (`app/loading.tsx`, needed because `/` mounts
`<AppShell>` inside `page.tsx` rather than a `layout.tsx`). The **one gap** was `/games/[matchId]` — the
*other* route that mounts `<AppShell>` in `page.tsx` instead of a layout, so it wasn't swept by either
the layout-mounted routes' simple "just wrap `RouteSkeleton`" pattern or the home route's special-cased
file. F-P1-ERR1/F-P1-ERR2 (404/error boundaries) were **not** affected by NAV-LAT and remained fully
unbuilt as the audit describes.

Net effect on scope: F-P2-ERR1 closes with **one new file** (`app/games/[matchId]/loading.tsx`) instead
of twelve, following the existing NAV-LAT convention (specifically the home-route variant of it) exactly
rather than introducing a second pattern.

## 1. What was built (11 new files, all additive)

- `app/not-found.tsx` (F-P1-ERR1) — root 404. Renders inside the root layout (ds.css loaded), no
  AppShell (404s can hit before/without an authenticated nav context) — a single branded `.card` +
  "Back to Dashboard" `<Link href="/">`, per the brief's "no new nav logic" instruction.
- `app/games/[matchId]/not-found.tsx` (F-P1-ERR1) — scoped 404 for the `if (!view) notFound()` call in
  that route's `page.tsx`. Next resolves the *nearest* `not-found.tsx` in the segment tree, so this one
  wins for that call while the root file still covers unmatched URLs generally. Renders inside
  `GameDetailLayout`'s `.gd-host` wrapper (dark + cobalt already applied there).
- `app/_boundaries/BoundaryScreen.tsx` — the shared centered-card frame both 404s and `error.tsx` (but
  NOT `global-error.tsx`) use. Pure presentational, ds.css vocabulary only (`.card`, `.btn-primary`,
  `.t-h1`, `.t-label`, text-color utilities), `BrandMark` for the trophy mark.
- `app/error.tsx` (F-P1-ERR2) — root error boundary (`"use client"` per the Next contract), catches an
  uncaught exception in any route without its own `error.tsx`. Reuses `BoundaryScreen` + surfaces
  `reset()` as a "Try again" button alongside the dashboard link.
- `app/global-error.tsx` (F-P1-ERR2) — fires only when the root layout itself throws, and REPLACES it —
  so `layout.tsx`'s imports (ds.css, globals.css, AppShell) never execute. Deliberately
  self-contained: renders its own `<html>`/`<body>`, every style is an inline hardcoded value (colors
  copied from ds.css's dark tokens at time of writing — no `var(--...)`, since the custom properties
  don't exist in this tree), no `next/image`, no Google Fonts fetch (`system-ui` only). Pinned at the
  source level in `global-error.test.tsx` — the test reads the real file and asserts its only import is
  `react`, so a future edit reaching for `BoundaryScreen`/`Brand`/a stylesheet breaks the test instead
  of silently reintroducing the themeless crash page the finding describes.
- `app/games/[matchId]/loading.tsx` (F-P2-ERR1) — the one route NAV-LAT left uncovered. Same
  hand-mirrored-shell-chrome pattern as `app/loading.tsx` (the other shell-in-`page.tsx` route), reusing
  `RouteSkeleton`'s `pitch` variant (tab strip + hero band + big field block + legend chips — the
  closest existing archetype to the real scoreboard + pitch-halves shape). Since this route's active
  nav tab depends on an unreadable `?from=` searchParam, the skeleton highlights **"pool"** — the real
  page's own documented fallback when `from` is absent/unknown — an accepted cosmetic transient on the
  rare `?from=home`/`?from=vsfield` tap, same class as `app/loading.tsx`'s documented base-label
  transient. No new `RouteSkeleton` variant was added (additive-files-only fence).
- 5 test files: `not-found.test.tsx` (root + games), `error.test.tsx`, `global-error.test.tsx` (renders
  + the source self-containment pin), `games/[matchId]/loading.test.tsx`.

No existing file was edited. `RouteSkeleton.tsx`, `AppShell.tsx`, `crossNav.ts`, `shell.css`, `ds.css`
(all copies), T15-CUT / Theater surfaces are byte-untouched.

## 2. Verification

**Full DoD gate — green:**

| Stage | Result |
|---|---|
| `pnpm -w typecheck` | PASS (all 17 workspace packages) |
| `pnpm lint` | PASS (0 errors, 0 warnings — fixed 2 unused-eslint-disable warnings during the pass) |
| `pnpm format:check` | PASS (2 files reformatted with `prettier --write` during the pass, then clean) |
| `pnpm test` | PASS — **3329 passed / 104 skipped** (baseline 3314/104 + 15 new tests, exact match) |
| `pnpm --filter @app/web build` | PASS — all 12 authed routes still `ƒ` dynamic; `/_not-found` compiles `○` static (expected — no dynamic data) |

**Fence verifiers — all pass UNMODIFIED:**

| Verifier | Result |
|---|---|
| `verify-the-cut.mjs` | 43/43 |
| `verify-playoffs-hero.mjs` | 19/19 |
| `verify-players.mjs` | 14/14 (no local `.env` in this worktree — DB-gated 15th check SKIPs, matching the documented 14-vs-15 split) |
| `verify-shell-stacking.mjs` | 33/33 |
| `verify-nav-latency.mjs` | 48/48 |
| `verify-nav-link.mjs` | 14/14 |
| `verify-mobile-nav.mjs` | 75/75 |
| `verify-form-attrs.mjs` | 42/42 (local mode) |

**New tests (15, jsdom/RTL):**
- Root + games `not-found.tsx`: branded copy renders, link back to `/`.
- Root `error.tsx`: branded copy, `reset()` fires on button press, link back to `/`.
- `global-error.tsx`: (a) structural — branded copy, `reset()` fires; (b) source-level anti-drift — only
  import is `react`, no `ds.css`/`globals.css`/`var(--...)` reference in code, renders its own
  `<html>`/`<body>`.
- `games/[matchId]/loading.tsx`: mounts a real `RouteSkeleton` (`pitch` variant, not a spinner), static
  shell chrome (`.sh-topbar`/`.sh-btmnav`) present, "pool"/"Quiniela" highlighted as the fallback-active
  tab on both the desktop strip and the mobile bar.

**Screenshots** (360px viewport, real `ds.css`/`shell.css` in headless Chromium, captured via a
throwaway render script — deleted after use, not part of the deliverable): `app/screenshots/t15-5/` —
`404-root.png`, `404-games.png`, `error-boundary.png`, `global-error.png`, and one `loading-*.png` per
`RouteSkeleton` archetype (`dashboard`/`list`/`pitch`/`cockpit`/`board`/`form`) plus
`loading-games-matchid.png` for the new file specifically. (`apps/web/screenshots/` is gitignored, so
these aren't part of the diff — available in the worktree for review.) All 11 files present on disk,
re-confirmed on the follow-up confirmation round below.

## 2b. Confirmation round (same session, follow-up — no code changes)

Six items confirmed against the committed `b32bbb8` worktree; no fix was needed on any of them (item 1
was the only one with a plausible gap, and it turned out already closed):

1. **Root 404 escape.** `app/not-found.tsx` renders `BoundaryScreen`, which already includes a working
   `<Link href="/" className="btn btn-primary">Back to Dashboard</Link>` (`_boundaries/
   BoundaryScreen.tsx:69-71`) — a functional in-content route-back, independent of AppShell/bottom nav.
   `not-found.test.tsx` already asserts `getByRole("link", {name: /back to dashboard/i})` has
   `href="/"`. **No addition made** — this was already satisfied by the original delivery, not a gap.
2. **`reset()` in both boundaries.** `app/error.tsx:37-39` and `app/global-error.tsx:94-112` both render
   a `<button onClick={reset}>Try again</button>`. `error.test.tsx:19-24` and
   `global-error.test.tsx:58-63` each `fireEvent.click` the button and assert
   `expect(reset).toHaveBeenCalledTimes(1)`. Confirmed for both.
3. **`global-error.tsx` self-containment.** It does **not** render `BoundaryScreen` — it inlines its own
   markup entirely (no import of `_boundaries/BoundaryScreen`, `Brand`, or any `@/` module). Its only
   import is `react` (`global-error.test.tsx`'s source-level check, `imports.length > 0` +
   every specifier `=== "react"`). Since there is no `BoundaryScreen` (or any other local module) in the
   import graph at all, asserting global-error's own direct imports **is** asserting its full transitive
   graph here — there's no second hop to trace.
4. **`games/[matchId]/not-found.tsx` interception — build-level proof, not just render proof.** Ran
   `pnpm --filter @app/web build` fresh and inspected the compiled output:
   `grep -rl "Match not found" apps/web/.next/` returns exactly **one** file —
   `apps/web/.next/server/app/games/[matchId]/page.js` — and nowhere else in the build tree. Conversely
   `grep -rl "Page not found" apps/web/.next/server/app/` returns the root `_not-found.rsc`/`.html`
   bundle (plus `sign-in`/`auth/denied`, unrelated matches) and does **not** appear in
   `games/[matchId]/page.js`. This is Next actually compiling the scoped `not-found.tsx`'s content
   directly into that route's own server bundle, distinct from and not sharing the root 404's content —
   the concrete build artifact evidence that the segment-local boundary is wired to that route
   specifically, not merely "a `not-found.tsx` file exists that also happens to render."
5. **Derive-status, recorded.** See the top of §0 above — `origin/main` was `0508a7a` at both branch
   time and this confirmation round; re-verified via `git merge-base --is-ancestor` against `b32bbb8`.
6. **Gate + screenshots, restated (re-run fresh this round, not carried over):**

   | Stage | Result |
   |---|---|
   | `pnpm -w typecheck` | PASS |
   | `pnpm lint` | PASS (0 errors, 0 warnings) |
   | `pnpm format:check` | PASS |
   | `pnpm test` | **3329 passed / 104 skipped** (3433 total) — unchanged from the first round |
   | `pnpm --filter @app/web build` | PASS |
   | `verify-the-cut.mjs` | 43/43 |
   | `verify-playoffs-hero.mjs` | 19/19 |
   | `verify-players.mjs` | 14/14 (no local `.env`) |
   | `verify-shell-stacking.mjs` | 33/33 |
   | `verify-nav-latency.mjs` | 48/48 |
   | `verify-nav-link.mjs` | 14/14 |
   | `verify-mobile-nav.mjs` | 75/75 |
   | `verify-form-attrs.mjs` | 42/42 (local mode) |

   Screenshot set confirmed complete on disk (11 files, listed above): root 404, games 404, error.tsx,
   global-error.tsx, 6 `RouteSkeleton` archetypes, and the new games skeleton specifically.

## 3. Staged brain-docs section (not applied — HOLD)

Per CLAUDE.md, brain docs update as part of every feature; this thread holds the merge, so the docs
edit is staged here for Sergio to apply alongside the merge decision, mirroring the NAV-LINK precedent
(`audit/NAV_LINK_NOTES.md` → `PROJECT.md`/`DECISIONS.md`/`BACKLOG.md` entries applied at merge time).

**BACKLOG.md → T15 row, append after the T15-3 sentence:**

> **T15-5 DONE** (error/404/loading boundaries — branch `feat/error-loading-boundaries`, additive files
> only, HOLD): `not-found.tsx` (root + `/games/[matchId]`), `error.tsx` + self-contained
> `global-error.tsx`, and the one `loading.tsx` NAV-LAT's sweep left uncovered
> (`/games/[matchId]`, reusing `RouteSkeleton`'s `pitch` variant). Full DoD gate green (**3329**
> tests + web build) + all 8 fence verifiers unmodified (the-cut 43 · playoffs-hero 19 · players 14 ·
> shell-stacking 33 · nav-latency 48 · nav-link 14 · mobile-nav 75 · form-attrs 42 local). See
> `audit/T15-5_NOTES.md`.

**PROJECT.md → new dated entry** (`### 2026-07-05 — T15-5: error/404/loading boundaries`), body =
§§1–2 above condensed to the NAV-LINK-entry format (what changed, verification, fences held).

**DECISIONS.md → new dated entry**, recording the two judgment calls this thread made without a prior
explicit decision: (a) games-detail loading skeleton defaults its highlighted nav tab to "pool" (the
real page's own `?from=` fallback) rather than showing no active tab; (b) `global-error.tsx`'s
hardcoded color palette is a point-in-time copy of ds.css's dark tokens, not a live binding — a future
token change won't propagate here automatically, by design (self-containment > freshness for a crash
page).

### RESOLVED 2026-07-05 — Sergio confirmed T15-6 → T15-1 → T15-7, see SEQUENCE_T15_LAUNCH.md's 2026-07-05 ordering-resolution block.

### [historical] three-way T15 ordering conflict (not just a two-way one)

The first pass of this note flagged BACKLOG vs. SEQUENCE's table as a two-way conflict. On closer
reading, `SEQUENCE_T15_LAUNCH.md` disagrees with **itself**, so this is a three-way conflict. All three
statements, quoted verbatim:

1. **`audit/SEQUENCE_T15_LAUNCH.md` Window-A table** (lines 43–48, part of the doc adopted 2026-07-04
   per its own header):
   > A4 — T15-6 — time truth (promoted) … `TODO`
   > A5 — T15-5 — error/404/loading boundaries … `TODO`
   > A6 — T15-7 — rulebook truth (/scoring) … `TODO`
   > A9 — T15-1 — 360-conditional P0 hotfixes (demoted) … `TODO`
   → order: **T15-6 → T15-5 → T15-7 → … → T15-1 (last)**.

2. **`audit/SEQUENCE_T15_LAUNCH.md` line 23**, under "Derived-status corrections (2026-07-05)" — dated
   *later* than the table above and explicitly self-labeled unchanged:
   > **Remaining Window A order UNCHANGED:** T15-3 → T15-1 → T15-5 → T15-7, with **T15-6 promoted** and
   > T15-13 still `PROPOSED` (gated on Sergio accepting the thread).
   → order: **T15-1 → T15-5 → T15-7** (T15-6 "promoted" but not placed in the sequence by this line).

3. **`BACKLOG.md`'s T15 row** (the sentence appended by `0508a7a`, the T15-3 close-out docs commit):
   > **Remaining order:** T15-1 (360-conditional) → T15-5 → T15-7; **T15-6 promotion flagged** (step 58
   > live-confirmed); T15-13 proposed.
   → order: **T15-1 → T15-5 → T15-7** (matches #2, not #1).

So #2 and #3 agree with each other (T15-1 early, ahead of T15-5/T15-7) and both disagree with #1 (T15-1
demoted to last). #2 is the newest-dated statement and self-labels "UNCHANGED" — so #1's table is not
automatically the canonical one just because it's the more detailed artifact; it's possible #2/#3 are
the intentional, later call and the table simply wasn't edited to match. Against that: the audit's own
substantive rationale points the other way — §6c is what demotes T15-1 to 360-conditional (i.e.,
*only if the device screen width warrants it*, not an unconditional priority item), and §6f/step-58 is
what promotes T15-6 (a live-confirmed FAIL), and the table (#1) is the one place that actually encodes
both of those moves into a concrete slot order. #2/#3 mention the same two facts ("T15-1
360-conditional," "T15-6 promoted") without acting on them positionally — T15-6 isn't even placed in
line 23's sequence, and T15-1 sits first despite being the "demoted, conditional" item in the same
sentence. That reads more like the ordering clause not being updated when the promoted/demoted facts
were added, than like a deliberate re-prioritization.

I did not find an explicit Sergio decision reconciling these three. If Sergio adopts the table order
(#1), **both** #2 (SEQUENCE line 23) **and** #3 (BACKLOG) need correcting — the BACKLOG-only fix
originally staged above is incomplete on its own. Proposed correction, applied to both docs together:

> **Remaining order:** T15-6 → T15-5 (this thread) → T15-7 → T15-1 (360-conditional, demoted); T15-13
> proposed.

Not editing BACKLOG.md or SEQUENCE_T15_LAUNCH.md — both are pre-existing files outside this thread's
additive-only fence. Sergio: confirm (I'll fold the matching edit into both docs at merge time) or
strike if #2/#3's order was the intentional, later call and the table is what's stale.
