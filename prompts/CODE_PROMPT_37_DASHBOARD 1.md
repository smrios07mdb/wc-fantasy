Code — Prompt 37: Dashboard home (1 of 2) — foundation + pre-draft + draft phases

> Paste with the four brain files + BRAND.md + design/ ref (Dashboard.html + dashboard/{data,
> components,desktop,mobile,app}.jsx + COMPONENT_MAP + CLAUDE.md).
> Branch off CURRENT main (must include merged P36 + P36 docs): feat/dashboard-home-foundation.
> Server + loader + client. NOT client-only. NO new route (render into page.tsx's hub branch).
> NO new dependency. NO migration unless STOP-flagged and cleared first.

## Context
The dashboard is DESIGNED, not built. Today's "home" is the Prompt-16 nav-card hub — the
`ok → hub` render in apps/web/app/page.tsx, already AppShell-wrapped (Prompt 20, active="home").
The design's phase-aware dashboard IS that home. This prompt builds the foundation + the two
PRE-TOURNAMENT phases only (pre-draft, draft). Group phase = a follow-up prompt; playoff/complete
are deferred (Guillotine + recap don't exist). Canonical visual source = committed
design_reference Dashboard.html + dashboard/*.jsx. Brain files win; DIAGNOSE before building.

## Part A — DIAGNOSE FIRST (report before/with the build, STOP where noted)
1. Phase source of truth. Locate how league phase is represented/derivable in production
   (draft.status / lobby→active→complete, draft start, tournament schedule). Define a PURE,
   IO-free `selectDashboardPhase(...)` in apps/web/src/dashboard/ — mirror the established
   pure-selector pattern (selectLandingView / selectActiveNav), exhaustive switch + `never` guard.
   For THIS prompt it must distinguish: pre-draft | draft | (anything past draft → a minimal
   "tournament underway" interim, since group is the next prompt). Report the exact source fields.
   STOP if phase determination requires a NEW DB column/migration → flag with the proposed column;
   do not add a migration on your own.
2. Per-phase data inventory. For each module the design shows in pre-draft (countdown to draft +
   readiness grid) and draft (on-the-clock + squad forming + recent picks), map module → the
   EXISTING production data source it reads (reuse loadDraftRoom outputs / @app/draft, manager
   list, etc. — do NOT re-derive draft state). For ANY module whose data shape does not exist in
   production (e.g. a scheduled draft-start datetime for a countdown, or a manager "ready" flag for
   the readiness grid) → STOP-flag it with file+line, build the rest, and render that module's
   honest empty/"waiting" state rather than faking data. (Same discipline as the P22 draft-skin
   "data-shape seams".)

## Part B — Foundation (shared scaffold)
- New server loader `loadDashboard` (mirror loadDraftRoom / loadVsField placement + the
  `requireManager` + league-scope gate; reuse existing reads, don't bypass RLS). It returns the
  resolved phase + that phase's module payloads.
- Port the design's render layer to TSX route-scoped CSS (the shell.css / draft.css convention —
  new `dashboard.css` on the GLOBAL ds.css; ds.css NOT forked; zero hex, tokenized, cobalt/red/
  slate only, NO gold leak per BRAND §1/§5): phase-aware `PrimaryBanner` (headline + CTA, colored
  by FUNCTIONAL state via `--phc`, NEVER accent), the `modulesFor(phase)` → `renderModule` router,
  the `db-mod` module shell, and the masonry / spotlight layout from Dashboard.html.
- Components live under apps/web/app/_dashboard/ (the _landing / _auth non-route convention).

## Part C — Phases (this prompt: pre-draft + draft only)
- pre-draft: countdown-to-draft (or honest "waiting for commissioner to start" if no scheduled
  datetime — see Part A.2) + manager readiness/roster grid.
- draft: on-the-clock + squad-forming + recent-picks modules, reading the SAME draft data
  loadDraftRoom exposes (no second source, no re-derivation).
- Render into page.tsx's `ok → hub` branch ONLY: replace the nav-card hub render with <Dashboard>.
  `selectLandingView()`, the outcome determination, and the signin/unlinked/denied renders stay
  BYTE-FOR-BYTE. page.tsx stays `ƒ`. The AppShell wrap + active="home" stay.

## STOP seams
- Phase determination needs a migration/new column → STOP, flag the proposed column, wait.
- Any group/playoff/complete-phase work → STOP (out of scope; next prompt / deferred).
- A module needs data that doesn't exist → STOP-flag (file+line), build the rest, render honest empty.
- Anything touching selectLandingView, auth, routes, middleware, the @app/draft|lineup|vsfield|faab
  packages or their routes (reuse READ-ONLY), the worker, Realtime, or env → STOP.

## Tests (proportional)
- Pure unit test for `selectDashboardPhase` (pre-draft / draft / past-draft interim + the `never`
  guard), in apps/web/src/dashboard/ — mirror landingPage / appShell / draftRoom smokes.
- A pure-Node source-contract smoke for the dashboard render contract.
- No regression: landing four-state, AppShell, CrossNav helper, draft/lineup/vsfield, faab purity,
  packages/draft purity grep.

## Definition of done
Dashboard foundation + pre-draft + draft phases render in page.tsx's hub branch; phase resolved by
a pure `selectDashboardPhase`; loader reuses existing reads behind the requireManager+league gate;
any absent module data is STOP-flagged + rendered as honest empty, NOT faked; selectLandingView +
the non-hub outcome renders byte-for-byte; `/` stays `ƒ`; route-scoped dashboard.css on global
ds.css, zero hex, no gold leak; client-only where it must be (server component by default);
no new route / migration / dependency; pnpm -w typecheck && lint && format:check && test exit 0;
pnpm --filter @app/web build green.

## When done
Report: the phase source found + selectDashboardPhase signature; the per-phase module → data-source
map; every data-shape seam flagged (file+line) + how it's rendered (empty/waiting); what's built vs
STOP-flagged; confirmation page.tsx non-hub states are byte-for-byte and `/` stays `ƒ`; test count;
exact commands; git log --oneline + git status. Branch feat/dashboard-home-foundation, conventional
commits (logical units, e.g. feat(dashboard): phase selector + loader; feat(dashboard): pre-draft +
draft home), no force-push, hold for Chat's clearance. Do NOT touch brain files (docs land at
clearance). Model effort: high (multi-layer: loader + selector + render).