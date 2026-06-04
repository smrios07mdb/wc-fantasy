# Claude Code — Prompt 08: Draft-room UI + Supabase Realtime (+ complete the worker tick seam)

> Paste into Claude Code with the four brain files in the repo root
> (`PROJECT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `SCORING.md`), the **`design/` reference**
> (`design/CLAUDE.md`, `design/COMPONENT_MAP.md`, `design/design_reference/*`), and Prompts 01–07 in
> place (all merged to `main`). **ARCHITECTURE.md §5 (Real-time layer → Live draft room) is the spec
> for this prompt**, with §6 (auth — already wired in Prompt 07) and **DECISIONS.md → Theme C** (snake
> order; per-pick timer = `league.draft_pick_seconds`; autopick on expiry = queue → best-available).
> This is the **first user-facing screen** and the binding pre-kickoff deliverable (the WC opens June
> 11; the draft must run before then).

---

## Context (read first)
Read **ARCHITECTURE.md §5** (the draft room is **server-authoritative**: state lives in
`draft`/`draft_pick`; a controller advances it on **pick-submitted OR `pick_deadline_at` expiry**;
clients **subscribe** and render a countdown **synced to the server's `pick_deadline_at`, never the
client clock**), **§6** (auth), and **DECISIONS.md → Theme C** (the locked draft rules). Then read the
**design reference**: `design/CLAUDE.md` (the intended integration approach — **follow it**, do not
invent a different one), `design/COMPONENT_MAP.md`, and `design/design_reference/draft/*` +
`design/design_reference/shell/*` (the app shell the screen sits in).

State of the build: Prompts 01–07 are done and on `main`. Relevant to this prompt:
- **`packages/draft`** (Prompt 06) — the pure-core controller behind a `DraftStore` port:
  `submitPick(draftId, managerId, playerId, now)`, `tickDraft(draftId, now)`, `startDraft(...)`,
  snake ordering, `autopick` (queue → best-available), a `DraftError` family, and `memoryStore` +
  `prismaStore`. **Do not change its signatures.**
- **Auth** (Prompt 07) — `requireManager` / `getSessionManager`, the authz assertion, the Supabase SSR
  **server + browser** clients, and the **gated `POST /api/draft/pick`** route that resolves the
  session manager, asserts it matches the body `managerId` (**401 no-session / 403 not-your-manager
  before touching the controller**), then calls `submitPick` unchanged. `apps/web/src/draft/handlePick.ts`
  is its server-side helper.
- **`apps/worker/src/draft.ts`** is a **seam/stub** from Prompt 06 — the worker does **not** yet drive
  `tickDraft` on a schedule. A server-authoritative timer that nothing advances is just a column; this
  prompt **completes that seam** (piece 4).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` already exist (Prompt 07) for the
  browser client. `packages/feed` stays a stub; ingestion/scraper untouched.

Guiding constraint, non-negotiable: **"boring and reliable" over clever**, and **server-authoritative**.
The countdown is **never** the source of truth — the server `pick_deadline_at` + the worker tick are.
Do **not** reopen or re-derive any locked decision; where this prompt and the brain files disagree, the
**brain files win**, and **`design/CLAUDE.md` governs the UI integration approach**. If a detail is
ambiguous, follow §5 / Theme C / the design reference, or leave a `// TODO(prompt-NN):` /
`// TODO(confirm):` naming the section — do not invent product rules.

## Scope of THIS prompt — the draft-room screen + Realtime + the tick loop
Five pieces. Keep the draft **decision** logic in `packages/draft` (unchanged); the UI is a thin
**authed** client + a Realtime subscription; the worker tick is thin IO around `tickDraft`.

1. **Read the design first, then build to it.** Open `design/CLAUDE.md`,
   `design/design_reference/draft/*` (notably `draft/app.jsx`, `draft/data.jsx`) and the `shell/*`
   references, and follow the integration approach `design/CLAUDE.md` prescribes (e.g. Tailwind tokens
   / the `ds.css` design system vs. porting the reference JSX). **Match the design**; don't reinvent
   the visuals or the layout.

2. **The draft-room screen** (`apps/web`, App Router, **authenticated** — gate via `requireManager`):
   - **Live pick board** — snake order, picks made so far, the **on-the-clock** manager highlighted,
     round/pick number.
   - **Countdown** — rendered **locally as animation off the server `pick_deadline_at`**, re-synced on
     every Realtime broadcast. **Never trust the client clock for the actual deadline** (the worker
     enforces it; piece 4).
   - **Available players** — undrafted = `player` minus already-drafted (`draft_pick` / active
     `roster_player`), with **search + position filter**. (Depends on the player pool being seeded —
     the deploy/provisioning track; for building/testing here, **seed test players**.)
   - **Current manager's roster-so-far** (counts toward the 2/5/5/3 squad shape — display only;
     legality is the controller's job).
   - **Make-pick action** — calls the **existing `POST /api/draft/pick`** with the session manager's id
     (unchanged route), and **surfaces the typed `DraftError`s** (not-your-turn / already-owned /
     illegal-roster, plus 401 no-session / 403 not-your-manager). **No controller change**; this screen
     adds presentation + the call, nothing more.

3. **Supabase Realtime subscription** (broadcast-on-change; state stays authoritative in Postgres):
   - Subscribe (browser client from Prompt 07) to **Postgres changes on `draft` and `draft_pick`** so a
     new pick or an advance (`current_pick_no` / `current_manager_id` / `pick_deadline_at`) pushes to
     **all** connected clients, who re-render from the authoritative row state.
   - **Presence** on the draft channel for "who's online."
   - Document the **15–30s polling fallback** (ARCHITECTURE §5) as a `// TODO(confirm):` seam; default
     to the subscription since the vendor's already there.

4. **Complete the worker tick seam** (`apps/worker/src/draft.ts`) — the server-authoritative half of the
   timer:
   - While a draft is **`active`**, the worker calls the existing **`tickDraft(draftId, now)`** on a
     **short interval** so an **expired `pick_deadline_at` autopicks** (queue → best-available) and
     advances. Inject the clock at the edge; the decision stays inside the **unchanged** controller.
   - **Idempotent** (a tick before expiry is a no-op); the loop **stops when the draft completes**.
   - This is the boring completion of Prompt 06 — no new draft rules, just *driving* the existing tick.

5. **(Should-have, not blocking) autopick-queue management** — set/reorder `draft_queue`. The engine
   **already falls back to best-available**, so the draft functions without a queue UI. Build it **only
   if** the design reference shows it **and** time allows; otherwise leave a `// TODO(prompt-NN):`.
   **Ship the core first** (board + countdown + pick + Realtime + tick).

## Explicitly OUT of scope (later prompts / the parallel track; leave seams intact)
- **Deploy + data provisioning** (Render + real Supabase, migrations, player-pool schedule-sync, seeding
  league/managers/allowlist, creating the draft) — the **parallel operational track**, not this prompt.
- **Lineup-setting flow, the "vs the field" screen, FAAB/waivers UI, the commissioner/admin surface, the
  group→playoff transition / eliminations** — all later; their design references exist but stay untouched.
- **The scoring engine / recompute / standings / ingestion / scraper / draft-controller / auth
  internals** — done. You **call** `submitPick` / `tickDraft` / `requireManager`; you do **not** change
  them. `packages/feed` stays stubbed; no scraper; **no churn to any prior signature.**

## Key contracts
- Draft **decision** logic stays in `packages/draft` (pure core + `DraftStore`), **unchanged**. The UI is
  a thin **authed** client; the **only write path** is the gated `POST /api/draft/pick`; the worker tick
  is thin IO around `tickDraft`.
- **Server-authoritative**: `pick_deadline_at` + the worker tick are the truth; the on-screen countdown
  is presentation only, re-synced on every broadcast.
- Reuse the Prompt-07 Supabase **browser** client + `requireManager` gate; reuse `NEXT_PUBLIC_*` env.
- Follow `design/CLAUDE.md` for the integration approach; map components to `design/COMPONENT_MAP.md`.

## Tests — keep IO at the edges; don't duplicate Prompt-06 coverage
Vitest; root `pnpm test` stays green. The repo already has **`apps/web` Vitest**
(`apps/web/src/draft/handlePick.test.ts`) — extend that; add Testing Library for component rendering if
not present, else leave a `// TODO(confirm):`.
- **Board / pick action (component or thin integration, mocked route):** the board renders authoritative
  state; the pick action is **enabled only for the on-the-clock manager**; making a pick **posts to
  `/api/draft/pick`** and **surfaces a typed error** (mock the route — assert the body carries the
  session manager id).
- **Countdown is server-derived:** with an injected `now`, the displayed remaining time derives from
  `pick_deadline_at`, **not** the local clock; a re-sync on a simulated broadcast updates it.
- **Worker tick (memory store, fake timers):** `now > pick_deadline_at` → the loop calls `tickDraft` and
  the **autopick advances**; `now < deadline` → **no-op**; a **completed** draft **stops** the loop. No
  real waiting.
- **Realtime wiring (mocked Supabase channel):** the subscription targets the right tables/filter and
  **re-renders on a simulated change**; presence wired. No real network.
- **Purity/edges:** grep-clean that `packages/draft` stays IO-free; clock/network/Supabase confined to
  the worker tick + the browser client + the route.

## Definition of done (verify these pass)
- The **draft-room screen** builds and runs in `apps/web` **to the design reference**; a pick by the
  on-the-clock manager **writes via the gated route** and **pushes to all subscribers**; an **expired
  timer autopicks** via the worker tick; presence shows who's online.
- `pnpm db:generate && pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm
  test` green (+ the new draft-room / tick suites).
- **`submitPick` / `tickDraft` / `startDraft` / `requireManager` / engine signatures untouched**; the
  pick route is only *consumed*, not changed; `packages/feed` still stubbed; no scraper.
- No out-of-scope work (no deploy/provisioning, no lineup flow, no vs-the-field, no FAAB, no admin, no
  transition); design integration follows `design/CLAUDE.md`.

## When done
Summarize: the screen + components built and **which `design/design_reference/draft/*` (and shell)
references they map to**; the Realtime subscription (tables/filters + presence) and the documented
polling fallback; **how the countdown stays server-synced** (and how the worker tick enforces the
deadline); the **worker tick loop completing Prompt 06's seam**; the test count + coverage + the purity
proof; the exact commands you verified; and any `TODO(prompt-NN)` / `TODO(confirm):` left (e.g. the
queue UI if deferred, any web test-harness gap). Do not start the lineup flow, the vs-the-field screen,
FAAB, the admin surface, the playoff transition, or deploy.
