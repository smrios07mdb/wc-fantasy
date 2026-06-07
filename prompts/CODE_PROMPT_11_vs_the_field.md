# Claude Code — Prompt 11: Live "vs the field" screen — current-period standings + per-opponent H2H + "still to come"

> Paste into Claude Code with the four brain files in the repo root (`PROJECT.md`, `ARCHITECTURE.md`,
> `DECISIONS.md`, `SCORING.md`), the **`design/` reference** (`design/CLAUDE.md`,
> `design/COMPONENT_MAP.md`, the **vs-the-field** reference under `design/design_reference/` +
> `shell/*`), and Prompts 01–10 in place (all merged to `main`). **Branch off `main`.**
> **ARCHITECTURE.md §5 (Real-time layer → the "vs the field" screen) is the spec for this prompt's
> data + UI**, with **DECISIONS.md → Theme C** for the all-play-all "power record" definition, **§4**
> for the data model (`score_manager_period` / `standing` / `lineup_slot` / `fifa_match.period_id`),
> and **DECISIONS.md → Theme F** for the RLS rule that governs what the browser may read. This is the
> **second reactive surface** (the draft room was the first); it is **read-only** — no new write path.
> The WC opens June 11.

---

## Context (read first)
Read **ARCHITECTURE.md §5** (the "vs the field" bullet is the spec), **§4** (`score_manager_period` /
`standing` / `lineup_slot` / `fifa_match` + the structural `period_id`), **DECISIONS.md → Theme C** (the
all-play-all / power-record definition + the seeding tiebreak), and **DECISIONS.md → Theme F** (RLS:
every public table default-denies the browser unless a policy opts it in; **"any NEW table the browser
reads — direct `.from()` or a Realtime subscription — needs its own `authenticated` SELECT policy"**).
Then the design reference: `design/CLAUDE.md` (integration approach — **follow it**),
`design/COMPONENT_MAP.md`, the vs-the-field reference folder + `shell/*`.

State of the build relevant here (all on `main`):
- **The all-play-all math is already built (Prompt 04).** `packages/recompute`'s `standing.ts` has the
  pure all-play-all computation **and a reusable pairwise-comparison helper** (manager→points map →
  per-pair outcomes) that Prompt 04 exposed **specifically for this screen** to render per-opponent H2H
  + the provisional record. **Reuse it; do not re-derive the W/L rule.** The locked rule (Theme C /
  Prompt 04): `W` = count **strictly below**, `L` = count **strictly above**, **a tie is NEITHER**
  (do **not** compute `L` as `N−1−W`). The "provisional 6-3 so far" record is that **same** function
  applied to the **current (in-progress) period's** `score_manager_period` map — there is **no separate
  "provisional" mode** (standings are always current-state).
- **Scores are already computed + recompute-driven (Prompts 02/03/05a).** `score_player_match` →
  `score_manager_period` → `standing` flow from the recompute sweep on each ingestion pass. **Consume
  `score_manager_period` + `standing`; do not touch the engine / recompute / standings internals — no
  signature churn.**
- **The player lock + match status come from ingestion (05a).** `lineup_slot.locked_at` (lock-on-play)
  and `fifa_match.status` / `.period_id` (the structural match→period link). **Consume; do not change.**
- **The Realtime AUTH pattern is solved (Prompt 08 + the mock-draft fix).** A browser Realtime client
  on an **anon socket receives ZERO RLS-gated `postgres_changes`**; it must call
  `realtime.setAuth(<user access_token>)` **before** subscribe, gate the first subscribe on
  `INITIAL_SESSION`, and re-subscribe on `TOKEN_REFRESHED` (tearing down the prior channel). **Reuse
  that exact pattern** (DECISIONS.md → "Mock-draft session" Learning) — do **not** reinvent it. Getting
  it wrong = the screen **silently never updates** (presence/broadcast would still stream, masking the
  gap — exactly the draft-room bug).
- **Auth (Prompt 07).** `requireManager` / `getSessionManager`, the `@supabase/ssr` server + browser
  clients, `getUser()` not `getSession()`. The vs-the-field read is a **league-scoped read** (you see
  the **whole field**), so the gate is **"authenticated league member" (`requireManager`) — there is no
  own-manager target and no `403 not-your-manager` here** (that part of the draft/lineup gate does not
  apply).

Guiding constraint, non-negotiable: **"boring and reliable" over clever**, **server-authoritative**.
The screen is a thin **authed** client over **server-computed** state. The brain files win where this
prompt disagrees; `design/CLAUDE.md` governs UI integration. If a detail is ambiguous, follow §5 /
Theme C / §4 / the design reference, or leave a `// TODO(prompt-NN):` / `// TODO(confirm):` — do **not**
invent product rules. **In particular: do not invent a points _projection_ — "still to come" is a
_count_, per §5.**

## Scope of THIS prompt — three pieces
Keep the vs-the-field **aggregation** logic pure; the screen is a thin **authed** client; the live path
is a **Realtime change-nudge → an authed snapshot refetch**.

1. **Pure vs-the-field view-model** (a `packages/vsfield` mirroring `packages/lineup`, or where
   ARCHITECTURE prescribes — **don't scatter it into the route/component**):
   - `buildVsField(currentPeriodScores, lineupsForPeriod, matchStatuses, standings, now)` → the display
     model: per-manager **running score** (current period); the **provisional all-play-all record** +
     **per-opponent H2H** — **by calling the Prompt-04 pairwise helper** (import it; do **not**
     re-implement the W/L rule); each manager's **count of starters yet to play** (derived from their
     period `lineup_slot` starters vs the status of each starter's match for the period); and the
     **season view** (record + `total_points` + `seed` from `standing`).
   - **"Still to come" is a count, grounded in §4 facts** — a starter's match not-yet-kicked-off /
     in-progress / finished (via `player`→`team`→the period's `fifa_match`, or whatever §4 join the
     schema supports). **Do not invent a projected-points number.** If the exact bucket boundary
     (yet-to-kick-off vs not-yet-final, and how `locked_at` factors) is ambiguous against §5, follow the
     design reference or leave a `// TODO(confirm):`.
   - **Pure** — all inputs injected; no DB / Supabase / `process.env` / wall-clock. Mirror
     `packages/lineup`'s shape.
   - Exhaustive tests (below), **TDD-first**. The all-play-all assertions must match Prompt 04's rule
     (incl. **tie = neither W nor L**, asserted via the **reused** helper).

2. **The "vs the field" screen** (`apps/web`, App Router, **authenticated** — gate via `requireManager`)
   built **to the design reference**:
   - The **current-period field**: every manager's running score, provisional record ("6-3 so far"),
     per-opponent H2H, and the **"still to come"** indicator (starters yet to play) — the locked §5
     requirement: **points-so-far alongside how much is still to come**. Plus the **season view**
     (cumulative record + total points + seed).
   - **Initial load** = an SSR Prisma loader (owner-bypass) that computes the full snapshot via
     `buildVsField`. **Live updates** = subscribe (Realtime, **JWT-authed per Prompt 08**) to the
     league's `score_manager_period` (+ `standing`) changes; on a change, **refetch the computed
     snapshot** from the authed read (piece 3) and re-render. **15–30s polling is the documented
     fallback** (§5) — wire it as the fallback, default to the subscription.
   - Lineup/match data stays **server-only**: the browser reads **only** `score_manager_period` +
     `standing` (the subscription); the starters-yet-to-play counts, per-opponent lineups, and match
     statuses are **server-computed** in the snapshot — **no browser-direct `lineup_slot` / `fifa_match`
     / `player` read** (keeps other managers' lineups off the Data API; consistent with Prompt 10's
     Theme F posture).
   - Match the vs-the-field reference + `shell/*`; map to `COMPONENT_MAP.md`.

3. **The authed snapshot read + the RLS/publication migration** (the infra the live path needs):
   - An **authed read** (a gated `GET` — e.g. `/api/vsfield` — or a server action; mirror the Prompt-07
     gate) that resolves the session manager (**401 no-session / not-a-league-member**; **no `403
     not-your-manager`** — it returns the whole league's field), then computes + returns the
     `buildVsField` snapshot for the league's **current period** + season view. This is what the client
     refetches on a change-nudge / poll tick.
   - **New raw SQL migration — Theme F (the trap):** add **league-scoped `authenticated` SELECT
     policies** on **`score_manager_period`** AND **`standing`** (a league member may read **all** rows
     for **their** league — all-play-all means the whole field is visible), using the **same idiom as
     the `draft`/`draft_pick` policies** (`auth.uid() = manager.user_id` via a `manager`
     league-membership subquery; mirror migration `20260605170000_enable_rls_public_tables` and the
     `faab_bid` + draft policies). **Add both tables to the `supabase_realtime` publication**
     (`postgres_changes` don't broadcast otherwise — `draft`/`draft_pick` are already in it). Keep it
     **portable to the DoD's plain-Postgres** (the `auth.uid()` shim, as Theme F did). **Without these,
     the subscription delivers zero events and the screen silently never updates** — the exact
     draft-room failure mode.
   - Determine the **"current period"** from `period` status / its matches' statuses (the active wave).
     If the exact current-period selection is ambiguous against the staggered group-stage calendar,
     leave a `// TODO(confirm):` rather than guessing.

## Explicitly OUT of scope (later prompts; leave seams intact)
- **Write surfaces** — lineup (Prompt 10), FAAB/waivers UI, draft (08/09) — done/separate; **no new
  write path here.**
- **The commissioner/admin override surface**, **the group→playoff transition / reduced-roster
  guillotine standings view**, **scoring display internals beyond the period/standing totals** — later;
  their references stay untouched.
- **Past-period browsing / a projected-points model** — out of scope; the screen is the **live
  current-period view + season standing**. (A finished period's all-play-all is already final in
  `standing`; a past-period browser is a possible later addition.)
- **Scoring engine / recompute / standings / ingestion / lock-on-play / auth internals** — done;
  **consume, no signature churn.** `packages/feed` stays stubbed; no scraper.

## Key contracts
- The vs-the-field **aggregation** stays **pure** (a package + injected inputs, **reusing the Prompt-04
  pairwise helper**); the UI is a thin **authed** client; the live path is **Realtime change-nudge →
  authed snapshot refetch** (server-authoritative), with **polling as the documented fallback**.
- **The only new browser-readable tables are `score_manager_period` + `standing`** (league-scoped SELECT
  policy + publication entry) — everything lineup/match-derived stays server-side. Reuse the **Prompt-08
  JWT Realtime-auth** pattern and the **Prompt-07 `requireManager`** gate.
- Follow `design/CLAUDE.md`; map components to `COMPONENT_MAP.md`.

## Tests — TDD-first; keep IO at the edges
Vitest; root `pnpm test` stays green. Build the pure view-model's suite **first**.
- **Pure `buildVsField`:** a fixture manager→points map + lineup/match-status fixtures + standings →
  correct **running scores**; the **provisional record + per-opponent H2H match the Prompt-04 helper**
  (assert the **tie = neither W nor L** case, and an **inactive-0** manager who banks nobody / is a free
  win for everyone strictly above); **starters-yet-to-play** counts correct (all-yet-to-play,
  all-finished, mixed); the **season view** reads from `standing`. Inputs injected (no IO/clock).
- **Authed read (mocked auth + store):** **401 when no session / not a league member**; an
  authenticated league member gets the **whole league's** snapshot (**no 403**, no own-manager
  scoping); the snapshot equals `buildVsField` over the seeded state.
- **Component (mocked route):** renders the field from the snapshot; a **simulated change event triggers
  a refetch + re-render**; the **polling fallback** refetches on tick; **no real network** (view-model
  style, consistent with the draft-room / lineup tests).
- **RLS/publication:** at minimum a migration assertion (in the plain-Postgres shim, as Theme F did)
  that a league member **can** SELECT the league's `score_manager_period` + `standing` and a non-member
  **cannot**; note that the **live JWT-authed `postgres_changes` delivery** is the provision-time gate
  (below).
- **Purity/edges:** grep-clean that the view-model is **IO-free**; Supabase / Realtime / Prisma / clock
  confined to the loader + the authed read + the browser client.

## Definition of done (verify these pass)
- The **"vs the field" screen** builds and runs in `apps/web` **to the design reference**: it shows
  **points-so-far alongside still-to-come** (running score + starters-yet-to-play) per manager, the
  **provisional all-play-all record + per-opponent H2H** (via the **Prompt-04 helper**), and the
  **season view**; it **live-updates** via the **JWT-authed** subscription (with the **polling
  fallback**) and **refetches the server-computed snapshot** on change.
- The **RLS migration** adds league-scoped `authenticated` SELECT on `score_manager_period` +
  `standing` and **adds both to the `supabase_realtime` publication**; **no other table becomes
  browser-readable**; the read gate is `requireManager` (**401, no 403**).
- `pnpm db:generate && pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0;
  `pnpm test` green (+ the new vsfield suites).
- **No signature churn** (engine / recompute / standings / ingestion / auth / the **Prompt-04 helper**);
  **no new write path**; the all-play-all rule is **consumed, not re-derived**; `packages/feed` still
  stubbed; no scraper.
- No out-of-scope work; UI follows `design/CLAUDE.md` and maps to `COMPONENT_MAP.md`.

## Runtime verification (only if a live DB + recompute + an authed client are reachable this session; else flag as the gate)
The **JWT-authed `postgres_changes` delivery on the NEW tables** is the key live check — the same class
of bug the mock-draft session caught on `draft`/`draft_pick`. If connected to live Supabase with scores
recomputing: with an authenticated league member, confirm a `score_manager_period`/`standing` upsert
**streams to the screen** and triggers the refetch (and that an anon socket would get nothing). **If
live scores/ingestion aren't wired this session, say so** and leave it as the provision-time gate —
**fold it into the same GOAT-trial ingestion smoke test** (it needs a drafted roster + live recompute
anyway). The Prompt-08 pattern already proved JWT-auth Realtime works, so this is **low-risk reuse on
two new tables + policies** — label live/ingestion state as an inference to confirm, per the
verification rule.

## Commit discipline
- **Branch off `main`** (e.g. `feat/vs-the-field`). Conventional Commits, split as cleanest — e.g.
  `feat(vsfield): pure vs-the-field view-model (reuses Prompt-04 pairwise H2H)`,
  `feat(db): RLS SELECT + realtime publication for score_manager_period + standing`, and
  `feat(web): vs-the-field live screen + authed snapshot read + JWT Realtime`. **No force-push.** Push
  the branch. **Hold the merge for Chat review** — report against the definition of done first.

## When done
Summarize: **where the vs-the-field view-model lives** + that it **reuses the Prompt-04 pairwise helper**
(the exact import); the screen + components and **which `design_reference/<vsfield>|shell/*` they map
to**; the authed read + its gate (**401, no 403**); the **RLS policies + publication entries added**
(and the confirmation that **no other table became browser-readable**); how the **JWT Realtime-auth**
pattern is reused from Prompt 08 (and the change-nudge → refetch + polling fallback); how "still to come"
is computed (the **count**, the §4 join, and any `TODO(confirm):` on the bucket boundary /
current-period selection); the test count + coverage + the purity proof; the exact commands you
verified; the runtime JWT-`postgres_changes` check (or the explicit reason it's deferred + the gate);
and any `TODO(prompt-NN)` / `TODO(confirm):` left. Do not start the admin surface, the playoff
transition, FAAB, or deploy.
