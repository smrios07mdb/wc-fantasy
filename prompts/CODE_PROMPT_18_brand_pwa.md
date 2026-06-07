# Claude Code — Prompt 18: Brand identity + PWA (manifest / icons / theme) + land the Brand component

> Paste into Claude Code with the four brain files in the repo root (PROJECT.md, ARCHITECTURE.md,
> DECISIONS.md, SCORING.md) **+ BRAND.md** (the design brand spec) and Prompts 01–17 in place
> (**17 = the shared cross-nav strip, on main**). This is the first of two Design-handoff integration
> prompts. **It wires the app's *identity* only — favicons, web manifest, theme-color, app metadata — and
> lands the `Brand` component so Prompt 19 can place it. It adds NO CSS and changes NO screen layout
> beyond the document `<head>` / metadata.**
>
> **Sequencing (cross-branch):** branch off **post-17 main** — 17, this prompt, and Prompt 19 all touch
> `apps/web/app/layout.tsx`, so they are serialized (17 → 18 → 19), not parallel. The *XI Brand Handoff*
> package files are **already vendored in the repo** (commit 1 on this branch) at the paths in Scope. If
> any listed file is missing, **STOP and flag** — do not regenerate or invent assets.

---

## Context (read first)
Read the Prompt-16/17 entries in PROJECT.md + ARCHITECTURE §1 (frontend) and **BRAND.md**. State of the
build: the app is functionally complete and **deliberately unstyled** — `/` is the auth-aware hub
(Prompt 16) and the three feature screens share a cross-nav strip (Prompt 17). Design has now delivered
the brand package. This prompt is the *identity* layer: wire the PWA manifest + favicon/app-icon set +
theme-color into the App Router metadata, and land the `Brand` component for later placement.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Reference the **static files in
`public/`** via Next's Metadata API; **do not hand-rewrite the manifest** or regenerate icons. No CSS,
no design-system import, no screen restyle — that is Prompt 19. Where this prompt and the brain files
disagree, the brain files win. If a detail is ambiguous (a metadata value, an asset path), read it from
**BRAND.md / the package README** or leave a `// TODO(confirm):` — do not invent brand values.

## Scope of THIS prompt
1. **Confirm the vendored assets are present** at:
   - `apps/web/public/site.webmanifest`
   - `apps/web/public/icons/` — `icon-maskable-512.png`, `icon-maskable-192.png`, `icon-512.png`,
     `icon-192.png`, `favicon-48.png`, `favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png`
   - `apps/web/public/brand/` — `trophy.png`, `parrot.png`, `icon-tile.png`

   If any is missing, **STOP and flag** (do not generate placeholders).
2. **Wire the App Router Metadata API in the root layout** (`apps/web/app/layout.tsx` — confirm this is
   the root layout; if it doesn't exist or already defines conflicting icon/manifest metadata, **STOP and
   flag**):
   - `metadata.icons` → the favicon set (16/32/48) + `192`/`512` + `apple-touch-icon`.
   - `metadata.manifest = '/site.webmanifest'`.
   - `themeColor` + `appleWebApp` (title / status-bar) and the app `title` — **use the values BRAND.md /
     the package README specify**, not guessed colors.
   Prefer referencing the `public/` files; do not duplicate them into `app/` or convert the manifest to a
   TS module.
3. **Sanity-check `site.webmanifest`** — confirm its `icons[]` paths (+ `start_url` / `scope` if present)
   resolve to the vendored files under `public/`. Fix **only** path mismatches; do not redesign the
   manifest, rename keys, or change the icon set.
4. **Land `Brand.tsx`** in the existing components directory — **confirm the convention first**
   (`apps/web/components/` vs `apps/web/src/components/`; `src/` is in use elsewhere) and place it there.
   Make it compile and export cleanly; ensure any asset references inside it resolve to the vendored
   `public/brand/*` (fix only path mismatches). **Do NOT mount it in any screen** — landing/header
   placement is Prompt 19's job. A trivial render smoke test is sufficient.

## Explicitly OUT of scope (leave seams intact)
- **Any CSS / design-system import** (`ds.css` / `landing.css`) and **any screen restyle** — that is
  **Prompt 19**. This prompt imports no stylesheet.
- **Placing `<Brand/>` into the landing, the nav strip, or any screen** — Prompt 19 places it.
- **The cross-nav strip (17, done), the hub `/` (16, done), the feature screens' internals.**
- **Routes / auth / env / middleware / `getSessionManager()` / the auth core** — no churn.
- **Admin surface; any self-serve join/league flow.**

## Tests — keep proportional
Vitest. `pnpm test` stays green — **no regression to `selectLandingView` or any existing test.** A trivial
`Brand` render/smoke (it mounts without throwing, exports as expected) is enough; do **not** over-test
static metadata or the manifest JSON.

## Definition of done (verify these pass)
- The web manifest, favicon/app-icon set, apple-touch-icon, maskable icons, and theme-color are wired via
  the **root-layout Metadata API** (BRAND.md values, not guessed); `site.webmanifest` icon paths resolve.
- `Brand.tsx` lands in the confirmed components dir, compiles, is exported, its asset paths resolve, and
  it is **NOT mounted** anywhere.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter web build`
  green; all six routes keep their current static/dynamic shape (`/` stays **`ƒ`**).
- No out-of-scope churn: **no CSS import, no screen-layout change** beyond metadata, no auth/route/env
  edits, no Brand placement.

## When done
Summarize: the metadata wired (icon sizes, `manifest`, `themeColor`, `appleWebApp`, title — and that the
values came from BRAND.md/README); any `site.webmanifest` path fixes; **where `Brand` landed** (exact dir)
and that it is unmounted; the smoke test; the exact commands you verified; any `TODO(confirm):` left.
Report `git log --oneline -1` and `git status` post-commit; branch off main, conventional commit, no
force-push, **hold the merge for Chat's clearance**. Flag **Prompt 19 (landing visual design — apply
ds.css + landing.css, place Brand)** as the next step. Do **not** start any CSS / landing work or place
the Brand component.
