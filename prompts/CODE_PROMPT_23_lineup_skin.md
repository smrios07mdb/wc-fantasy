# Claude Code — Prompt 23: Lineup feature-body re-skin — `/lineup` to the `design_reference/` Set Lineup screen

> Paste with the four brain files (PROJECT.md, ARCHITECTURE.md, DECISIONS.md, SCORING.md) + BRAND.md in
> the repo root, the **`design/` reference** (`design/CLAUDE.md`, `design/COMPONENT_MAP.md`,
> `design/design_reference/*`), and Prompts 01–22 in place (**22 = Draft body skin, on main**). **Fourth
> screen of the design sprint, second feature body.** Branch off **post-22 main** (`71c96d8`).
>
> **RUNS IN PARALLEL with Prompt 24 (Vs-the-Field).** Both branch off the same `71c96d8`. To stay
> conflict-free this branch is **code-only and route-scoped** — see the parallel constraints below.
>
> **Canonical design source = the repo's committed `design/design_reference/`.** Read the Set Lineup
> screen from the **lineup design in `design/design_reference/lineup/*`** (find the canonical Set Lineup
> design there), the integration approach from **`design/CLAUDE.md`** (follow it), the component mapping
> from **`design/COMPONENT_MAP.md`**, tokens from **`Design System.html`** (global via Prompt 20's ds.css),
> and the shell from **`App Shell.html` / `shell/*`** (built in Prompt 20 — **do not re-skin the shell**).
> Do **not** pull from `~/Downloads`. Ambiguous detail → `// TODO(confirm):`; do not invent design values.

## Context (read first)
Read the **Prompt-10 entry** (the lineup build), the **Prompt-20 / Prompt-22 entries**, **ARCHITECTURE
§1** (the Tailwind / ds.css / App-Shell situation) + the lineup-persistence / player-lock-source sections,
**DECISIONS → Theme B** (roster/lineup rules + the lock-on-play amendment), and **BRAND.md §1** (the one
color rule).

`/lineup` was built in Prompt 10 and runs. This prompt is a **purely visual re-skin** of an already-working
screen to the *finalized* `design_reference/` Set Lineup screen, on the global ds.css (Prompt 20) inside
the finalized App Shell (Prompt 20). **Appearance changes; logic, data shape, the gated route, the pure
`validateLineup` core, the server-side lock re-check, and `lineup_slot` persistence do NOT.**

What `/lineup` is (so you skin the right things and preserve the right seams):
- **An authenticated, dynamic (`ƒ`) screen**, gated via `requireManager` / `getSessionManager`,
  **server-authoritative** — `lineup_slot` persistence + the lock latch live on the server; legality is the
  pure `validateLineup`; the **only write path** is the gated `POST /api/lineup`. Lock-on-play comes from
  ingestion (`locked_at`, Prompt 05a) — **consumed, not reimplemented**.
- **Regions to re-skin (every one the build renders):** the **formation view** of the XI + the bench; the
  **swap bench↔start** affordance; **live formation/position validity feedback** (save disabled + reason
  shown when illegal); **locked players visually frozen** (non-draggable / non-removable) with **per-player
  kickoff + lock indicators** (who's still movable); **pre-set upcoming windows** (period selector + its
  XI); the **save action** → gated `POST /api/lineup`, surfacing the typed `LineupError`s
  (`illegal-formation` / `locked-player-moved` / `not-your-player` / `wrong-period` / `incomplete-xi`) +
  401 no-session / 403 not-your-manager; and the **2/5/5/3 squad shape + formation bounds** (display only —
  legality is the controller's job).

**Three things this shares with the Prompt-22 Draft skin — internalize all:**
1. **`/lineup` IS wrapped by `AppShell`** (Prompt 20 mounted it via `apps/web/app/lineup/layout.tsx`,
   `active="lineup"`). Top-level brand comes from the **shell topbar**, not the lineup body. **Do not add a
   brand lockup to the lineup body.** If the prototype carries a body brand chip (a `.logo`-family badge per
   BRAND §5), **remove it** — mirror exactly what Prompt 22 did for the draft body's `.dr-logo`. **Do not
   touch `AppShell.tsx` / `shell.css`.**
2. **The Prompt-20 fixed-height / internal-scroll model.** The body must live inside `.sh-content`'s scroll
   region without re-clipping or a second scrollbar. Don't set conflicting `height`/`overflow` on the body
   root.
3. **PARALLEL with Prompt 24.** This branch touches **ONLY** `apps/web/app/lineup/*` + a new route-scoped
   `lineup.css` + a new lineup test (+ this prompt md). **Do NOT edit `ds.css`, `AppShell.tsx`/`shell.css`,
   the shared `@/components/Brand`, the brain files, or anything under `apps/web/app/vsfield/*`** — Prompt 24
   owns vsfield, and the brain-file records are a combined post-merge commit. Needing any shared-file edit →
   **STOP and flag** (it's the parallel-collision seam).

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Brain files win over this prompt;
**`design/CLAUDE.md` governs the UI integration approach.**

## Scope of THIS prompt
1. **Re-skin the `/lineup` feature body to the `design_reference/` Set Lineup screen**, per
   `design/CLAUDE.md` + `design/COMPONENT_MAP.md` + BRAND.md §1 — **presentation only**. Bring the formation
   view, bench, swap, validity feedback, locked-frozen indicators, upcoming-windows selector, and save/error
   surface into alignment. Migrate raw Tailwind onto ds where present; reconcile to the finalized design
   where already ds. Follow the design's **responsive** behavior. **Preserve the exact behavior, data shape,
   route/validator wiring, the server-side lock re-check, and `lineup_slot` persistence.**
2. **Port the styles following the established convention** — a route-scoped `lineup.css` alongside the
   route (the `shell.css` / `_auth/auth.css` / `draft.css` model), layered on the global ds.css token base.
   **Do not fork or duplicate ds.css.** A needed token the global ds.css lacks → add to the **route-scoped
   sheet** (or flag for a ds.css addition) — never edit the canonical ds.css.
3. **Brand & icons come from the existing sets.** No brand lockup in the body (the shell provides it). Reuse
   the Prompt-18 `@/components/Brand` primitives and the shell/auth icon set — **reuse, don't rebuild**; a
   composite the design needs that Prompt 18 didn't build → compose from primitives (BRAND §4) and flag.

**The one color rule (BRAND §1):** gold lives **only** in the trophy mark — which on `/lineup` is only in
the **shell topbar**, so **no gold in the lineup body.** The lineup gold-temptations — the **save CTA**, the
**formation-valid / complete indicator**, the **locked-vs-movable** treatment, validity feedback, links, all
chrome — are **NOT gold**; they use the cobalt accent `#4D8DFF` (the ds `--accent` token) + the appropriate
ds tokens.

## Explicitly OUT of scope (leave seams intact)
- **Any lineup logic.** No edits to `packages/lineup` (`validateLineup`), the gated `POST /api/lineup`, the
  **server-side lock re-check at write time**, `lineup_slot` persistence, the lock-on-play (`locked_at`)
  consumption, or `requireManager` (no signature churn). Presentation only.
- **`AppShell.tsx` / `shell.css`** and the shell-chrome seams (bell / avatar / "More" / mobile tab-bar /
  sheets) — keep the wrap; don't expand into shell chrome.
- **`apps/web/app/vsfield/*`** (Prompt 24), the **brain files** (combined post-merge commit), and the other
  screens — **Draft**, auth, landing, FAAB/waivers, commissioner, the playoff transition. Untouched.
- **Tailwind / `globals.css` / Preflight teardown, the ds.css fork, the per-route ds.css de-dup** — all
  coexist; all post-sprint.
- **Deploy / data / seeding / migrations** — the operational track.

## Early-warning seams (STOP and flag, don't expand)
- If matching the design needs a **different data shape** than the formation view / bench / roster currently
  render (a field the query/payload doesn't provide) — **STOP and flag.** Skin what's there.
- If the design's layout **fights the shell's `.sh-content` height/scroll model** — **STOP and flag.** Don't
  edit `shell.css` / `AppShell.tsx`.
- If re-skinning the validity feedback, the locked indicators, or the error surface would require touching
  **`validateLineup` / the route / the server-side lock re-check / persistence** — **STOP and flag.**
- If a design-defined view-state isn't rendered by the build — **flag it as a logic follow-up**; don't build
  it.
- If the skin would require touching a **shared file** (ds.css / shell / Brand / brain files / vsfield) —
  **STOP and flag** (the parallel-collision seam).

## Tests — keep proportional
Vitest. `pnpm test` stays green — **no regression to any existing lineup test**: `validateLineup`'s
formation-bound + lock-respecting cases, the route's authed-owner + server-side-lock-reject + persist tests,
the component locked-non-draggable / illegal-disables-save / posts-to-`/api/lineup` tests, and the
`packages/lineup` purity grep must all still pass unchanged. Light smoke (extend the `apps/web` suite; add
Testing Library if not present, else `// TODO(confirm):`): the **formation view** renders the XI + bench;
**locked players render frozen** (non-draggable); an **illegal formation disables save + shows the reason**;
the save affordance **posts to `/api/lineup`**; a typed `LineupError` surfaces in the restyled display.
Don't over-test static markup or ds classes.

## Definition of done (verify these pass)
- `/lineup` re-skinned per the Set Lineup design + `design/CLAUDE.md` + BRAND §1 — formation view + bench +
  swap + validity feedback + locked-frozen indicators + upcoming-windows + save + typed errors all match.
- All lineup **behavior preserved**: `validateLineup`, the gated `POST /api/lineup`, the **server-side lock
  re-check**, `lineup_slot` persistence, lock-on-play consumption, the 2/5/5/3 display — **no edits to
  `packages/lineup` / the route / the lock re-check / persistence / `requireManager`.**
- **Shell boundary holds:** `/lineup` stays `<AppShell active="lineup">`-wrapped; `AppShell.tsx`/`shell.css`
  untouched; fixed-height + internal-scroll preserved (no re-clip, no second scrollbar) — browser-verified.
  **No brand lockup in the body.**
- **Color correct:** no gold in the body; save CTA / validity / locked-vs-movable / links / chrome use cobalt
  `--accent` + ds tokens. Brand/icon primitives reused, not re-drawn.
- **Stylesheet discipline:** one canonical global ds.css (not forked); lineup styles in a route-scoped
  `lineup.css` layered on it.
- Tailwind / `globals.css` / Preflight retained globally; landing, auth, hub/shell, **Draft**, and
  **Vs-the-Field** still render and function.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter @app/web build`
  green; `/lineup` keeps its dynamic shape (`ƒ`); other route shapes unchanged.
- **Parallel discipline:** zero shared-file edits — touched **only** `apps/web/app/lineup/*` + `lineup.css` +
  the new test (+ this prompt md). No ds.css / shell / Brand / brain-file / vsfield edits.

## Verification discipline & live-verify
State **only what you directly verified** (read code, ran a command, browser-checked a view); label anything
non-observable (Render / live-DB) as an **inference to confirm**. You don't need a live lineup save this
session — the server-side lock-freeze + late-edit rejection were proven server-side in Prompt 10 and the skin
doesn't touch them, so the build-session proof is the visual one (formation view + bench + locked/movable
indicators + validity + save render and sit in the shell scroll region). Visual fidelity is confirmed on the
live Render deploy (merge → verify-live) — flag that as the operator gate.

## When done
Summarize: files re-skinned + where the lineup styles live (route-scoped `lineup.css`, layered on global
ds.css, no fork); which `design_reference/lineup` surfaces each region maps to; how you handled each region
(formation, bench, swap, validity, locked indicators, upcoming-windows, save/error); whether the body carried
a brand chip (removed, mirroring Prompt 22's `.dr-logo` de-dup) or not; which brand/icon primitives you
reused vs composed; explicit confirmation the lineup logic / route / validator / lock re-check / persistence
are untouched and every existing lineup test passes; confirmation `/lineup` stays `AppShell`-wrapped, the
fixed-height/scroll model is intact (browser-verified), and no brand lockup was added; confirmation Tailwind
coexists and the landing/auth/hub/Draft/Vs-the-Field routes still render; **the parallel confirmation — only
lineup files touched, zero shared-file / brain-file / vsfield edits**; the exact commands verified; any
`TODO(confirm):` / flagged follow-up. Report `git log --oneline -1` and `git status` post-commit; branch off
post-22 main (suggested `feat/lineup-skin`), conventional commit, no force-push, **hold the merge for Chat's
clearance — and do not push** (Sergio handles all pushes/merges; the parallel merge sequence is
Chat+Sergio's). Note that **Prompt 24 (Vs-the-Field) runs in parallel.** Do **not** start any other screen or
push to main.