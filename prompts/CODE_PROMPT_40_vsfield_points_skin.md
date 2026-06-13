# Claude Code — Prompt 40: Vs-the-Field "points" rework — re-skin `/vsfield` to the Claude-Design handoff

> Paste with the four brain files (PROJECT.md, ARCHITECTURE.md, DECISIONS.md, SCORING.md) + BRAND.md in
> the repo root, the **`design/` reference** (`design/CLAUDE.md`, `design/COMPONENT_MAP.md`,
> `design/design_reference/*`), and Prompts 01–39 in place (the Vs-the-Field feature = **Prompts 11 +
> 13**, on `main`, functional and live). **Branch off `main`.**
>
> **The visual target for THIS rework = the committed in-repo handoff at
> `design/handoff/vsfield_points/`** — read its **`README.md` FIRST** (it is the handoff spec from
> Claude Design for the points rework). The handoff sits **inside the repo** (it is *not* a `~/Downloads`
> pull), so it is a legitimate in-repo design source for this screen. The **governing design system is
> unchanged**: tokens come from the global **ds.css** (Prompt 20), the **one color rule** from
> **BRAND.md §1**, and the integration approach from **`design/CLAUDE.md`** (follow it; do not invent a
> different one). Where the handoff and the governing system disagree on a token/value, the **ds.css /
> BRAND.md system wins** and you flag the gap with `// TODO(confirm):` — do not fork ds.css and do not
> invent design values.

---

## Context (read first)
1. **Read the handoff `README.md`** under `design/handoff/vsfield_points/` — it is the spec for the
   visual target. Then inventory the folder: `Vs the Field.html`, the two variants `vsfield/` and
   `vsfield2/`, `tweaks-panel.jsx`, `ds/`, `logo/`.
2. Read the **Prompt-11 + Prompt-13 entries** in PROJECT.md/DECISIONS.md, **ARCHITECTURE §5** (the
   Vs-the-Field server-authoritative model + the Realtime layer) + **§1** (the ds.css / App-Shell
   situation), and **BRAND.md §1** (the one color rule).

The Vs-the-Field screen was built in **Prompt 11** (RLS/publication fixed in **Prompt 13**) and is
**functional and live** (the WC opened June 11; standings + per-opponent H2H + still-to-come render off
live recompute). This prompt is a **points-focused visual rework** of that already-working, already-ds-
leaning screen to bring it into alignment with the Claude-Design handoff, on the global ds.css
foundation and inside the finalized App Shell. **Appearance changes; logic, data shape, the authed
snapshot read, Realtime wiring, and the polling fallback do NOT** — unless the early-warning fork below
fires, in which case you **STOP and flag**, you do not proceed.

What `/vsfield` is (so you skin the right things and preserve the right seams — all from Prompt 11):
- **An authenticated, read-only, league-scoped screen** gated via **`requireManager`** (**401, no
  403** — there is no own-manager target; you see the whole field). **No write path.**
- **Server-authoritative.** The pure view-model **`buildVsField`** lives in **`packages/vsfield`** and
  is **IO-free** (all inputs injected). The browser reads **only** `score_manager_period` + `standing`
  (the league-scoped `authenticated` SELECT policies + `supabase_realtime` publication entries added in
  Prompts 11/13). **All lineup/match-derived data — per-manager running score, the provisional
  all-play-all record + per-opponent H2H (via the reused Prompt-04 pairwise helper), and the
  starters-yet-to-play count — is server-computed** in the snapshot read (`/api/vsfield` or the server
  action, per Prompt 11). **No browser-direct `lineup_slot` / `fifa_match` / `player` read.**
- **"Still to come" is a COUNT, grounded in §4 facts — never a projected-points number** (the locked §5
  rule). Do not introduce a projection in the rework.
- **Live path = JWT-authed Realtime change-nudge → authed snapshot refetch → re-render**, with **15–30s
  polling as the documented fallback** (§5). The Prompt-08 JWT Realtime-auth pattern (`setAuth` →
  gate first subscribe on `INITIAL_SESSION` → re-subscribe on `TOKEN_REFRESHED`) is reused; getting it
  wrong = the screen silently never updates.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Brain files win over this
prompt; **`design/CLAUDE.md` governs the UI integration approach.**

## The crucial scope fork (internalize this before you write any code)
The handoff is named **"points"** and the rework is about how scoring is *presented*. There are two
cases, and which one applies decides whether this prompt proceeds:

- **(A) Pure presentation rework** — the handoff re-arranges / restyles data the **current snapshot
  already provides** (running score, provisional record, per-opponent H2H, the still-to-come count,
  season record/total/seed). → **In scope. Proceed.** Restyle the output; touch no mechanism.
- **(B) Needs new data** — the handoff shows anything the current `buildVsField` snapshot / `/api/vsfield`
  read does **not** already expose: e.g. a **per-player points breakdown**, per-bucket scoring detail,
  per-opponent **lineup** detail, a **projected/“if it ends now”** number, or any new field. → **STOP
  and FLAG. Do NOT proceed.** Do not add a fetch, change the snapshot shape, alter `buildVsField`, touch
  the Realtime payload, or open a migration. Report exactly which design element needs which missing
  field. That is a **separate logic prompt** (Chat will author it — Opus 4.8 / max effort) and it is
  **out of scope here**.

If part of the handoff is (A) and part is (B): **skin the (A) parts, flag the (B) parts, and ship
neither the projection nor any new data path.** When in doubt, treat it as (B) and flag.

## Scope of THIS prompt
1. **Re-skin the `/vsfield` feature body to the handoff design** (`design/handoff/vsfield_points/`,
   reading `README.md` as the spec), per `design/CLAUDE.md` + `design/COMPONENT_MAP.md` + BRAND.md §1 —
   **presentation only** for everything in case (A). Bring **every view-state the build renders** into
   alignment: the **current-period field** (each manager's running score, provisional record
   "6-3 so far", per-opponent H2H, still-to-come indicator) and the **season view** (cumulative record +
   total points + seed). Follow the design's **responsive** behavior; don't break narrow viewports.
   **Preserve the exact behavior, data shape, authed-read wiring, Realtime subscription, and polling
   fallback** — you are restyling the *output*, never the *mechanism*.
2. **Two variants — pick per the README, report your choice.** The handoff ships `vsfield/` and
   `vsfield2/`. If the README designates one as canonical, implement that one. If it does not, **STOP
   and ask** (flag it) — do not guess which variant is the intended target.
3. **`tweaks-panel.jsx` is a design-exploration artifact, NOT a production component.** Claude-Design
   handoffs ship a tweaks/control panel for tuning the design in isolation. **Do not ship it into
   `/vsfield`** unless the README explicitly says it is a production surface (it almost certainly is
   not). If anything in it encodes final token values, **lift those values into the route-scoped sheet
   / flag them for ds.css**, but do not mount the panel. Report what you did with it.
4. **Port the rework styles following the established convention** — a **route-scoped feature
   stylesheet** alongside the route (the `shell.css` / `_auth/auth.css` / `draft` model), layered on the
   global ds.css token base. **Do not fork or duplicate ds.css.** If the design needs a token/value the
   global ds.css lacks, add it to the **route-scoped sheet** (or flag it for a ds.css addition) — never
   edit canonical ds.css. The handoff's `ds/` is a *reference*; reconcile it to the repo's existing
   global ds.css, do not replace it.
5. **Brand & icons come from the existing sets.** `/vsfield` is `AppShell`-wrapped — the top-level brand
   (trophy / "XI" / league) comes from the **shell topbar, not the Vs-the-Field body**; **do not add a
   brand lockup to the body**, and **do not touch `AppShell.tsx` / `shell.css`**. For in-body marks the
   design calls for, **reuse the Prompt-18 brand primitives** (`@/components/Brand`) + the shell/auth
   icon set; compose from primitives if needed (BRAND.md §4) and flag — do not re-draw the trophy/
   wordmark. The handoff's `logo/` is a reference; use the repo's committed brand primitives.

**The one color rule (BRAND.md §1):** gold lives **only** inside the trophy mark — and on `/vsfield` the
only trophy is in the **shell topbar**, so **effectively no gold appears in the Vs-the-Field body.** The
points-rework gold-temptations — a **leader/winner highlight**, a "you" row, a positive-score emphasis,
the H2H "winning" cell, links, chrome — are **NOT gold**; they use the cobalt accent **`#4D8DFF`** (the
ds `--accent` token) and the appropriate ds tokens. **No gold leak into the body.**

## Explicitly OUT of scope (leave seams intact)
- **Any new data / case-(B) work** — per-player point breakdowns, a projected-points number, per-opponent
  lineup detail, new snapshot fields. **Flag, don't build.** (Separate Opus prompt.)
- **Scoring engine / recompute / standings / `buildVsField` / the Prompt-04 pairwise helper / ingestion /
  lock-on-play / auth / the authed read / the RLS+publication migration (Prompts 11/13)** — **consume, no
  signature churn, no migration.**
- **The active lineup-lock fix (`fix/premature-locks-statusgate`), the MD2 league-status / FAAB lifecycle
  work, the duel-fields scoring watch** — separate workstreams; **do not touch.**
- **Write surfaces** (lineup, FAAB/waivers, draft), the **commissioner/admin** surface, the
  **group→playoff transition / guillotine standings view** — later; references stay untouched.
- **`AppShell.tsx` / `shell.css` / shell chrome**, the **other feature screens** (Draft, Lineup),
  **`page.tsx` / the landing / auth routes** — untouched.
- **Tailwind / `globals.css` / Preflight teardown, the ds.css fork, the per-route ds.css de-dup** — all
  coexist; all post-sprint.
- **Deploy / provisioning / seeding** — the operational track.

## Early-warning seams (STOP and flag, don't expand)
- **The case-(B) fork above** — if matching the design needs a field the current snapshot / `buildVsField`
  doesn't provide, **STOP and flag**; do not add a fetch, change the snapshot or Realtime payload, or
  touch `buildVsField` / the route.
- If the design implies a **points projection / "if it ended now"** number, **STOP and flag** —
  still-to-come is a **count**, never a projection (locked §5).
- If the rework would touch the **JWT Realtime subscription, the polling fallback, the authed read, or
  the RLS/publication migration**, **STOP and flag** — restyle the output only.
- If the design's layout **fights the shell's `.sh-content` fixed-height / internal-scroll model**
  (the Prompt-20/22 clip risk), **STOP and flag** — do not "fix" it by editing `shell.css` /
  `AppShell.tsx`; the body must sit inside the scroll region without re-clipping or a second scrollbar.
- If a view-state the design defines **isn't rendered by the build**, **flag it as a logic follow-up** —
  do not build the missing state here.

## Tests — keep proportional
Vitest; root `pnpm test` stays green. **No regression to any existing Vs-the-Field test** — the
`buildVsField` purity + all-play-all assertions (tie = neither W nor L, via the reused Prompt-04
helper), the authed-read **401 / no-403 / whole-league-snapshot** test, the **change-event → refetch +
polling-fallback** component test, and the RLS/publication migration assertion must all still pass
**unchanged**. A light smoke is enough (extend the existing `apps/web` suite): the reskinned
current-period field renders its key regions (per-manager running score, provisional record,
per-opponent H2H, still-to-come indicator), the season view renders, and a simulated change still
triggers a refetch + re-render in the restyled output. **Don't over-test static markup or ds classes.**

## Definition of done (verify these pass)
- `/vsfield` re-skinned per `design/handoff/vsfield_points/` (README as spec) + `design/CLAUDE.md` +
  BRAND.md §1 — the **current-period field** (running score + provisional record + per-opponent H2H +
  still-to-come **count**) and the **season view** match the chosen handoff variant; the variant choice
  is reported; `tweaks-panel.jsx` is **not** mounted (and its disposition reported).
- All Vs-the-Field **behavior preserved**: server-authoritative, read-only, `requireManager`-gated
  (**401, no 403**); the browser still reads **only** `score_manager_period` + `standing`; the
  server-computed snapshot, the JWT-authed Realtime change-nudge → refetch, and the polling fallback all
  still work — **no edits to `packages/vsfield` / `buildVsField` / the Prompt-04 helper / the authed
  read / the route / the Realtime wiring / the RLS+publication migration.**
- **Still-to-come stays a count; no projection introduced.** **No case-(B) data added** — any such need
  is flagged, not built.
- **Shell boundary holds:** `/vsfield` stays wrapped in `AppShell`; `AppShell.tsx` / `shell.css`
  untouched; the fixed-height + internal-scroll model preserved (no re-clip, no second scrollbar) —
  **browser-verified**. No brand lockup added to the body.
- **Color correct:** no gold in the Vs-the-Field body; leader/“you”/H2H-win/accent chrome use cobalt
  `--accent` + ds tokens; no gold leak. Brand/icon primitives reused, not re-drawn.
- **Stylesheet discipline:** one canonical global ds.css (**not** forked); the Vs-the-Field rework styles
  live in a route-scoped sheet layered on it.
- Tailwind / `globals.css` / Preflight retained globally; the landing, auth, hub/shell, Draft, and
  Lineup screens all still render and function unchanged.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter @app/web
  build` green; `/vsfield` keeps its dynamic shape (it's `ƒ` — keep it `ƒ`); other route shapes
  unchanged.
- No out-of-scope churn: no view-model / read / route / Realtime / migration edits, no shell-chrome
  expansion, no `AppShell`/`shell.css` edits, no Tailwind teardown, no ds.css fork, no other-feature /
  `page.tsx` / auth edits, no provisioning/deploy, no touching the lock-fix / MD2 / scoring workstreams.

## Verification discipline & live-verify
Per the working-protocol **verification rule**: in your report, state **only what you directly verified**
(read code, ran a command, browser-checked a rendered view); label anything non-observable this session
(**Render / live-DB / Realtime / two-browser** behavior) as an **inference to confirm**. For a CSS/render
rework, **source-contract/grep tests can confirm a rule was written but not that it applied at the right
cascade layer** — the real gate is **rendered visual proof on the live Render deploy** (the sprint
cadence: merge → verify-live per screen). You do not need live recompute this session; the Realtime/
polling behaviors are unchanged by the skin. Flag the live-Render visual check as the operator gate.

## Commit discipline
- **Branch off `main`** as **`feat/vsfield-points`**. **Use an isolated git worktree** if any parallel
  Code session is open: `git worktree add ../wc-vsfield-points -b feat/vsfield-points` (the P43/P44
  shared-tree incident — never share a working tree across sessions).
- First commit may carry the handoff assets if they aren't committed yet (e.g.
  `chore(design): commit vsfield points handoff`), then the rework commits — e.g.
  `feat(vsfield): re-skin current-period field + season view to points handoff` and
  `feat(web): route-scoped vsfield rework stylesheet on global ds.css`. Conventional Commits;
  **no force-push.** Push the branch. **Hold the merge for Chat's clearance — report against the
  definition of done first** (diffs / line refs / test counts, not narrative).

## When done
Summarize: which handoff variant you implemented (`vsfield` vs `vsfield2`) and why; what you did with
`tweaks-panel.jsx` (and any token values you lifted); which files you re-skinned and where the rework
styles live (route-scoped sheet name + that it layers on global ds.css, no fork); which handoff surfaces
each view-state/region maps to (via `COMPONENT_MAP.md`); **whether the case-(B) data fork fired** and if
so exactly which design element needs which missing field (for the follow-up Opus prompt); explicit
confirmation that `packages/vsfield` / `buildVsField` / the Prompt-04 helper / the authed read / the
route / the Realtime wiring / the RLS+publication migration are untouched and every existing
Vs-the-Field test still passes; confirmation `/vsfield` stays `AppShell`-wrapped with the
fixed-height/scroll model intact (browser-verified) and no brand lockup added; confirmation still-to-come
stayed a count and no projection/new data was introduced; the test count + coverage; the exact commands
you verified; `git log --oneline -1` + `git status` post-commit; and any `TODO(confirm):` / flagged
follow-up. **Hold the merge.** Do not start any case-(B) data work, the lock fix, MD2, or deploy.