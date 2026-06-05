# Decision Log

## Theme A — Scoring  ✅ LOCKED
Full build-ready model: see **SCORING.md**.

### Key decisions & rationale
- **ONE unified model** (merged the earlier "Model A / Model B" split — the two-model framing
  was confusing).
- **NO milestone/threshold "monster" bonuses.** They created ±6–12 point cliffs and spiked
  variance. Position-balanced ceilings now come from **breadth of categories + a
  position-neutral rating** instead.
- **Sofascore-inspired structure** (~25 categories) for richness — the stated goal is
  "more points, while balanced."
- **Position-weighted goals & assists** (kept from Sofascore): rarer for a position = worth more
  (GK/DEF goal 6 > MID 5 > FWD 4).
- **Performance Rating catch-all, AMPLIFIED ladder (−2 to +5).** Position-neutral, so a steeper
  ladder adds points everywhere **without** unbalancing toward scorers. This is the main
  pool-deepener. ⚠️ Depends on a provider match rating — see Data source below.
- **"For every N" buckets kept** (integers, legible box scores). These are distinct from the big
  bonuses we removed: buckets are 1-point, noise-filtering increments, not variance spikes.
- **Every action scores for ANY position.** Clean sheet / goals conceded / GK keeping stats
  attach to the **role actually played** → the goalie-emergency case (an outfielder forced into
  goal) is handled automatically, no special-case logic.
- **Defensive buckets FLAT** across DEF/MID/FWD (not inverse-weighted) — simpler.
- Fractional points allowed; clean sheet requires 60+ minutes.

### Balance
Monster games cluster **~23–26** across all four positions (a forward hat-trick edges highest,
as the rarest feat). GK/DEF carry reliable floors (~14); MID/FWD are lower-floor, higher-ceiling.

### Superseded along the way (for context)
- An inflated goal ladder (FWD 5 / MID 6.5 / DEF 8 / GK 11) was proposed for a *sparse* model.
  It is **void** — the rich Sofascore-style model reaches balance through accumulation, so goals
  returned to modest values.

### ⚠️ Verification amendment (Architecture thread — ratify)
The OpenAPI field-mapping (see Data source → verification, and **ARCHITECTURE.md §7**) forced
**six line changes**, documented as a marked amendment block in **SCORING.md** (model balance
untouched, fully reversible):
- **DROP** (no feed field, rare/low-magnitude): *clearance off the line* (+2), *successful run-out*
  (+1 ea), *player-level offsides* (−1/2 — only team-level offsides exists).
- **KEEP via manual entry** (Cowork surface; a few per tournament): *penalty won* (+2),
  *penalty committed* (−2).
- **REMAP**: *dispossessed* (−1/3) → feed-native **possession lost** (broader stat; the −1/3 rate
  is kept, accepting that it now catches all careless giveaways, not only being tackled).

### Card-handling clarification (build thread — folded into SCORING.md §8)
§8 left one point open: does a **second-yellow dismissal** also incur the first yellow's −1?
**Ruled: yes — additive, no suppression.** Each card row scores independently and is summed.
*Decisive reason:* under the no-stacking reading a second yellow in the 60–90 band scores only its
bucket (−1) — *identical to a lone yellow* — making a late sending-off cost the same as a harmless
caution. Stacking gives −1 + bucket = −2 (correctly worse), and is also the **boring** implementation
(sum rows; no "was this yellow upgraded?" state). It yields the identity *two-yellow dismissal =
straight red at the same minute band*, which is exactly why §8's second-yellow row sits one point
above the red row. Also locked: minute bands are **lower-bound-inclusive** with the **top band a ≥60
catch-all** (so stoppage-time dismissals score rather than fall through); bucket on the **effective
minute** (incl. `added_time`). **Feed→input requirement (recompute/ingestion prompts):** the
`match_events`→`ScoreInput` mapping must set the first-yellow signal alongside the second-yellow and
classify a two-yellow dismissal as **second yellow, not red** (the `incident_class` confirm-in-code
item, ARCHITECTURE §7). **No point values changed** — purely disambiguating; reversible.

---

## Theme B — Roster & Lineups  ✅ LOCKED

### Squad & starting XI
- **Squad size 15:** 2 GK / 5 DEF / 5 MID / 3 FWD.
- **Starting XI 11:** exactly 1 GK + 10 outfield. Formation bounds **min 3 DEF / min 2 MID /
  min 1 FWD** (standard set: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1, …). The 15-man
  squad can legally field any valid formation and always leave a legal bench.
- **Bench = the 4 non-starters.** No bench priority/ordering needed — substitution is manual
  (see locking), so there is no auto-sub list to rank.
- **Undrafted players → FAAB pool.**

### Locking & substitution — lock-on-play (NO auto-subs)
- **A player locks the instant he plays ≥1 minute.** Until he plays he is freely swappable
  (subject to formation legality). This is stricter than "lock at kickoff" — a benched starter
  who plays 0 minutes stays swappable.
- **No auto-subs.** Manual swaps of not-yet-played players replace the old "sub fires if starter
  played 0 min" rule (supersedes brief req #3's *mechanism* — same intent, simpler).
- **Why it's sound (no hindsight):** the only players you can ever move are players who have
  scored nothing (haven't played). You can never watch a player bank points and *then* slot him
  in — the moment he plays he is frozen in whatever role he was in. Every swap is forward-looking.
- **Consequence:** a bench player who *has* played is locked **on the bench** — he cannot be
  promoted after scoring. Coverage of a blanking starter depends on having an *unplayed*,
  position-legal reserve at that moment, not on best bench score. Rewards live management /
  late-sub streaming.
- **Acquisition deadline (waivers / free agents):** you cannot pick up a player once **his match
  kicks off**. Intentionally a touch stricter than the own-player rule — avoids adjudicating live
  appearance status for free agents and prevents grabbing an in-progress performer.
- **Period close = backstop:** an unplayed starter left in the XI at period end simply scores 0.
  No auto-anything.
- **Edge cases:** abandoned / postponed matches and warmup scratches → manual override
  (Cowork failsafe).

### "Set multiple lineups" — defined
Pre-set lineups for **multiple upcoming match windows/periods in advance**; within a period,
edit any not-yet-locked player. NOT multiple competing entries (that's best-ball / multi-entry —
doesn't fit a private H2H league).

### Playoff reduced roster (guillotine)
- **Hard roster cap ≈ 9 = 7 starters + 2 bench.** Cuts flow into the FAAB pool (fuels the
  reinforcement churn). Bench is positional-flexible.
- **Starting shape 1 GK + 6 outfield, small variations allowed:** min 2 DEF / min 2 MID /
  min 1 FWD → **2-2-2** (base), **3-2-1**, **2-3-1**.
- **Bench GK optional** — not required, but a manager may spend a bench slot on a backup keeper
  for insurance.
- Exact cap / bench numbers stay provisional pending guillotine cadence (Theme C) and
  reinforcement (Theme D); 9 = 7+2 is the working default. **(Theme D now confirms 9 = 7+2 is
  comfortable for reinforcement — nothing in FAAB pushes to change it; the number stays pending
  only the Theme C guillotine cadence.)**

### ⚠️ Knock-on
Lock-on-play changes the Data-source assumption (locking is no longer purely schedule-driven) —
see the amendment under **Data source** below.

---

## Open themes — agenda for future threads

### Data source  ✅ LOCKED (amended twice — lock-on-play + verification)
**Hybrid: BALLDONTLIE API (stats/events/schedule) + Sofascore scrape (rating — PRIMARY) + manual failsafe.**
- **Live scoring** (not settled-only) — frequent polling during match windows.
- **BALLDONTLIE FIFA World Cup API** = primary feed: schedule, rosters, lineups, events
  (with minutes), per-match player & team stats, live scores. Covers WC 2018/2022/2026.
  Free tier + paid tiers; tier ordering confirmed **Free < ALL-STAR ($9.99) < GOAT ($39.99) <
  ALL-ACCESS ($299.99)**, per-sport. → **Tier RESOLVED below: GOAT.** Webhooks are an
  **ALL-ACCESS-only** feature **and** absent from the WC OpenAPI spec → **we poll** (see amendment).
- **Sofascore scrape** = the proprietary Sofascore **rating** line — the calibration target for the
  locked ladder. Scraping one field per player keeps the fragile surface tiny — far more reliable
  than scraping everything. Verification found the BALLDONTLIE WC feed *also* exposes its **own**
  `rating`, **but its provenance is unknown**, so **Sofascore stays PRIMARY** (a required component);
  BALLDONTLIE's rating becomes the **automatic fallback** (resolver `[manual, scrape, balldontlie]`)
  — better resilience than "scrape or null." See Amendment 2 below.
- **Manual input** = failsafe / corrections (BALLDONTLIE also has a Google-Sheets integration).
- Ingestion via **scheduled cron / serverless job** (not a Cowork agent). Cowork = manual
  overrides/corrections only.
- ~~Locking is schedule-driven (kickoff times) — independent of the live feed.~~
  **← SUPERSEDED by the lock-on-play amendment below.**

**⚠️ AMENDMENT 1 (lock-on-play, Theme B):** locking is **no longer purely schedule-driven.** To
lock on *actual play* you need:
- confirmed starting XIs at kickoff (official lineup) → lock all starters;
- **live substitution / appearance events with minute** → lock each sub the instant he enters;
- players never subbed on simply never lock.
The starter half is one lineup pull per match. The **substitution half is now a hard dependency**
— a sub must lock at entry to stay hindsight-proof — so the live feed is **required for locking**,
not optional. Add "live substitution / appearance events" to the OpenAPI verification list
(alongside card minutes). Fallback if live appearances aren't available: revert that match to
kickoff-locking (robust but reintroduces the benched-starter 0), handled via manual override.

**✅ OPEN VERIFICATION — DONE (Architecture thread).** Mapped every SCORING.md category to a
BALLDONTLIE WC field via the OpenAPI spec (https://www.balldontlie.io/openapi/fifa.yml). Full
per-line table: **ARCHITECTURE.md §7**. Verdict:
- **Both hard dependencies CONFIRMED.** Card **minutes**: `FIFAMatchEvent.time_minute` (+
  `added_time`). **Live substitution events**: `match_events` with `incident_type=substitution`,
  `player_in`, `player_out`, `time_minute`. → **lock-on-play is feed-supported.**
- **Most lines map directly or derive.** Three lines previously *suspected* missing are PRESENT:
  `was_fouled`, `saves_inside_box`, and **both** `punches` + `high_claims`. Derivations cover
  save-outside-box (`saves − saves_inside_box`), clean sheet, goals conceded, penalty missed/saved
  (`match_shots`), and own goal (`match_events`).
- **Six lines forced a call (all minor/rare)** → the **SCORING.md amendment** (3 drops, 2
  keep-via-manual, 1 remap; see Theme A above).
- **Confirm-in-Code (not blockers):** `match_shots.situation` / `match_events.incident_class`
  enum values; the rating **fallback-quality** check (BALLDONTLIE vs Sofascore — gauges the fallback
  only; Sofascore stays primary). *(`blocked_shots` direction is now resolved — defensive, confirmed.)*

**⚠️ AMENDMENT 2 (verification, Architecture thread — ratify):**
- **(a) Rating source — Sofascore PRIMARY.** Both feeds carry a per-match `rating`, but
  BALLDONTLIE's provenance is unknown, so the locked ladder stays calibrated to **Sofascore
  (scraped)**. The engine reads through **one resolver** — `first non-null of [manual, scrape,
  balldontlie]` (config-driven) — so the **Sofascore scrape leads and is required**, with
  **BALLDONTLIE's `rating` as the automatic fallback** on a scrape miss (same 0–10 ladder, accepting
  a possible scale mismatch; commissioner-overridable). The scraper is **not** dropped; a one-time
  BALLDONTLIE-vs-Sofascore comparison in Code only gauges how good the fallback is. Net effect vs
  the old "scrape or null": **better** resilience, scrape still primary.
- **(b) Ingestion = POLLING; no webhook receiver is built.** The WC spec is pure REST + cursor
  pagination with no subscription contract, and webhooks are ALL-ACCESS-only. The brief's
  "webhook receiver" is dropped; the "live event consumer" collapses into a ~60s poll of
  `match_events` during live windows. Simpler and cheaper.
- **(c) Tier confirmed: GOAT $39.99/mo on the FIFA product** (per-sport) — unlocks every endpoint
  used and satisfies the "ALL-STAR or higher" `group_standings` requirement; 600 req/min; 48h
  trial for dev. **ALL-ACCESS not needed.** This **resolves the prior "confirm which tier +
  webhooks" open item.**
- **(d) Live latency ≈ a few minutes** on the feed (detailed stats can lag hours; the rating lands
  near/after FT) → **reinforces the recompute pipeline** (event points live, settle later).

**Live nuance:** event-based points update live; the rating settles near/after full-time, so that
component lags and adjusts during/after a match — handled by the recomputable scoring pipeline
(ARCHITECTURE.md §4).

### C. League & format  ✅ LOCKED (this thread)
The mechanics are decided; the only deferred piece is a **numeric config** (final manager count →
playoff field size + per-round cut schedule), set at the group→playoff transition — by design, not
an open question.

**Locked:**
- **Regular season = all-play-all ("power record").** Each matchday your score is compared
  against *every* manager; bank a W for each one you outscore. Seed by record, ties by
  **total points**. This *is* head-to-head (the field-wide flavor) → **supersedes brief req #4's
  1v1 framing.** Chosen because the group stage is only ~3 matchday-waves; all-play-all turns 3
  periods into 3×(N−1) head-to-heads, which sorts a field reliably — and *better* as the field
  grows.
- **Scoring period = group "matchday," defined per fixture.** Each team plays exactly 3 group
  games, so MD1 = every team's 1st game (each player has exactly one); three waves. Close each
  wave when its last fixture ends. The staggered group calendar doesn't break this.
- **Manager count: target 12**; **8–10 fallback** if recruiting is light. Even-number preference
  **dropped** (all-play-all has no pairings; odd counts sort fine).
- **Playoff field is FLEXIBLE — likely 8 or 10** (was a fixed 6). The **per-round cut count adapts**
  so the bracket collapses to one champion over the WC's **5 knockout rounds** (R32 → R16 → QF →
  SF → Final): roughly **2 cuts per round early, tapering to 1** (e.g. 10→8→6→4→2→1; or
  8→6→4→3→2→1). The exact field size + cut schedule is **fixed once at the group→playoff transition**
  when the final manager count is known; the *derivation rule* is locked. (A 6-field with one cut
  per round, 6→5→4→3→2→1, remains a valid special case.)
- **Draft:** **snake** order; **per-pick timer = a league config** (`draft_pick_seconds`,
  commissioner-set, adjustable pre-draft — no hard-coded number); **autopick on expiry** = the
  highest-ranked still-available player from the manager's **pre-set queue**, falling back to
  best-available by default ranking.
- **Guillotine *elimination* tiebreak (was the flagged Theme-D hand-off):** when managers tie at a
  round's elimination cutoff, the one(s) with the **lowest cumulative tournament total points** (all
  periods to date — regular season + playoffs) are cut, down to the number being eliminated. Mirrors
  the regular-season seeding tiebreak. **Backstop:** if still perfectly tied, **commissioner
  adjudicates** (rare enough to need no machinery).
- **Late-correction freeze policy:** a period's results go **final `result_freeze_hours` (default 6)
  after that wave's last final whistle** (enough for the rating to settle); after that, later
  feed/rating corrections **do not auto-restate** the period — **commissioner-only** override
  (recompute still works, it's just gated). Config knob; infra in ARCHITECTURE.md §4/§9.
- **Caution:** all-play-all punishes inactive managers (a non-setter is a free win for everyone
  compared against him that week, inflating records) → recruit for commitment.

**Deferred by design (config, not a decision):** the final manager number is recruiting-dependent;
it selects the playoff field size (8/10/…) and thus the exact per-round cut schedule at the
transition. Nothing else in Theme C remains open.

**Resolved this thread (formerly open):** draft order/timer/autopick (snake; timer config; queue→best-available),
the guillotine *elimination* tiebreak (lowest cumulative tournament total points; commissioner backstop),
deviation from one-cut-per-round (cuts now adapt to field size over 5 knockout rounds), and the
late-correction-after-period-close freeze policy (final at `result_freeze_hours`≈6 after last FT,
commissioner-only after). Only the recruiting-dependent manager/field number is deferred (config).

### D. FAAB & Waivers  ✅ LOCKED (this thread)
Tiebreak principle (previously locked) **confirmed and sharpened**; budget, processing cadence,
free-agency rules, and the load-bearing **playoff reinforcement** mechanism now fully defined.
Guiding constraint honored: **boring and reliable** (this is the standard "blind FAAB → free
agency" pattern, compressed to a daily tournament cadence; no clever machinery).

#### Budget
- **$100 starting FAAB per manager** for the group stage. Clean and legible (bids read as a %),
  ample resolution against a huge undrafted pool (≈1,000+ unowned players), enough for the handful
  of in-tournament churn moves a group stage produces.
- **Full reset to a fresh $100 at the group→playoff transition**, for every advancing manager.
  **No carryover.** Equalizes the six qualifiers so nobody enters the guillotine with a FAAB edge
  earned (or squandered) in groups — which is what makes reinforcement actually function.
- **One $100 budget for the ENTIRE playoff run — NOT per round.** Rationing it across up to five
  knockout rounds is a deliberate guillotine pressure. Self-balancing: each round frees a cut
  manager's ~9 players while the field shrinks each round (e.g. 6→5→4→3→2, or 10→8→6→4→2 with
  2-cuts — the illustrative sequence scales with the field size and cut schedule chosen in Theme C),
  so late reinforcement is
  cheap and a single $100 lasts; budget bites hardest early (R32→R16).

#### Processing — two-tier daily cycle (identical in group stage and playoffs)
The staggered WC calendar has **no weekly "no-games" night**, so waivers run on a **daily** cycle
— finer than the per-matchday *scoring* period (Theme C), intentionally, and without conflict.
- **Pre-dawn blind-bid batch, once per day** (default **06:00 league-local**, adjustable; must
  sit before the day's first kickoff). All sealed bids submitted since the last batch clear at
  once.
- **Free agency between batches:** after the batch, any player that has **already cleared ≥1
  batch unclaimed** is a **free agent — first-come, first-served, $0**.
- **New releases (drops + freed players) go to WAIVERS first** (bid-only) and are **not**
  free-grabbable until they pass one pre-dawn batch unclaimed. This 1-cycle hold (≤24h) is what
  stops a hot just-dropped player being sniped for $0 — **contested players always route through a
  blind bid**, free agency only ever dispenses genuinely uncontested depth.

#### Mesh with the per-player acquisition deadline (locked: can't add a player once his match kicks off)
- The pre-dawn batch precedes the day's kickoffs (WC earliest ≈ noon local), so it can legally
  award anyone playing later that day.
- **A bid on a player whose match has already kicked off is VOIDED + refunded** — self-enforces
  the deadline inside the batch.
- Free agency closes **per-player at his kickoff**.
- **Data note:** FAAB timing is **schedule-driven** (kickoff times from the BALLDONTLIE feed) and
  adds **no new live-data dependency** — the live feed is required for *locking* (lock-on-play),
  not for FAAB.

#### $0 bids / free agency / out-of-budget rule
- **Minimum bid is $0; $0 bids are legal** — lowest in the batch, win only uncontested players,
  tie-broken by waiver order.
- **Free agency is always $0 and always available — even at $0 budget.** Spending out **never**
  locks a manager off the wire; it only removes the ability to *win contested* bids. A broke
  manager can always grab an uncontested free agent to stay legal — the **"never stuck / always
  able to field a legal lineup" safety valve.**
- Every claim is **add-X / drop-Y** (rosters are capped); a bid above remaining budget is rejected
  at submission.

#### Tiebreak (locked principle confirmed; mechanics sharpened)
- **Primary: highest bid wins.**
- **Tie → rolling waiver order**, **seeded ONCE by reverse draft order** at the draft (last
  overall pick = priority #1) — it then persists and evolves by the move-to-bottom rule below.
  Draft order exists before MD1, so there is **no cold-start**; the order is **never** derived
  from standings/seeding.
- **Move-to-bottom triggers ONLY when the tiebreak is actually USED** — i.e., you won a player
  *because* order broke the tie. Winning on bid amount alone does **not** move you. (In a pure-FAAB
  system, order only ever matters as a tiebreak, so this is the consistent reading of the locked
  rule — you "spend" your high position only when you use it.)
- **Batch processed highest-bid-first, player-by-player;** a manager who uses the tiebreak drops
  to the bottom **immediately** for the rest of that batch → no sweeping all the tied players.
- **A manager's own multiple winning bids resolve highest-first**, applying each that's still
  legal (budget + roster + a valid drop) and **skipping** any that no longer fit — minimal
  conditional logic, boring/reliable. *(Conditional / grouped bids = possible later enhancement,
  not part of the locked rule set.)*
- **Playoffs — carry the SAME rolling order forward (NO re-seed):** take the live order over the
  twelve, **remove the eliminated managers, preserve the surviving qualifiers' relative order.** Budget
  resets to $100; the waiver order does **not** reset. Simpler — and it **keeps FAAB fully
  decoupled from Theme C seeding**: the order is draft-seeded and self-maintaining, so it never
  needs standings, at MD1 or at the playoff transition.

#### Playoff reinforcement (load-bearing — the attrition mechanism)
No bespoke machine: **reinforcement is the same daily FAAB cycle, run on the playoff field** with
the reset $100 + the carried-forward rolling waiver order (eliminated managers removed). Two attrition streams feed it — (a) each guillotined
manager's freed ~9-player roster, and (b) every survivor's own roster decaying as WC teams are
knocked out — which is exactly what *forces* reinforcement each round.
- **At the group→playoff transition:** lock final standings → the **top N advance** (N = the
  Theme C playoff field, likely 8 or 10) →
  release all non-advancers' rosters → advancers **trim 15 → ≈9 (7+2)** by the **trim deadline =
  first playoff pre-dawn batch** → reset budgets ($100); the rolling waiver order carries forward
  (eliminated managers removed). All released players hit
  **waivers** for that first batch. (Players from WC teams already eliminated in the group stage
  are in the pool but worthless — natural filtering; managers trim them first.)
- **Between every knockout round:** a **reinforcement window** opens when the round's scoring
  closes (cut processed, loser's ~9 players freed) and runs to the next round's first relevant
  kickoff. The daily batch + free agency operate normally inside it; WC rest days leave **≥1 batch
  per window**.
- **Re-entry path:** freed players → **waivers** → next pre-dawn batch → free agency if unclaimed
  (same 1-cycle hold). Roster cap **≤9** enforced; every add needs a drop; dropped players
  re-enter the pool. Bench stays **positional-flexible**, bench GK optional (Theme B).
- **Failsafe:** if the real calendar ever leaves no pre-dawn gap before a round, the batch shifts
  into whatever no-live-match window exists (manual / config).

#### Out of scope / deferred (not reopened here)
- **Trades:** none — FAAB acquires **pool** players only (no manager-to-manager trades; not in the
  brief). Could be a later theme.
- **Guillotine *elimination* tiebreak** (managers tied at a round's cut): **now DECIDED in Theme C**
  — lowest cumulative tournament total points among the tied is cut (commissioner backstop). Was
  flagged here, owned/resolved in Theme C.
- Exact batch clock time is a config knob (06:00 default).

### E. World Cup attrition  ✅ RESOLVED (folded into playoffs + FAAB)
Handled by the **playoff transition itself**: not all managers advance (freeing their players
back to the pool); lineup requirements shrink (reduced roster, Theme B); guillotine
(everyone-vs-everyone, lowest score eliminated per knockout round); **survivors reinforce via
FAAB**, topped up by freed players from eliminated / non-qualifying managers. No separate
replacement-draft or roster-reduction machinery needed. → **Reinforcement windows/cadence,
budget, and re-entry are now fully defined in Theme D (✅ LOCKED).**

### Architecture & Stack  ✅ LOCKED (this thread)
Full build-ready spec: see **ARCHITECTURE.md** (split out the way SCORING.md was). Summary +
rationale below. The brief's open feed-tier/webhook question is **resolved** and the OpenAPI
verification is **done** (results under Data source above). Guiding constraint honored: **boring
and reliable** — every choice is the well-trodden default for a small team, sized for the real
scale (a private league of ~12 managers, one ~month-long tournament, ~104 matches).

#### Stack & hosting
- **TypeScript end-to-end.** One language across UI, scoring, and ingestion → a small team holds
  the whole system, and the scoring rules / lock logic / feed shapes / API contract **share one
  set of types** (the biggest reliability lever here). Scoring is integer/fraction bucketing, so
  no separate Python data stack is warranted.
- **Frontend: Next.js (App Router) + React + TypeScript + Tailwind.** Canonical, deepest
  ecosystem, what Design + Code target most easily.
- **Backend: a modular monolith** (Next.js route handlers) **+ a separate worker service in the
  same monorepo** (shared `packages/` for the scoring engine, feed client, DB schema). Web traffic
  and scheduled/long-running jobs have different runtimes; one repo, one DB, two processes. No
  microservices at a dozen users.
- **Compute host: Render** — Web Service + Cron Jobs + Background Workers + an isolated scraper
  Worker, all on one platform with one build. *Reversible:* Railway is an equivalent swap; Vercel
  for the app (workers still on Render/Railway) is a documented 3rd-vendor option. **Two vendors
  total (Render + Supabase);** can later collapse to **Vercel + Supabase only** if the scrape is
  proven unnecessary and ~1/min cron polling suffices.

#### Persistence
- **PostgreSQL via Supabase.** Consistency-critical relational state — unique player ownership,
  sealed FAAB bids, no double-spend, hindsight-proof locks — is textbook Postgres. **Invariants
  enforced in the DB, not hopeful app code:** unique active ownership per league; each FAAB claim
  resolves in one transaction; sealed bids kept secret by **row-level security**; a lineup slot is
  editable only while `locked_at IS NULL`.
- **Per-player lock timestamps live on `lineup_slot.locked_at`** (nullable) — set at kickoff for
  starters, at entry minute for subs; null = still swappable. This is the mechanical home of
  lock-on-play (Theme B).
- **Recompute is the load-bearing principle:** raw feed inputs are stored immutably-by-upsert on
  natural keys; **scores are a pure function of stored inputs**, so any score is recomputable at
  any time — which is exactly what the **late-settling rating** (Theme A / Data source) requires.
  A write to any input marks `(match, player)` dirty → recompute player → manager-period →
  standing. No queue at this scale.
- **ORM: Prisma** (Drizzle acceptable); Prisma Migrate for schema. Data-model sketch in
  ARCHITECTURE.md §4 (league / manager / app_user; fifa_team / player / fifa_match / stage / group;
  roster_player + lineup_slot; period; draft + draft_pick; faab_bid + faab_batch; a raw feed layer;
  a derived score layer).

#### Real-time
- **Supabase Realtime for both surfaces** (reuses the DB vendor). *Reversible fallback:* Socket.IO
  on the worker + polling.
- **Draft room is server-authoritative:** a draft controller (worker) advances state
  transactionally on pick-submitted **or** `pick_deadline_at` expiry (incl. autopick); clients
  subscribe and render a countdown synced to the server timestamp. **Draft *rules* are now locked
  in Theme C** (snake; per-pick timer = `league.draft_pick_seconds` config; autopick on expiry =
  queue → best-available); this layer just enforces them.
- **"Vs the field" screen:** subscribe to score/standing rows (15–30s polling is a documented
  fallback, sufficient given the feed's own latency). Shows running score + each manager's
  starters-yet-to-play + provisional weekly all-play-all record + per-opponent H2H + season view
  (data shapes fall out of §4). → Design + Code deliverable.

#### Auth
- **Supabase Auth, email magic-link** (+ optional Google), **private email allowlist**; an
  `is_commissioner` flag gates the admin/override (Cowork) surface. Nothing heavier for a private
  league of friends.

#### Ingestion
- **Polling, not webhooks** (see Data-source Amendment 2): no webhook receiver is built; the
  "live event consumer" is a ~60s poll of `match_events` during live windows. Worker scheduler
  modes: schedule-sync (hourly/daily) → pre-match lineup pull (lock starters) → live poll (events
  + stats + shots; lock subs at entry minute) → settle poll (until stats + rating land →
  recompute). Idempotent upserts self-correct on re-poll.
- **Rating resolver:** `first non-null of [manual, scrape, balldontlie]` (config-driven); the
  scraper is isolated, writes one field only, and is the **PRIMARY rating source and required**
  (BALLDONTLIE's `rating` is the automatic fallback — see Amendment 2(a)).
- **Manual / Cowork override surface** writes the raw/manual layer and triggers the same recompute
  — corrections and the feed-gap fields (penalty won/committed) share one code path. Owns the
  **lock-on-play fallback** (per-match revert to kickoff-locking + an alert if the live poller goes
  silent inside a match window).

#### Feed tier — RESOLVES the prior open item
- **BALLDONTLIE GOAT, $39.99/mo, on the FIFA product** (per-sport): unlocks every endpoint used —
  `matches`, `match_lineups`, `match_events`, `player_match_stats`, `team_match_stats`,
  `match_shots` — and satisfies the "ALL-STAR or higher" `group_standings` requirement.
  **600 req/min**; **48h GOAT trial** for dev. **ALL-ACCESS ($299.99/mo) is NOT needed** — its only
  relevant extra is webhooks, which we've designed away.
- Est. run cost ≈ **$40/mo feed + low-double-digit hosting** (a season, not forever).

#### Amendments this thread forces (ratify)
- **Theme A / SCORING.md** — six verification-forced line changes (3 drops, 2 keep-via-manual, 1
  remap), documented as a marked amendment block; model balance untouched and reversible.
- **Data source** — Amendment 2 above: rating via resolver with the **Sofascore scrape PRIMARY/required**
  (BALLDONTLIE `rating` = automatic fallback), **polling** ingestion (no webhook receiver), tier
  **GOAT $39.99/mo**, live latency ≈ a few minutes.

#### Theme C now closed (resolved this thread)
Draft order/timer/autopick (snake; timer = `draft_pick_seconds` config; queue→best-available),
the guillotine elimination tie (lowest cumulative tournament total points; commissioner backstop),
playoff field/cut cadence (flexible field, ≈2-cut tapering to 1 over the 5 knockout rounds, fixed at
the transition), and the **late-correction freeze policy** (final ~6h after last FT,
commissioner-only after) are all decided — see **Theme C** above; infra in **ARCHITECTURE.md §4/§9**.
Trades remain out of brief. **All themes are now LOCKED.**

## Theme F — Security: Data API / Row-Level Security  ✅ LOCKED
Supabase Security Advisor flagged RLS disabled on every public table: the anon/publishable key could
read **and write** all 27 tables directly through the Data API, bypassing the gated server routes.
Closed in migration `20260605170000_enable_rls_public_tables` (extends the `faab_bid` RLS from
`20260603223500_invariants`).

### Decisions & rationale
- **RLS ENABLED on every public table.** A table with RLS on and no policy default-denies the
  `anon`/`authenticated` roles entirely — so the Data API exposes nothing unless a policy opts it in.
- **Server bypasses RLS; it is the only writer.** Prisma connects as the table-owning `postgres`
  role and RLS is **`ENABLE`, never `FORCE`**, so the owner bypasses it. Every server path — the app,
  the gated `POST /api/draft/pick`, the worker, provisioning, and `prisma migrate deploy` — is
  unaffected. Supabase `service_role` bypasses too. **No `INSERT/UPDATE/DELETE` policies exist**, so
  all client writes are default-denied: mutations go through the server, never the anon key.
- **Browser gets least-privilege reads only**, `TO authenticated`, identity `auth.uid() =
  manager.user_id` (same idiom as the `faab_bid` policies):
  - `draft` and `draft_pick` — the two tables the draft room subscribes to via Realtime — scoped to
    **league membership** (a `manager` row linking the caller to the draft's league), not `USING(true)`
    (authorization, not just authentication).
  - `manager` — **own row only**. Load-bearing: it's the minimum that lets the league-membership
    subqueries (and the existing `faab_bid` policies, which also subquery `manager`) resolve the
    caller's identity now that `manager` itself has RLS. Other managers' details reach the draft room
    only via the server-rendered snapshot (Prisma), never the anon key.
- **Realtime keeps working** because supabase-js authorizes the socket as the signed-in user (its
  `accessToken` callback), so an authenticated league member passes the SELECT policy. The migration
  does **not** touch the `supabase_realtime` publication (a dashboard/operator concern) and stays
  portable to the DoD's plain-Postgres (a stub `authenticated` role + `auth.uid()` shim cover it).
- **Invariant for future work:** any NEW table the browser reads (direct `.from()` or a Realtime
  subscription) needs its own `authenticated` SELECT policy, or the client sees nothing. Today the
  browser reads only `draft`/`draft_pick` (Realtime) — there are zero `.from()`/`.rpc()` calls.
