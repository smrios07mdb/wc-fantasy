# Thread closeout — Prompt 16 (landing hub) + route-map ground truth + Prompt-15 deconfliction

Paste each block into the live brain file, then re-upload DECISIONS.md + PROJECT.md to Project
knowledge. These assume the `feat/landing-hub` merge lands on `origin/main` (9accb1f); if a rebase
conflict surfaces, ping before pasting.

---

## Block 1 — PROJECT.md → "Build progress (Claude Code)" (append after the Prompt 13 entry)

**Prompt 16 — landing hub (auth-aware root replacing the scaffold), COMPLETE ✅** (690 tests, +5). The
Prompt-01 scaffold `/` (`apps/web/app/page.tsx`) is replaced by an **auth-aware server component** that
reuses `getSessionManager()` **unchanged** (the Prompt-07 `getUser()`-backed edge) and defers the render
to a pure **`selectLandingView(outcome)`** (`apps/web/src/landing/`, IO-free, `@app/auth` type-only
import, exhaustive `switch` with a `never` guard so a 5th outcome kind is a compile error). Four states →
four renders: **no-session → signin** (single "Sign in" CTA → `/sign-in`, closing the front-door gap);
**ok → hub** ("Signed in as {name}" + nav cards to `/draft` / `/lineup` / `/vsfield` + a **POST**
sign-out `<form action="/auth/sign-out">`, closing the post-login stranding gap — members land here via
the callback's default `/` redirect, `safeNextPath(null)` left unchanged); **no-manager → unlinked** — a
**distinct** "not linked to a manager yet — contact the commissioner" state, **NOT** routed to
`/auth/denied` (the Prompt-07 provisioning seam; the `handlePick` / `handleVsField` 403-collapse is
deliberately split out here); **not-allowlisted → denied** (defensive — the callback already signs these
out). The build flips `/` from static `○` to **dynamic `ƒ`** (per-request SSR) — a cached static root
would have leaked one user's hub to all, so the dynamic render is a correctness requirement, verified.
`pnpm -w typecheck && lint && format:check && test` (690) + `pnpm --filter web build` all exit 0; no
out-of-scope churn (no redirect/callback change, no feature-page / API / middleware / auth-core edits, no
admin surface, no security-closeout churn, no new routes/env). **Numbering:** this is **Prompt 16**,
deconflicted from **Prompt 15 = the pre-prod security follow-ups closeout** already on main (unrelated).
**Next follow-up (flagged, not done):** the shared cross-nav strip on the three authenticated layouts so
members move between draft / lineup / vsfield without bouncing through `/`. ⚠️ *Merge: implemented +
verified on `feat/landing-hub` @ `dd0aed3`; merge to main pending base-reconcile onto `9accb1f` +
working-tree cleanup (see DECISIONS → "Landing hub & route-map ground truth").*

---

## Block 2 — DECISIONS.md (new section; append near the other build/ops sections)

## Landing hub & route-map ground truth (Prompt 16) — navigation gap closed

### Route-map ground truth (verified pre-go-live, report-only — baseline commit `c8f404d`)
Established before touching anything. The deployed `apps/web` surface:
- **Page routes (6), all in the production build** — none env-gated or build-excluded; the feature pages
  are protected by **runtime** `getSessionManager()` redirects, not build exclusion: `/` (scaffold —
  since replaced by Prompt 16), `/sign-in`, `/auth/denied` (public); `/draft`, `/lineup`, `/vsfield`
  (auth — no session → `/sign-in`, not-ok → `/auth/denied`).
- **Route handlers:** `GET /api/health`, `GET /api/db-check` (public diagnostics); `GET
  /api/draft/state`, `POST /api/draft/pick`, `POST /api/lineup`, `GET /api/vsfield` (gated); `GET
  /auth/callback` (code-exchange + allowlist enforcement → `next || /`); `POST /auth/sign-out` (→ 303
  `/sign-in`).
- **Middleware does zero authz** — it only refreshes the Supabase token cookie; all authz is per-page via
  `getSessionManager()` (so `/` is reachable by anyone). `app/draft/flags.ts` = **nation flags** (CSS
  country chips), NOT feature flags — nothing in the app is feature-flag-gated. The only conditional UI is
  the optional Google button on `/sign-in` (`NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED`).

### The navigation gap (two parts) — RESOLVED by Prompt 16
1. **Dead-end `/`** — the scaffold root linked only to `/api/health` + `/api/db-check`; no link to
   `/sign-in` on it or in the root layout. The only in-app link to `/sign-in` lived on `/auth/denied`.
2. **Post-login stranding** — the magic link's `emailRedirectTo` carries no `next`, so `safeNextPath(null)`
   defaults to `/`; an authenticated member landed back on the scaffold with no path onward.
Both closed by a **single** auth-aware root (Prompt 16) — fixing `/` is sufficient precisely because `/`
is also the post-login redirect target. The bare "add a sign-in link" alternative was rejected (leaves
authed users stranded). `safeNextPath` / the callback were left unchanged.

### Prompt-15 / 16 numbering deconfliction (do not re-collide)
Two different deliverables briefly shared the number 15: the **security follow-ups closeout** (mirror-fn /
`search_path` hardening, migration `20260606180000`) and the **landing hub**. The security closeout merged
to main first and owns **Prompt 15** (do not reopen — items 1 & 2 RESOLVED). The landing hub was
renumbered to **Prompt 16**. PROJECT.md's "Prompt 15 COMPLETE ✅" = security; "Prompt 16 COMPLETE ✅" =
landing hub.

### Merge / working-tree hygiene (action before merge)
- `feat/landing-hub` (`dd0aed3`) was branched off **stale local main `c8f404d`**, not current
  `origin/main 9accb1f` (the security merge). **Reconcile first:** `git fetch`, then **rebase
  `feat/landing-hub` onto `origin/main`** (disjoint file sets → clean) for a fast-forward merge, or
  `--no-ff`. Re-run the gate post-rebase before merging.
- ⚠️ **The shared working tree has the Prompt-15 security migration SQL deleted (unstaged):
  `D …20260606180000_…/migration.sql`.** It is committed in history; the deletion is phantom local state
  (NOT in `dd0aed3`). **`git restore`** it before any branch / merge / DB work — letting the deletion ride
  into a commit drops the migration from the repo and causes `migrate deploy` drift on a fresh
  environment. This recurring dirty-checkout state (phantom diff, modified RUNBOOK, untracked prompts) has
  carried across sessions — clean it once before go-live.
