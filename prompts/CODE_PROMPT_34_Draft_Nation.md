# Claude Code — Prompt 34: Draft nation binding — source country from FifaTeam.name

> Paste with the four brain files + BRAND.md, design/ reference, Prompts 01–33 on main.
> Branch off CURRENT main (must include 33): feat/draft-nation-binding.
> SERVER-SIDE one-file select fix. NO engine, NO route/handlePick, NO Realtime/countdown,
> NO worker, NO migration, NO client changes.

## Context (read first)
P31 added a /draft nation filter and P33 added flags, both keyed off DraftPlayer.country.
VERIFIED against the repo: player.country is a String? column that NO ingestion path writes
(ingestRosters → upsertPlayerByBdlId writes only displayName/position/teamId, prismaStore.ts).
The player's nation is written to fifa_team.name (= the feed's country_name) via player.teamId.
loadDraftRoom.ts's PLAYER_SELECT currently selects the dead `country` scalar and does not join
the team — so the filter chips derive empty and flags never render in prod. This rebinds the
nation to the populated source. Brain files win.

## Scope of THIS prompt (apps/web/app/draft/loadDraftRoom.ts ONLY)
1. PLAYER_SELECT: drop `country: true`; add `team: { select: { name: true } }`.
   (Player.team is the FifaTeam? relation via teamId — verified in schema.prisma.)
2. PlayerRow interface + toPlayer: carry the team, and set DraftPlayer.country = p.team?.name ?? null.
   Keep the DraftPlayer.country FIELD NAME unchanged so P31's filter + P33's <Flag> are untouched.
3. The live value becomes a country NAME ("Brazil", "Korea Republic") — exactly what P33's
   resolver name + FIFA-override branch targets, and what P31's distinct-country chip list expects.

## Out of scope (leave seams intact)
Ingestion (packages/ingest), packages/draft, pick route/handlePick, worker, Realtime + countdown,
the shell, other screens, every client file (components.tsx / Flag.tsx / flag.ts / flags.ts /
draft.css are correct as-is — they key off DraftPlayer.country, which now flows from team.name).
No migration (FifaTeam.name is already populated). No new endpoint.

## Early-warning seams (STOP and flag, don't expand)
- If the Player→FifaTeam relation field is NOT `team`, or the fix needs more than the select +
  toPlayer mapper change → STOP and flag with file+line.
- Any temptation to touch ingestion, the route, the subscription/countdown, the engine, or any
  client file → STOP and flag.

## Tests (proportional)
loadDraftRoom is an untested IO edge by design (its own header). If toPlayer is unit-testable in
isolation, add ONE case: a row with team.name resolves to DraftPlayer.country (and null team → null).
Do NOT add a live-DB test. No regression: P31 nation filter, P33 flag suites, handlePick,
lobby→active, countdown server-derived, autopick totality, packages/draft purity grep all still pass.

## Definition of done
DraftPlayer.country flows from team.name; on the live deploy P31 chips are non-empty and P33 flags
render (country names); /draft stays ƒ + AppShell-wrapped; no engine/route/worker/subscription/
countdown/migration/client edits; pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test
exit 0; pnpm --filter @app/web build green.

## When done
Confirm the relation field used + that the value is a country name; test count; exact commands
verified; git log --oneline -1 + git status. Branch feat/draft-nation-binding, conventional commit,
no force-push, hold the merge for Chat's clearance. Model effort: medium.