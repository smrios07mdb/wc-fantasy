# World Cup Fantasy — Project Brain

## Product summary
A standalone web app for a **private friends' league**: a FIFA World Cup fantasy game
modeled on Sleeper.com's polish and feature depth, redesigned for a **single-tournament**
format. Snake draft (unique player ownership per league), staggered per-match player
locking, head-to-head group stage, guillotine playoffs on a reduced roster, FAAB waivers.
Not client-facing — fun with friends. Guiding constraint: **"boring and reliable" over clever.**

## Build surfaces (who owns what)
- **Claude Code** — implementation
- **Claude Cowork** — progress tracking + manual/operational steps (draft kickoff, stat
  overrides/corrections, FAAB processing oversight)
- **Claude Chat** — ideation, planning, decisions (this surface)
- **Claude Design** — UX/UI

## Working protocol
- **One decision/theme per conversation thread.** Keeps context lean and decisions clean.
- These files are the source-of-truth "brain":
  - `PROJECT.md` (this) — overview, surfaces, protocol, status
  - `DECISIONS.md` — running decision log across all themes + agenda for open ones
  - `SCORING.md` — the locked, build-ready scoring model
  - `ARCHITECTURE.md` — the locked, build-ready stack / infra spec (split out the way SCORING.md was)
- **Start of each new thread:** attach these files (keep them in the Project's knowledge so
  every thread sees them).
- **End of each thread:** update the files with whatever was locked.
- **Verification discipline (applies to Code AND Chat):** state only what's directly verified — read the
  code, queried the DB, or ran a command. Anything not directly observable — Render env/process,
  dashboard config, request origin, deploy status — is labeled an **inference to confirm**, never
  asserted as fact.

## Locked requirements (from brief)
1. Snake draft; unique player ownership per league.
2. Per-player staggered locking — **a player locks the instant he plays ≥1 minute; until then he
   stays swappable** (refined from "locks at his match kickoff" — a benched 0-minute starter is
   *not* locked).
3. ~~Pre-set subs; a sub only fires if the starter played 0 minutes.~~ **Superseded (Theme B): no
   auto-subs.** Substitution is manual — swap any not-yet-played player. Lock-on-play delivers the
   original 0-minute protection.
4. Group stage: head-to-head — **all-play-all ("power record"); top N advance** (refined from 1v1
   and "top X" — N is the playoff field, set at the transition; likely 8 or 10, see Theme C).
5. Playoffs: guillotine (lowest scorer eliminated each round), reduced roster.
6. Waivers: FAAB blind bid. **(Full rules locked — see DECISIONS.md → Theme D: $100 budget,
   daily pre-dawn batch, free-agency fallthrough, reverse-seed rolling tiebreak, playoff
   reinforcement.)**
7. Standalone website.
8. **Live "vs the field" screen** — required by all-play-all; must show points-so-far alongside
   how much is still to come (see ARCHITECTURE.md → Real-time layer).

## Status
| Theme | Status |
|---|---|
| A. Scoring | ✅ LOCKED (see SCORING.md) — **amended:** 6 verification-forced line changes from the BALLDONTLIE field map (3 drops, 2 keep-via-manual, 1 remap); balance untouched; **§8 card-handling clarification** folded in (additive stacking; top minute band = ≥60 catch-all; no point values changed) |
| Data source | ✅ LOCKED — BALLDONTLIE WC API (stats/events) + Sofascore rating scrape + manual failsafe (**amended twice:** (1) locking is play-driven → needs live substitution events; (2) verification — **Sofascore scrape is the PRIMARY rating source** (calibration target), BALLDONTLIE's own `rating` = automatic fallback (provenance unknown); ingestion is **polling** (no webhooks at our tier); tier confirmed **GOAT $39.99/mo**) |
| B. Roster & lineups | ✅ LOCKED — 15-man squad (2/5/5/3), XI of 11, lock-on-play / no auto-subs, multiple-lineups defined, playoff cap ≈9 (7+2) |
| C. League & format | ✅ LOCKED — all-play-all regular season (seed by record, ties by total points), period = matchday wave; **snake draft, per-pick timer = config, autopick queue→best-available**; **playoff field flexible (likely 8 or 10), per-round cut ≈2 tapering to 1 over the 5 WC knockout rounds, fixed at the transition**; **guillotine elimination tie = lowest cumulative tournament total points** (commissioner backstop); **late-correction freeze ≈6h after last FT, commissioner-only after**. Only the recruiting-dependent manager/field number is deferred (config) |
| D. FAAB & Waivers | ✅ LOCKED — $100 (resets to a fresh $100 at the playoffs; single budget across knockout rounds); daily pre-dawn blind-bid batch + $0 free-agency fallthrough; per-player kickoff void+refund; rolling waiver-order tiebreak (seeded once by reverse draft order, carried forward into the playoffs — no re-seed; move-to-bottom only when the tiebreak is used); reinforcement = same FAAB cycle on the playoff field |
| E. World Cup attrition | ✅ RESOLVED — folded into the playoff transition + FAAB (reinforcement now fully specified in Theme D) |
| Architecture & stack | ✅ LOCKED (see ARCHITECTURE.md) — TypeScript/Next.js, Postgres via Supabase (+ Auth + Realtime), Render compute (web + workers + cron), polling ingestion, recompute scoring pipeline, lock-on-play live consumer; live "vs the field" screen + draft-room infra specified (draft *rules* now locked in Theme C) |

**Build progress (Claude Code):** Prompt 01 — repo scaffold + Postgres schema ✅ · Prompt 02 — pure
scoring engine + tests ✅ · Prompt 03 — recompute pipeline (DB→ScoreInput adapter + rating resolver +
dirty-flag sweeper) ✅ · Prompt 04 — standing / all-play-all + seeding + guillotine cut-selection ✅ ·
**Prompt 05 — ingestion + locking, COMPLETE ✅** [05a BALLDONTLIE polling + raw layer + lock-on-play
(`locked_at`); 05b isolated Sofascore scraper + rating-fallback comparison] (283 tests). Key build
facts: match→period resolved by an explicit, structural `fifa_match.period_id` (window-inference
retired; single-league assumption, documented); the player-match dirty invariant is hardened + hoisted
to `@app/db` (`STAT_DIRTY_UPDATE` / `markStatPlayerDirty`, imported by ingestion + scraper); the
scraper is a physically isolated `packages/scrape` + `apps/scraper` (no `@app/ingest` import) resolving
identity by **stored Sofascore IDs only** at scrape time, populated by a verified one-time `keyMatch`
pass (auto-writes unambiguous, flags the rest). **Go-live (post-launch — balldontlie carries the
rating until then):** apply the pending migrations (`period_id`, `kickoff_lock_fallback`, the
`recompute_scope` enum-retire, `sofascore_ids`); confirm the BALLDONTLIE base-path/auth header;
implement `loadSofaIndex` (the Sofascore index source — currently stubbed `[]`) + `pnpm add playwright`
& wire the launcher; smoke-test ingestion against the GOAT trial + a real Supabase. · **Prompt 06 —
server-authoritative draft controller (engine), COMPLETE ✅** (327 tests). New pure `packages/draft`
(`@app/draft`): snake order (`managerForPick`), roster legality (the 2/5/5/3 caps via `@app/shared`),
and autopick selection (queue → best-available, both filtered to available + position-legal) + a
store-backed controller (`startDraft` / `submitPick` / `tickDraft` + completion at 15×N) behind a thin
`DraftStore` port (Memory + Prisma impls). The ONE transaction (guarded pick + `roster_player`
ownership + pointer advance) lives in `commitPick`; it is idempotent (monotonic `current_pick_no`
latch) and backstopped by the `draft_pick` and `roster_player` active-ownership uniques. A worker tick
hook (`tickActiveDrafts`) drives timer-expiry autopicks; `pick_deadline_at` is the only timer source of
truth. **SEAM:** the best-available **default-ranking source is injected** — `getDefaultRanking`
returns `[]` with a `// TODO(confirm):` (no `player.default_rank` column exists), so autopick relies on
each manager's queue until a real ranking is wired. Realtime broadcast + the draft-room UI remain out
of scope (the deferred Design+Code deliverable). · **Prompt 07 — auth (Supabase magic-link + allowlist
+ session→manager binding + the draft-op authz gate), COMPLETE ✅** (406 tests, +79). New pure
`packages/auth` (`@app/auth`): the allowlist gate (`isEmailAllowed`, case-insensitive — a
`// TODO(confirm):`), session→manager resolution (`resolveSessionManager` — dual-key match on the
Supabase uid OR the linked `app_user` email, so it is robust to the unpinned link ceremony), and the
scope-gated act-as assertion (`canActAsManager` — `self` = strict self-match, `admin` = commissioner
override) + a typed `AuthError` family — all DB/Supabase/clock/env-free (`purity.test.ts` proves it,
comment-stripped). The edges live in `apps/web`: `@supabase/ssr` server + browser clients (SEPARATE
from Prisma; authz reads `getUser()`, never `getSession()`) + a session-refresh middleware;
`getSessionManager` / `requireManager` (the reusable gate every later route reuses); the minimal
magic-link sign-in / `/auth/callback` (code-exchange + edge allowlist enforcement: a non-allowlisted
email is `signOut` + denied, never admitted) / sign-out; and `POST /api/draft/pick`, whose
framework-agnostic `handleDraftPick` rejects **401 (no session) / 403 (not your manager) BEFORE**
calling the **unchanged** `submitPick`. Google OAuth is config-gated / seamed-optional. **SEAMS
(`// TODO(confirm):`):** the `user_id`↔`manager` provisioning ceremony (lookup is robust to either
`app_user.id == uid` or email-only linking; no self-serve manager-creation wizard) + email
case-sensitivity. Adversarial review (9 agents, 3 findings, **0 confirmed** — all the single-league
`leagueId`-filter non-issue). **Next: the user-facing critical path** (the WC opens June 11) — the
draft-room UI + Realtime (subscribe to the controller's state, call the now-gated `/api/draft/pick`),
the manager-provisioning ceremony, a minimal lineup-setting flow, and deploy. The draft is the binding
pre-kickoff deadline. All themes remain LOCKED; build is downstream of decisions. · **Prompt 08 —
draft-room screen + Supabase Realtime + worker draft-tick loop, COMPLETE ✅** the deferred Prompt-06 UI:
a gated draft-room screen (pure board / countdown / reducer / pickClient / realtime modules) subscribes
to the controller's state over Supabase Realtime and calls the gated `/api/draft/pick`; a dedicated
worker tick loop drives timer-expiry autopicks. · **Mock-draft smoke
test — the draft exercised end-to-end LIVE ✅** Against the deployed app + a real Supabase, the draft
controller + the draft-room UI + Supabase Realtime + the worker tick/autopick now run together: a draft
started, ran on the per-pick timer, and **completed**, recording **both** manual human picks **and**
timer autopicks. Verified facts: (1) **`default_rank` must be populated for autopick** — an empty ranking
makes `selectAutopick` return null and the draft **stalls**, so the go-live order is **`provision rank` →
`provision draft`**; (2) a clean **~30s pick window** was confirmed and the earlier "born-expired
`pick_deadline_at`" was **ruled out** (a non-simultaneous-read artifact, not a real defect); (3) the
worker **autopicks ~1s after each expiry** (autopicks landing = **verified**; *that they originate from
the Render worker = inference* — no process access, but no local worker was running); (4) picks **stream
across two browser sessions via Realtime** (operator-confirmed); (5) **manual pick recording = verified
working** (human picks recorded alongside autopicks). Engineering follow-ups in DECISIONS.md →
"Mock-draft session — open items": the lobby→active client flip on start, and an autopick empty-ranking
fallback (pre-launch hardening). · **Prompt 09 — draft closeout (lobby→active flip + autopick
totality), COMPLETE ✅** the two mock-draft follow-ups closed: the client lobby→active flip on the
`draft.status` change (partial-safe reducer + authoritative state fetch), and a total autopick
best-available fallback via `orderDraftPool` when the queue/ranking is empty (the empty-ranking stall is
gone). · **Draft surface — verified end-to-end on the live Render deploy ✅**
Both follow-ups above are now **CLOSED** (DECISIONS.md → "Mock-draft session — open items"): the
**lobby→active flip** and **live pick + autopick streaming** were confirmed across **two authed clients
with no reload**. Root fix = the browser Realtime client now authorizes with the **user JWT** (`setAuth`)
before subscribing — the anon socket received zero RLS-gated `postgres_changes`; autopick totality came
via the pure `orderDraftPool` (queue → `default_rank` NULLS LAST → `playerId`). · **Prompt 10 —
set-lineup flow (XI picker + lock-on-play binding), COMPLETE ✅** (605 tests, +~110). New pure
`packages/lineup` (`@app/lineup`): `validateLineup(squad, proposedXI, lockState, period, now)` →
`ok | a typed LineupError family` (`illegal-formation` / `incomplete-xi` / `not-your-player` /
`locked-player-moved` / `wrong-period`), with the Theme-B bounds sourced from `@app/shared`
(`FORMATION_BOUNDS` / `STARTING_XI_SIZE`, never re-derived) and **lock-respecting** on each locked slot's
frozen `is_starter` (a played player can't be moved into or out of the XI); behind a thin `LineupStore`
port (Memory + Prisma impls) + a store-backed `setLineup` controller — the decision core is
**purity-proven** (`purity.test.ts`, comment-stripped). The **player lock is consumed, not
reimplemented**: it is ingestion's `lineup_slot.locked_at` (Prompt 05a), read through the SSR loader. The
ONLY write path is the gated **`POST /api/lineup`**, mirroring `POST /api/draft/pick` (resolve session →
assert it owns the lineup, **401/403 before** the controller, scope `self`), with a **triple-defended
server-authoritative lock re-check**: `validateLineup` on the authoritative lock state → `saveLineup`
writes only `WHERE locked_at IS NULL` and **aborts the whole commit if a locked row would change** → the
`enforce_lineup_lock` trigger is the DB backstop (the Prompt-01 latch is **not regressed**).
`wrong-period` gates on `period.closes_at`, and **future windows are legal by construction** (the
validator's `PeriodWindow` carries no `opens_at`) — so pre-setting upcoming windows is allowed, and an
unplayed, never-locked starter is still backstopped by period close. The **set-lineup screen**
(`app/lineup/`, mapped to `design_reference/setlineup/*` + `shell/*`) renders the formation pitch +
bench, swaps start↔bench with live legality feedback (the SAME `validateLineup`), freezes locked players,
and pre-sets per-period windows; lineup data reaches the browser only via the SSR Prisma loader (**no
browser-direct `lineup_slot` read / no Realtime on the table — Theme F needs no new authenticated SELECT
policy**). Opus adversarial review (6 lenses → verify): **0 blockers, 2 majors fixed pre-merge**
(cross-position swaps so the formation can actually change + the live illegal-formation feedback is
reachable; the FAAB-drop orphan-slot reconcile seam TODO'd). **Launch gates (pre-June-11):** (a) wire the
per-player **kickoff indicator** (`kickoffByPlayer` `TODO(confirm)` — `fifa_match.kickoff_at` via
`player.teamId`); (b) the **runtime lock-freeze + late-edit rejection** is deferred (no drafted roster /
live `locked_at` yet) → fold into the GOAT-trial ingestion smoke test. **Carried TODOs:** FAAB add/drop
reconcile (`saveLineup` orphan-slot DELETE + forbid dropping a locked-slot player), a dedicated
`FormationPicker` / `reshape()`, and a commissioner `admin` lineup scope. **Next: the live "vs the field"
screen** (ARCHITECTURE → Real-time layer) — points-so-far alongside how much is still to come,
all-play-all — then the commissioner/admin surface + the group→playoff transition. All themes remain
LOCKED; build is downstream of decisions. · **Prompt 13 — vsfield RLS migration self-test fix (launch-gating deploy blocker), COMPLETE ✅ (deploy reported green).** Migration `20260606170000_rls_realtime_vsfield`'s embedded self-test set the JWT claim to a **non-uuid label** (`'rls_selftest_user_in'` / `'…_out'`); on Supabase the real `auth.uid()` casts `request.jwt.claim.sub` to `uuid`, so the helper `vsfield_caller_shares_league_with_manager` **`22P02`'d on every clean apply** — `prisma migrate deploy` failed at #10 and blocked the Render deploy on WC-eve. **Fix = valid-uuid literals** (`00000000-…-0001/0002`, canonical-lowercase so `manager.user_id (text) = auth.uid()::text` round-trips), mirroring the Theme F precedent (`20260605170000_enable_rls_public_tables`). Helper / SELECT policies / `supabase_realtime` adds **byte-for-byte unchanged**; cleanup (sentinel-rollback) already present; member-can / non-member-cannot assertion intact (#10 `finished=true` ⇒ both branches green). Proven by a Supabase-faithful Docker repro (uuid-returning `auth.uid()`) that reproduced the Render error byte-for-byte, then applied all 10 clean with zero residue. **Production gate cleared (operator-confirmed):** failed record resolved on the live Supabase DB (`migrate resolve --rolled-back`), branch `fix/vsfield-migration-selftest` merged to `main` (FF, 2 files: the 8/2 migration hunk + RUNBOOK), Render deploy ran #10 clean → green (first green deploy carrying the vsfield RLS migration). Recovery documented in **RUNBOOK d.1**. ⚠️ *Confirm-to-close (not yet observed): worker process up + sign-in→vs-the-field smoke — build/migrate is green; worker + smoke pending operator confirm.* · **Prompt 15 — pre-prod security follow-ups (function hardening), COMPLETE ✅** Migration `20260606180000` on `main` (clean merge `c8f404d`) + Render deploy **GREEN** (embedded self-test passed on live → `EXECUTE` revoke + both `search_path` pins **catalog-verified**): `REVOKE EXECUTE` on `mirror_auth_user_to_app_user()` from `PUBLIC`/`anon`/`authenticated` (`SECURITY DEFINER` kept — trigger still fires) + pin `enforce_lineup_lock` `search_path=''` (`INVOKER`, body unchanged), guarded by a fail-safe catalog-only self-test. Net-new vs prior `main` = only the lineup-lock pin (the mirror revoke + `''` pin were already in `20260606010000`). Behavioral confirms fold into go-live: first allowlisted signup → `app_user` row (trigger fires); first kickoff → locked-player swap rejected (no live locks pre-tournament). Leaked-password protection (HaveIBeenPwned): pending operator dashboard toggle. (Prompt-13 worker+vsfield smoke + Prompt-14 close-out remain separate.) · **Prompt 16 — landing hub (auth-aware root replacing the scaffold), COMPLETE ✅** (690 tests, +5). The Prompt-01 scaffold `/` (`apps/web/app/page.tsx`) is replaced by an **auth-aware server component** that reuses `getSessionManager()` **unchanged** (the Prompt-07 `getUser()`-backed edge) and defers the render to a pure **`selectLandingView(outcome)`** (`apps/web/src/landing/`, IO-free, `@app/auth` type-only import, exhaustive `switch` with a `never` guard so a 5th outcome kind is a compile error). Four states → four renders: **no-session → signin** (single "Sign in" CTA → `/sign-in`, closing the front-door gap); **ok → hub** ("Signed in as {name}" + nav cards to `/draft` / `/lineup` / `/vsfield` + a **POST** sign-out `<form action="/auth/sign-out">`, closing the post-login stranding gap — members land here via the callback's default `/` redirect, `safeNextPath(null)` left unchanged); **no-manager → unlinked** — a **distinct** "not linked to a manager yet — contact the commissioner" state, **NOT** routed to `/auth/denied` (the Prompt-07 provisioning seam; the `handlePick` / `handleVsField` 403-collapse is deliberately split out here); **not-allowlisted → denied** (defensive — the callback already signs these out). The build flips `/` from static `○` to **dynamic `ƒ`** (per-request SSR) — a cached static root would have leaked one user's hub to all, so the dynamic render is a correctness requirement, verified. `pnpm -w typecheck && lint && format:check && test` (690) + `pnpm --filter web build` all exit 0; no out-of-scope churn (no redirect/callback change, no feature-page / API / middleware / auth-core edits, no admin surface, no security-closeout churn, no new routes/env). **Numbering:** this is **Prompt 16**, deconflicted from **Prompt 15 = the pre-prod security follow-ups closeout** already on main (unrelated). **Next follow-up (flagged, not done):** the shared cross-nav strip on the three authenticated layouts so members move between draft / lineup / vsfield without bouncing through `/`. ⚠️ *Merge: implemented + verified on `feat/landing-hub` @ `dd0aed3`; merge to main pending base-reconcile onto `9accb1f` + working-tree cleanup (see DECISIONS → "Landing hub & route-map ground truth").* · **Prompt 17 — shared cross-nav strip on the authenticated screens, COMPLETE ✅** (697 tests, +7). `/draft`, `/lineup`, `/vsfield` had no cross-navigation — reaching one from another meant bouncing through `/`. Closed by a single presentational shared component, `apps/web/app/shell/CrossNav.tsx` (client component for `usePathname()`), mounted once per route-scoped layout — **no shared layout existed** (each screen has its own `app/<route>/layout.tsx`; the route-group refactor to a literal shared layout was rejected as out-of-scope churn). Markup lives in one place — no triplication. Links the other two feature screens + home (`/`); the current screen is indicated via a pure **`selectActiveNav(pathname)`** (`apps/web/src/shell/`, mirroring `selectLandingView` — exact home match; feature routes match exact / trailing-slash / nested sub-path but not a prefix-sibling like `/draftroom`; → `.tab.is-active` + `aria-current="page"`). Sign-out reuses the Prompt-16 hub form verbatim (`<form action="/auth/sign-out" method="post">` → existing 303 handler; native POST, JS-free even inside the client component). Zero new CSS (reuses ds.css `.tabs`/`.tab`/`.btn-ghost`). No new auth / routes / env / middleware; screens stay `getSessionManager()`-gated as before; build keeps `/draft` `/lineup` `/vsfield` dynamic `ƒ`. 7 unit tests (`crossNav.test.ts` — config shape + path-match edges). Full gate + `pnpm --filter web build` exit 0; no out-of-scope churn (hub `/` untouched; no feature-page / API / admin / auth-core / security-closeout edits). **Last navigation follow-up — nothing further flagged from this theme.** Merged to main @ `14a0811` (off current main `52e1416`, ff, no force-push). · **Prompt 19 — landing visual re-skin (apply the XI design system to `/`), COMPLETE ✅** (708 tests, +7). The Prompt-16 four-state `/` is re-skinned to the delivered design as a **purely visual** change: `selectLandingView()`, the four-outcome branch, the session read, and the route set are **byte-for-byte unchanged** (proven by `diff` of `Home()` vs HEAD + a source-contract smoke). The handoff package (`design_handoff_landing`) was **NOT actually vendored** as the prompt claimed (its `ds.css` is byte-identical to the already-vendored `apps/web/app/{draft,lineup,vsfield}/ds.css`; only `landing.css` + `XI Landing.html` were new) — the operator supplied it from Downloads; vendored to `apps/web/app/_landing/`. **The delivered design is a full 10-section public marketing+login page, not a four-state hub re-skin** (the prompt's premise was off): resolved with the operator → the logged-out **`signin`** state renders the full XI marketing landing (`_landing/MarketingLanding.tsx`, ported 1:1 from `XI Landing.html`: nav · hero · brand-trophy band · 4 mechanics rows · scoring 5-col grid (categories only, **no point values** — honesty) · draft-board + flag-pitch showcase · how-it-plays · 6 explore cards · CTA · footer); **`hub`/`unlinked`/`denied`** get branded `ds.css` panels (no design pixel-truth exists for them). The prototype's **two inline self-serve email forms become a "Sign in" CTA → `/sign-in`** (honoring "no self-serve join flow"); the prototype Tweaks panel + `<script>` are dropped (scroll-reveal left static — `.lp-reveal` is fully visible at rest, so the page stays a server component, no client boundary). **CSS is per-route, NOT global** (operator decision — global `ds.css` would double-reset with the existing Tailwind `globals.css` + double-load on the feature routes): `ds.css` + `landing.css` imported in `page.tsx`, scoped under a `.lp` wrapper; root `layout.tsx` untouched (no conflict with Prompt 18's metadata edit). **Two sanctioned `landing.css` adaptations:** `body.lp` → `.lp` with **`overflow-x: clip`** (not `hidden` — would make `.lp` a scroll container and break the sticky nav) + **`color: var(--text-primary)`** (the root `<body>`'s Tailwind `text-slate-900` *class* beats `ds.css`'s `body{color}` *element* rule on `/`, so color-less headings would inherit dark-on-dark). `<Brand/>` (`BrandMark`) sits in every state's header; sign-out stays a **POST** form; **unlinked stays distinct from denied** (only `denied` links `/auth/denied`). Amends **ARCHITECTURE §1 "Tailwind"** (plain CSS consumed as-delivered; see DECISIONS). Opus adversarial review (5 lenses → verify): **0 blockers / 0 majors / 0 confirmed-serious**; folded in the a11y polish it surfaced (decorative trophy/icons `aria-hidden` so the brand link reads "XI WC Fantasy League", not "XI XI …"). Gates: `pnpm -w typecheck && lint && format:check && test` (708) + `pnpm --filter web build` all exit 0; **`/` stays `ƒ`**; `/sign-in` + `/auth/denied` unchanged (`○`). **Deferred follow-up (flagged):** skin `/sign-in` (+ `/auth/denied`) — the login design (`Join.html`) was **not in this handoff bundle**, so not improvised. ⚠️ *Branch `feat/landing-design` (`aa295bd`) **stacks on Prompt 18** (`feat/brand-pwa`) — it imports `Brand.tsx` (landed in 18, not yet on `main`); **merge order: 18 → main, then 19.** Held for clearance; not pushed; no force-push.* · **Prompt 20 — App Shell: `ds.css` global foundation + shell chrome, COMPLETE ✅** (723 tests, +15). The first/foundational screen of the design sprint; every later skin sits on it. **(1) `ds.css` promoted to the single GLOBAL stylesheet:** imported once in root `layout.tsx` **after** `globals.css` (wins cascade ties); canonical byte-identical copy at `app/styles/ds.css` (md5 `66d4bbbc`); the 4 per-route copies stay (double-load harmless; de-dup is post-sprint). Tailwind / `globals.css` / Preflight **coexist** (not retired). **(2) Collision A (body surface) fixed:** root `<body>` dropped Tailwind `bg-slate-50 text-slate-900` (CLASS selectors that out-specified `ds.css`'s `body{…}` ELEMENT rule, pinning the app light); the ds **dark** surface now applies (dark = the `:root` default, no `data-theme` needed); `min-h-screen antialiased` kept. **(3) App Shell chrome:** `app/shell/AppShell.tsx` (+ `shell.css`) — the design's **GlobalTopbar** ported from `App Shell.html` + `shell/*`, a **pure server component** (no client JS: explicit `active` prop instead of CrossNav's `usePathname()`; plain `<a>` nav; POST `<form>` sign-out). `<Brand/>` per **BRAND.md §5** = `BrandBadge` trophy chip + "XI" + `WC Fantasy League` secondary line (brain file overrides the prototype's league-name-as-primary). Nav lists **only the 4 built routes**; the prototype's 14-screen IA + "More"/bell/avatar/mobile-tab-bar/sheets/commissioner (all targeting **unbuilt** screens) are flagged `TODO(confirm)` seams. **(4) Mounting** = per-feature-layout (no route group — the dual-state `/` can't be wrapped unconditionally): `/draft` `/lineup` `/vsfield` layouts swap `<CrossNav/>`→`<AppShell active=…>`; the **hub state only** of `page.tsx` is wrapped (`active="home"`, dropping its `.lp-nav`). `selectLandingView()` + `Home()`'s branch + the `signin`/`unlinked`/`denied` states are **byte-for-byte** (they keep landing chrome). **CrossNav absorbed** — `app/shell/CrossNav.tsx` deleted; the pure `crossNav.ts` helper + test stay/reused. Amends **ARCHITECTURE §1** + **supersedes Prompt 19's "per-route, not global."** **Opus adversarial review (5 lenses → verify): 3 of 10 confirmed, all folded** — (a) a naive height port clipped the fixed-height `/draft` surface (~3300px, browser-reproduced) → restored the design's `.sh-app{height:100%}` + `.sh-content{flex:1;min-height:0;overflow-y:auto}` dual model, **browser-verified** for both fixed-height (/draft) and natural-scroll (/lineup,/vsfield,hub); (b) global dark body made `/sign-in`+`/auth/denied` gray status/helper text illegible (~2:1) → minimal `text-slate-400/300` legibility repair (still Tailwind; full skin stays Prompt 21); (c) duplicate `banner` landmark on `/lineup` → `aria-label="Global"` on the shell `<header>`. Gates: `pnpm -w typecheck && lint && format:check && test` (723) + `pnpm --filter @app/web build` all exit 0; **`/` stays `ƒ`**; `/sign-in`+`/auth/denied` stay `○`; no out-of-scope churn (no Tailwind retirement, no feature-body re-skin, no `selectLandingView`/auth/route/env/middleware/`.gap-*`/admin edits). **Next: Prompt 21 — sign-in / Join skin** (`/sign-in` + `/auth/denied` from `Join.html` + `auth/*`, migrating them off Tailwind). ⚠️ *Branch `feat/app-shell`, off post-19 `main`; held for clearance; not pushed; no force-push.*
