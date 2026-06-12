Code — Prompt 35: Draft nation filter — flag-resolution gaps + collapsible grid

> Paste with the four brain files (incl. the P34 DECISIONS line) + BRAND.md + design/ ref.
> Branch off CURRENT main (must include merged P34 + P34 docs): fix/draft-nation-filter.
> CLIENT-ONLY. Two disjoint-file parts, two commits. NO server, NO loadDraftRoom, NO engine/
> route/handlePick, NO worker, NO Realtime/countdown, NO migration, NO new dependency.

## Context
P31 = /draft nation filter chips; P33 = flags; P34 rebound DraftPlayer.country to FifaTeam.name,
so country is now the feed's exact country NAME string. Two issues visible on the live filter:
(A) several countries render the placeholder, not a flag; (B) the full ~60-country grid is
always-on and eats vertical space. Brain files win; verify premises before editing.

## Part A — flag-resolution gaps (flag-resolver module ONLY: flag.ts / flags.ts)
DIAGNOSE FIRST, then fix:
1. Locate the name→flag resolver. Report the MECHANISM (emoji regional-indicator vs SVG library/
   asset) and, for each currently-failing country, the exact reason it falls through.
2. Enumerate the DISTINCT country-name set actually in play (distinct FifaTeam.name / 
   DraftPlayer.country). For EVERY name that resolves to placeholder — not just the known ones
   (England, Scotland, DR Congo, Côte d'Ivoire, Curaçao, Bosnia & Herzegovina) — add the
   alias/override so it resolves. Key the aliases to the EXACT feed strings (accents/apostrophes/
   ampersands included).
3. Goal: ZERO placeholders across the distinct set.

## Part A — STOP seams (don't expand silently)
- If England/Scotland (or any home nation) require a NEW dependency or vendored SVG assets, or
  the mechanism makes them platform-dependent (emoji tag sequences) → STOP and flag with the
  options; do NOT add a dep or assets on your own. Still complete every other alias in this pass.
- If the fix needs anything beyond the resolver module (touching Flag.tsx render logic, the route,
  or server) → STOP and flag with file+line.

## Part B — collapsible nation filter (filter component + draft.css ONLY)
1. Collapse the nation chip grid by DEFAULT behind a toggle. Position chips (All/GK/DEF/MID/FWD)
   stay always-visible.
2. When a nation is selected, show it in the collapsed header (label + clear control) so an active
   filter is never hidden while collapsed.
3. Ephemeral client state (useState) only — do NOT touch P31's filter-state model, URL params, or
   the position-chip logic. No persistence.

## Part B — STOP seam
- If collapse requires changing P31's filter state, the chip-selection logic, or any server/route
  code → STOP and flag.

## Tests (proportional)
- Part A: extend the existing P33 flag-resolver unit test with the previously-failing names →
  each resolves to a flag, not placeholder. P33's existing flag suite stays green.
- Part B: if a component test harness exists, ONE test (default collapsed; toggle expands;
  selected nation visible when collapsed). If not cheaply unit-testable, skip per proportionality.
- No regression: P31 filter, P33 flags, handlePick, lobby→active, countdown, autopick,
  packages/draft purity grep.

## Definition of done
Zero placeholder flags across the distinct country set (or any genuinely-unsupported name listed
explicitly with reason + the STOP flag raised); nation grid collapsed by default with working
toggle and active-selection visibility; /draft stays ƒ + AppShell-wrapped; client-only, no
server/engine/route/worker/Realtime/migration/dependency edits; pnpm -w typecheck && lint &&
format:check && test exit 0; pnpm --filter @app/web build green.

## When done
Report: flag mechanism; per-country failure reasons found; the full list of names added to the
map; confirmation of zero remaining placeholders (or explicit exceptions); collapse default state;
test count; exact commands verified; git log --oneline -2 + git status.
Branch fix/draft-nation-filter, two conventional commits (fix(draft): flag gaps; feat(draft):
collapsible nation filter), no force-push, hold for Chat's clearance. Model effort: medium.