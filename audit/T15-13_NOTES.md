# T15-13 — Identity & Copy Truth: Audit Notes

Read-only trace of defect families N2/N6 (raw-email-as-name PII), N3 (raw team-ID in FA copy), and N4 ("balldontlie" in score copy). Nothing edited. All paths relative to repo root unless noted.

Source: T15-A live walkthrough (`audit/T15_WALKTHROUGH_RESULTS.md`), findings N2/N3/N4/N6.

## 1. Canon confirmations

### TeamLabel / "TBD" convention (N3 canon)
- **Component:** `TeamLabel` at `apps/web/src/pool/components.tsx:53-71`.
- **Behavior (confirmed by re-read):** it calls `isTeamResolved(team)` (from `apps/web/src/pool/poolView.ts`, backed by `isPlaceholderTeamName` / `isTeamNameResolved` in `packages/pool/src/pool.ts:190-197`, predicate `/^Team \d+$/`). When a side is null OR a `Team {id}` placeholder, it renders a fixed `<span class="pl-team is-tbd …"><span class="pl-team-name">TBD</span></span>`. The raw `Team {id}` string never reaches the DOM through this path. A sibling defense-in-depth helper `sideName()` at `apps/web/src/pool/components.tsx:161-163` does the same for reveal/modal labels (`isTeamResolved(team) ? team.name : "TBD"`).
- **DECISIONS.md quote (around the cited line ~1972):** `DECISIONS.md:1964-1977`:
  > "The live feed seeds undecided bracket slots as placeholder teams named `Team {balldontlie_team_id}` (e.g. "Team 273"…"Team 304")… `TeamLabel` renders "TBD" for a null OR placeholder side (the raw `Team {id}` name never reaches the DOM); `FixtureCard` renders the pick control only when `pickable`…"

So the pool bracket path is airtight. N3 leaks because it is a **different surface** (see §3) that never routes through `TeamLabel`/`isTeamResolved`.

### Safe-name "resolver" (N2 canon) — the guarantee is MISSING
There is **no shared manager→safe-name resolver.** Every surface reads the raw `manager.displayName` column directly:
- `loadPlayers` owner cell: `apps/web/app/players/loadPlayers.ts:105` (`select: { id, displayName }`) → `:218` `nameById = new Map(managerRows.map(m => [m.id, m.displayName]))` → `:223` `name: nameById.get(...) ?? "Unknown"`.
- Same pattern in the team-budgets/waiver-order rail (`loadWaivers`) and everywhere else (§2).

Critically, `Manager.displayName` is a **NON-NULL** column (`packages/db/prisma/schema.prisma:170`). There is no separate "safe name" field sitting beside an "email" field to switch between. The provisioning path (`apps/worker/src/provision/plan.ts:108`, `cli.ts:115`) *requires* an explicit non-empty `displayName`, and no manager-creation path in the codebase defaults `displayName` to an email. Therefore the observed leak means the **production `manager.displayName` column literally contains email strings** for members who never set a name — and every read renders it verbatim.

**Consequence for the fix model:** the premise "thread a safe name field the loader forgot" does not match reality — the only name field is `displayName`, and it *is* the email. The only true code-level `name ?? email` fallback in the whole app is the commissioner audit log (`apps/web/src/commish/commishView.ts:372`, on the `AppUser` actor whose `displayName` *is* nullable). Everything else is "the column holds an email, rendered raw."

## 2. N2/N6 site table

Every row below renders `manager.displayName` unmodified; when that column holds an email, the email is shown to all league members. None currently routes through any masking helper. "DISPLAY-ONLY vs CONTRACT-TOUCHING" is judged against a fix that shows a stable numbered label like "Manager 4" (needs an ordinal threaded) vs. a generic mask.

| # | Family | file:line | Current leaking render | Correct render via canon | Verdict |
|---|--------|-----------|------------------------|--------------------------|---------|
| 1 | N2 | `apps/web/app/waivers/loadWaivers.ts:320` | `name: m.id === viewerManagerId ? "You" : m.displayName` (Team-Budgets rail) | mask email-shaped `displayName` → e.g. "Manager 4" | Loader selects only `{id, displayName, waiverOrderPosition, faabBudget}` (`:99`). Mask-to-generic = display-only via shared helper; "Manager {waiverOrderPosition}" reuses a field already selected; "Manager {draftSlot}" = CONTRACT-TOUCHING (draftSlot not selected). |
| 2 | N2 | `apps/web/app/waivers/loadWaivers.ts:331` | `name: m.id === viewerManagerId ? "You" : m.displayName` (Rolling-Waiver-Order rail) | same as row 1 | Same as row 1 (waiverOrderPosition already present → display-only for a numbered label). |
| 3 | N2 | `apps/web/app/waivers/loadWaivers.ts:306` | `managerName: b.manager.displayName` (FAAB bids list; select at `:288`) | mask | DISPLAY-ONLY if generic; CONTRACT-TOUCHING for an ordinal (bid select carries no slot). |
| 4 | N2 | `apps/web/app/vsfield/loadVsField.ts:414` | `managers: managerRows.map(m => ({ managerId: m.id, displayName: m.displayName }))` — the "This period" field/standings | mask | Loader selects only `{id, displayName}` (`:171`). DISPLAY-ONLY if generic; CONTRACT-TOUCHING for a numbered label. **Fence-exposed (verify-the-cut).** |
| 5 | N2 | `apps/web/app/vsfield/loadVsField.ts:487` + render `apps/web/app/vsfield/KnockoutUI.tsx:462,464` | `displayName: e.displayName` → `<Avatar name={row?.displayName ?? id}/>` and `{row?.isMe ? "You" : (row?.displayName ?? id)}` (KO ladder ghost rows) | mask | DISPLAY-ONLY if generic. **Fence-exposed (verify-the-cut).** |
| 6 | N2 | `apps/web/src/pool/poolView.ts:203` (selector) → render `apps/web/src/pool/components.tsx:305,377,179,177` | `managerName: m.displayName` → leaderboard `{r.isMe ? "You" : r.managerName}`, modal title, OthersReveal `<b>{o.managerName}</b>` + `title` | mask | Loader `apps/web/app/pool/loadPool.ts:74` selects `{id, displayName}`. DISPLAY-ONLY if generic; CONTRACT-TOUCHING for numbered. **This is the "raw email + Canada" league-picks + leaderboard leak.** |
| 7 | N2 | `apps/web/app/playoffs/loadPlayoffs.ts:71,77` | `select: { id, displayName }` → `managerNames[m.id] = m.displayName` (ladder) | mask | DISPLAY-ONLY if generic. **Suspected fence exposure (verify-playoffs-hero) — needs confirmation, see §6.** |
| 8 | N2 | `apps/web/app/draft/loadDraftRoom.ts:124` + render `apps/web/app/draft/components.tsx:208` | `displayName: m.displayName` → `→ {m?.displayName ?? "?"}` (draft board pick ticks) | mask | Loader **already selects `draftSlot`** (`:63`) → "Manager {draftSlot}" is DISPLAY-ONLY here. |
| 9 | N2 | `apps/web/app/players/loadPlayers.ts:218-223` | owner cell `name: nameById.get(managerId) ?? "Unknown"` | mask | DISPLAY-ONLY if generic; ordinal needs a slot thread. **Fence-exposed (verify-players).** |
| 10 | N2 | `apps/web/app/games/[matchId]/loadGameDetail.ts:173,183` | `managerName: nameById.get(...) ?? "Unknown"` (owner tags on /games) | mask | Loader selects `{id, displayName}` (`:161`). DISPLAY-ONLY if generic. |
| 11 | N2 | `apps/web/app/standings/loadStandings.ts:95` | `managers: managerRows.map(m => ({ managerId: m.id, displayName: m.displayName }))` | mask | Loader selects only `{id, displayName}` (`:40`). DISPLAY-ONLY if generic. |
| 12 | N6 | `apps/web/src/commish/commishView.ts:372` | `actorLabel: row.actor ? (row.actor.displayName ?? row.actor.email) : null` — **the ONLY literal `?? email` fallback** (commissioner audit log) | drop `?? email`; show `displayName ?? "Commissioner"` or masked | Loader `apps/web/app/commish/loadCommish.ts:117` **selects `{ displayName, email }`** on the actor. Here `displayName` is nullable (`AppUser`), so removing the email branch is DISPLAY-ONLY (the select still works; just stop consuming `.email`). Pinned by `apps/web/src/commish/commishView.test.ts:45-46` ("falls back to email") — that test would need updating. |

Note: rows 1-2 (Team Budgets + Rolling Waiver Order) and row 6 (/pool) are the exact three the walkthrough named (`audit/T15_WALKTHROUGH_RESULTS.md:128-129,163`); rows 4-5, 7-11 are the "anywhere the name field renders" superset the walkthrough asked to sweep, now confirmed in code.

## 3. N3 finding — "vs Team 288" in the FA opponent line

- **Render:** `apps/web/src/waivers/components.tsx:157-174` (`OpponentLine`). It prints `{prefix} <NationFlag/> {opponent.opponentName}` (`:165,171-172`) with `prefix = opponent.isHome ? "vs" : "@"`. It renders "TBD" **only when `opponent` is null** (`:158-163`) — not when the opponent *name* is a `Team {id}` placeholder.
- **Source of the raw string:** `opponentName` comes from the shared lineup resolver `resolveOpponentByPlayer` at `apps/web/src/lineup/view.ts:171-200`, which sets `opponentName: m.awayTeamName ?? UNNAMED_OPPONENT` (`:182`) / `m.homeTeamName ?? …` (`:190`). For a knockout fixture whose opponent side is still a bracket placeholder, `awayTeamName`/`homeTeamName` is the literal `"Team 288"` — passed straight through. `loadWaivers.ts` threads this onto each free agent (`opponent: opponentByFreeAgent[p.id] ?? null`, proved by `apps/web/src/waivers/opponentWiring.test.ts:38`).
- **Why it bypasses the TeamLabel/TBD convention:** it is an entirely separate string-interpolation path. `OpponentLine` lives in the waivers/lineup domain and knows nothing about `isTeamResolved` / `isPlaceholderTeamName` (those live in `packages/pool` + `apps/web/src/pool/poolView.ts`). Its only "unresolved" signal is `opponent === null`; a *present-but-placeholder-named* opponent sails through. This exactly matches the walkthrough: a knockout FA shows "vs Team 288" while genuinely null-opponent FAs show "TBD" (`audit/T15_WALKTHROUGH_RESULTS.md:129`).
- **Verdict: DISPLAY-ONLY.** The placeholder name is already present on the `OpponentInfo.opponentName` field the row receives. The fix is to apply the existing `isPlaceholderTeamName(name)` predicate (already exported from `packages/pool/src/pool.ts:190`) at the display boundary — either in `OpponentLine` (treat a `/^Team \d+$/` name as TBD) or in `resolveOpponentByPlayer` (return `null` / a TBD marker instead of the placeholder name). No loader/query change is needed to *know* it is unresolved — the name already tells you. (Threading a cleaner boolean is optional polish, not required.)

## 4. N4 findings — user-facing "balldontlie"

Case-insensitive sweep across the repo returns many hits; the overwhelming majority are internal (env/package/ingest/comments/docs: `SCORING.md`, `README.md`, `packages/ingest/**`, `docs/**`, `packages/scoring/src/types.ts` comments, `commishStatStore.ts` comments, `rating/route.ts` comments). Filtering to **rendered, user-facing copy**:

1. **`packages/scoring/src/index.ts:99,103`** — the primary offender the walkthrough saw. `const src = input.ratingSource ? \` (${input.ratingSource})\` : ""` then `detail: \`rating ${input.rating}${src} → ${signed(pts)}\``. This `detail` string is the §1 Performance-Rating breakdown line rendered on **every player score sheet** (`/lineup`, `/vsfield`, `/games` player cards, `/waivers` FA card, `/players` card). Produces "rating 8.2 (balldontlie) → +3". **Note: this string is generated INSIDE `packages/scoring`, which the memory index repeatedly pins as byte-untouched / high-caution.**
2. **`apps/web/app/commish/CommishConsole.tsx:1845`** — static copy: `Rating override <span…>0–10 · manual beats balldontlie</span>`. Commissioner-facing UI.
3. **`apps/web/app/commish/CommishConsole.tsx:1851`** — `{current.resolvedRatingSource ? \`via ${current.resolvedRatingSource}\` : "no rating"}` renders "via balldontlie" (the raw `RatingSource` value from `apps/web/app/commish/loadCommish.ts:491`). Commissioner-facing.

The walkthrough only flagged #1 (`audit/T15_WALKTHROUGH_RESULTS.md:162`); #2/#3 are additional user-facing (commissioner-facing) exposures found in this sweep.

## 5. Contract-touching summary

The honest picture: **no loader is missing a safe-name field it could simply add** — the only name column is `manager.displayName`, and it is the thing leaking. So the split is about *what label you want to show*, not about a missing join:

- **Nothing needs a name field threaded** for a generic mask ("Manager"): every listed loader already selects `displayName` (the field to mask). Fully display-layer via a shared `safeManagerName(displayName)` helper.
- **For a stable numbered label ("Manager 4"), an ordinal must be threaded** into these loaders, which currently select only `{id, displayName}`: `loadVsField.ts:171` (+`:487`), `loadPool.ts:74`, `loadPlayoffs.ts:71`, `loadPlayers.ts:105`, `loadGameDetail.ts:161`, `loadStandings.ts:40`, and the `loadWaivers` bid select (`:288`). These would become CONTRACT-TOUCHING (add `draftSlot`).
- **Already carry a usable ordinal (numbered label = display-only):** `loadDraftRoom.ts:63` (`draftSlot`), `loadWaivers.ts:99` (`waiverOrderPosition`, for the two rails).
- **N3:** no query change — `opponentName` already carries the placeholder; the `isPlaceholderTeamName` predicate already exists.
- **N4:** no query change — the source string is generated in `packages/scoring` (#1) and static/loader copy (#2/#3).

## 6. Fence exposure

Verifier scripts live in `apps/web/scripts/`. Offender fixes that touch fenced code:

- **verify-players.mjs** — pins the `/players` table incl. the owner cell (`:64` `mt-owner-h`, `:92` `<span class="pl-own ${own}">`). **N2 row 9** (owner-name render, `loadPlayers.ts:218-223`) touches this surface. A fix must keep the `.pl-own` markup/class contract intact so the replica keeps passing.
- **verify-the-cut.mjs** — pins `/vsfield` The Cut / KO ladder components (`theCutSkin.test.ts` markers). **N2 rows 4-5** (`loadVsField.ts:414,487`, `KnockoutUI.tsx:462,464`) render inside this surface. Any masking change to the ghost-row name must preserve the pinned class markers.
- **verify-playoffs-hero.mjs** — pins the `/playoffs` Chocoyo hero (`chocoyoHero.test.ts`). **N2 row 7** (`loadPlayoffs.ts:77` `managerNames`) feeds the playoffs ladder that this hero surface renders. **Suspected fence exposure — needs a check of whether verify-playoffs-hero.mjs asserts on ladder manager-name text vs. only hero-blade markup** (its header comment says it pins the hero markup replica, so a name-mask change likely does not break it, but confirm before a fix thread).
- **Not fenced:** `/waivers` rails (rows 1-3), `/pool` (row 6 — `verify-page-fit.mjs` uses an *email fallback string as a width stressor* at `:200,205`, so if the fix removes emails from that surface, that test's stressor rationale is stale but its assertion is on width, not on the literal email — low risk, worth a glance), `/games` owner tags (row 10), `/standings` (row 11), commish audit (row 12), and the N4 `packages/scoring` line.

## 7. Fix recommendation (recommend only — nothing built)

**Split into (at least) two threads; do not bundle all three families.**

- **N2/N6 — one focused thread, and decide the label policy first.** All twelve sites share one root: `manager.displayName` holds raw emails and is rendered verbatim (only row 12 is a literal `?? email` code fallback). The cleanest, lowest-blast-radius fix is a single shared display-layer helper (e.g. `safeManagerName(displayName)`) that detects an email-shaped value and returns a neutral label, applied at every render site — this is **pure display-only across all twelve rows** and threads no new fields. If product wants a *stable numbered* label ("Manager 4") instead of a generic one, then rows 4, 6, 7, 9, 10, 11 (and the waivers bid list) become **contract-touching** (thread `draftSlot`), which is a materially larger, higher-risk change touching three fenced surfaces (verify-players, verify-the-cut, verify-playoffs-hero) — that variant should be its own thread. Note row 12 also requires updating `commishView.test.ts:45-46`, whose current RED test *asserts* the email fallback. Recommend: settle the label policy, then ship the generic-mask version as one contained thread; defer the numbered-label/contract variant if desired.

- **N3 — can ride along or stand alone; it is pure display.** The fix is a one-line-ish application of the existing `isPlaceholderTeamName` predicate at the waivers opponent boundary (`OpponentLine` or `resolveOpponentByPlayer`). Low risk, no query change, no fence exposure (waivers opponent is unfenced). It is independent of N2's label-policy decision, so it can be folded into the N2 display thread or shipped separately with equal safety.

- **N4 — keep separate from N2/N3 because of blast radius.** The user-visible commish copy (#2/#3) is a trivial display edit. But the *primary* leak (#1) is emitted from `packages/scoring/src/index.ts:99-103`, i.e. inside the scoring engine that the memory index treats as byte-sensitive (dirty-sweep / re-score discipline). Even though dropping the `(${ratingSource})` suffix is display-only for `pts`/`total` (the points are unchanged), any edit to `packages/scoring` warrants the full gate incl. gated Postgres/scoring tests and is a resolver-adjacent, user-owns-the-merge change. Recommend N4 as its own small thread so the scoring-package touch is isolated and does not gate the (much safer, web-only) N2/N3 identity fixes.

**Suspected items needing one more check:** (a) the exact production origin of email-in-`displayName` (no code path defaults it; suspected to be the live provision config having used emails as `displayName` for un-named members — needs a DB spot-check, out of read-only scope); (b) whether `verify-playoffs-hero.mjs` asserts on ladder name text (see §6).
