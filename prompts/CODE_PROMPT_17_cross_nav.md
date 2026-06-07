# Claude Code — Prompt 17: Shared cross-nav strip on the authenticated screens

> Paste into Claude Code with the four brain files in the repo root (PROJECT.md, ARCHITECTURE.md,
> DECISIONS.md, SCORING.md) and Prompts 01–16 in place (**16 = the auth-aware landing hub, now on main
> @ `52e1416` and deployed**). This is the follow-up Prompt 16 flagged: the three authenticated screens
> have no cross-nav, so a member on one must bounce through `/` to reach another. Add a shared nav strip.

---

## Context (read first)
Read the Prompt-16 entry in PROJECT.md + ARCHITECTURE §6. State: `/` is now an auth-aware hub (Prompt
16) with nav cards to `/draft`, `/lineup`, `/vsfield` + a **POST** sign-out. But the three authenticated
screens themselves have **no cross-navigation** — from `/draft`, reaching `/lineup` means going back to
`/` first. This prompt adds a shared nav strip to those three screens so members move directly between
them.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** This is **presentational** —
the screens are already gated by `getSessionManager()`; the strip adds **no** auth, **no** routes, **no**
env. Reuse existing primitives (the hub's sign-out form + nav pattern from Prompt 16; the existing
`shell/*` layout if the feature screens share one). Where this prompt and the brain files disagree, the
brain files win. If a detail is ambiguous, leave a `// TODO(confirm):` — do not invent product rules.

## Scope of THIS prompt
A single shared nav strip rendered on `/draft`, `/lineup`, `/vsfield`:
- Links to the other feature screens + home (`/`).
- The existing **POST** sign-out (`<form action="/auth/sign-out" method="post">`) — reuse the Prompt-16
  pattern, **not** a link, no `"use client"` needed for it.
- The **current screen indicated** (active state) — minimal, computed from the current path.
- **DRY:** first check whether the three screens already share a `shell/` / layout component (the lineup
  screen references `shell/*`). If they do, add the strip **there** so it renders once for all three. If
  not, create **one** shared nav component and mount it in each screen's layout. Do **not** duplicate the
  markup three times.
- Minimal/functional styling, consistent with the existing convention (or the shell primitive). Polish is
  the deferred Design deliverable, not this prompt.

## Explicitly OUT of scope (leave seams intact)
- Restyling the feature screens or the hub.
- The hub `/` itself (done — Prompt 16). If a shared component naturally serves both, fine, but do **not**
  refactor the hub to chase it.
- Any new routes / auth / env / middleware change; no `getSessionManager()` or auth-core edits (the
  screens stay gated exactly as they are).
- Admin surface; the feature screens' internal logic (draft board, lineup validation, vsfield live data)
  — untouched.

## Tests — keep proportional
If the active-state / link-set has any logic (e.g. current-path → active link), extract a **tiny pure
helper** and unit-test it (mirroring the `selectLandingView` pattern from Prompt 16). A purely
presentational strip needs little; don't over-test static markup. Root `pnpm test` stays green.

## Definition of done (verify these pass)
- `/draft`, `/lineup`, `/vsfield` each render the shared nav strip: links to the other two screens +
  home, the current screen indicated, and a **POST** sign-out reusing the Prompt-16 form. Mounted **once**
  via a shared component/layout (no triplicated markup).
- No new auth / routes / env; the screens stay `getSessionManager()`-gated as before.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter web build`
  green (the three feature routes stay `ƒ`).
- No out-of-scope churn.

## When done
Summarize: the nav component + where it's mounted (shared shell vs per-screen), the active-state
handling, the sign-out reuse, any pure helper + test count, the exact commands verified, and any
`TODO(confirm):` left. Report `git log --oneline -1` + `git status` post-commit; branch off main,
conventional commit, no force-push, **hold the merge for Chat's clearance**. This is the last navigation
follow-up — flag nothing further from this theme.
