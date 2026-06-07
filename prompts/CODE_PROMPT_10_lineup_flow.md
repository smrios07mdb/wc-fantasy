# Claude Code — Prompt 10: Set-lineup flow — XI picker + lock-on-play binding

> Paste into Claude Code with the four brain files in the repo root (`PROJECT.md`, `ARCHITECTURE.md`,
> `DECISIONS.md`, `SCORING.md`), the **`design/` reference** (`design/CLAUDE.md`,
> `design/COMPONENT_MAP.md`, `design/design_reference/lineup/*` + `shell/*`), and Prompts 01–09 in place
> (all merged to `main`). **Branch off `main`.** **DECISIONS.md → Theme B (Roster & Lineups), including
> the lock-on-play amendment**, is the spec for the rules; **ARCHITECTURE.md** for where lineup logic
> lives and how the player lock is sourced. This is the **first lineup surface**; the live "vs the field"
> screen is the next prompt. The WC opens June 11.

---

## Context (read first)
Read **DECISIONS.md → Theme B** (the locked roster/lineup rules) and the **lock-on-play amendment**, plus
the relevant **ARCHITECTURE.md** sections (lineup persistence, the player-lock source, the gated-route
pattern). Then read the **design reference**: `design/CLAUDE.md` (integration approach — **follow it**),
`design/COMPONENT_MAP.md`, and `design/design_reference/lineup/*` + `shell/*`.

The locked product rules (confirm exact values against Theme B — **brain files win**):
- **15-man squad: 2 GK / 5 DEF / 5 MID / 3 FWD.** Starting **XI = 11**. Formation bounds: **exactly 1 GK,
  min 3 DEF / min 2 MID / min 1 FWD** (and the rest flexible up to the squad caps). Use Theme B's exact
  bounds; do not invent your own.
- **Lock-on-play (Theme B amendment):** a player **locks the instant he plays ≥1 minute**. A locked
  player **cannot be moved into or out of the XI**; benched starters stay swappable **until they lock**.
  **No auto-subs** — lock-on-play replaces them entirely. Locking is **staggered per player** across a
  match wave (each player locks at his own match's events).
- **"Set multiple lineups"** = pre-setting lineups for **upcoming match windows** (future periods), not
  multiple concurrent entries. The current window's locked players are frozen; unlocked players remain
  editable.

State of the build relevant here (all on `main`):
- **Player lock comes from ingestion** (Prompt 05a) — the `locked_at` monotonic latch / the derived
  player-lock. **Consume it; do not reimplement lock-on-play.** Confirm the exact field/derivation in
  ARCHITECTURE; if ambiguous, read it through a thin accessor and leave a `// TODO(confirm):`.
- **`lineup_slot`** table + its **lock latch** exist (Prompt 01) and the latch is **enforced** (the
  unlock-then-edit escape was closed in Prompt 01 review — don't regress it).
- **Auth** (Prompt 07) — `requireManager` / `getSessionManager`, the authz assertion, the gated-route
  pattern (`POST /api/draft/pick`: resolve session manager → assert it matches body `managerId` → 401
  no-session / 403 not-your-manager **before** touching domain logic). **Mirror this** for lineup.
- **Pure-core / IO-at-edges** is the architecture: lineup **legality is a pure function**; the player-lock
  read and the `lineup_slot` persistence are **IO at the edge**. Mirror `packages/draft`'s shape.

Guiding constraint, non-negotiable: **"boring and reliable" over clever**, **server-authoritative**.
Locked players are frozen **on the server**, not just hidden in the UI. The brain files win where this
prompt disagrees; `design/CLAUDE.md` governs UI integration. If a detail is ambiguous, follow Theme B /
ARCHITECTURE / the design reference, or leave a `// TODO(prompt-NN):` / `// TODO(confirm):` — do **not**
invent product rules.

## Scope of THIS prompt — three pieces
Keep lineup **decision** logic pure; the screen is a thin **authed** client; the route is thin IO around
the pure validator + persistence.

1. **Pure lineup-legality** (a `packages/lineup` mirroring `packages/draft`, or the home ARCHITECTURE
   prescribes — **don't scatter it into the route**):
   - `validateLineup(squad, proposedXI, lockState, period, now)` → `ok` | a typed **`LineupError`** family
     (`illegal-formation`, `locked-player-moved`, `not-your-player`, `wrong-period`/`window-closed`,
     `incomplete-xi`). Encodes the **Theme B formation bounds** and is **lock-respecting**: a change that
     adds or removes a player whose lock is set is rejected. **Pure** — `lockState` and `now` are
     **injected**; no DB / Supabase / `process.env` / wall-clock.
   - Exhaustive tests (below). This is the correctness-critical core; build it **first, TDD**.

2. **The set-lineup screen** (`apps/web`, App Router, **authenticated** — gate via `requireManager`) built
   **to the design reference**:
   - **Formation view** of the XI + the bench; **swap bench↔start**; **live formation/position validity
     feedback** (save disabled + reason shown when illegal).
   - **Locked players visually frozen** (non-draggable / non-removable), with **per-player kickoff + lock
     indicators** so the manager can see who's still movable.
   - **Pre-set upcoming windows** per Theme B (select a future period and set its XI); the current
     window's locked players are frozen.
   - **Save action** → calls the gated `POST /api/lineup` with the session manager's id; **surfaces the
     typed `LineupError`s** plus 401 no-session / 403 not-your-manager. Match
     `design/design_reference/lineup/*` + `shell/*`; map to `COMPONENT_MAP.md`.

3. **Gated `POST /api/lineup`** (authed; **server-authoritative**):
   - Resolve the session manager, **assert it owns the lineup** (401 no-session / 403 not-your-manager
     **before** validating), then call `validateLineup` and persist `lineup_slot`.
   - **Re-check the lock at write time** against the authoritative lock state (a locked-slot edit is
     rejected **server-side**, not just disabled in the UI) — this is the latch the client can't be
     trusted to honor. Reject illegal formations with the typed error.

## Explicitly OUT of scope (later prompts; leave seams intact)
- **The live "vs the field" screen** (next prompt), **FAAB/waivers UI**, **scoring display / live points**,
  the **commissioner/admin surface**, the **group→playoff transition / reduced-roster guillotine lineups**
  — all later; their design references stay untouched.
- **Lock-on-play ingestion / `locked_at`** (done, Prompt 05a — **consume**, don't change). **Draft / auth /
  scoring / recompute / standings internals** — done; no signature churn. `packages/feed` stays stubbed;
  no scraper.

## Key contracts
- Lineup **decision** logic stays **pure** (a package + injected `lockState`/`now`); the UI is a thin
  **authed** client; the **only write path** is the gated `POST /api/lineup`.
- **Server-authoritative lock:** the locked-player freeze is enforced at the route on the authoritative
  lock state; the UI freeze is presentation. Reuse the Prompt-07 Supabase **browser** client +
  `requireManager` gate.
- Follow `design/CLAUDE.md` for integration; map components to `COMPONENT_MAP.md`.

## Tests — TDD-first; keep IO at the edges
Vitest; root `pnpm test` stays green. Build the pure validator's suite **first** (watch RED→GREEN).
- **Pure `validateLineup`:** a legal XI passes; **each formation-bound violation** (e.g. 2 DEF, 0 FWD, 0
  or 2 GK, 10 or 12 selected) → the right typed error; **moving a locked player** (in or out) →
  `locked-player-moved`; selecting a non-owned player → `not-your-player`; a closed/wrong window →
  `wrong-period`; the 2/5/5/3 squad shape is respected. Lock-respecting cases use an **injected**
  `lockState`.
- **Route (mocked auth + store):** **authed owner only** (401 no-session / 403 not-your-manager **before**
  validate); a **locked-slot edit is rejected server-side** even if the client sent it; a legal lineup
  **persists** `lineup_slot`; typed errors surfaced. Assert the body carries the **session** manager id.
- **Component (mocked route):** renders XI/bench from authoritative state; **locked players are
  non-draggable**; an **illegal formation disables save** and shows why; save **posts to `/api/lineup`**.
  No real network.
- **Purity/edges:** grep-clean that the lineup core is **IO-free**; the lock read / `lineup_slot`
  persistence / Supabase / clock are confined to the route + the browser client.

## Definition of done (verify these pass)
- The **set-lineup screen** builds and runs in `apps/web` **to the design reference**; a **legal XI saves**
  via the gated route; **locked players cannot be moved** (enforced **server-side**); **formation bounds
  enforced**; typed errors + 401/403 surfaced; upcoming windows can be pre-set.
- `pnpm db:generate && pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm
  test` green (+ the new lineup suites).
- **No signature churn** (`requireManager` / draft / scoring / ingestion / engine); **lock-on-play is
  consumed, not changed**; the `lineup_slot` lock latch is **not regressed**; `packages/feed` still
  stubbed; no scraper.
- No out-of-scope work; UI follows `design/CLAUDE.md` and maps to `COMPONENT_MAP.md`.

## Runtime verification (only if a live DB/draft is reachable this session; else flag as the gate)
If connected to live Supabase with a populated roster: set a lineup and confirm it **persists**; then
exercise the lock — when a rostered player's match logs ≥1 min (or simulate the `locked_at` write), his
slot **freezes** and the route **rejects a late edit** to it. If the live DB/ingestion isn't wired this
session, **say so** and leave the lock-freeze + late-edit-rejection as the provision-time gate — label
live/ingestion state as an inference to confirm, per the verification rule.

## Commit discipline
- **Branch off `main`** (e.g. `feat/lineup-flow`). Conventional Commits: `feat(lineup): pure XI legality
  (formation + lock-respecting)` and `feat(web): set-lineup screen + gated POST /api/lineup` (split as
  cleanest). **No force-push.** Push the branch. **Hold the merge for Chat review** — report against the
  definition of done first.

## When done
Summarize: **where lineup-legality lives** + the `LineupError` family; the screen + components and **which
`design/design_reference/lineup|shell/*` they map to**; the gated route + **how the locked-slot freeze is
re-checked server-side**; how the player lock is sourced from ingestion (the field/accessor); the test
count + coverage + the purity proof; the exact commands you verified; the runtime lock-freeze check (or
the explicit reason it's deferred + the gate); and any `TODO(prompt-NN)` / `TODO(confirm):` left. Do not
start the vs-the-field screen, FAAB, the admin surface, the playoff transition, or deploy.
