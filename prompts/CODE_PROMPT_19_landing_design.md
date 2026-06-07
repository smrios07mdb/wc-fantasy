# Claude Code — Prompt 19: Landing visual design — apply ds.css + landing.css to `/`, place the Brand mark

> Paste into Claude Code with the four brain files in the repo root (PROJECT.md, ARCHITECTURE.md,
> DECISIONS.md, SCORING.md) **+ BRAND.md** and Prompts 01–18 in place (**18 = brand/PWA metadata + the
> landed `Brand` component, on main**). This is the second Design-handoff integration prompt: re-skin the
> Prompt-16 landing `/` to the delivered design, **as a purely visual re-skin** — the auth/branch logic is
> untouched.
>
> **Sequencing (cross-branch):** branch off **post-18 main** — this prompt and Prompt 18 both touch
> `apps/web/app/layout.tsx` (18 added metadata; this adds the global CSS import). The
> *design_handoff_landing* package files are **already vendored** (commit 1 on this branch). If any is
> missing, **STOP and flag**.

---

## Context (read first)
Read the Prompt-16 entry in PROJECT.md (the four-state landing + `selectLandingView`), ARCHITECTURE §1,
and **BRAND.md**. **Architecture decision to honor:** ARCHITECTURE §1 *named* Tailwind, but the app was
built deliberately unstyled and **Design delivered the system as plain CSS** — `ds.css` (the global design
system: tokens / reset / shared components) + `landing.css` (landing-specific). Per **"boring and reliable"
and the launch deadline, consume the CSS exactly as delivered — do NOT re-translate it to Tailwind.** (This
amends the ARCHITECTURE "Tailwind" line; record it in DECISIONS at thread close.)

**First, confirm the current root-layout styling baseline** — is a global stylesheet (Tailwind / a
`globals.css`) already imported in `apps/web/app/layout.tsx`? Does anything reset or tokenize globally
today (e.g. the `app/draft/flags.ts` country-chip CSS)? **If importing `ds.css` would collide** — a double
reset, token / class-name clashes, or it visibly breaks the Prompt-17 nav strip or the auth pages —
**STOP and flag before proceeding.** Do not silently fight an existing global stylesheet.

Where this prompt and the brain files disagree, the brain files win. Ambiguous → `// TODO(confirm):`; do
not invent product rules (in particular, do **not** add a self-serve join-the-league flow).

## Scope of THIS prompt
The vendored package files (confirm present; **STOP and flag** if missing):
- `apps/web/app/styles/ds.css`, `apps/web/app/styles/landing.css` — **confirm the actual global-CSS
  directory** the app uses and place/import from there.
- `design_reference/landing/XI Landing.html` — the **visual truth** to map the markup against
  (reference only; do not turn it into a route or import it).

1. **Import `ds.css` once, globally**, in the root layout (`apps/web/app/layout.tsx`). This intentionally
   restyles the **whole** app — including the Prompt-17 nav strip and the three feature screens. Verify
   they remain coherent under `ds.css`; if one **badly** breaks, **flag it** (don't patch feature screens
   out of scope here).
2. **Apply `landing.css` to the landing route** (`apps/web/app/page.tsx`) — import it there and **scope its
   selectors under the landing root** (a wrapper class/id) if they aren't already, so it does not leak into
   other routes.
3. **Re-skin the existing four-state landing to the design**, using `design_reference/landing/XI
   Landing.html` as the pixel truth, for each of the Prompt-16 states:
   - **no-session → signin**: the designed "Sign in" CTA → `/sign-in`.
   - **ok → hub**: "Signed in as {name}" + nav cards to **`/draft`** / **`/lineup`** / **`/vsfield`** + the
     **POST** sign-out `<form action="/auth/sign-out">` (a form, **not** a link).
   - **no-manager → unlinked**: the "not linked to a manager yet — contact the commissioner" state. **Still
     NOT a denial — do not route it to `/auth/denied`.**
   - **not-allowlisted → denied**: the short denied state.
   Place **`<Brand/>`** (from Prompt 18) in the landing header per the reference.
4. **Reuse `selectLandingView()` and the four-outcome branch UNCHANGED.** This is a *visual* re-skin: the
   session read, the four-way mapping, the redirect, and the route set stay **byte-for-byte** as they are.
5. **`/sign-in` (and `/auth/denied`):** apply the design **only if** the package's HTML/README covers them
   **and** it's trivial; otherwise leave them and **flag a follow-up** — do not improvise an unspecified
   sign-in design.

## Explicitly OUT of scope (leave seams intact)
- **Changing `selectLandingView`** or any auth / redirect / route / env / middleware.
- **Re-translating anything to Tailwind**, or introducing a Tailwind config.
- **The feature screens' internal logic** (draft board, lineup validation, vsfield live data) and the nav
  strip's **structure** (Prompt 17 — `ds.css` may restyle it, but do **not** refactor it).
- **Admin surface; a self-serve join/league flow.**

## Tests — keep proportional
Vitest. `pnpm test` stays green — **`selectLandingView`'s four-outcome mapping must remain intact and
untouched** (the re-skin must not regress it; the unlinked≠denied case still holds). Don't over-test static
markup; if you add a render assertion, keep it to "each of the four states still renders its key affordance"
(sign-in CTA / hub nav + POST sign-out / unlinked message / denied).

## Definition of done (verify these pass)
- `ds.css` imported **once** globally in the root layout; `landing.css` applied and **scoped** to `/`; no
  global-stylesheet collision (or one explicitly flagged).
- The **four** landing states render per `design_reference/landing/XI Landing.html`, with `<Brand/>` in the
  header; sign-out still **POSTs** to `/auth/sign-out`; unlinked is still distinct from denied.
- `selectLandingView` + the branch logic + the redirect are **unchanged**.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter web build`
  green; the routes keep their current static/dynamic shape (`/` stays **`ƒ`**).
- No out-of-scope churn: no auth/redirect/route/env change, no Tailwind translation, no feature-logic edit,
  no nav-strip refactor.

## When done
Summarize: how `ds.css` / `landing.css` were wired (global vs page, the scoping you used); how the four
states map to the design and **where `<Brand/>` sits**; explicit confirmation that `selectLandingView` /
the branch / the redirect are byte-unchanged; whether `/sign-in` was skinned or deferred (+ the flagged
follow-up); any global-stylesheet conflict you resolved or flagged; the exact commands you verified; any
`TODO(confirm):` left. Report `git log --oneline -1` and `git status` post-commit; branch off main,
conventional commit, no force-push, **hold the merge for Chat's clearance**. Flag any deferred
sign-in/denied skin as the remaining follow-up.
