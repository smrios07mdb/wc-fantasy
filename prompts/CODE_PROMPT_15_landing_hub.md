# Claude Code — Prompt 15: Landing hub — replace the scaffold `/` with an auth-aware front door + post-login signpost

> Paste into Claude Code with the four brain files in the repo root (PROJECT.md, ARCHITECTURE.md,
> DECISIONS.md, SCORING.md) and Prompts 01–14 in place. **ARCHITECTURE.md §6 (Auth) + the Prompt-07
> `getSessionManager` primitive are the spec for this prompt.** This closes the go-live navigation gap
> surfaced by the route-map report: `/` is the unchanged Prompt-01 scaffold with no link to sign-in,
> AND the magic-link callback's post-login redirect defaults to `/` (`safeNextPath(null)`), so even an
> authenticated member lands on the scaffold with no path onward. One file fixes both.

---

## Context (read first)
Read **ARCHITECTURE.md §6** + the Prompt-07 status in PROJECT.md. State of the build: Prompts 01–14 are
done — the scoring / recompute / standings / draft / ingestion core, the auth layer (07: magic-link +
allowlist + `getSessionManager` / `requireManager` + the authz gate), the draft-room UI (08/09), the
set-lineup flow (10), and the live vs-the-field screen (11/13). The Render deploy is green. **The only
thing missing is the front door:** `apps/web/app/page.tsx` is still the Prompt-01 scaffold ("Foundation
is up…" + links to `/api/health` and `/api/db-check`). It has no nav and no link to `/sign-in`, and
because the callback redirects to `next || /` and the magic link carries no `next`, signed-in members
are dropped right back onto that scaffold — `/draft`, `/lineup`, `/vsfield` are reachable only by
hand-typing the URL.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Reuse the existing auth
primitive; add **no** new auth logic, **no** new routes, **no** new env. **Pure decision logic first**
for the branch mapping (the pattern from scoring / auth / lineup). Where this prompt and the brain files
disagree, the brain files win. If a detail is ambiguous, follow ARCHITECTURE §6 or leave a
`// TODO(confirm):` — do not invent product rules (in particular, do not invent a join-the-league flow).

## Scope of THIS prompt
Replace the scaffold `app/page.tsx` with an **auth-aware server component** that reuses the existing
**`getSessionManager()`** (Prompt 07 — `getUser()`-backed, the same primitive every feature page uses)
and branches on its **typed outcome**. Four states, four renders:

1. **No session** → a minimal landing with a single **"Sign in"** CTA → `/sign-in`. (Closes the
   front-door gap.)
2. **Resolved `{ manager, isCommissioner }`** → a minimal hub: nav links/cards to **`/draft`**,
   **`/lineup`**, **`/vsfield`**, plus a **sign-out** control that POSTs to the existing
   **`/auth/sign-out`** (a form/button, **not** a link). (Closes the post-login stranding gap —
   signed-in members land here via the default `/` redirect and can reach every screen.)
3. **No manager linked** (allowlisted, valid session, `manager.user_id` not yet linked — the Prompt-07
   provisioning seam) → a **distinct** "your account isn't linked to a manager yet — contact the
   commissioner" message. **This is NOT a denial — do not route it to `/auth/denied`.**
4. **Not allowlisted** (defensive only — the callback already signs these out) → a short denied message
   + link to `/auth/denied`.

Keep the **outcome→view selection as a pure helper** (e.g. `selectLandingView(outcome) → 'signin' |
'hub' | 'unlinked' | 'denied'`), DB/Supabase-free and unit-testable, mirroring the pure-core pattern;
the session read stays the thin edge.

Styling is **deliberately minimal/functional** — match the existing unstyled auth-page convention
(reuse the existing `shell/*` primitive only if trivial). Polish is the deferred Design deliverable, not
this prompt.

## Explicitly OUT of scope (leave seams intact)
- **The shared cross-nav strip** on the three authenticated layouts (so members move between
  draft/lineup/vsfield without bouncing through `/`) — a nice-to-have follow-up, **NOT** this prompt.
- **Styling / polish / Design**, and any commissioner/admin surface (it does not exist yet — do **not**
  link to one, and do not add a commissioner-only affordance beyond what already exists).
- **The post-login redirect default** — leave `safeNextPath` / the callback **unchanged**; fixing `/`
  is sufficient precisely because `/` is the redirect target.
- **`getSessionManager()` / the auth core / the feature pages / the APIs / the middleware** — no churn;
  you *call* `getSessionManager`, you do not change it. The manager-provisioning ceremony stays the
  existing `// TODO(confirm):` seam (you render the unlinked state; you do not build a join wizard).

## Tests — pure branch mapping; root `pnpm test` stays green
Vitest. The valuable test is the **outcome→view mapping**, asserting each of the four outcomes maps to
its view — **in particular that "no manager linked" maps to `'unlinked'`, NOT `'denied'`.** No
Supabase/DB in the helper's tests; the server component's session read is the thin (mockable) edge.

## Definition of done (verify these pass)
- `apps/web/app/page.tsx` is an auth-aware server component; the Prompt-01 scaffold placeholder is
  **replaced**; it reuses `getSessionManager()` unchanged and handles **all four** outcomes (signin /
  hub / unlinked-distinct / denied); sign-out uses the existing **POST `/auth/sign-out`**; a signed-in
  member can reach `/draft`, `/lineup`, `/vsfield` from `/`.
- The branch logic is a **pure, unit-tested** helper (the unlinked≠denied case asserted).
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm test` green (+ the
  new mapping test).
- No out-of-scope work: no redirect change, no feature-page / API / middleware / auth-core edits, no
  admin surface, no shared cross-nav strip, no new env/routes.

## When done
Summarize: the four-way branch and each rendered state (call out **unlinked ≠ denied** and that it
points at the commissioner, not `/auth/denied`); that `getSessionManager()` was reused unchanged; that
sign-out POSTs to `/auth/sign-out`; the test count + the purity proof for the mapping helper; the exact
commands you verified; and any `TODO(confirm):` left. Flag the deferred **shared cross-nav strip** as
the recommended next follow-up. Do not start styling/Design, the cross-nav strip, or any admin surface.
