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
pre-kickoff deadline. All themes remain LOCKED; build is downstream of decisions.
