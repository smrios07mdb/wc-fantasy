# CAPTIONS — Club Identity System canvas · turn + option labels

Export: W2 reconciliation final settle · 2026-07-09 · spec v6 · turns in canvas order (newest first)

## Turn 12 — Club badges — the sheet, the construction system, and the registry flip

Registry completion: 28 new crests — the four gap clubs (CAD · LUM · COR · HEL) plus all 24 pool stubs — drawn in the 1a language, one committed badge per club, no variants. crest:true flips registry-wide this turn (sanctioned), so turns 1–10 now render crests wherever the locked chain allows ≥16px; the eight annotations and two hardcoded 6c slots that asserted the old monogram state are edited in place — changelog on 12b. The floor (3b), outage fallback (1d) and plinth rule (3c) are untouched: crestOutage is now the one path to the monogram-heavy state. Scope fence: fictional clubs only — the real-UCL 36 (11c) keep monograms; their actual badges are licensed club artwork, not something this canvas redraws (DEC-0, Sergio clearing rights). QA notes MG-6 and the MG-5 slot resolve as side effects.

- 12aThe badge sheet — all 36 fictional clubs crested, 28 new · one silhouette set, one motif vocabulary, flat fills only · construction rules stated for the v5 sync
- 12bAdoption — the in-situ size ramp (16→40), keyline-vs-plinth, the registry flip, and the annotation changelog · real-UCL posture restated · W2 settle changelog 07-09 (below)

Next: Next: the v5 spec sync lifts badge.construction into §4's sibling section and re-states the registry as fully crested · licensed real-UCL assets drop in when cleared (plinth path ready) · uniqueness gate + edge-luminance run at ingest for any future club.

## Turn 11 — /vsfield consolidation — one phase-aware surface: the fantasy competition + the real-UCL backdrop

The consolidation chapter — RATIFIED 2026-07-07 · D1–D8 (gates per spec v5): /vsfield becomes the app's one competition surface and absorbs the retired /playoffs — no tab proliferates. It hosts two peer regions: the fantasy side (group-phase manager standings → the 8a/8b manager knockout, both formats) and the real-UCL football backdrop (the 36-club Swiss table the 2c flags promised, the real bracket on §6.1 BracketNodeIdentity, matchday, and a populated news/events slot). One phase flag swaps each region's primary object — this resolves R1 (knockout was two surfaces) and R2 (standings lived three places). 11a is the IA, 11b fills fantasy, 11c fills the backdrop. Built to the corrected rules, not turn-1–10 drift: every color state carries a non-color signal (NEW standing rule, release gate) · self disc = cobalt selection state, all other discs slate · monogram text = the luma metric · 3 chars ≥24px / 2 below, uniform (D6b) · live chrome --live red only. Identity fence (§6.2) holds everywhere: crests/monograms identify clubs, initials discs identify managers — never crossed. Real club names are feed data; no licensed crest artwork ships — all 36 clubs monogram through the locked 1d/3b chain until licensing clears (DEC-0).

- 11aThe consolidation IA — one phase-aware /vsfield, fantasy + football as peer sections, no new tabs · /playoffs retired · desktop 1440 + mobile 360 · live, flip the phase · W2 settle 07-09: period nav + Season scope + ceremony states drawn in the 11b annex (W2-17/18); self-status banner in 8b (W2-19)
- 11bThe fantasy side, filled — live group standings (GW13 · all-play-all power record W2-16 · PF tiebreak, self = cobalt selection state) → knockout entry on identical seeds, both formats · pure composition of the locked 8a/8b ManagerKONode primitives · W2 settle 07-09: period nav + Season scope + expanded row (W2-17) · KO ceremony + aftermath (W2-18) — annex below
- 11cThe real-UCL backdrop, filled — 36-club Swiss table with labeled zone bands · the bracket on §6.1 BracketNodeIdentity · matchday · news/events slot designed populated, structured for a feed (source TBD) · live, toggle the empty feed

Next: Ratified 2026-07-07 · D1–D8; the v5 spec sync has landed (§9.2 backdrop contract · §4.1 badge construction · the D2 standing rule + D3 self-disc in §1/§6.2). Next in the window: chapter B — the landing page (real licensed content, Sergio clearing rights). Open on this chapter: news feed source (Sergio) · the 11a expander interactions at build · commissioner format selector stays DEC-0-gated.

## Turn 10 — Waivers chapter — the claim flow, FAAB semantics, and the /players hardening pass

R3's other half: 9b browses, this chapter claims. 10a is the /waivers surface — the FAAB composer honoring the 9a entry (?claim=:playerId) plus the priority queue, one live loop: queue a claim here and cancel it back out. FAAB semantics ship as proposed defaults with product gates (10b) — budget, sealed bids, soft holds and tie-breaks are stated, not silently locked. 10c adds the two-up compare for claim decisions — provider facts + engine totals only, no scoring semantics invented. 10d hardens /players: live search, pagination, canonical route state, and an a11y annex that retrofits 9b and this chapter. §6 fence holds throughout — managers are initials discs even on their own bidding surface; the only crests are players' clubs, resolved through the locked chain. P52 artifact is still not in the project, so 9a sheet labels remain engine slots.

- 10a/waivers — FAAB composer + priority queue · W2 settle 07-09: composer-at-rest primary entry with embedded pool (W2-11) · watchlist (W2-12) · kickoff-void (W2-13) · after-pending model (W2-15) · entry honored from 9a/9b · live: bid, pick a drop, queue it, reorder, cancel — the budget bar follows
- 10bWaiver lifecycle — window → seal → process → results · blind-bid visibility · resolution states · kickoff-void in lifecycle (W2-13) · gates: TIE-BREAK / CADENCE / ROLLOVER shipped (W2-14), REVEAL + MIN BID proposed not locked
- 10cCompare — two-up for claim decisions · provider facts + engine totals only · live: swap either side
- 10d/players hardening — live search with ✕ clear (W2-09) · cumulative load-more pagination (W2-02) · canonical route state · a11y annex retrofitting 9b

Next: Surfaced for review: sign off the five FAAB gates in 10b (tie-break · min bid · cadence · reveal · rollover) · fold t8 + t9 + t10 into Handoff Spec v4 together? · P52 artifact still wanted — 9a sheet labels stay engine slots until it lands · UCL-1 schema ask unchanged.

## Turn 9 — Player chapter — the card, the /players page, the states

The player-surface chapter: the locked identity system composed into the app's highest-frequency drill-in. Nothing new is invented — the player's club resolves through the locked chain (crest ≥16px, monogram below the floor, 1d/3b), the avatar is the §7 disc + crest badge (1g), the list unit is the 5b row, the filter is the shared ClubFilter (1e panel / 4c sheet, reused as-is). Scoring is a trust surface: the 9a breakdown reuses the P52 PlayerScoreSheet pattern — grouped by SCORING.md §1–§8, engine-sourced, display-only. The rulebook is locked and not restated on-canvas: group labels render as engine slots, and sample values sit inside the balance reference (~14 floor / ~23–26 ceiling). Managers appear only as initials discs (§6 fence — the ownership block, never a crest). The acquire affordance is an entry point only — R3: /players browses, /waivers claims (9c). The §7 AS-OF appearance primitive is drawn to spec but UCL-1 data-gated. Spec stays v3; 9c records the v4 items.

- 9aThe player card — expanded single-player object · §7 identity header, crest at 24px through the chain · breakdown = P52 pattern, engine-sourced · live: click matches + flip the state axis · W2 settle 07-09: sheet-hosted (W2-10) · acquisition-cutoff semantics (W2-06) · watch star (W2-12)
- 9b/players as a full surface — R3 browse home · 1e ClubFilter reused as-is (panel / 4c sheet) · 5b row as the list unit · rows drill into 9a · live filters · W2 settle 07-09: availability segment (W2-03) · claims-window line (W2-05) · self-row YOU treatment (W2-07) · claim-entry button (W2-08) · row model ratified as contract — stats live in the 9a card, NEXT FIXTURE in the row; live's 9-col + swipe is the workaround, not the target (W2-01)
- 9cStates + the browse/action boundary — five row/card states (W2-04 adds club-eliminated) · acquire flagged to /waivers (R3) · v4 record · W2 settle 07-09

Next: Surfaced for review: spec the /waivers claim flow next (R3 + FAAB semantics)? · fold t8 + t9 into Handoff Spec v4 together? · UCL-1 schema ask for appearance.clubId stays open.

## Turn 8 — Manager knockout — two selectable formats (bracket · The Cut) + shared seeding

The competition-surface chapter opens on the manager knockout. Locked (Sergio): group phase stays today's league — ~12 managers — anchored, not rebuilt; mechanic corrected to live truth (W2-16, 2026-07-09): all-play-all power record — each period every manager scores against the whole field, and the weekly W–L is the record vs every other manager. Two knockout formats, both production, league-selectable; a league picks one, nothing converges. Round scoring is settled: one round = one aggregated score over a two-GW window, one advancer — no legs, no per-leg 1X2 (the 2c fork is superseded for the fantasy knockout; recorded in 8c for the v4 sync, spec stays v3). Nodes are manager-identity: initials disc + name + one agg score, never crests (§6 fence, 2a avatar rail); the club-crest system pays off one level down, in the 8a lineup drill-in. 8a/8b run on the same seeds, windows and score stream, so a league compares formats on identical data. Winner / loser / TBD / LIVE inherit 1f/4a verbatim. Qualifier count is the stated swappable param — default 8, live in Tweaks: band, tree and blade schedule all recompute.

- 8aFormat 1 · conventional playoff bracket — single-elim tree seeded from the table · qualifiers = Tweaks param (default 8) · managers = initials discs, never crests · live, click LD or C for the round-lineup drill-in
- 8bFormat 2 · guillotine "The Cut" — the blade retargeted from clubs (2c) to the manager knockout · same nodes, same score stream, elimination by field position · like-for-like with 8a · W2 settle 07-09: self-status banner + reduced-squad chip (W2-19) · fallen fold format (W2-20)
- 8cShared seeding + format-selected states — the group table feeds either mode · commissioner selector flagged (DEC-0), not designed · spec-reconciliation recorded for v4

Next: Surfaced for post-review: spec the commissioner format selector next (unblocks on the DEC-0 membership call) or hold · /vsfield-vs-/playoffs hosting (R1 IA follow-on) · v4 spec sync when this chapter settles (fork narrowing + node rename, recorded in 8c).

## Turn 6 — Identity-completeness sweep — /pool pick'em, dashboard matchday module, full box score

The three crest-bearing surfaces the original five (5c) didn't cover — all club-vs-club fixtures, format-locked, no pool-tie dependency (1X2 is per-fixture, phase-agnostic). Everything resolves through the locked 1d/3b chain and the 3c collision rules — zero new logic. 6a re-identifies the Quiniela row with crest sizes stated so floor behavior is explicit; picks stay cobalt per 4a. 6b is the same treatment at module scale — its presence under the league phase is flagged (F-P3-B2), not solved. 6c extends 3c's kit-clash pitch end-to-end across the game-detail box score. Coverage: 5 → 8 applied surfaces (5c stands as the turn-5 snapshot). Manager avatars untouched (§6 fence); Swiss-table chapter unopened; spec stays v2.

- 6a/pool (Quiniela) — two nation flags become two club crests per row · crest 24px desktop / 20px mobile, floor stated · picks cobalt-only · live, try picking
- 6bDashboard matchday module — same fixture treatment at module scale, 18px crests · presence in league phase flagged, not solved
- 6cFull game-detail box score — 3c's kit-clash pitch extended end-to-end: header, events timeline, both lineups · NOR–COR, the locked clash pair

Next: Held per scope: the /vsfield Swiss-table / two-legged / standings chapter (competition-model call) · 6b module presence in league phase (F-P3-B2) — flag only · Handoff Spec re-sync at settle (stays v2).

## Turn 5 — Review response — guard re-calibration (HOLD), --surface-base pin, applied /players, coverage confirmation

Four line items, flags/retrofit only — turns 1–4 intact except where sanctioned. 5a re-parameterizes the 4a guard: the four chrome references are now swap-in Tweaks props, deltas compute live, and the numeric lock is HOLD pending real ds/ds.css tokens. 5b adds the applied /players surface (1d was component-level only). 5c is the five-surface coverage line. The 2c aggregate header now carries its DEC-0 fork-sketch label. Stopped there per scope: no Swiss morph, no agg live-states, no spec re-sync — all Sergio-gated; the Handoff Spec stays at v2 deliberately.

- 5aGuard calibration — tokens are inputs now · paste real ds/ds.css values in Tweaks and the audit recomputes · HOLD on the numeric lock
- 5b/players applied surface — 1d proved the row; this is the page, at 2b fidelity
- 5cCoverage — the five applied surfaces, confirmed

Next: On hold for Sergio: real ds/ds.css tokens (rerun 5a) · DEC-0 fork (unlabel 2c, build agg states) · then the /vsfield Swiss morph + spec v3.

## Turn 4 — Guardrails + coverage — functional-color guard, dim floor, draft at 360, filter as bottom sheet

Closes the remaining review items. 4a locks the rule that keeps club color out of functional chrome — with the three real near-misses in this registry — and enforces the crest dim floor 1f promised. 4b and 4c fill the coverage gaps: the draft board at mobile 360 and the 36-club ClubFilter as a bottom sheet (4c shares live state with 3a — toggle in one, watch the other). Handoff Spec sync lands when the system settles, per plan.

- 4aFunctional-color guard — club color never paints chrome · plus the crest dim floor, now token math
- 4bDraft board at 360 — the grid becomes a picks feed; identity rules unchanged
- 4cClubFilter as a bottom sheet — rows, not chips · live, shares state with 3a

Next: Try next: "sync the Handoff Spec" · "full 12-manager strip with autopick states" · "sheet with country grouping at 36"

## Turn 3 — Stress pass — the three review risks: filter at tournament scale, a hard crest floor, collision rules

Nothing in turns 1–2 changes yet — these are the rules that decide whether it survives contact with real scale and real assets. 3a runs the 1e ClubFilter at the full 36-club field (24 new registry stubs — run crest-less then, crested since 12a; crestOutage re-creates the mid-licensing state it was designed against). 3b locks a crest floor into the 1d resolver — retrofit applied to turns 1–2 in place. 3c adds kit-clash auto-resolution and the dark-crest plinth. 3a/3c remain proposals; 3b is locked.

- 3aClubFilter at 36 clubs — search-within, selected pinned, scroll-capped · live, try searching + toggling
- 3bCrest floor — locked ✓ below 16px the monogram always renders, even when the crest asset exists · retrofit applied to turns 1–2
- 3cCollision rules — kit-clash auto-resolution on shared pitches, plinth for dark crests on base

Next: Try next: "lock the crest floor and retrofit turns 1–2" · "ClubFilter as a mobile bottom sheet" · "functional-color audit — KRY cyan vs cobalt, MER red vs live"

## Turn 2 — Applied surfaces — draft board + waivers, and the format-shift map (closes the F-D08 deliverable)

The two remaining highest-identity surfaces from the captures, re-identified club-first. Nothing new is invented — every crest, kit and monogram resolves through the 1d resolver and the 1a registry. Also this pass: rails re-pinned to BRAND.md — functional cobalt is #4D8DFF everywhere, base #0A0D14, and turn-1's amber state tags re-toned to slate (no gold-adjacent color in UI chrome).

- 2aDraft board — pick cards go crest-first; the bespoke nation grid is deleted, 1e ClubFilter takes over
- 2bWaivers — free-agent list reads club-first; "Nations ▸" becomes the shared ClubFilter trigger
- 2cFormat-shift map — where the Swiss table + two-legged ties change surface shape vs the WC captures (flags only, next pass builds them)

Next: Try next: "mock the full /vsfield Swiss-table morph" · "draft board at mobile 360" · "agg strip states — leg 1 pending, tie level"

## Turn 1 — UCL-4 · Club identity system — replaces the flag-color kit generator (F-D08)

One committed direction, evolved from the live app's dark shell. Placeholder clubs only — crest/kit licensing posture is an open DEC-0 sub-item (was INV-10); every surface accepts real assets via the resolver without redesign. Build contract: Handoff Spec. Full /vsfield layout + two-legged aggregate: next pass (DEC-0).

- 1aFoundations — club registry, 12 placeholder identities + fallback chain
- 1bKitToken — the anchor component (semi-real, reads at 40px+)
- 1cKit on the three pitch surfaces — /lineup · /vsfield compare · game box score
- 1dCrest — the <img> identity atom that retires the emoji flag span
- 1eClubFilter — one shared filter (D4a): replaces NationFilter + the draft's bespoke grid · chips are real buttons · try clicking
- 1f/vsfield (D2) identity primitives — table row + bracket node only; full morph layout is the next pass
- 1gPlayerAvatar crest badge + historical identity (F-D07) — a finished match renders the club he played for then

Next: Try next: "riff on the bracket node winner treatment" · "show the ClubFilter overflow at 24 clubs" · "tighten the lineup card for 3 kits per row at 360"

