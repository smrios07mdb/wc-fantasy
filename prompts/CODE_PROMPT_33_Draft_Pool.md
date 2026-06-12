# Claude Code — Prompt 33: Draft-pool flags — country flags on filter + player rows

> Paste with the four brain files + BRAND.md, design/ reference, Prompts 01–32 on main.
> Branch off CURRENT main (must include 31's nation filter AND 32): feat/draft-flags.
> CLIENT-SIDE presentation extension of 31's country work. REUSE 31's nation filter logic verbatim —
> this prompt adds flag rendering only. NO engine, NO route/handlePick, NO Realtime/countdown, NO worker.

## Context (read first)
Prompt 31 added a client-side nation filter on /draft: AvailableFilter.nation, filterAvailable's nation
AND-branch (board.ts), a nation chip row derived from the pool, both reading p.country (the country NAME).
This prompt renders flags beside those names. Brain files win; design/CLAUDE.md governs integration;
BRAND.md §1: cobalt --accent for UI chrome, gold ONLY in the trophy. Flags are CONTENT imagery (a flag
containing yellow is not a UI gold accent) — exempt from the no-gold-in-body rule; chip/control chrome
stays cobalt.

## Scope of THIS prompt
1. **Flag component.** One new `<Flag code={iso2} />` (single file). Renders the emoji flag via
   regional-indicator codepoints from an ISO 3166-1 alpha-2 code. Unknown/empty code → graceful
   fallback (render nothing or a neutral placeholder; never a broken glyph, never a crash). This is the
   ONLY flag-rendering surface, so the source is swappable later in one file.
2. **Player rows.** Available-pool rows (and queue rows) show flag + country name beside the player
   name. Design tokens; cobalt chrome; flags are content imagery.
3. **Filter options/chips.** Each nation option/chip from 31's derived list shows its flag alongside the
   name. REUSE 31's derived option list + filter logic — do NOT re-derive or re-filter.

## Data contingency (flag, don't expand)
The mapping from p.country to a flag needs an ISO 3166-1 alpha-2 code:
- If the available-players payload ALREADY carries an ISO2 code (e.g. country_code) → render flags purely
  client-side from it. No map, no fetch, no migration.
- If it carries only the country NAME → add a static name→ISO2 reference as a pure web util, sourced from
  a standard ISO-3166 list (generate it; do NOT hand-author flag-by-flag). Map name→code at render.
- If a code column EXISTS on the player table but is not selected → the ONLY sanctioned backend change is
  adding that one column to the EXISTING available-players select (P31 pattern).
- If names are inconsistent/unmappable, or it needs more than a util + one-column add → STOP and flag with
  file+line.

## Out of scope (leave seams intact)
31's filter LOGIC (reuse, don't touch), packages/draft, pick route/handlePick, worker tick, Realtime
subscription + countdown (32's domain), the shell, other screens, deploy/provisioning. No new endpoints;
no SVG/flag dependency; no migration unless the single additive code column above is needed AND
model-supported (flag if so).

## Early-warning seams (STOP and flag, don't expand)
- name→ISO2 needs more than a generated util or one-column select add → STOP and flag.
- Any temptation to touch route / subscription / countdown / engine / 31's filter logic → STOP and flag.

## Tests (proportional; extend apps/web suite)
- Flag renders the correct emoji for a known ISO2; unknown/empty code degrades gracefully (no crash).
- Player row shows flag + country name + player name; filter option/chip shows its flag.
- No regression: 31's nation filter (code/ALL/compose), handlePick, lobby→active, countdown server-derived,
  autopick totality, packages/draft purity grep all still pass. Don't over-test static markup/ds classes.

## Definition of done
Flags render on rows + filter to the design; 31's filter behavior + all existing tests unchanged; /draft
stays ƒ and AppShell-wrapped; no engine/route/worker/subscription/countdown edits; no SVG dep; chrome stays
cobalt (flags exempt); pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test exit 0;
pnpm --filter @app/web build green.

## When done
Summarize files touched; which data branch you hit (ISO2-in-payload vs name→ISO2 util vs one-column add) or
where you stopped; confirm flag source = emoji + the <Flag> component is the sole render surface; test count;
exact commands verified; git log --oneline -1 + git status. Branch feat/draft-flags, conventional commit,
no force-push, hold the merge for Chat's clearance. Model effort: medium.