# Claude Code — Prompt 20: App Shell — ds.css global foundation + shell chrome

> Paste with the four brain files (PROJECT.md, ARCHITECTURE.md, DECISIONS.md, SCORING.md) + BRAND.md
> in the repo root, and Prompts 01–19 in place (**19 = landing visual re-skin, on main**). This is the
> first and foundational screen of the design sprint: it promotes the design system (`ds.css`) to a
> global import and builds the App Shell chrome. Every later screen skin sits on top of it.
>
> **Sequencing (cross-branch):** branch off **post-19 main**. This touches `apps/web/app/layout.tsx`
> (global ds.css import + the body surface), so it serializes after 19. **Canonical design source =
> the repo's committed `design/design_reference/`** (the complete, MD5-verified 94-file set). Do NOT
> pull designs from `~/Downloads`.

---

## Context (read first)
Read the Prompt-16/17/19 entries in PROJECT.md, ARCHITECTURE §1, and **BRAND.md §5** (where the brand
renders in the shell). Today: `ds.css` is imported **per-route** (4 sites — `draft/`, `lineup/`,
`vsfield/` layouts + `_landing/` via `page.tsx`); the only **global** stylesheet is `globals.css`
(Tailwind `@tailwind base/components/utilities`), and the root `<body>` carries Tailwind light classes
(`bg-slate-50 text-slate-900`). So Tailwind is the global layer; ds.css is a per-route overlay.

**Architecture decision this prompt executes (record in DECISIONS at thread close):** `ds.css` becomes
the **global** design system. **Tailwind / `globals.css` / Preflight stay (coexist)** — not retired
here. Known collisions: the body-surface specificity fight is **fixed in this prompt** (mandatory);
the `.gap-*` class-name overlap is **left as-is** (ds.css and Tailwind generate identical values; ds
wins by import order); migrating the bare auth pages off Tailwind and dropping Preflight are
**deferred** (auth skin = a later prompt; Preflight drop = post-sprint, only once nothing uses
Tailwind). A short half-ds look on `/sign-in` + `/auth/denied` is accepted.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Brain files win over this
prompt. Read surface/theme/token truth from **`design/design_reference/Design System.html`** and the
shell markup from **`design/design_reference/App Shell.html`** + **`design/design_reference/shell/`**
(7 files). Ambiguous detail → `// TODO(confirm):`; do not invent design values.

## Scope of THIS prompt
1. **Promote `ds.css` to a single global import** in the root layout (`apps/web/app/layout.tsx`),
   imported **after** `globals.css` so ds.css wins cascade ties. Consolidate to **one canonical
   `ds.css`** — it's byte-identical to the vendored `_landing/ds.css` (md5 `66d4bbbc…`); pick a tidy
   shared location (e.g. `apps/web/app/styles/ds.css`) or reuse the existing file, but exactly one copy
   imported globally. Do not duplicate or fork it.
2. **Fix the global body surface (mandatory).** Replace the root `<body>`'s Tailwind light classes
   (`bg-slate-50 text-slate-900`) with the ds **dark** surface per `Design System.html` /
   `App Shell.html` (the body element rule taking effect, or an explicit `data-theme` on
   `<html>`/`<body>` — match what ds.css uses). Verify a bare route renders dark and correct. Keep
   `min-h-screen antialiased` if still wanted.
3. **Build the App Shell chrome** per `App Shell.html` + `shell/` + `Design System.html`: the
   nav/header/layout frame, with **`<Brand/>`** (Prompt 18) placed per **BRAND.md §5** (trophy badge +
   "XI" + the league-name secondary line). Mount the shell so it wraps the **authenticated** screens
   (the hub `/` + `/draft` + `/lineup` + `/vsfield`) and **NOT** the landing/auth/marketing routes
   (`/sign-in`, `/auth/*`, the logged-out `/`). If this needs a shared **route-group layout** (e.g.
   `(app)/layout.tsx`) to scope the shell to authenticated routes, create it — but **wrap** the
   existing feature screens, do **not** refactor their internals. The shell's nav
   **supersedes/absorbs** the interim Prompt-17 cross-nav (`CrossNav`). **If absorbing `CrossNav` would
   require touching feature-screen structure beyond wrapping, STOP and flag** — don't refactor feature
   layouts to force it.

## Explicitly OUT of scope (leave seams intact)
- **Retiring Tailwind / dropping `globals.css` / Preflight** — coexists; teardown is post-sprint.
- **Migrating `/sign-in` + `/auth/denied` off Tailwind** — the next prompt. Half-ds look here is fine.
- **Re-skinning feature-screen bodies** (draft board, lineup pitch, vsfield standings) — each is its
  own later prompt. This prompt only sets the global surface + the shell that wraps them.
- **Feature-screen internal logic**, `selectLandingView`, auth/redirect/route/env/middleware, the
  `.gap-*` scale, admin/commissioner, any self-serve join flow.
- **De-duplicating the per-route ds.css imports** on the feature layouts (they double-load harmlessly).

## Tests — keep proportional
Vitest. `pnpm test` stays green — **no regression to `selectLandingView` or any existing test.** A
shell smoke is enough: the shell mounts without throwing and the Brand mark is present; the four
landing states still render their key affordance (sign-in CTA / hub nav + POST sign-out / unlinked /
denied); the feature routes still render within the shell. Don't over-test static markup or global CSS.

## Definition of done (verify these pass)
- `ds.css` imported **once, globally** in the root layout, **after** `globals.css`; exactly one
  canonical copy (no fork).
- The global `<body>` surface is the ds **dark** surface (collision A resolved); bare routes render
  dark and correct.
- The App Shell chrome renders per `App Shell.html` + `shell/`, `<Brand/>` per BRAND.md §5,
  **wrapping authenticated screens only** — the landing, `/sign-in`, `/auth/*` are **not** wrapped.
- Tailwind / `globals.css` / Preflight **retained**; the landing, feature screens, `/sign-in`, and
  `/auth/denied` all still render and function (the two auth pages may look half-ds — acceptable).
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter @app/web
  build` green; all routes keep their static/dynamic shape (`/` stays **`ƒ`**).
- No out-of-scope churn: no Tailwind retirement, no auth-page migration, no feature-body re-skin, no
  feature-logic / `selectLandingView` / auth / route / env edits.

## When done
Summarize: where the canonical `ds.css` now lives + that it imports globally after `globals.css`;
exactly how you fixed the body surface (classes removed, dark-surface mechanism); where the shell
mounts (root layout vs a route-group — name the file) and how it's scoped to authenticated routes
only; where `<Brand/>` sits; how `CrossNav` was absorbed (or flagged); confirmation Tailwind coexists
and the auth/landing/feature routes still render; the exact commands you verified; any `TODO(confirm):`
left. Report `git log --oneline -1` and `git status` post-commit; branch off post-19 main, conventional
commit, no force-push, **hold the merge for Chat's clearance.** Flag **Prompt 21 (sign-in / Join skin —
`/sign-in` + `/auth/denied` from `Join.html` + `auth/*`, migrating them off Tailwind)** as the next
step. Do **not** start the auth-page skin or any feature-body re-skin.