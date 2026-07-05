# T15-5 thread notes — error/404/loading boundaries

Branch: `feat/error-loading-boundaries` (off `origin/main` @ `0508a7a`, isolated worktree). Merge:
**HOLD** — Sergio's merge gate per the thread brief. Fences: additive files only, zero edits to any
existing file, `packages/*` / T15-CUT / T15-2 surfaces byte-untouched.

Derive-status check (standing rule): `git ls-remote origin main` → `0508a7a` — matched the expected tip
(the docs commit atop `c12427a`). No drift; proceeded.

## 0. Scope correction found before writing any code

The brief's finding text (F-P2-ERR1) and the audit's own §7 opener both say "Zero `loading.tsx`
anywhere." That's now **stale** — the separate **NAV-LAT** thread (`a1eace3`, already on `main`) shipped
`loading.tsx` for **11 of the 12** force-dynamic routes (`/`, `/commish`, `/draft`, `/lineup`,
`/players`, `/playoffs`, `/pool`, `/settings`, `/standings`, `/vsfield`, `/waivers`), reusing a shared
`RouteSkeleton` component (`app/shell/RouteSkeleton.tsx`) with 6 archetype variants (`list`/`pitch`/
`cockpit`/`board`/`form`/`dashboard`). The **one gap** left uncovered was `/games/[matchId]` — it mounts
`<AppShell>` inside `page.tsx` (not a `layout.tsx`, same reason `/` needs its own hand-mirrored shell
chrome in `app/loading.tsx`), so it wasn't swept by the other 11 routes' simpler "just wrap
`RouteSkeleton`" pattern. F-P1-ERR1/F-P1-ERR2 (404/error boundaries) were **not** affected by NAV-LAT
and remained fully unbuilt as the audit describes.

Net effect on scope: F-P2-ERR1 closes with **one new file** (`app/games/[matchId]/loading.tsx`) instead
of twelve, following the existing NAV-LAT convention exactly rather than introducing a second pattern.

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
these aren't part of the diff — available in the worktree for review.)

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

### [SERGIO TO CONFIRM OR STRIKE] — BACKLOG.md T15-row ordering line

`BACKLOG.md`'s T15 row currently ends: *"**Remaining order:** T15-1 (360-conditional) → T15-5 →
T15-7; **T15-6 promotion flagged** (step 58 live-confirmed); T15-13 proposed."* — this line entered via
`0508a7a` (the T15-3 close-out docs commit).

That **contradicts** `audit/SEQUENCE_T15_LAUNCH.md`'s own Window-A table (lines 43–48), which orders
**A4 T15-6 → A5 T15-5 → A6 T15-7 → … → A9 T15-1** — i.e. T15-6 promoted ahead of everything and **T15-1
demoted to LAST** (A9), not first. The BACKLOG prose line puts T15-1 *before* T15-5, the opposite of the
SEQUENCE doc's explicit demotion.

I did not find an explicit Sergio decision reordering T15-1 back ahead of T15-5/T15-7 between the
SEQUENCE doc (which already reflects the demotion) and `0508a7a` landing. Flagging per the standing
"status is derived, not narrated" rule rather than silently trusting either doc. Proposed correction —
restore BACKLOG's line to match SEQUENCE:

> **Remaining order:** T15-6 → T15-5 (this thread) → T15-7 → T15-1 (360-conditional, demoted); T15-13
> proposed.

Sergio: confirm this correction (I'll fold it into the merge-time BACKLOG edit above) or strike it if
the BACKLOG line was intentional and SEQUENCE is what's stale.
