Claude Code — Prompt 26: Waivers UI (/waivers screen on the FAAB engine)

Context (read first)
The design reference is the visual truth:
design/design_reference/Waivers.html + waivers/{data,components,desktop,mobile,app}.jsx. Read all
five files before writing any code. The design is a sim with illustrative data — your job is to recreate
its structure and interactions against real data from the FAAB engine. Do not copy-paste the reference JSX;
port the design's structure, classes, and interaction patterns into the codebase's established
conventions (Next.js App Router, TypeScript, server+client components, ds.css tokens).
What already exists (consume, do NOT rebuild or modify):

packages/faab — the pure resolver, typed errors (FaabBidError), and the Prisma store. The
engine owns bid validation; the UI calls the API routes and renders outcomes.
/api/faab/bid (Prompt 25) — POST (submit), PATCH (edit amount/drop), DELETE (cancel).
Auth gated: 401 no session, 403 not-your-manager before any write. Validation errors return structured
JSON with the FaabBidError kind.
apps/web/app/shell/AppShell.tsx + shell.css — the top-bar nav chrome. Currently lists 4
screens (Home/Draft/Lineup/Vs-field). The nav item list lives in apps/web/src/shell/crossNav.ts
(NAV_ITEMS). Waivers must be added to this list — this is the one justified shared-file edit.
getSessionManager() — the auth gate every screen uses. Returns the session + manager or redirects.
ds.css — global design system (promoted in Prompt 20). Tokens, component classes (.btn,
.tabs, .tab, .pill, .pos, etc.). Use these; do not invent new tokens.
@app/shared — roster legality (2/5/5/3), position types, formation caps.
@app/lineup — findLockedSlotPlayerIds (Prompt 25 addition) — identifies players locked by
play in an active matchday. Relevant for the drop picker (can't drop a locked player).

Guiding constraint: "boring and reliable" over clever. This is a form-driven CRUD screen (place bid,
edit, cancel, view results), not a real-time surface. No Realtime subscriptions, no polling — standard
fetch-on-mount + refetch-after-mutation. Where this prompt and the brain files disagree, brain files win.

Scope of THIS prompt
1. The /waivers route — server component + client shell
New route: apps/web/app/waivers/page.tsx (server component) + layout.tsx (mounts AppShell).
Server component (page.tsx): getSessionManager() gate → load initial data via Prisma:

Manager's faabBudget, sum of pending bid amounts → budget state (available / pending / after-pending).
Manager's waiverOrderPosition + all managers' positions + display names → waiver order rail.
Manager's pending FaabBid rows (with joined playerAdd + playerDrop names, positions, team/nation,
and the add target's next fixture kickoffAt for cutoff display) → claims list.
Recent completed FaabBatch rows (last 5) with their settled FaabBid rows (all managers' outcomes,
since post-batch bids are public per RLS) → batch results.
Unowned players league-wide (free agents) with positions + team/nation + next fixture kickoff →
the composer's player picker.
Manager's current roster (15 players) with lock status (via findLockedSlotPlayerIds) → the
composer's drop picker.

Pass all initial data as props to a "use client" WaiversClient component.
2. The client component — WaiversClient
apps/web/src/waivers/WaiversClient.tsx — the interactive surface. Two tabs per the design:
Tab: "My claims"

FAAB budget bar (FaabBar) — available vs after-pending, per the design's wv-faab-* classes.
Waiver order rail (WaiverOrderRail) — numbered list, current manager highlighted (.is-me),
explanatory note about tie-breaking.
Next batch display — League.faabBatchLocalTime formatted with a countdown to next occurrence.
Label it "illustrative cadence" if you can't compute the exact next batch time from the cron schedule.
Pending claims list — sorted by amount descending (matching engine resolution order). Each claim
shows: add player (name, position badge, nation kit chip, cutoff status), drop player, sealed amount,
edit + cancel buttons. Void state: if the add target's match has kicked off (cutoff passed at
Date.now()), show the void+refund styling per the design (.is-void, refund tag). Edit/cancel
disabled on voided claims.
"+ New" button → opens the BidComposer.
Empty state when no pending claims: "No pending claims. Place a sealed bid on a free agent."

Tab: "Batch results"

List of recent completed batches, most recent first. Each batch: header (batch label/date), then
result rows. Each result: add player + drop + winning amount + outcome (won/lost/void+refund). The
current manager's outcomes accented (.is-mine). Amounts are revealed post-batch (they were sealed).
Foot note: "Void + refund returns the full bid when a claim's player kicks off before the batch.
Equal bids break on the rolling waiver order."

BidComposer (modal dialog):

Opens for new bids and edits. Two-panel layout per the design:

Left: free agent picker. Search input + position segment filter (ALL/GK/DEF/MID/FWD). List of
claimable free agents: unowned, cutoff open, not already in another pending bid (unless editing that
bid). Show name, position badge, nation kit chip, season points (if available, else —). Scrollable,
capped at 40 visible. Selecting highlights the row.
Right: bid details. Amount stepper (min 0, max = available budget + the bid's own amount if
editing). Drop picker: manager's roster filtered to droppable players (owned, not locked by play).
Rules summary text. Submit button (disabled until valid: player selected + drop selected + amount
in range).


On submit: POST /api/faab/bid (new) or PATCH /api/faab/bid (edit) → on success, close
composer + refetch claims list. On validation error, display the FaabBidError kind as inline
feedback (e.g. "Player already owned", "Over budget", "Drop is locked by play").
Cancel / edit / delete: DELETE /api/faab/bid for cancel → refetch. PATCH for edit.

Fully sealed — do NOT show rival bid counts. The design's rivalBids() function was removed per the
CLAUDE.md note: "we DON'T show rival bid counts." Show only the manager's own pending claims; never
display how many rivals are bidding on a player.
3. Reorder — deferred (no priority column)
The FaabBid schema has no priority column. Prompt 25 deferred this: the engine resolves own-bids
strictly by amount (§D locked); priority is the intra-manager equal-amount tiebreak, which needs a
migration to support. Do not add the reorder UI (no up/down arrows, no drag). Display pending claims
sorted by amount descending. Leave a // TODO(confirm): pending-claim reorder needs faab_bid.priority migration where the reorder buttons would go.
4. Shell integration — add Waivers to nav
Add { key: "waivers", label: "Waivers", href: "/waivers" } to NAV_ITEMS in
apps/web/src/shell/crossNav.ts. Update the selectActiveNav test to cover the new path. Mount
<AppShell active="waivers"> in apps/web/app/waivers/layout.tsx.
5. Styling — scoped CSS, ds.css tokens
Create apps/web/src/waivers/waivers.css with the waivers-specific classes from the design reference
(the wv-* and mwv-* prefixes). Import it in the client component. Use ds.css tokens (--accent,
--surface-*, --text-*, --hairline, --r-*, --fs-*, --font-sans, --e3, etc.) — no hardcoded
colors or sizes. No gold — all CTAs and highlights use cobalt --accent. Responsive: the design
shows desktop (two-column: main + rail) and mobile (stacked). Use a media query breakpoint consistent
with the existing screens (~768px or what the design uses).
6. Kit chip rendering
The design uses nation flag kit chips (FaKit in the reference). Port this using JERSEY_BG from the
existing codebase if available, or a simple flag+position display if not. Critical: never set
background-size: cover on a kit chip (the project-wide gotcha from CLAUDE.md — multi-layer background
shorthands collapse).

Explicitly OUT of scope (leave seams intact)

Engine changes — packages/faab, /api/faab/bid, faabBatch.ts are untouched. No new API routes
(reads are server-component Prisma queries, not API endpoints).
Free-agency instant claims ($0 between batches) — flagged sibling concern, not built.
Playoff FAAB reset — the design shows a reset banner; render it conditionally if the league
is in a playoff phase (read from league state), but the reset logic itself is a separate prompt.
Priority column migration / reorder — deferred per above.
Other screens' internals — draft, lineup, vsfield, scoring, recompute, standings, ingestion — no
churn to any of them. The only cross-screen edit is adding Waivers to NAV_ITEMS.
The Free Agents screen (/fa) — a separate future prompt. The waivers composer has its own inline
FA picker; it does not depend on a /fa route existing.


Data-loading guidance
The server component queries Prisma directly (no API route for reads — the existing pattern). Key
queries:

Pending bids: faabBid.findMany({ where: { managerId, status: 'pending' }, include: { playerAdd: true, playerDrop: true } }) — self-scoped (only own pending).
Batch results: faabBatch.findMany({ where: { leagueId, status: 'complete' }, orderBy: { runAt: 'desc' }, take: 5, include: { bids: { include: { playerAdd: true, playerDrop: true, manager: true } } } }) — public post-batch.
Free agents: unowned players = players not in any Manager's roster for this league. Include position, team/nation, and the team's next fixture kickoff for cutoff display.
Manager roster: the manager's 15 players with positions + lock status.
Waiver order: all managers in the league with waiverOrderPosition + user.displayName.
Budget: manager.faabBudget — the "available" line is faabBudget - sum(pending bids).

Shape these into typed props for WaiversClient. The client never calls Prisma.

Tests — keep proportional
Vitest. pnpm test stays green. Proportional to a UI screen:

crossNav.test.ts: the existing suite + a new case for the /waivers path matching.
waivers.test.ts (new): the client component's key behaviors — tab switching, composer open/close,
bid submission calls the API, cancel calls DELETE, void styling applied when cutoff passed, empty state
renders. Mock fetch for API calls; supply typed props (don't hit Prisma). Keep it ≤12 tests.
Do NOT over-test static markup, server-component Prisma queries, or CSS classes. The engine's
validation is already exhaustively tested in packages/faab.

Definition of done

/waivers renders behind getSessionManager() + AppShell; both tabs functional with real data from
the FAAB engine; bid place/edit/cancel round-trips to /api/faab/bid and refreshes; void styling
applied in real time based on cutoff; the composer validates inline before submit.
NAV_ITEMS includes Waivers; the nav strip shows it; selectActiveNav handles /waivers.
pnpm db:generate && pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test exit 0
(+ the new waivers + updated crossNav suites green); pnpm --filter @app/web build exits 0 with
/waivers listed as a dynamic ƒ route.
No churn to packages/faab / /api/faab/bid / faabBatch.ts / scoring / recompute / standings /
draft / ingestion / auth signatures. No engine changes.
Scoped waivers.css uses only ds.css tokens; no hardcoded colors; no gold.

When done
Summarize: the route structure (server component → client component, data loaded, props shape); the two
tabs and what each renders; the composer flow (new + edit); how void state is computed (cutoff at
Date.now() vs add target kickoff); the nav integration (which file changed, new test); the styling
approach (scoped CSS, token usage); the test count + what's covered; the exact commands you verified;
and every // TODO(confirm): left (at minimum the reorder/priority deferral). Report git log --oneline -1

git status. Branch off latest main (suggested feat/waivers-ui), conventional commit, no
force-push, hold the merge for Chat's clearance. Do not push to main.