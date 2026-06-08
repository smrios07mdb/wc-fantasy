# Claude Code — Prompt 21: Sign-in / Join skin — `/sign-in` + `/auth/denied` off Tailwind

> Paste with the four brain files (PROJECT.md, ARCHITECTURE.md, DECISIONS.md, SCORING.md) + BRAND.md
> in the repo root, and Prompts 01–20 in place (**20 = App Shell + global ds.css, on main**, merge
> `b135cac`). Second screen of the design sprint. Branch off **post-20 main**.
>
> **Canonical design source = the repo's committed `design/design_reference/`** (the full app set).
> Read the sign-in/Join screen from **`design/design_reference/Join.html`**, the auth component set
> from **`design/design_reference/auth/*`**, tokens from **`Design System.html`** (already global via
> Prompt 20's ds.css), and the brand-splash reference from **`XI Brand.html`** → "Launch splash". Do
> NOT pull designs from `~/Downloads` (that bundle was landing-only). Ambiguous detail →
> `// TODO(confirm):`; do not invent design values.

## Context (read first)
Read the Prompt-20 entry in PROJECT.md/DECISIONS.md, **BRAND.md §5** (the "Auth / Join" row), and
ARCHITECTURE §1.

Prompt 20 promoted `ds.css` to the global design system and set the global `<body>` to the ds **dark**
surface, but **deliberately left `/sign-in` + `/auth/denied` on bare Tailwind** with only a minimal
text-color legibility repair (`text-slate-600→400` on descriptions, `text-slate-700→300` on the
sign-in status line) so their copy was readable on the now-dark body. **This prompt does the real
migration:** re-skin those two routes off Tailwind onto ds, per `Join.html` + `auth/*`. The Prompt-20
legibility repair is a stopgap — **remove/supersede it** (full ds replaces it).

These two routes are **not** wrapped by the App Shell (Prompt 20 scoped the shell to authenticated
screens only — `/sign-in` + `/auth/*` stay shell-free), and **that boundary holds**: the auth screens
are full-bleed split-layout splash screens whose brand comes from their **own brand panel**
(`AuthLogo` / `LockupStacked`), **not** the shell topbar. **Do not wrap these routes in `AppShell`.**

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Brain files win over this prompt.

**Architecture this prompt advances (record in DECISIONS at thread close):** `/sign-in` + `/auth/denied`
join the **ds-only set** (alongside the Prompt-19 landing and the Prompt-20 shell). **Tailwind /
`globals.css` / Preflight stay global** (other unmigrated screens still use Tailwind) — **no teardown
here**; the Preflight drop remains post-sprint, only once nothing uses Tailwind.

## Scope of THIS prompt
1. **Re-skin `/sign-in` off Tailwind onto ds**, per `Join.html` + `auth/*` + BRAND.md §5: the split
   layout (brand-panel splash + form column), brand panel = **`LockupStacked`** (trophy over **"XI"**
   over tagline) with the **`{league} · {season}`** row per BRAND.md §5. Skin **every state** of the
   magic-link flow — the email-input state, the submitted/"check your email" confirmation, and any
   validation/error display — **preserving their behavior, the server action / POST wiring, and the
   `next` / `safeNextPath` passthrough exactly.** Appearance changes; logic does not. Follow the
   design's **responsive** behavior (the split collapses/stacks on mobile per `Join.html`); don't
   break narrow viewports.
2. **Re-skin `/auth/denied` off Tailwind onto ds**, consistent with the auth chrome (same split layout
   / brand panel), with the denied messaging + its existing affordance (e.g. back-to-sign-in / contact
   link) in the content slot. If `auth/*` specifies an explicit denied variant, follow it; else derive
   it consistently from the auth chrome and mark `// TODO(confirm):`.
3. **Reuse the brand + auth components** — pull `LockupStacked` / `BrandBadge` / `Wordmark` from the
   Prompt-18 brand set (`@/components/Brand`) and the auth pieces from `auth/*` (`AuthLogo` + brand
   rows). **Reuse, don't rebuild** the trophy/wordmark. If the splash needs a lockup Prompt 18 didn't
   build, **compose it from the existing brand primitives** (per BRAND.md §4) rather than re-drawing
   the mark — and flag it.
4. **Port the auth-screen styles** following the established convention — a route-scoped stylesheet
   alongside the routes (like `shell.css` / the feature layouts), layered on the global ds.css token
   base. **Do not fork or duplicate ds.css.**

**The one color rule (BRAND.md §1):** gold lives **only** inside the trophy mark. The brand panel's
trophy is gold (fine); **"XI", the tagline, the league row, the form CTA, links, and all chrome are
NOT gold** — the functional accent is cobalt `#4D8DFF` (the ds accent token). The sign-in CTA uses the
ds accent, not gold.

**League/season source:** use the **same league-name source the Prompt-20 shell uses** (the
`"WC Fantasy League"` placeholder); season = the World Cup year. **Do not** introduce a new
league-name source or wire `SHELL_LEAGUE_NAME` here — that env swap is a separate COMPONENT_MAP §0 task.

## Explicitly OUT of scope (leave seams intact)
- **Any auth logic.** No edits to the magic-link request/callback, the email allowlist check,
  `getSessionManager()`, `safeNextPath` / the `next` param, `selectLandingView()`, the redirect flow,
  or the four-way state distinction (**unlinked ≠ denied** stays intact). Presentation only.
- **The `/`-rendered states** (marketing / hub / **unlinked** / denied branches at the root, via
  `selectLandingView`). The marketing landing is already skinned (Prompt 19); the hub got the shell
  (Prompt 20). **Do not touch `page.tsx` / `selectLandingView`.** See the early-warning seam below.
- **Wrapping the auth routes in `AppShell`** — they stay shell-free (Prompt 20 boundary).
- **Other `/auth/*` routes** (the magic-link callback, etc.) — logic handlers, not skinned here. If one
  has a visible UI state that's broken on the dark body, **flag it, don't expand scope.**
- **Tailwind / `globals.css` / Preflight teardown** — coexists; teardown is post-sprint.
- **Feature-screen bodies** (Draft / Lineup / Vs-the-Field) and the richer shell-chrome seams
  (bell / avatar / commissioner / mobile tab-bar) — each is its own later prompt.

## Early-warning seam (STOP and flag, don't expand)
If `/auth/denied` and the root's `selectLandingView` "denied" branch **already share a component**,
skinning that shared component covers both — fine, in scope. **But** if the denied (or unlinked) state
renders **only** as a `page.tsx` / `selectLandingView` branch and can't be skinned without editing
that branch, **do NOT touch `page.tsx` / `selectLandingView`** (locked from Prompt 20): skin the
`/sign-in` + `/auth/denied` **routes** only, and **flag the `/`-rendered auth-state skins as a
follow-up**. Likewise, if porting the auth skin would require touching shell or feature internals,
**STOP and flag.**

## Tests — keep proportional
Vitest. `pnpm test` stays green — **no regression to the auth tests, `safeNextPath`,
`selectLandingView`, `getSessionManager`, or any existing test.** A light smoke is enough: `/sign-in`
renders its key affordance (the magic-link email input + submit) and the submitted/confirmation state
renders; `/auth/denied` renders its denied message + affordance; the brand mark is present on both.
Don't over-test static markup or ds classes.

## Definition of done (verify these pass)
- `/sign-in` + `/auth/denied` re-skinned per `Join.html` + `auth/*` + BRAND.md §5 — split layout,
  `LockupStacked` brand panel, `{league} · {season}` row — and **off Tailwind** (the Prompt-20
  `text-slate-*` legibility repair removed/superseded; these routes' own styling is ds, not Tailwind
  utilities).
- All auth **function preserved**: magic-link request + the submitted/confirmation state,
  validation/error display, the `next` / `safeNextPath` passthrough, and the denied affordance all
  still work; **no edits to auth logic / `selectLandingView` / `getSessionManager` / callback /
  redirect / allowlist**.
- Brand correct: trophy + **"XI"** + `{league} · {season}`; **gold only in the trophy mark**, "XI" =
  `--text-primary`, CTA/links/chrome use the cobalt accent, **no gold leak**. Brand components reused
  (not re-drawn).
- Auth routes **not** wrapped in `AppShell` (shell-free, Prompt 20 boundary holds). One canonical
  ds.css, not forked; auth styles route-scoped on top of it.
- Tailwind / `globals.css` / Preflight **retained globally**; the landing, hub/shell, and feature
  screens all still render and function unchanged.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter @app/web
  build` green; `/sign-in` + `/auth/denied` keep their current static/dynamic shape (they're **`○`** —
  keep them `○`); `/` stays **`ƒ`**.
- No out-of-scope churn: no auth-logic / `selectLandingView` / route / redirect / env edits, no shell
  wrapping of auth routes, no Tailwind teardown, no feature-body re-skin, no `page.tsx` edits.

## When done
Summarize: which files you re-skinned and where the auth styles live (route-scoped stylesheet name +
that it layers on global ds.css, no fork); exactly how you migrated each route off Tailwind (and that
the Prompt-20 legibility repair is gone); which brand/auth components you reused vs composed (and any
lockup you had to compose from primitives); how the `/sign-in` states + the denied affordance are
preserved; confirmation the auth routes stay shell-free and the `next` / `safeNextPath` passthrough is
intact; whether the denied/unlinked `/`-rendered states share a component (skinned) or were flagged as
a follow-up; confirmation Tailwind coexists and the landing/hub/feature routes still render; the exact
commands you verified; any `TODO(confirm):` left. Report `git log --oneline -1` and `git status`
post-commit; branch off post-20 main (suggested `feat/auth-skin`), conventional commit, no force-push,
**hold the merge for Chat's clearance.** Flag **Prompt 22 (first feature-body re-skin — Draft, from the
`design_reference/` Draft screen)** as the next step. Do **not** start any feature-body re-skin or push.