# Claude Code — Prompt 22: Draft feature-body re-skin — `/draft` to the `design_reference/` Draft screen

> Paste with the four brain files (PROJECT.md, ARCHITECTURE.md, DECISIONS.md, SCORING.md) + BRAND.md
> in the repo root, the **`design/` reference** (`design/CLAUDE.md`, `design/COMPONENT_MAP.md`,
> `design/design_reference/*`), and Prompts 01–21 in place (**21 = sign-in / Join + denied skin, on
> main**; the auth routes are now ds, shell-free). **Third screen of the design sprint — the first
> feature body.** Branch off **post-21 main**.
>
> **Canonical design source = the repo's committed `design/design_reference/`** (the full app set).
> Read the Draft screen from the **Draft page/screen in `design/design_reference/`** (e.g.
> `Draft.html` and/or `draft/*` — find the canonical Draft design there), the **integration approach
> from `design/CLAUDE.md`** (follow it; do not invent a different one), the component mapping from
> `design/COMPONENT_MAP.md`, tokens from **`Design System.html`** (already global via Prompt 20's
> ds.css), and the shell the screen sits in from **`App Shell.html` / `shell/*`** (already built in
> Prompt 20 — **do not re-skin the shell here**). Do **not** pull designs from `~/Downloads`. Ambiguous
> detail → `// TODO(confirm):`; do not invent design values.

## Context (read first)
Read the **Prompt-08, Prompt-09, and Prompt-20 entries** in PROJECT.md/DECISIONS.md, **ARCHITECTURE §5**
(the draft room's server-authoritative model) + **§1** (the Tailwind / ds.css / App-Shell situation),
and **BRAND.md §1** (the one color rule).

The Draft room was built in Prompts 08–09 and ran end-to-end live (60 picks, autopick + manual,
two-browser streaming, the lobby→active flip, the total-autopick fallback). It is **functional and
launch-solid** — this prompt is a **purely visual re-skin** of an already-working, already-ds-leaning
screen to bring it into alignment with the *finalized* `design_reference/` Draft screen, on the global
ds.css foundation (Prompt 20) and inside the finalized App Shell (Prompt 20). **Appearance changes;
logic, data shape, Realtime wiring, the countdown's server-sync, and the pick path do not.**

What `/draft` is (so you skin the right things and preserve the right seams):
- **An authenticated, dynamic (`ƒ`) screen** gated via `requireManager` / `getSessionManager`,
  **server-authoritative** — state lives in `draft` / `draft_pick`; the worker tick advances it; clients
  **subscribe** via Supabase Realtime and render from the authoritative row state.
- **View-states (re-skin every one that the build renders):** **lobby/waiting** (`draft.status =
  pending`) → **active board** (`active`) → **complete/results** (`complete`; `paused` if it exists).
  The lobby→active flip is Realtime-driven (the handler re-derives the view from `draft.status` on
  broadcast — Prompt 09 Part A).
- **Active-board regions:** the **live pick board** (snake order, picks-so-far, the **on-the-clock**
  manager highlighted, round/pick number); the **countdown** (rendered locally as animation off the
  server `pick_deadline_at`, re-synced on every broadcast — **never the client clock**); **available
  players** (undrafted pool, with **search + position filter**); the **current manager's
  roster-so-far** (counts toward the 2/5/5/3 squad shape — display only; legality is the controller's
  job); the **make-pick action** (calls the gated `POST /api/draft/pick`, surfaces the typed
  `DraftError`s — not-your-turn / already-owned / illegal-roster, + 401 no-session / 403
  not-your-manager); and **presence** ("who's online").

**Two ways this differs from the Prompt-21 auth skin — internalize both:**
1. **`/draft` IS wrapped by `AppShell`** (Prompt 20 mounted it via `apps/web/app/draft/layout.tsx`).
   Its top-level brand (trophy / "XI" / league) comes from the **shell topbar**, **not** the Draft
   body. **Do not add a brand lockup to the Draft body** (it would double the topbar), and **do not
   touch `AppShell.tsx` / `shell.css`** — keep the wrap exactly as Prompt 20 left it.
2. **The Prompt-20 fixed-height / internal-scroll model.** `/draft` is a tall fixed-height surface (a
   naive height port clipped it at ~3300px in Prompt 20); the shell resolves this with
   `.sh-app{height:100%}` + `.sh-content{flex:1;min-height:0;overflow-y:auto}`. The re-skinned Draft
   body **must live inside `.sh-content`'s scroll region without re-clipping or introducing a second
   scrollbar.** Don't set conflicting `height`/`overflow` on the body root.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Brain files win over this
prompt; **`design/CLAUDE.md` governs the UI integration approach.**

**Architecture this prompt advances (record in DECISIONS at thread close):** `/draft` joins the
**ds-aligned skinned set** (Prompt-19 landing, Prompt-20 shell, Prompt-21 auth, now Draft) — re-skinned
to the finalized design on the global ds.css. **Tailwind / `globals.css` / Preflight stay global**
(Lineup + Vs-the-Field still consume them), and the **per-route `apps/web/app/draft/ds.css` copy
coexists** — **no teardown and no de-dup here**; the per-route-copy de-dup and the Preflight drop both
remain post-sprint, only once nothing relies on them.

## Scope of THIS prompt
1. **Re-skin the `/draft` feature body to the `design_reference/` Draft screen**, per `design/CLAUDE.md`
   + `design/COMPONENT_MAP.md` + BRAND.md §1 — **presentation only**. Bring the **lobby**, the **active
   board** (all the regions above), and the **complete/results** state into alignment with the design
   (and `paused`, if the build renders it). If parts of the body still carry raw Tailwind utilities,
   migrate those onto ds per the design; where it's already ds, reconcile it to the finalized design.
   Follow the design's **responsive** behavior (don't break narrow viewports). **Preserve the exact
   behavior, data shape, server-action / route wiring, Realtime subscription, and countdown server-sync
   of every state** — you are restyling the *output*, never the *mechanism*.
2. **Re-skin any draft-queue UI only if it already exists.** Prompt 08/09 deferred the autopick-queue
   UI; the engine falls back to best-available without it. **If a queue UI is in the current build,
   re-skin it to the design. If it was never built, do NOT build it now** — a queue UI is its own
   feature, out of scope for a skin. Flag which case you found.
3. **Brand & icons come from the existing sets.** The Draft body needs **no brand lockup** (the shell
   provides it). For any in-body marks/icons the design calls for, **reuse** the Prompt-18 brand
   primitives (`@/components/Brand`) and the shell/auth icon set — **reuse, don't rebuild**. If the
   design needs a composite Prompt 18 didn't build, compose it from existing primitives (BRAND.md §4)
   and flag it — do not re-draw the trophy/wordmark.
4. **Port the Draft styles following the established convention** — a route-scoped feature stylesheet
   alongside the route (the `shell.css` / `_auth/auth.css` model), layered on the global ds.css token
   base. **Do not fork or duplicate ds.css.** If the design needs a token/value the global ds.css
   doesn't have, add it to the **route-scoped sheet** (or flag it for a ds.css addition) — never edit
   the canonical ds.css. Leave the per-route `draft/ds.css` copy + its import alone (post-sprint de-dup).

**The one color rule (BRAND.md §1):** gold lives **only** inside the trophy mark — and on `/draft` the
only trophy is in the **shell topbar**, so **effectively no gold appears in the Draft body.** The
draft-specific gold-temptations — the **on-the-clock highlight**, the **make-pick CTA**, **timer
urgency**, a leader/winner indicator, links, and all chrome — are **NOT gold**; they use the cobalt
accent `#4D8DFF` (the ds `--accent` token) and the appropriate ds tokens. No gold leak into the body.

## Explicitly OUT of scope (leave seams intact)
- **Any draft logic.** No edits to `packages/draft` (the pure core), `submitPick` / `tickDraft` /
  `startDraft` / `autopick` / `requireManager` (no signature churn), the gated `POST /api/draft/pick`
  route, `apps/web/src/draft/handlePick.ts`, **or `apps/worker/src/draft.ts` / the worker tick**.
  Presentation only.
- **The Realtime subscription wiring** — the tables/filters (`draft` + `draft_pick` Postgres changes),
  presence, and the lobby→active `draft.status` re-derivation (Prompt 09 Part A) all stay exactly as
  built. Restyle what they render; do not touch how they subscribe or re-sync.
- **The countdown's server-sync mechanism** — it derives from `pick_deadline_at`, re-synced on
  broadcast, **never** the client clock. Restyle the countdown's appearance; do not change its timing
  source or the deadline/clock logic (the "born-expired" report was a resolved read-timing artifact —
  do not reopen it).
- **`AppShell.tsx` / `shell.css`** and the **shell-chrome seams** Prompt 20 flagged `TODO(confirm)`
  (bell / avatar / "More" / the 14-screen IA / mobile tab-bar / sheets / commissioner) — each is its
  own later prompt. Keep the wrap; **do not expand into shell chrome.**
- **The other feature screens** — **Lineup**, **Vs-the-Field** — and **FAAB/waivers**, the
  **commissioner/admin** surface, the **group→playoff transition**. Later prompts; don't touch.
- **`page.tsx` / `selectLandingView` / the auth routes / the landing** — not this screen; untouched.
- **Tailwind / `globals.css` / Preflight teardown, the ds.css fork, and the per-route ds.css de-dup** —
  all coexist; all post-sprint.
- **Deploy / data provisioning / seeding / migrations / schedule-sync** — the operational track.

## Early-warning seams (STOP and flag, don't expand)
- If matching the design would require a **different data shape** than the board / available-players /
  roster currently render (a field the current query/payload doesn't provide), **STOP and flag** — do
  not add a fetch, change the Realtime payload, or alter `handlePick` / the route. Skin what's there.
- If the design's Draft layout **fights the shell's `.sh-content` height/scroll model** (Prompt 20),
  **STOP and flag** — do not "fix" it by editing `shell.css` / `AppShell.tsx`. The body must sit inside
  the scroll region as-is.
- If re-skinning the countdown, the board re-render, the presence display, or the error surface would
  require touching the **server-sync, the subscription, or the pick path**, **STOP and flag** — restyle
  the output only.
- If a Draft **view-state the design defines isn't rendered by the build** (e.g. a results view that
  was deferred), **flag it as a logic follow-up** — do not build the missing state here.
- If porting the skin would require touching shell or other-feature internals, **STOP and flag.**

## Tests — keep proportional
Vitest. `pnpm test` stays green — **no regression to any existing Draft test**: `handlePick`, the
Realtime / lobby→active flip (Prompt 09 Part A), the **countdown-server-derived** test, the **autopick
totality** cases (Prompt 09 Part B), and the `packages/draft` purity grep must all still pass unchanged.
The re-skin must not perturb the behaviors they pin. A light smoke is enough (extend the existing
`apps/web` suite; add Testing Library if not already present, else `// TODO(confirm):`): the **active
board** renders its key regions (pick board, available players with search + filter, roster-so-far,
countdown, make-pick action); the **lobby** and **complete** states render; the make-pick affordance is
present and **enabled only for the on-the-clock manager**; a typed `DraftError` surfaces in the
restyled display. **Don't over-test static markup or ds classes.**

## Definition of done (verify these pass)
- `/draft` re-skinned per the `design_reference/` Draft screen + `design/CLAUDE.md` + BRAND.md §1 — the
  **lobby**, **active board** (pick board + on-the-clock highlight + server-synced countdown +
  available-players w/ search & filter + roster-so-far + make-pick + typed errors + presence), and
  **complete/results** states all match the design; any existing queue UI re-skinned (or its absence
  noted).
- All Draft **behavior preserved**: server-authoritative state, the Realtime subscription (`draft` +
  `draft_pick` changes, presence, lobby→active re-derivation from `draft.status`), the **server-synced
  countdown** (off `pick_deadline_at`, never the client clock), the gated `POST /api/draft/pick` path +
  typed `DraftError` surfacing, and the 2/5/5/3 roster display all still work — **no edits to
  `packages/draft` / `submitPick` / `tickDraft` / `startDraft` / `autopick` / `requireManager` / the
  route / `handlePick` / the worker tick / the subscription wiring / the deadline logic.**
- **Shell boundary holds:** `/draft` **stays wrapped in `AppShell`** (Prompt 20); `AppShell.tsx` /
  `shell.css` untouched; the **fixed-height + internal-scroll model preserved** (no re-clip, no second
  scrollbar) — browser-verified. **No brand lockup added to the body** (brand comes from the topbar).
- **Color correct:** no gold in the Draft body; on-the-clock highlight / make-pick CTA / timer / links /
  chrome use the cobalt `--accent` + ds tokens; **no gold leak.** Brand/icon primitives reused, not
  re-drawn.
- **Stylesheet discipline:** one canonical global ds.css (**not** forked); the Draft feature styles
  live in a route-scoped sheet layered on it; the per-route `draft/ds.css` copy + import left in place
  (post-sprint de-dup).
- Tailwind / `globals.css` / Preflight **retained globally**; the landing, auth, hub/shell, **Lineup**,
  and **Vs-the-Field** screens all still render and function unchanged.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter @app/web
  build` green; **`/draft` keeps its dynamic shape (it's `ƒ` — keep it `ƒ`)**; the other route shapes
  unchanged.
- No out-of-scope churn: no draft-logic / route / worker / subscription / countdown-sync / deadline
  edits, no shell-chrome expansion, no `AppShell`/`shell.css` edits, no Tailwind teardown, no ds.css
  fork, no other-feature / `page.tsx` / auth edits, no provisioning/deploy.

## Verification discipline & live-verify
Per the working-protocol **verification rule**: in your report, state **only what you directly
verified** (read code, ran a command, browser-checked a rendered view); label anything non-observable
in this session (**Render / Realtime / live-DB / two-browser** behavior) as an **inference to confirm**.
You do **not** need a live draft this session — the Realtime, countdown-timing, and two-browser
behaviors are unchanged by the skin, so the build-session proof is the visual one (lobby / active /
complete + the board regions render correctly and sit in the shell scroll region). **Visual fidelity to
the design and the live Realtime/countdown behaviors are confirmed on the live Render deploy** (the
sprint cadence: merge → verify-live per screen) — flag that as the operator gate.

## When done
Summarize: which files you re-skinned and where the Draft styles live (route-scoped stylesheet name +
that it layers on the global ds.css, no fork); which `design_reference/` Draft surfaces each view-state
+ region maps to; exactly how you handled each state (lobby / active / complete / paused-if-present) and
each active-board region; whether a queue UI existed (re-skinned) or was absent (left alone); which
brand/icon primitives you reused vs composed (and any composite you built from primitives); explicit
confirmation that the draft logic / route / worker / subscription / countdown-sync / deadline are
untouched and every existing Draft test still passes; confirmation `/draft` stays `AppShell`-wrapped,
the fixed-height/scroll model is intact (browser-verified), and no brand lockup was added to the body;
confirmation Tailwind coexists and the landing/auth/hub/Lineup/Vs-the-Field routes still render; the
exact commands you verified; any `TODO(confirm):` / flagged follow-up left (including any
design-defined state the build doesn't render). Report `git log --oneline -1` and `git status`
post-commit; branch off post-21 main (suggested `feat/draft-skin`), conventional commit, no force-push,
**hold the merge for Chat's clearance.** Flag **Prompt 23 (Lineup re-skin — from the `design_reference/`
Lineup screen)** as the next step. Do **not** start the Lineup re-skin or push to main.
