 Claude Code — Prompt 31: Draft-pool UX — queue draft-button + country filter

> Paste with the four brain files + BRAND.md in the repo root, the design/ reference
> (design/CLAUDE.md, design/COMPONENT_MAP.md, design/design_reference/*), Prompts 01–30 on main.
> Branch off current main: `feat/draft-pool-ux`. This is a CLIENT-SIDE extension of the existing
> /draft available-players + queue UI. Presentation + one optional additive select column only.
> NO engine, NO route/handlePick, NO Realtime/countdown, NO worker, NO migration.

## Context (read first)
ARCHITECTURE §5 (server-authoritative draft). /draft (Prompts 08/09, re-skinned P22) renders:
available players = `player` minus drafted, with SEARCH + POSITION filter (client-side); a per-player
make-pick action → gated `POST /api/draft/pick` surfacing typed DraftErrors (not-your-turn /
already-owned / illegal-roster + 401/403); a draft-queue UI (the manager's autopick order). Brain
files win; design/CLAUDE.md governs integration; BRAND.md §1 = gold ONLY in the trophy → no gold in
the body, use cobalt `--accent`.

## Scope of THIS prompt
1. **Queue rows get a make-pick affordance.** Each row in the EXISTING queue list renders the SAME
   Draft action the available-players list uses, bound to that row's playerId. Identical gating:
   enabled only when (session manager is on the clock) AND (pick window open) AND (player still
   undrafted); else disabled with the existing disabled/tooltip treatment. On click it calls the
   EXISTING pick path verbatim (no new endpoint, no handler change) and surfaces the SAME typed
   DraftErrors. On success the drafted player drops off the queue the same way they drop out of the
   pool (now owned) — REUSE the existing "owned ⇒ filtered out" derivation; do NOT add bespoke
   queue-mutation logic.
2. **Country filter on the available pool.** Add a country/nation filter beside the position filter,
   same control pattern + same client-side model (composes with search + position, AND semantics).
   Options = distinct countries in the pool, sorted, with an "All" default. Design styling, ds tokens,
   no gold.
   - **Data contingency (flag, don't expand):** if the available-players payload ALREADY carries the
     player's country/nation field → filter client-side exactly like position (no fetch, no query, no
     Realtime change). If it does NOT → the ONLY sanctioned change is adding that column to the
     EXISTING available-players select so the field is present. Do NOT add a new fetch, change the
     Realtime payload, or touch handlePick/route/subscription. If it needs more than a one-column add
     to the existing select → STOP and flag with file+line.

## Out of scope (leave seams intact)
packages/draft, the pick route/handlePick, the worker tick, the Realtime subscription + countdown
server-sync (untouched — that's Prompt 32), the shell, other feature screens, deploy/provisioning.
No new endpoints; no migration unless the single additive column above is needed AND model-supported
(flag if so).

## Early-warning seams (STOP and flag, don't expand)
- Queue UI absent in the build → STOP and flag (do NOT build a queue from scratch; it's its own feature).
- Country field needs more than a one-column add to the existing select → STOP and flag.
- Any temptation to touch route / subscription / countdown / engine → STOP and flag.

## Tests (proportional; extend apps/web suite)
- Queue-row draft action present; enabled ONLY for on-the-clock + available; posts the right playerId
  to the pick path (mock route); surfaces a typed error.
- Country filter composes with search + position (client-side) and an "All" reset.
- No regression: handlePick, lobby→active, countdown-server-derived, autopick totality, packages/draft
  purity grep all still pass. Don't over-test static markup/ds classes.

## Definition of done
Both features work to the design; existing Draft behavior + all existing tests unchanged; /draft stays
`ƒ` and AppShell-wrapped; no engine/route/worker/subscription/countdown edits; no gold leak;
`pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter @app/web build` green.

## When done
Summarize files touched; which country-field branch you hit (client-side vs one-column add) or where
you stopped; the queue-button reuse of the existing pick path; test count; exact commands verified;
`git log --oneline -1` + `git status`. Branch `feat/draft-pool-ux`, conventional commit, no force-push,
**hold the merge for Chat's clearance.** Model effort: medium.