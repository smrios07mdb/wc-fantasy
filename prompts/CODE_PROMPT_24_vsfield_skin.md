# Claude Code — Prompt 24: Vs-the-Field feature-body re-skin — `/vsfield` to the `design_reference/` screen

> Paste with the four brain files (PROJECT.md, ARCHITECTURE.md, DECISIONS.md, SCORING.md) + BRAND.md in the
> repo root, the **`design/` reference** (`design/CLAUDE.md`, `design/COMPONENT_MAP.md`,
> `design/design_reference/*`), and Prompts 01–22 in place (**22 = Draft body skin, on main**). **Fifth and
> final screen of the design sprint, third feature body.** Branch off **post-22 main** (`71c96d8`).
>
> **RUNS IN PARALLEL with Prompt 23 (Lineup).** Both branch off the same `71c96d8`. To stay conflict-free
> this branch is **code-only and route-scoped** — see the parallel constraints below.
>
> **Canonical design source = the repo's committed `design/design_reference/`.** Read the Vs-the-Field screen
> from the **vsfield design under `design/design_reference/`** (find the canonical Vs-the-Field design there),
> the integration approach from **`design/CLAUDE.md`** (follow it), the component mapping from
> **`design/COMPONENT_MAP.md`**, tokens from **`Design System.html`** (global via Prompt 20's ds.css), and
> the shell from **`App Shell.html` / `shell/*`** (built in Prompt 20 — **do not re-skin the shell**). Do
> **not** pull from `~/Downloads`. Ambiguous → `// TODO(confirm):`; do not invent design values.

## Context (read first)
Read the **Prompt-11 entry** (the vs-the-field build), the **Prompt-20 / Prompt-22 entries**, **ARCHITECTURE
§1** (the Tailwind / ds.css / App-Shell situation) + **§5** (the real-time "vs the field" bullet) + **§4**
(the data model), **DECISIONS → Theme C** (the all-play-all "power record") + **Theme F** (RLS), and
**BRAND.md §1** (the one color rule) + **§6** (the parrot is a mascot, **manager avatars stay initials**).

`/vsfield` was built in Prompt 11 and runs. This prompt is a **purely visual re-skin** of an already-working
screen to the *finalized* `design_reference/` Vs-the-Field screen, on the global ds.css (Prompt 20) inside
the finalized App Shell (Prompt 20). **Appearance changes; logic, data shape, the SSR loader, the authed
snapshot read, the JWT-authed Realtime wiring, the polling fallback, the RLS/publication, and the Prompt-04
pairwise-helper reuse do NOT.**

What `/vsfield` is (so you skin the right things and preserve the right seams):
- **An authenticated, dynamic (`ƒ`) screen**, gated via `requireManager` — a **league-scoped read** (you see
  the **whole field**), so the gate is **"authenticated league member" only: 401 no-session / not-a-member,
  and NO `403 not-your-manager`** (there's no own-manager target here). **Read-only — no write path.**
- **Server-authoritative:** an **SSR loader** computes the snapshot via `buildVsField` (which **reuses the
  Prompt-04 pairwise helper** for the W/L rule); **live updates** = a **JWT-authed Realtime subscription** to
  `score_manager_period` + `standing` → **refetch the server-computed snapshot**; **15–30s polling** is the
  documented fallback. The browser reads **only** `score_manager_period` + `standing`; lineup/match data is
  server-computed.
- **Regions to re-skin (every one the build renders):** the **current-period field** — each manager's
  **running score**, the **provisional all-play-all record** ("6-3 so far"), **per-opponent H2H**, and the
  **"still to come"** indicator (count of starters yet to play — it is a **count, not a points projection**,
  per §5); the **season view** (cumulative record + `total_points` + `seed` from `standing`); the
  **live/connection state** (the SYNCED-style indicator + presence if rendered); and any **empty/loading**
  state the build renders. **Manager avatars are initials** (BRAND §6 — not the parrot).

**Three things this shares with the Prompt-22 Draft skin — internalize all:**
1. **`/vsfield` IS wrapped by `AppShell`** (Prompt 20 mounted it via `apps/web/app/vsfield/layout.tsx`,
   `active="vsfield"`). Brand comes from the **shell topbar**, not the vsfield body. **Do not add a brand
   lockup to the body.** The vsfield prototype carries a body brand chip — the **`.vf-logo` 28px badge**
   (BRAND §5 names it). **Remove it** — mirror exactly what Prompt 22 did for the draft body's `.dr-logo`.
   **Caveat:** BRAND §5 calls `.vf-logo` "the shared chip." If it's defined once and *imported by multiple
   screens* (truly shared), do **NOT** delete the shared definition — that's a shared-file edit that would
   break others; instead remove its **usage** from the vsfield body and **flag**. If it's vsfield-local,
   remove it. Determine which and report the case. **Do not touch `AppShell.tsx` / `shell.css`.**
2. **The Prompt-20 fixed-height / internal-scroll model.** The field can be tall (every manager + H2H); the
   body must sit inside `.sh-content`'s scroll region with no re-clip / second scrollbar. Don't set
   conflicting `height`/`overflow` on the body root.
3. **PARALLEL with Prompt 23.** This branch touches **ONLY** `apps/web/app/vsfield/*` + a new route-scoped
   `vsfield.css` + a new vsfield test (+ this prompt md). **Do NOT edit `ds.css`, `AppShell.tsx`/`shell.css`,
   the shared `@/components/Brand`, the brain files, or anything under `apps/web/app/lineup/*`** — Prompt 23
   owns lineup, and the brain-file records are a combined post-merge commit. Needing a shared-file edit (incl.
   a truly-shared `.vf-logo`) → **STOP and flag** (the parallel-collision seam).

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Brain files win over this prompt;
**`design/CLAUDE.md` governs the UI integration approach.**

## Scope of THIS prompt
1. **Re-skin the `/vsfield` feature body to the `design_reference/` Vs-the-Field screen**, per
   `design/CLAUDE.md` + `design/COMPONENT_MAP.md` + BRAND.md §1 — **presentation only**. Bring the
   current-period field (running score + provisional record + per-opponent H2H + still-to-come count), the
   season view (record + total points + seed), the live/connection indicator, and any empty/loading state
   into alignment. Migrate raw Tailwind onto ds where present; reconcile to the finalized design where ds.
   Follow the design's **responsive** behavior. **Preserve the exact behavior, data shape, the SSR loader,
   the authed snapshot read, the Realtime JWT-auth wiring + polling fallback, the RLS/publication, and the
   Prompt-04 helper reuse.**
2. **Port the styles following the established convention** — a route-scoped `vsfield.css` alongside the
   route (the `shell.css` / `_auth/auth.css` / `draft.css` model), layered on the global ds.css. **Do not
   fork or duplicate ds.css.** A needed token the global lacks → route-scoped sheet (or flag) — never edit
   canonical ds.css.
3. **Brand & icons come from the existing sets.** No brand lockup in the body (the shell provides it). Reuse
   the Prompt-18 `@/components/Brand` primitives and the shell/auth icon set — **reuse, don't rebuild**.
   **Avatars stay initials** (BRAND §6); do not introduce the parrot as an avatar.

**The one color rule (BRAND §1):** gold lives **only** in the trophy mark — which on `/vsfield` is only in
the **shell topbar**, so **no gold in the vsfield body.** The vsfield gold-temptations — a **leader / "top of
the field" / winner indicator**, the **live/SYNCED state**, **H2H win tints**, the **seed/rank badge**,
links, all chrome — are **NOT gold**; they use the cobalt accent `#4D8DFF` (the ds `--accent` token) + the
appropriate ds tokens (e.g. the live indicator's green is the ds `--live`/positive token, not gold).

## Explicitly OUT of scope (leave seams intact)
- **Any vsfield logic.** No edits to `packages/vsfield` (`buildVsField`), the **Prompt-04 pairwise helper**,
  the SSR loader, the authed snapshot read (`GET /api/vsfield` or the server action), the **Realtime
  subscription wiring** (`setAuth` / `INITIAL_SESSION` / `TOKEN_REFRESHED` / channel teardown), the **polling
  fallback**, the **RLS/publication migration**, or `requireManager` (no signature churn). Presentation only.
- **`AppShell.tsx` / `shell.css`** and the shell-chrome seams — keep the wrap; don't expand into shell chrome.
- **`apps/web/app/lineup/*`** (Prompt 23), the **brain files** (combined post-merge commit), and the other
  screens — **Draft**, auth, landing, FAAB/waivers, commissioner, the playoff transition. Untouched.
- **Tailwind / `globals.css` / Preflight teardown, the ds.css fork, the per-route ds.css de-dup** — all
  coexist; all post-sprint.
- **Deploy / data / seeding / migrations** — the operational track. (You do **not** add or change any RLS or
  publication migration here.)

## Early-warning seams (STOP and flag, don't expand)
- If matching the design needs a **different data shape** than the snapshot/payload provides — **STOP and
  flag.** In particular, **"still to come" is a COUNT, not a projection** (§5 forbids a projected-points
  number); if the design implies a projection, flag it, don't invent one.
- If the design's layout **fights the shell's `.sh-content` height/scroll model** — **STOP and flag.**
- If re-skinning the live indicator, the record, or the H2H would require touching **the loader / the authed
  read / the Realtime wiring / the polling fallback / the RLS / the Prompt-04 helper** — **STOP and flag.**
- If a design-defined view-state isn't rendered by the build — **flag it as a logic follow-up**; don't build
  it.
- If the skin would require touching a **shared file** (ds.css / shell / Brand / brain files / lineup / a
  truly-shared `.vf-logo`) — **STOP and flag** (the parallel-collision seam).

## Tests — keep proportional
Vitest. `pnpm test` stays green — **no regression to any existing vsfield test**: `buildVsField`'s
running-scores + the provisional record / per-opponent H2H via the **Prompt-04 helper** (incl. **tie =
neither W nor L** and the **inactive-0** manager), the starters-yet-to-play counts, the season-view read; the
authed-read **401 / no-403**; the component snapshot-render + change-triggers-refetch + polling-fallback
tests; the RLS migration assertion; and the purity grep — all unchanged. Light smoke (extend the `apps/web`
suite; Testing Library or `// TODO(confirm):`): the **field** renders the per-manager rows (running score +
record + H2H + still-to-come); the **season view** renders; the **live indicator** renders; a simulated
change still drives the refetch path (unchanged — don't re-test the Realtime mechanism, just that the
restyled output renders). Don't over-test static markup or ds classes.

## Definition of done (verify these pass)
- `/vsfield` re-skinned per the Vs-the-Field design + `design/CLAUDE.md` + BRAND §1 — current-period field
  (running score + provisional record + per-opponent H2H + still-to-come) + season view + live indicator all
  match; avatars are initials.
- All vsfield **behavior preserved**: `buildVsField`, the **Prompt-04 helper reuse**, the SSR loader, the
  authed read (**401, no 403**), the **JWT-authed Realtime subscription + polling fallback**, the
  RLS/publication — **no edits to `packages/vsfield` / the helper / the loader / the read / the Realtime
  wiring / the migration / `requireManager`.**
- **Shell boundary holds:** `/vsfield` stays `<AppShell active="vsfield">`-wrapped; `AppShell.tsx`/`shell.css`
  untouched; fixed-height + internal-scroll preserved (no re-clip, no second scrollbar) — browser-verified.
  **No brand lockup in the body** — `.vf-logo` usage removed (or flagged if truly shared).
- **Color correct:** no gold in the body; leader / live / H2H / seed / links / chrome use cobalt `--accent` +
  ds tokens. Brand/icon primitives reused, not re-drawn; avatars stay initials.
- **Stylesheet discipline:** one canonical global ds.css (not forked); vsfield styles in a route-scoped
  `vsfield.css` layered on it.
- Tailwind / `globals.css` / Preflight retained globally; landing, auth, hub/shell, **Draft**, and **Lineup**
  still render and function.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter @app/web build`
  green; `/vsfield` keeps its dynamic shape (`ƒ`); other route shapes unchanged.
- **Parallel discipline:** zero shared-file edits — touched **only** `apps/web/app/vsfield/*` + `vsfield.css`
  + the new test (+ this prompt md). No ds.css / shell / Brand / brain-file / lineup edits.

## Verification discipline & live-verify
State **only what you directly verified**; label anything non-observable (Render / Realtime / live-DB /
two-browser) as an **inference to confirm**. You don't need live scores this session — the JWT-authed
`postgres_changes` delivery + live updates are unchanged by the skin, so the build-session proof is the visual
one (the field + season view + live indicator render and sit in the shell scroll region). Live fidelity + the
Realtime delivery are confirmed on the live Render deploy (merge → verify-live; this folds into the GOAT-trial
ingestion smoke, which needs a drafted roster + live recompute anyway) — flag that as the operator gate.

## When done
Summarize: files re-skinned + where the vsfield styles live (route-scoped `vsfield.css`, layered on global
ds.css, no fork); which `design_reference/` vsfield surfaces each region maps to; how you handled each region
(current-period field, running score, provisional record, per-opponent H2H, still-to-come, season view, live
indicator); the **`.vf-logo` finding** (shared vs vsfield-local — usage removed or flagged), mirroring Prompt
22's `.dr-logo` de-dup; the avatars-as-initials confirmation; which brand/icon primitives you reused vs
composed; explicit confirmation the vsfield logic / loader / authed read / Realtime wiring / RLS / Prompt-04
helper are untouched and every existing vsfield test passes; confirmation `/vsfield` stays `AppShell`-wrapped,
the fixed-height/scroll model is intact (browser-verified), and no brand lockup was added; confirmation
Tailwind coexists and the landing/auth/hub/Draft/Lineup routes still render; **the parallel confirmation —
only vsfield files touched, zero shared-file / brain-file / lineup edits**; the exact commands verified; any
`TODO(confirm):` / flagged follow-up. Report `git log --oneline -1` and `git status` post-commit; branch off
post-22 main (suggested `feat/vsfield-skin`), conventional commit, no force-push, **hold the merge for Chat's
clearance — and do not push** (Sergio handles all pushes/merges; the parallel merge sequence is
Chat+Sergio's). Note this is the **final sprint screen** and that **Prompt 23 (Lineup) runs in parallel.** Do
**not** start any other screen or push to main.