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

### ⚠️ AMENDMENT (Prompt 44 — draft positional caps lifted)
**Draft positional caps LIFTED — the draft is shape-unconstrained up to the 15-man total.** The
per-position ceilings above (2 GK / 5 DEF / 5 MID / 3 FWD) were the *draft* caps; only that per-position
draft ceiling is removed — the **squad total stays 15**. Lineup/formation bounds (**exactly 1 GK,
min 3 DEF / 2 MID / 1 FWD**) are **UNCHANGED**, so managers must still self-assemble a fieldable XI; an
over-drafted squad (e.g. zero keepers, or ten forwards) **can be locked out of a legal lineup by choice**
— the draft no longer protects you from an unfieldable shape. (Engine: `@app/draft`'s
`isPositionLegal` / `isSquadComplete` became total-based, gating on a new `squadTotal(counts)` helper vs
`SQUAD_SIZE`; `PositionFullError` is retained but defensive/unreachable in the snake flow.)

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

#### Amendment — in-matchday substitutions (supersedes the bidirectional freeze; group + playoff)
- **Lock-on-play's sub-IN half is preserved:** a player may be moved into the XI only while his
  match has not kicked off. A played player can never be promoted in (no hindsight upside; a played
  bench player stays locked on the bench).
- **Lock-on-play's sub-OUT half is overturned:** a manager may remove a player who has already
  played, but only as a substitution that swaps in an eligible (unplayed) bench player. Removing a
  played player forfeits every point he banked for that period — only the incoming sub scores that
  lineup slot. The risk is symmetric (the sub can score less); that gamble is the strategy.
- **A substitution = one current XI player out, one bench player in.** Incoming must be unplayed
  (his match not kicked off). Resulting XI must satisfy that mode's formation bounds: group exactly
  1 GK + min 3 DEF / 2 MID / 1 FWD; playoff exactly 1 GK + min 2 DEF / 2 MID / 1 FWD.
- **Cap = bench size: 4 (group) / 2 (playoff).** Each bench player may be subbed in at most once per
  period; a sub already moved into the XI cannot be moved back out for another. The counter is bench
  players, not actions.
- **Forfeit is realized through `is_starter`:** on a completed sub, the outgoing slot flips
  `is_starter=false` (scores 0 for the period regardless of points banked) and the incoming sub
  flips `is_starter=true`. `recomputeManagerPeriod` already keys on `is_starter` — no new scoring
  concept.
- **Knock-on (flag for the Theme-B implementation thread):** the `lineup_slot` lock latch becomes
  directional — it must still block promote-IN of a played player and must not regress the
  Prompt-01 "no unlock-then-edit" hardening, while now permitting demote-OUT of a played player as
  part of a validated sub. Auto-subs remain absent; period-close-scores-0 backstop and
  abandoned/postponed manual override unchanged.

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

##### Amendment — per-matchday acquisition window (supersedes the daily two-tier cycle)
- **One blind-bid waiver batch before each scoring period** — each group matchday (3) and each
  knockout round. The daily cron is retired. `resolveFaabBatch` (the §D algorithm) is unchanged;
  only cadence/scheduling changes.
- The batch runs **before the period's first kickoff,** so it can legally award anyone playing in
  that period.
- **Post-batch, unclaimed players → $0 free agents,** first-come, until the period's first kickoff.
- **Hard league-wide lock at the period's first kickoff** — waivers and FA both close; roster is
  frozen until the next period's batch. The only in-period roster moves are the bench subs (Theme B
  amendment).
- **Acquisition deadline is now the period's first kickoff (league-wide),** superseding the
  per-player-kickoff acquisition deadline. Note the scope: this retires per-player-kickoff for
  acquisition only — sub-IN eligibility (Theme B) remains gated on the incoming player's own match
  kickoff. Void-refund-on-kickoff becomes unreachable in normal flow (the batch precedes all
  kickoffs); keep it as a defensive guard, don't rely on it.
- **Retired: the 1-cycle waiver hold / "drops route to waivers first"** — there is no mid-period
  churn left for it to guard. New releases simply enter the next period's batch pool.
- **Unchanged:** $100 group budget spent across the 3 batches; $100 reset for the entire playoff
  run; rolling waiver-order tiebreak + playoff carry-forward (no re-seed).
- **Knock-on (flag for the Theme-D implementation thread):** the worker scheduler (Prompt 05a)
  changes from daily FAAB cron → per-period batch trigger; FA-eligibility ("cleared ≥1 batch
  unclaimed") collapses to "unclaimed after the period's single batch."
- **Implemented (Prompt 47, `feat/faab-per-matchday`):** per-period trigger in the worker tick
  (`apps/worker/src/faab/`; `period.waiver_batch_at` default `first_kickoff − 6h` + a `batch_cleared_at`
  idempotency latch); acquisition cutoff → the period's first kickoff in `validateBidSubmission`; daily
  cron retired. `resolveFaabBatch` is byte-unchanged. See ARCHITECTURE §3 + PROJECT.md (Prompt 47).
- **Implemented (Prompt 48, `feat/faab-fa-grant`, stacked on 47):** the instant **$0 free-agency
  grant** is now built — `POST /api/faab/free-agent`, accepted only in the free-agency phase
  (`acquisitionWindowState`), $0 (budget unchanged, no waiver order). **FA eligibility = the batch-clear
  snapshot, NOT live-unowned** (a player dropped during the window is held to the next batch); chosen
  mechanism = the history predicate `NOT EXISTS roster_player WHERE player=X AND (dropped_at IS NULL OR
  dropped_at >= batch_cleared_at)` (no snapshot table). First-come = the `roster_player_active_ownership_uq`
  partial unique (exactly one winner; loser → clean `fa-conflict`). The Prompt-47 "$0 FA surface is a
  TODO(confirm)" is now CLOSED. See ARCHITECTURE §3 + PROJECT.md (Prompt 48).

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

### Learning (Prompt 11 — vs-the-field): the RLS-subquery visibility trap
A browser-readable table that resolves league membership via the **caller's own** `manager` row is
fine with the plain draft idiom — `standing`, `draft`, `draft_pick` all carry `league_id`, so the
`manager_select_own`-visible own row satisfies the EXISTS. A table that must resolve the league via
**another** manager's row silently breaks: `score_manager_period` keys by `manager_id`/`period_id`
(no `league_id`), so a naive `manager` subquery has to read the *scored* manager's row — which
`manager_select_own` hides — and the policy returns **zero other-manager rows** (the whole field
collapses to just you). Same silent-failure class as the draft-room Realtime bug, on the read side.
- **Fix:** a `SECURITY DEFINER` membership helper (`vsfield_caller_shares_league_with_manager`) that
  bypasses `manager` RLS to resolve `manager_id → league_id`, then checks the caller's membership.
  Hardened: pinned `search_path`, `EXECUTE` revoked from `PUBLIC` + granted to `authenticated`.
  `auth.uid()` still resolves to the **caller** inside the helper — it reads the
  `request.jwt.claim.sub` session GUC (never `current_user`), which survives the DEFINER role swap
  (verified: a member sees the whole field; a different-league member and anon see nothing).
- **Rule of thumb:** prefer the direct `league_id` idiom; reach for the SECDEF helper only when a
  table lacks `league_id` and the no-churn boundary forbids denormalizing one onto it.

### Update: `supabase_realtime` publication is now migration-managed
Refines the earlier operational note ("the migration does not touch the publication — a
dashboard/operator concern"); the security decisions above are unchanged. New Realtime-read tables
are added to the publication **inside their RLS migration**, existence-guarded
(`IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')`) so it's idempotent
and no-ops cleanly on the plain-Postgres DoD shim. (Origin: Prompt 11 added `score_manager_period`
+ `standing`.)

### Learning (Prompt 13 — vsfield RLS migration self-test): valid uuids, and the text-shim false-green
The Prompt 11 migration shipped with the embedded member-can / non-member-cannot self-test (the Theme F pattern). Its in/out test users were **non-uuid labels** (`'rls_selftest_user_in'` / `'…_out'`); on Supabase the real `auth.uid()` casts `request.jwt.claim.sub` to `uuid`, so `vsfield_caller_shares_league_with_manager` `22P02`'d on every clean apply — `migrate deploy` failed at this migration and blocked the Render deploy (the WC-eve launch gate). **Fix = valid-uuid literals** (`00000000-…-0001/0002`, canonical-lowercase so `manager.user_id (text) = auth.uid()::text` round-trips), mirroring `20260605170000_enable_rls_public_tables`. Helper / SELECT policies / publication adds **unchanged** — a test-value bug, not RLS behavior.
- **⚠️ Known testing gap (parked — own thread, queued with the Security follow-ups below):** the plain-Postgres DoD shim stubs `auth.uid()` as **text-returning**, which **masks the uuid cast** — so `migrate reset` on bare Postgres passes even the *broken* migration (false green). The real proof came from a Docker repro with a **uuid-returning** `auth.uid()`. Consequence: the standing suite does **not** guard against reintroducing a non-uuid literal in an RLS-helper test. Hardening = make the test-path `auth.uid()` uuid-returning so a regression goes red locally. No new suites added now (out of scope).
- **Recovery (documented — RUNBOOK d.1):** a failed-and-rolled-back migration is cleared with `prisma migrate resolve --rolled-back <name>` on `DIRECT_URL`, then redeploy; pre-launch `migrate reset` is the acceptable one-shot (empty DB). `--rolled-back` (not `--applied`) is correct because the failed apply rolled back — single transaction, no non-transactional statements.

## Theme G — Ingestion: squad / player source (rosters bootstrap)  ✅ LOCKED
The feed client had NO player source: schedule-sync pulls only `/matches`, and `upsertPlayerByBdlId`
was an unwired seam — so `player` / `fifa_team` stayed empty and stat ingestion silently no-opped (every
raw upsert early-returns when the player row is absent). Confirmed against the live BALLDONTLIE FIFA
OpenAPI spec + season-2026 data (48 teams, 1,253 players, positions exactly `G/D/M/F`).

### Decisions & rationale
- **Source = `/fifa/worldcup/v1/rosters?seasons[]=2026`** (NOT `/players`): a roster row carries
  `team_id` (→ `fifa_team`) AND the nested player bio (id, name, position, country) in one call, so it
  fills our `player.teamId` FK; `/players` lacks `team_id`. New `feed.rosters()` paginates via the
  existing cursor `getAll` (same as `feed.matches()`).
- **`ingestRosters` upserts the team then the player** (team name = the player's `country_name`); the
  position letter maps to the `Position` enum via the exhaustive pure `mapPosition`
  (`G→GK, D→DEF, M→MID, F→FWD`; unknown/null → `MID` defensively). Idempotent on BALLDONTLIE ids.
- **Cadence = boot + a slow ~daily re-pull** (`WORKER_ROSTERS_SYNC_EVERY_TICKS`, default 1440 ticks),
  NEVER the 60s tick — squads are static; the slow re-pull only catches pre-tournament squad
  corrections. Plus a one-shot `job:rosters` for on-demand populate/refresh. Additive only — no change
  to the existing schedule/pre-match/live/settle modes.
- **Deferred (not now):** a `/teams` pull to enrich `fifa_team.abbreviation` / `country` — rosters only
  gives the country name, which is sufficient for `fifa_team.name`.

## Mock-draft session — open items & known issues (build / ops)
A live end-to-end smoke test of the draft (controller + draft-room UI + Supabase Realtime + worker
autopick) against the deployed app + a real Supabase. Verified capabilities are recorded in PROJECT.md →
Build progress; the engineering follow-ups:

- **Lobby→active client flip on draft start (RESOLVED — commits `9781030` Part A/B, `c884928` Realtime
  auth).** Root cause was **NOT the reducer** (the Part A status-fold handler was correct) — it was the
  browser **Realtime client subscribing with the anon apikey only**. The RLS policies on `draft` /
  `draft_pick` are `TO authenticated USING (manager.user_id = auth.uid())`, so an anon socket
  (`auth.uid()` null, role not `authenticated`) gets **zero `postgres_changes`**, while presence and
  broadcast (RLS-bypassing) still stream — which masked the gap (so it only updated on reload).
  **Fix (client-side only; no schema/policy change):** `client.realtime.setAuth(<user access_token>)`
  **before** subscribe, gate the first subscribe on `INITIAL_SESSION`, and re-subscribe on
  `TOKEN_REFRESHED` (tearing down the prior channel first). A bound league member's JWT then satisfies
  the policy and frames flow.
- **Autopick empty-ranking fallback (RESOLVED).** `selectAutopick` can no longer stall on an
  unpopulated ranking. A pure **`orderDraftPool`** (queue → `default_rank` NULLS LAST → `playerId`) is the
  single ordering source, and `getDefaultRanking` now **drops the `default_rank IS NOT NULL` filter** so
  the best-available fallback spans the whole undrafted, position-legal pool — a non-empty legal pool
  always yields a pick. (`provision rank` is still the right go-live step for a *good* order, but no
  longer a stall-avoidance prerequisite.)
- **Born-expired `pick_deadline_at` (RESOLVED — do not reopen).** The earlier ≈-expired deadline was a
  **non-simultaneous-read artifact** (measured ~30s after the start). A clean chained measurement showed a
  real **~30s window** (deadline − server `now()` ≈ +26.5s), and the first autopick fired ~1s after the
  full 30s elapsed. No fix needed.
- **Manual / human pick recording (VERIFIED working).** A completed mock draft recorded human picks
  alongside autopicks — manual pick submission persists correctly. This positively clears the earlier
  "manual pick didn't record" concern (its born-expired cause was already ruled out, and a human pick is
  now positively observed).
- **Learning — verify Realtime AUTH, not just the policy + publication.** RLS-gated Realtime
  `postgres_changes` are delivered only when the Realtime client carries the **user JWT**
  (`realtime.setAuth(token)`); **presence and broadcast do NOT** require it (they bypass table RLS). So a
  channel can JOIN and stream presence/broadcast while every row-change frame is silently filtered to
  zero. When `postgres_changes` are missing, check the **socket's auth (the JWT)** — not only the RLS
  policy and the `supabase_realtime` publication.

## Security follow-ups (non-blocking, pre-prod)
From the Supabase Security Advisor (none blocked the draft). All three closed by **Prompt 15** —
function-privilege + `search_path` hardening, **catalog-verified on live**: the Render deploy of `main`
(`c8f404d`) is green, so `prisma migrate deploy` applied `20260606180000` and its embedded **catalog-only**
self-test **PASSED on the live DB** — the `EXECUTE` revoke + both `search_path` pins are catalog-verified
there. This is a catalog-verified-on-live close-out, **not** a behavioral one; the no-regression
behavioral checks ride on go-live (below).

- **Item 1 — `mirror_auth_user_to_app_user()` `EXECUTE` (RESOLVED — do not reopen).** Shipped in
  `20260606180000` (idempotent re-assertion — `20260606010000` had already revoked from `PUBLIC` + pinned
  `search_path=''`): `REVOKE EXECUTE` from `PUBLIC` + role-guarded `anon`/`authenticated`. **KEPT
  `SECURITY DEFINER`** (not `INVOKER` — the boring fix); the `auth.users` trigger still fires (Postgres
  does not check `EXECUTE` at trigger-fire time). Catalog-verified on live (deploy self-test). Behavioral
  confirm (trigger fires) folds into the first allowlisted signup → `app_user` row.
- **Item 2 — `enforce_lineup_lock` `search_path` (RESOLVED — do not reopen).** Pinned to `''` in
  `20260606180000` (`ALTER … SET search_path=''`; `INVOKER`, body unchanged — all six lock branches
  verified under `''` pre-merge). Catalog-verified on live (deploy self-test). Behavioral lock-enforcement
  confirm deferred to first kickoff / GOAT-trial smoke (no live locks pre-tournament) — same deferral as
  the Prompt-10 lock-freeze check.
- **Item 3 — Auth leaked-password protection (HaveIBeenPwned).** **CLOSED — decided: NOT enabling.**
  Accepted risk for a private, invite-only ~12-manager league with no self-serve signup. Removed from the
  go-live gate. All three pre-prod security follow-ups are now fully resolved.
- **Learning.** Ship `SECURITY DEFINER` functions with a pinned `search_path` + `EXECUTE` revoked from
  `PUBLIC` at creation; the consolidated migration guards both with a fail-safe **catalog-only** self-test
  (`has_function_privilege(...) = false` + `proconfig` `c IN ('search_path=""', 'search_path=')`, tolerant
  of PG empty-string serializations; a `RAISE` rolls back the txn; `LIKE 'search_path=%'` is the documented
  deeper fallback). Catalog-only ⇒ no `auth.uid()`/JWT ⇒ none of the Prompt-13 `22P02` class.

## Env / deploy facts (recorded)
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` live on the **web service** (build-time —
  `NEXT_PUBLIC_` values are inlined at build, not read at runtime).
- `draft` and `draft_pick` are in the **`supabase_realtime` publication** (Realtime row-change broadcasts
  are enabled for those tables; delivery to a client still requires the user JWT — see the Learning above).
- Web pre-deploy runs `prisma migrate deploy` on `DIRECT_URL` (session pooler :5432); first green end-to-end deploy Jun 6 after the Prompt 13 fix. Failed-migration recovery: RUNBOOK d.1.

## Landing hub & route-map ground truth (Prompt 16) — navigation gap closed

### Route-map ground truth (verified pre-go-live, report-only — baseline commit `c8f404d`)
Established before touching anything. The deployed `apps/web` surface:
- **Page routes (6), all in the production build** — none env-gated or build-excluded; the feature pages
  are protected by **runtime** `getSessionManager()` redirects, not build exclusion: `/` (scaffold —
  since replaced by Prompt 16), `/sign-in`, `/auth/denied` (public); `/draft`, `/lineup`, `/vsfield`
  (auth — no session → `/sign-in`, not-ok → `/auth/denied`).
- **Route handlers:** `GET /api/health`, `GET /api/db-check` (public diagnostics); `GET
  /api/draft/state`, `POST /api/draft/pick`, `POST /api/lineup`, `GET /api/vsfield` (gated); `GET
  /auth/callback` (code-exchange + allowlist enforcement → `next || /`); `POST /auth/sign-out` (→ 303
  `/sign-in`).
- **Middleware does zero authz** — it only refreshes the Supabase token cookie; all authz is per-page via
  `getSessionManager()` (so `/` is reachable by anyone). `app/draft/flags.ts` = **nation flags** (CSS
  country chips), NOT feature flags — nothing in the app is feature-flag-gated. The only conditional UI is
  the optional Google button on `/sign-in` (`NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED`).

### The navigation gap (two parts) — RESOLVED by Prompt 16
1. **Dead-end `/`** — the scaffold root linked only to `/api/health` + `/api/db-check`; no link to
   `/sign-in` on it or in the root layout. The only in-app link to `/sign-in` lived on `/auth/denied`.
2. **Post-login stranding** — the magic link's `emailRedirectTo` carries no `next`, so `safeNextPath(null)`
   defaults to `/`; an authenticated member landed back on the scaffold with no path onward.
Both closed by a **single** auth-aware root (Prompt 16) — fixing `/` is sufficient precisely because `/`
is also the post-login redirect target. The bare "add a sign-in link" alternative was rejected (leaves
authed users stranded). `safeNextPath` / the callback were left unchanged.

### Prompt-15 / 16 numbering deconfliction (do not re-collide)
Two different deliverables briefly shared the number 15: the **security follow-ups closeout** (mirror-fn /
`search_path` hardening, migration `20260606180000`) and the **landing hub**. The security closeout merged
to main first and owns **Prompt 15** (do not reopen — items 1 & 2 RESOLVED). The landing hub was
renumbered to **Prompt 16**. PROJECT.md's "Prompt 15 COMPLETE ✅" = security; "Prompt 16 COMPLETE ✅" =
landing hub.

### Merge / working-tree hygiene (action before merge)
- `feat/landing-hub` (`dd0aed3`) was branched off **stale local main `c8f404d`**, not current
  `origin/main 9accb1f` (the security merge). **Reconcile first:** `git fetch`, then **rebase
  `feat/landing-hub` onto `origin/main`** (disjoint file sets → clean) for a fast-forward merge, or
  `--no-ff`. Re-run the gate post-rebase before merging.
- ⚠️ **The shared working tree has the Prompt-15 security migration SQL deleted (unstaged):
  `D …20260606180000_…/migration.sql`.** It is committed in history; the deletion is phantom local state
  (NOT in `dd0aed3`). **`git restore`** it before any branch / merge / DB work — letting the deletion ride
  into a commit drops the migration from the repo and causes `migrate deploy` drift on a fresh
  environment. This recurring dirty-checkout state (phantom diff, modified RUNBOOK, untracked prompts) has
  carried across sessions — clean it once before go-live.
- **Status (reconciled 2026-06-07, this session):** both actions above are **DONE** — `feat/landing-hub`
  rebased clean onto `origin/main` `9accb1f` (code commit `430419e`; disjoint file sets, zero conflicts),
  and the phantom working-tree state (deleted migration SQL + reverted RUNBOOK) `git restore`d. The
  PROJECT.md / DECISIONS.md Prompt-16 doc paste sits on top of that rebase. Gate re-run green post-rebase.
  **Remaining:** the merge of `feat/landing-hub` → `main` and the push to `origin/main` are **held for
  explicit operator go** (not yet merged, not yet pushed); the branch was never pushed, so no force-push.

## Cross-nav strip (Prompt 17) — direct movement between authenticated screens

- **No shared layout existed.** Each authenticated screen has its own route-scoped `app/<route>/layout.tsx`.
  Per the DRY rule's **path B**, one `CrossNav` component was created and mounted once in each layout
  (three mount lines, one source of markup) rather than refactoring into a route group (rejected as
  out-of-scope churn). The `shell/*` reference on the lineup screen is component-level, not a shared layout.
- **Active-state semantics (judgment call, encoded + tested):** home (`/`) matches **exactly** (a
  `startsWith` greedily matches everything); feature routes match exact / trailing-slash / nested sub-path,
  but **not** a prefix-sibling (`/draftroom` ≠ `/draft`). Standard section-nav default — a future
  `/draft/<sub>` keeps the Draft tab active; exact-only was considered and rejected (de-highlights on any
  sub-page). Lives in the pure `selectActiveNav` helper.
- **Presentational only:** no auth / routes / env / middleware; `getSessionManager()` gating unchanged;
  the hub `/` (Prompt 16) untouched; sign-out reuses the hub POST form verbatim; zero new CSS.

## Landing visual design (Prompt 19) — plain CSS over Tailwind, scoped per-route

- **Amends ARCHITECTURE §1 "Tailwind."** Design delivered the system as **plain CSS** — `ds.css` (the
  global design system: tokens / reset / component classes) + a per-screen CSS file. Per "boring and
  reliable" + the launch deadline, the app **consumes the CSS as delivered** rather than re-translating
  it to Tailwind. Tailwind stays installed (root `globals.css`, `@tailwind` directives) but is **not** the
  styling system; the feature screens (`/draft`, `/lineup`, `/vsfield`) already import their own
  per-route `ds.css` copies. `ds.css` is duplicated per-route by the existing convention (4 byte-identical
  copies now — a shared-import refactor was rejected as out-of-scope; the landing's copy is guarded
  byte-identical to the feature copy by a test).
- **Per-route, NOT global (operator decision).** The prompt asked to import `ds.css` **globally** in the
  root layout, but that **collides** with the existing global `globals.css` (Tailwind Preflight = a second
  reset) and would **double-load** `ds.css` on the feature routes. Resolved by importing `ds.css` +
  `landing.css` **in `page.tsx`** (route-scoped to `/`, the repo's per-route convention) under a `.lp`
  wrapper. Root `layout.tsx` is **untouched** (no conflict with Prompt 18's metadata edit there).
- **Two CSS adaptations to the vendored `landing.css` (the only edits to delivered CSS, both sanctioned
  by "scope under a wrapper"):** (1) the design ships `body.lp { … }`, but `/` shares the root-layout
  `<body>` with every route, so it was re-scoped to a **`.lp` wrapper** — using **`overflow-x: clip`**
  (NOT the original `hidden`: on a non-`<body>` element `overflow-x:hidden` computes `overflow-y:auto`,
  making `.lp` a scroll container that would **break the sticky `.lp-nav`**; the hero/CTA glows are
  self-clipped by their sections' `overflow:hidden`). (2) `.lp` sets **`color: var(--text-primary)`** —
  load-bearing: `ds.css` sets `body{color}` (element, 0,0,1) but the root `<body>` carries Tailwind's
  `text-slate-900` **class** (0,1,0), which wins on `/`, so the landing's color-less headings would
  inherit dark-on-dark without re-establishing the baseline on `.lp`.
- **The delivered design is a full marketing+login page, NOT a four-state re-skin (the prompt's premise
  was off).** Resolved with the operator: the logged-out **`signin`** state renders the **full 10-section
  XI marketing landing** (ported from `XI Landing.html` to `_landing/MarketingLanding.tsx`); `hub` /
  `unlinked` / `denied` get branded `ds.css` panels (no design pixel-truth exists for them). The
  prototype's **two inline self-serve email forms → a "Sign in" CTA → `/sign-in`** (honoring "no
  self-serve join flow"); the prototype Tweaks panel + `<script>` are dropped.
- **`selectLandingView()` + the four-outcome branch + the route set are byte-for-byte unchanged** (proven
  by diff + a source-contract smoke). `<Brand/>` (`BrandMark`) sits in every state's header. Link targets:
  the three built screens deep-link to `/draft` `/lineup` `/vsfield`; design destinations without a route
  yet (Dashboard / Standings / Guillotine / Free Agents / Waivers / Settings) point at `/sign-in` to avoid
  404s — a `TODO(confirm)` to repoint when those screens ship.
- **Deferred (flagged follow-up):** `/sign-in` (and `/auth/denied`) stay unstyled — the login flow's
  design (`Join.html`) was **not in this handoff bundle**, so skinning it is a separate task, not improvised.
- **Branch:** `feat/landing-design` (`aa295bd`) stacks on **Prompt 18** (`feat/brand-pwa`), because it
  imports `Brand.tsx` (landed in Prompt 18, not yet on `main`). **Merge order: Prompt 18 → main, then
  Prompt 19.** Held for clearance; not pushed; no force-push.

## App Shell & global design system (Prompt 20) — ds.css promoted to global; the nav chrome

- **ARCHITECTURE decision this prompt executes — `ds.css` is now the GLOBAL design system; Tailwind /
  `globals.css` / Preflight COEXIST (not retired).** `ds.css` is imported once in the root
  `layout.tsx`, **after** `globals.css`, so it wins cascade ties. This **supersedes Prompt 19's
  "per-route, NOT global"** call (above): that was a stop-gap to dodge the body-surface collision; the
  collision is now fixed head-on, so the global promotion is safe. Teardown of Tailwind/Preflight is
  **post-sprint** (only once nothing consumes Tailwind), explicitly out of scope here.
- **Canonical copy = `apps/web/app/styles/ds.css`** (byte-identical, md5 `66d4bbbc…`, the prompt's
  suggested tidy location). The four per-route copies (`draft`/`lineup`/`vsfield`/`_landing`) **stay** —
  they double-load harmlessly (identical bytes → idempotent); de-duping the per-route imports is a
  deliberate post-sprint follow-up, NOT this prompt. A test guards the canonical copy byte-identical.
- **Collision A (body surface) FIXED.** The root `<body>` carried Tailwind `bg-slate-50 text-slate-900`
  (**class** selectors, 0,1,0) which out-specified `ds.css`'s `body { background; color }` (**element**,
  0,0,1), pinning the app **light**. Fix = **drop the two classes** (keep `min-h-screen antialiased`);
  the ds dark surface then applies, and dark is the ds `:root` **default**, so **no `data-theme`** is
  needed. (This retires Prompt 19's `.lp`-wrapper `color` workaround for `/`, though that wrapper is left
  in place — harmless.) Collision B (the `.gap-*` class-name overlap) is **left as-is** (ds + Tailwind
  emit identical values; ds wins by import order).
- **Shell shape = TOP BAR, server component, real routes only.** Built the design's `GlobalTopbar`
  variant (`apps/web/app/shell/AppShell.tsx` + `shell.css`, ported from `App Shell.html` + `shell/*`),
  NOT the 240px sidebar: the topbar sits where the interim CrossNav did (a top strip), so it supersedes
  CrossNav **without reflowing the un-reskinned feature bodies**. It is a **pure server component** (no
  `"use client"`, no JS): active state is passed **explicitly** (`active` prop) by each consumer instead
  of CrossNav's client `usePathname()`; nav items are plain `<a>`; sign-out is the existing POST
  `<form>`. Nav lists **only the four built screens** (Home/Draft/Lineup/Vs-field). The prototype's
  richer chrome (the full 14-screen IA + "More" overflow, the bell → Notifications, the avatar menu, the
  slate commissioner entry, the dedicated mobile tab-bar + sheets) targets **unbuilt** screens → left as
  flagged `TODO(confirm)` seams (mirrors the landing's deferred unbuilt-screen links). The bar reflows
  responsively (flex-wrap) for now; it is intentionally **static** (not sticky), matching CrossNav.
- **Brand per BRAND.md §5 (a brain file outranks the prototype).** `<BrandBadge>` trophy chip + the
  **"XI"** wordmark + the **league-name** (`WC Fantasy League`) secondary line. The prototype's
  `ShellBrand` used the league name as the PRIMARY bold text and hid the secondary line in topbar mode
  (`.sh-brand-txt span{display:none}`); BRAND.md §5 wants "XI" primary + league name secondary, so that
  hide rule is **intentionally omitted** and the league line is shown.
- **Mounting = per-feature-layout + a conditional hub wrap (NOT a route group).** The dual-state `/`
  can't be wrapped by an unconditional `(app)` route-group layout (logged-out `/` = marketing, must stay
  bare), so the shell is applied **per layout** (matching the existing CrossNav pattern, zero directory
  moves): `draft`/`lineup`/`vsfield` layouts swap `<CrossNav/>` → `<AppShell active="…">`, and the **hub
  state only** of `page.tsx` is wrapped (`<AppShell active="home" signedInAs=…>`, dropping its own
  `.lp-nav`). `selectLandingView()`, `Home()`'s branch, and the `signin`/`unlinked`/`denied` states are
  **byte-for-byte unchanged** (those three keep their landing chrome — they aren't feature surfaces). The
  hub's welcome body (`.lp-section`/`.lp-peek-grid`) is unchanged and styles correctly outside `.lp`
  (every `.lp-*` is a global selector, not `.lp`-descendant-scoped — verified).
- **CrossNav absorbed:** `apps/web/app/shell/CrossNav.tsx` **deleted**; the pure helper
  `apps/web/src/shell/crossNav.ts` (`NAV_ITEMS` + `selectActiveNav`) + its test **stay and are reused**
  (the shell consumes `NAV_ITEMS`). The vsfield layout's old `TODO(prompt-NN): nest into the shell` is
  closed.
- **Height model — restored the design's original, after a browser-verified regression.** A naive port
  (`.sh-app{min-height:100dvh}` + a content-less `.sh-content`) **clipped the fixed-height `/draft`
  surface** (`.dr-app{height:100dvh; overflow:hidden}` → ~3300px of the board lost, internal scroll
  dead). Fix = the design's `.sh-app{height:100%}` (propagates a definite height when the parent has one)
  + `min-height:100dvh` floor + `.sh-content{flex:1; min-height:0; overflow-y:auto}`. This **one** model
  hosts both contracts: `/draft` (definite-height parent → internal scroll resolves, nothing clipped) and
  `/lineup`/`/vsfield`/hub (auto-height parents → `height:100%` computes to `auto` → natural page scroll).
  Both verified in a headless browser (the same method that proved the bug).
- **Auth-page legibility repair (minimal, NOT the deferred skin).** Promoting the dark body to global
  made `/sign-in` + `/auth/denied` gray helper/status copy (`text-slate-600/700`) ~2:1 on dark — the
  sign-in error/status line (its only feedback channel) was illegible. Bumped to `text-slate-400/300`
  (stays Tailwind, legible). The **full** auth skin off Tailwind remains the **deferred next prompt**.
- **Adversarial review:** 5 lenses (cascade / design-faithfulness / scope / a11y+RSC / hub-integrity) →
  per-finding verify. **3 of 10 confirmed, all folded** (the two above + an `aria-label="Global"` on the
  shell `<header>` so it doesn't duplicate `/lineup`'s own `sl-topbar` banner landmark). Brand-link badge
  also `aria-hidden` so the link reads "XI WC Fantasy League" (matches the Prompt-19 a11y fix).
- **Deferred / flagged:** **Prompt 21** = skin `/sign-in` + `/auth/denied` off Tailwind (from `Join.html`
  + `auth/*`); the richer shell IA + mobile tab-bar/sheets/bell/avatar/commissioner (add as those screens
  ship); per-route `ds.css` de-dup + Preflight drop (post-sprint). **Branch `feat/app-shell`, off
  post-19 `main`; held for clearance; not pushed; no force-push.**
- **Known tradeoff of per-layout mounting:** because the shell is mounted in each feature layout (not a
  shared `(app)/` route-group layout), it **remounts on every feature-route change**. Harmless today —
  the shell is a **stateless server component** (no open/close state to lose). Revisit a shared `(app)/`
  route-group layout if/when **stateful chrome** ships (avatar menu / bell open-state), so the shell
  persists across feature navigation instead of remounting.

## Sign-in / Join skin (Prompt 21) — `/sign-in` + `/auth/denied` off Tailwind onto ds

- **Architecture decision this prompt advances — `/sign-in` + `/auth/denied` join the ds-only set**
  (alongside the Prompt-19 landing + the Prompt-20 shell). Tailwind / `globals.css` / Preflight stay
  global (other unmigrated screens still consume Tailwind) — **no teardown here**; the Preflight drop
  stays post-sprint. The Prompt-20 `text-slate-*` legibility repair on these two routes is **gone**
  (superseded by the full ds skin — it was always a stop-gap).
- **Canonical design = the repo's `design/design_reference/Join.html` + `auth/*`** (NOT the Downloads
  bundle, which was landing-only). Built to the design's **split layout** (`.au-shell.is-split` =
  brand-panel splash + form column) using the design's `au-*` vocabulary.
- **Route-scoped stylesheet, NOT a per-route ds.css copy.** `apps/web/app/_auth/auth.css` holds only the
  `au-*` layout rules, ported from `Join.html`'s `<style>`; tokens + `.btn`/`.spinner` come from the
  **global** ds.css. This follows the **`shell.css` model** (shell relies on global ds, ships only
  `.sh-*`) — cleaner than the Prompt-19 landing, which keeps its own per-route `ds.css` copy because it
  predates the global promotion. ds.css is **not forked**; both routes import `auth.css`.
- **Shared chrome `apps/web/app/_auth/AuthChrome.tsx`** (parallels `_landing/chrome.tsx`): `AuthScreen`
  (split shell + brand panel + form-column slot + foot) + the design's icons + `PrivateTag`. **No
  `"use client"`** — pure presentational markup (next/image is server+client safe), so the **client**
  `/sign-in` and the **server** `/auth/denied` both render it. Each route is thin: drop its view in the slot.
- **Brand per BRAND.md §5 — reused `LockupStacked`, NOT redrawn.** Brand panel = the Prompt-18
  `LockupStacked` (trophy · "XI" · tagline) + the `{league} · {season}` row (`WC Fantasy League` — the
  SAME placeholder the shell uses, **no new source / no `SHELL_LEAGUE_NAME` wiring** — + `World Cup
  2026`) + `PrivateTag` + the static value-props list. The data-bound design pieces (`RosterAvatars` /
  `InviteBanner`) are **dropped, not faked** — they need a manager/invite fetch these routes don't have
  (out of scope). The design's old `AuthLogo` "W" chip (pre-XI-rebrand) is replaced by the XI lockup.
- **Gold rule (BRAND.md §1) holds:** gold lives ONLY in the trophy PNG; "XI" = `--text-primary` (via
  `Wordmark`); CTA / links / value-dots / focus rings are cobalt `--accent`; `PrivateTag` is slate
  `--locked`. **No gold leak** (grep-clean of `au-*` CSS + TSX — the only "gold" strings are prose).
- **`/sign-in` is PRESENTATION-ONLY.** The Supabase `signInWithOtp` (same `emailRedirectTo` →
  `/auth/callback`), the env-gated `signInWithOAuth(google)` + `GOOGLE_ENABLED`, and the `createClient`
  edge are **byte-for-byte preserved**. The one-string `message` became two presentation flags (`error` +
  `sent`) so the request form and the "check your email" confirmation render as the two designed views —
  the network/redirect behavior is identical. **No next/safeNextPath handling was introduced** (there
  never was — that passthrough lives in `auth/callback/route.ts`, untouched). The "Use a different email"
  reset is pure client UI state. `/auth/denied` keeps its **dual-cause** copy (allowlist OR expired link —
  the design's `DeniedView` is allowlist-only) + the back-to-sign-in affordance.
- **Early-warning seam — clean, no `page.tsx` edit.** The root `selectLandingView` `denied`/`unlinked`
  states render as **independent** `page.tsx` components (already ds-skinned in Prompt 19 via `.lp-*`),
  NOT shared with the `/auth/denied` **route** — so skinning the route touches nothing of `page.tsx`.
  `page.tsx` / `selectLandingView` / `getSessionManager` / the callback / the allowlist are **untouched**.
- **Shell-free boundary holds (Prompt 20).** Neither auth route is wrapped in `AppShell`; there is no
  `layout.tsx` under `sign-in/` or `auth/` (root layout only). The brand IS the auth chrome (the
  `AuthScreen` panel), replacing the shell topbar. Both stay `○` static (no `cookies()`/`headers()`/
  `force-dynamic`); `/` stays `ƒ`.
- **Responsive:** the design's split collapse (`@media (max-width:1100px)` → single column, brand panel
  on top with `border-bottom`) is ported verbatim; **browser-verified** (desktop split + mobile stack).
- **Adversarial review (Opus, 4 lenses [logic-scope / brand-gold / ds-responsive-a11y / convention] →
  per-finding verify): 1 of 1 confirmed, folded.** The reused `LockupStacked` double-announced "XI"
  (trophy image `alt="XI"` + visible "XI" wordmark). Fix = wrap the lockup in `aria-hidden="true"` (the
  splash is decorative) — the **in-repo precedent** is `_landing/chrome.tsx`, which aria-hides the same
  `BrandMark`; the accessible brand name now comes from the visible league name + each view's `<h1>`.
  **Browser-DOM-verified:** lockup `aria-hidden`, still centered (no layout shift), brand-panel accessible
  text = "WC Fantasy League · World Cup 2026 · Private league · invite only", single `<h1>`. (`Brand.tsx`
  — a shared primitive — was NOT edited; the ideal `alt=""` fix there is out of this prompt's scope.)
- **Tests:** a pure-Node source-contract smoke (`apps/web/src/auth/authPages.test.ts`, +12, mirroring
  `landingPage.test.ts` — no DOM/JSX mount): both routes go through `AuthScreen` + import `auth.css`; the
  brand mark is present; the Supabase wiring + Google gate + denied affordance are preserved; off-Tailwind
  (no `text-slate-*`/`bg-blue-600`); `auth.css` doesn't restyle `<body>` (no leak) and stays gold-free.
- **Confirmed at clearance (both `TODO(confirm)`s resolved — Chat):** (1) **The auth foot stays prose,
  never a link** — no commissioner-contact route exists app-wide, so we do NOT invent a `mailto`/`href="#"`;
  wiring a real contact destination is a later prompt. (2) **`/auth/denied`'s broadened `<h1>` "We can't
  sign you in" stays** — this route is **dual-cause** (allowlist OR expired link), so the design's
  allowlist-only `DeniedView` copy would mislead; this is a recorded **design-deviation**, and cause-
  specific copy is a future **logic** prompt (not a skin). (3) The `message → error + sent` split is
  **endorsed as presentation** (required to render the "check your email" confirmation as its own view).
  No `TODO(confirm)` remains in the auth skin.
- **Gates:** `pnpm -w typecheck && lint && format:check && test` (735, +12) + `pnpm --filter @app/web
  build` all exit 0; route shapes preserved (`○ /sign-in`, `○ /auth/denied`, `ƒ /`); no out-of-scope
  churn (no auth-logic / `selectLandingView` / route / redirect / env edits, no shell wrapping, no
  Tailwind teardown, no feature-body re-skin, no `page.tsx` edit). **Next: Prompt 22 — first feature-body
  re-skin (Draft, from the `design_reference/` Draft screen).** ✅ **CLEARED (Chat); branch `feat/auth-skin`
  (off post-20 `main`) pushed to origin (no force-push).** *Sergio runs the fast-forward merge to `main`
  and owns the Render deploy + live-verify — Code does NOT merge or deploy.*

## Draft body skin (Prompt 22) — `/draft` re-skinned to the `design_reference` Draft screen on global ds.css

- **Architecture decision this prompt advances — `/draft` joins the ds-aligned skinned set** (Prompt-19
  landing, Prompt-20 shell, Prompt-21 auth, now Draft — the **first feature body**). Tailwind /
  `globals.css` / Preflight stay **global** (Lineup + Vs-the-Field still consume them) — **no teardown
  here**; the per-route `ds.css` de-dup + the Preflight drop stay post-sprint. **The skin introduced no
  architecture change** — this DECISIONS entry is the record (ARCHITECTURE.md untouched).
- **The re-skin reduced to ONE change: brand de-dup.** A 6-agent adversarial fidelity audit confirmed the
  Draft body was **already byte-faithful** to `design_reference/Draft Room.html` on the global ds.css (the
  Prompt 08/09 port), so the only drift after Prompt 20 wrapped `/draft` in `AppShell` was a **doubled
  brand lockup**: the body's `.dr-top` rendered its own `.dr-logo` "W" + "Snake Draft" wordmark on top of
  the shell topbar's trophy · "XI" · league. Fix = drop the body lockup; `.dr-top` → a **de-branded
  `.dr-status` strip** (phase line + connection pill + presence). **No brand mark added to the body** — the
  shell owns it (BRAND.md §1/§5).
- **Route-scoped stylesheet, no fork.** The `.dr-*` layout lives in `apps/web/app/draft/draft.css` (the
  `shell.css` / `_auth/auth.css` convention), layered on the **global** ds.css; the `.dr-brand`/`.dr-logo`
  rules → `.dr-status`. **ds.css is NOT forked**; the per-route `draft/ds.css` copy + its import are **left
  in place** for the post-sprint de-dup. draft.css stays fully tokenized (zero hex) → cobalt `--accent` /
  red `--live` / slate `--pos-gk` only — **no gold leak**.
- **Presentation only — every mechanism preserved.** No edits to `packages/draft`, the gated `POST
  /api/draft/pick`, `handlePick`, the worker tick, the Realtime subscription wiring, the **server-synced
  countdown** (`pick_deadline_at` → `useServerCountdown`/`countdownView`, never the client clock), or the
  deadline logic. The Prompt-20 fixed-height/internal-scroll model
  (`.dr-app{height:100dvh;overflow:hidden}` → `.sh-content{flex:1;min-height:0;overflow-y:auto}` →
  `.dr{height:100%}`) is **untouched** (`.dr-top` stays `flex:none`). `/draft` stays `ƒ`.
- **Deferred-not-built (flagged, NOT skin gaps).** Two classes: **(a) data-shape seams** — the lobby
  start/sim controls + the "Draft starts in" countdown, and the Summary PROJECTED / draft-grade /
  value-pick + the available/roster `proj` sublines, are all **absent from `DraftRoomState`** (no `proj`,
  no scheduled-start field), so building them needs a loader/payload change (an early-warning STOP), not a
  re-skin — the build correctly omits them. **(b) deferred features** — the autopick queue **editor** (add
  ＋ / drag-reorder / ✕ remove + the clock-bar "Idle → autopick {top}" hint; the queue stays a read-only
  display) and the board **auto-scroll-to-current-pick** (`boardEndRef` + `scrollIntoView` — needs a
  ref+effect on live state, not CSS) are out-of-scope follow-ups.
- **Tests:** a pure-Node source-contract smoke (`apps/web/src/draft/draftRoom.test.ts`, +10, mirroring
  `landingPage.test.ts` / `appShell.test.ts` — no RTL/jsdom in the repo) guards the brand de-dup, the
  view-state→region branch, the make-pick on-the-clock gate, the server-countdown source, the typed-error
  surface, the no-hex/no-gold palette, and the `ƒ` shape. The 49 existing pure draft tests
  (`board`/`countdown`/`reducer`/`handlePick`/`pickClient`) already pin the behaviors at the right
  altitude, so a `selectDraftView` extraction was **rejected as disproportionate logic churn**. Draft
  suite **59 green**.
- **Gates:** `pnpm -w typecheck && lint && format:check && test` (745, +10) + `pnpm --filter @app/web
  build` all exit 0; route shapes preserved (`ƒ /draft`, others unchanged). Independent adversarial diff
  review = **clean PASS**. **Live visual fidelity** + the one `// TODO(confirm)` (the de-branded strip
  label) are the **operator gate** on the Render deploy — `/draft` needs auth+DB+Realtime, not in-session
  renderable — confirmed per the sprint cadence (merge → verify-live).
- **Merged to `main` at `d9800e7`** (`b135cac` P20 → `7e5d801` P21 → `d9800e7` P22). This thread-close
  record did **not** ride that commit (it was the cherry-picked draft change only); this docs commit adds
  it. **Next: Prompt 23 — Lineup re-skin (from the `design_reference/` Set Lineup screen).**

## Lineup + Vs-the-Field skins (Prompts 23–24) — design sprint complete; the live indicator is RED, never green
- **Design sprint COMPLETE.** All five screens are re-skinned to `design_reference/` on the Prompt-20 App
  Shell foundation: **landing (19) → App Shell (20) → auth (21) → Draft (22) → Lineup (23) →
  Vs-the-Field (24)**, all merged to `main` (68 files / 770 tests). Like Draft (Prompt 22), both bodies
  were **already faithful** route-scoped ports on the **global** ds.css (ds.css not forked); each re-skin
  reduced to small presentation-only reconciliations (per-prompt detail in PROJECT.md). The only sprint work
  left is the **operator gate** — live authenticated visual fidelity on the Render deploy (the feature
  bodies need auth+DB+Realtime, not in-session renderable).
  - **Prompt 23 (`/lineup`, `43490aa`):** already a faithful `.sl-*` port; **no body brand chip existed**
    (`sl-topbar` is a de-branded screen-title strip) → **no de-dup needed** (unlike Draft/Vs-the-Field).
    Reduced to **pitch markings** (ported the full field markings) + a **legend over-claim fix** (the binary
    `lineup_slot.locked_at` is "Locked", not "Locked · played"). No `packages/lineup` / `POST /api/lineup` /
    lock-recheck edits.
  - **Prompt 24 (`/vsfield`, `fee577f` via merge `37fd7c6`):** **brand de-dup** (dropped the body `.vf-logo`
    "W" — **vsfield-LOCAL** despite BRAND §5 naming it "the shared chip"; in code it was defined+used only in
    `apps/web/app/vsfield/*`, exactly like `.dr-logo` was route-scoped to draft, so removing it is **not** a
    shared-file edit) + **pitch markings** (centre circle + halfway line, the same gap as Lineup). The
    **natural-scroll height model is preserved** (`.vf-app` keeps `min-height:100%`; `shell.css` classes
    `/vsfield` as a natural-scroll screen where `.sh-content` owns the single scrollbar — **NOT** forced to
    the design's `height:100%`, which would fight the shell). Avatars stay initials (BRAND §6 — no parrot).
    No `packages/vsfield` (`buildVsField`) / Prompt-04-helper / `loadVsField` / authed-read (**401, no 403**)
    / Realtime / RLS edits.

- **LIVE INDICATOR = RED `#FF4D4D`, NEVER GREEN — ✅ LOCKED (design-canonical; do not re-litigate).** The
  `--live` token is **byte-identical** in the app's `apps/web/app/styles/ds.css` and the design's
  `design/design_reference/ds/ds.css` (`--live: #FF4D4D`), and **design `CLAUDE.md §3`** lists the functional
  color "live `#FF4D4D`". Red is the **broadcast / match-LIVE pulse** — a starter currently playing, a match
  in progress, the "● Live" connection pill — always **color + icon + word**, never color alone. It is
  **not** a "connection-healthy" green light: the connection-health ladder is **Live = red** · Reconnecting =
  info-blue · Stale = gray (`--surface-3`) · Loading = neutral; **green (`--win #2FBF71`) is reserved for WIN
  states only** (the all-play-all record W, an H2H `+margin`). **The Prompt-24 prompt's assumption that the
  live indicator should be green (a "`--live`/positive" token) was INCORRECT** — `--live` is red by spec;
  corrected against the design source and locked here so it isn't re-opened. Discipline held: the build's
  `ConnPill` / `.vf-livedot` use **tokenized `var(--live)`**, no raw hex.

---

## Post-provision fixes — mapper reconciliation & session-manager hardening
Three fixes landed on `main` after the design sprint (most-recent-first).

### Scoring mappers reconciled with the GOAT docs (`fix/scoring-mapper-shape`, `f3db93a`)
All four scoring mappers (`mapEvent`/`mapStatLine`/`mapTeamStat`/`mapShot`) reconciled against the
official GOAT FIFA API docs. `mapEvent` had the **same nested-object bug as the match mapper**
(`player`/`assist_player`/`player_in`/`player_out` are nested objects, not flat IDs).
**`FeedShapeMismatchError`** added as a **per-item fail-loud guard** — thrown on an unexpected shape,
caught per-item in the ingest pipeline so one bad row never halts the batch. GOAT covers the
**2018/2022/2026** tournaments (not 2026-only); **2022 completed-match data** used for pre-opener
shape verification.

### GOAT matches endpoint returns nested objects (`fix/feed-mapper-shape`, `6ca5829`)
The GOAT API returns **nested objects** for teams/stage/group on the `matches` endpoint, not flat
primitives. `mapMatchRow` and `derivePeriodLabel` updated to extract from the nested shape. Period
bucketing verified: **3 group MDs + 5 KO rounds = 103 mapped fixtures; 3rd-place match intentionally
excluded** (no 9th period).

### `resolveSessionManager` — split uid/email link fails loud (`1b28e3b`)
`resolveSessionManager`: a uid↔email **cross-link mismatch throws `AmbiguousManagerLinkError`** rather
than silently preferring the uid match. **Rationale:** a split link is a **data-integrity issue that
must surface, not hide.**

## FAAB batch engine (Prompt 25) — the locked §D algorithm in code; `@app/faab` pure resolver + bid route + cron

The Prompt-25 build implements the **already-LOCKED** Theme D ("FAAB & Waivers") algorithm faithfully —
"boring and reliable" over clever; **no rule re-derived**. Engine only, **no UI** (the `/waivers` screen
is Prompt 26). Merged to `main` @ `2145700`. The decisions of record:

- **The 8-step §D algorithm is implemented as specified** by the pure `resolveFaabBatch`
  (`packages/faab/src/resolve.ts`, IO/clock/Prisma/Supabase-free — `now` + kickoffs are injected): void +
  refund a bid whose add target already kicked off; highest-bid-first, player-by-player; tie → the rolling
  waiver order; a manager's own multiple wins apply highest-first, skipping any that no longer fit; $0 bids
  legal; every won claim is add/drop + a budget debit; the waiver order stays a contiguous 1..N permutation.
- **Move-to-bottom fires ONLY when the tiebreak is actually USED** (an equal competing bid existed and the
  waiver order decided the win). **Winning on bid amount alone never moves a manager.** The single
  `tiebreakUsed` boolean both stamps the winning bid and gates the renumber, and the winner drops to the
  bottom **immediately for the rest of that same batch** (so a tiebreak winner can't sweep all the tied
  players).
- **Own bids resolve by AMOUNT, highest-first-skip** — this is **emergent**, not special-cased: the loop
  always awards the globally-highest live bid against the manager's *updated* budget / roster / ownership,
  so a lower own bid that no longer fits (drop already consumed, budget exhausted, roster cap) is naturally
  skipped (`drop-invalid` / `budget-exhausted` / `roster-illegal`).
- **Cross-player equal-amount ordering = waiver order (locked).** When several DIFFERENT players are tied
  at the top amount, they are processed in the order of their **leading bidder's `waiverOrderPosition`**
  (lower first), **NOT** by player id / insertion / `createdAt` — because move-to-bottom sequencing (and
  thus the final waiver order) depends on it. Waiver positions are unique per league, so the only tie is
  the same manager leading both at equal amount → a deterministic player-id fallback (the intra-manager
  equal-amount case; see `priority` below).
- **Drop-lock validation (added, enforcing §B lock-on-play on the FAAB path).** A player **locked by play
  in a still-active matchday cannot be dropped** until that matchday ends. Enforced via the existing
  lock-on-play seam (no new clock): the bid route **rejects at submission** a `playerDropId` whose
  `lineup_slot.locked_at` is set in a non-closed matchday (`drop-locked` `FaabBidError`), and the resolver's
  `claimLegality` treats a locked-lineup drop as **`drop-invalid`**, so the batch skips that bid and the
  player passes to the next valid bid. Once the matchday closes, the lock is historical and the player is
  droppable again.
- **Lineup-slot release is routed through `@app/lineup`, inside the batch transaction.** Scoring keys off
  the starting lineup, so a won drop's UNLOCKED `lineup_slot` rows are released in the same `$transaction`
  as the roster drop (a dropped starter must stop scoring) — but **faab must not touch `lineup_slot`
  directly**. It calls the exported `@app/lineup/prisma` `releaseDroppedPlayerSlots(tx, { leagueId,
  managerId, playerId })` (release only UNLOCKED slots; locked/historical slots are kept). The lock-on-play
  read (`findLockedSlotPlayerIds`) lives in the same lineup module. The lineup domain owns `lineup_slot`.
- **`addTargetKickoffAt` resolves through `fifa_match.kickoff_at` (the SAME field as lock-on-play, no
  second clock).** The acquisition cutoff ("can't add a player once his match kicks off") reads the team's
  next not-completed fixture's `kickoff_at` via `player.team_id` — exactly the schedule field `@app/ingest`
  derives `lineup_slot.locked_at` from. The pure resolver compares it to the injected `now`.
- **The single atomic transaction is the invariant guard.** `commitBatch` writes the whole resolved
  outcome in one `$transaction` (assign winners + add/drop + debit, refund voids, mark losers, two-phase
  move-to-bottom reorder preserving the non-deferrable `manager_waiver_order_uq`, stamp `batchId` +
  terminal status, batch → `complete`). **Idempotent**: guarded `updateMany WHERE status='pending'` + a
  no-pending-bids run creates no batch row, so a re-run is a clean no-op.
- **`faab_bid.priority` is DEFERRED to Prompt 26.** DECISIONS §D locks own-bid resolution by **amount**;
  the design's reorderable pending-claim *priority* would be the **intra-manager tiebreak for equal-amount
  own bids** (+ a UI apply-order hint) — but there is **no `priority` column** today, so the engine
  resolves purely by amount and the route does **not** expose reorder. Honoring priority needs a migration
  (Prompt 26). The submission/cancel/edit-amount paths are wired now.
- **Out of scope (flagged, not built):** the free-agency **FA `Acquire` route does not exist** (sibling
  concern); the **playoff FAAB reset + waiver carry-forward** belong to the group→playoff transition prompt
  (this engine only READS current budget/order). `faab_bid` **RLS is already present** (Theme F invariants
  migration — own-pending read/write + public settled read), so no policy was added.

## DRAFT Nation Binding (Prompt 33) — the locked §D algorithm in code; `@app/faab` pure resolver + bid route + cron
P34 — Draft nation binding. /draft country chips (P31) and flags (P33) now source from FifaTeam.name via player.team, not the player.country scalar (no ingestion path ever wrote it). Single-file change in apps/web/app/draft/loadDraftRoom.ts — PLAYER_SELECT team join + toPlayer mapper (country = p.team?.name ?? null). DraftPlayer.country field name kept so P31/P33 untouched. No migration; no engine/route/worker/Realtime edits.

P35 — All 48 distinct FifaTeam.name values in the 2026 dataset now resolve to flags (zero placeholders). Flag resolver gaps closed: home nations (England/Scotland/Wales/Northern Ireland), Curaçao (CUW→CW, omitted from ISO table), DR Congo variants, Côte d'Ivoire variants, Bosnia & Herzegovina variants, Cabo Verde (Intl.DisplayNames returns "Cape Verde" on Node 25 but the feed sends "Cabo Verde"), and 11 FIFA formal names that differ from Intl output (IR Iran, Türkiye/Turkey, Korea Republic, DPR Korea, Republic of Ireland, Chinese Taipei, Trinidad and Tobago, Czechia). Collapsible nation filter added: chip grid collapsed by default behind a "Nations ▾/▸" toggle; position chips (All/GK/DEF/MID/FWD) always visible; active-selection shown in collapsed header with ✕ clear control. CLIENT-ONLY — `src/draft/flag.ts`, `flag.test.ts`, `components.tsx`, `draft.css` only. **Home nation interim decision (superseded by P36):** England/Scotland/Wales/Northern Ireland rendered the Union Jack (🇬🇧) as a pre-launch INTERIM — correct inline-SVG flags delivered in P36.

P36 — Home-nation flags resolved. England = St George's Cross, Scotland = Saltire, as inline SVG (universal; no dep, no asset files, no emoji tag sequences). All home-nation → GB fallbacks removed from the resolver (England/Scotland/Wales/N. Ireland → null); `Flag.tsx` intercepts via `isHomeNation()` before the emoji path. `HOME_NATIONS` set + `isHomeNation()` predicate exported from `src/draft/flag.ts` as single source of truth; `Flag.tsx` is the sole render surface (unchanged contract). Supersedes the P35 Union Jack interim. 48/48 distinct countries now render their correct flag. CLIENT-ONLY — `src/draft/flag.ts`, `flag.test.ts`, `flagWiring.test.ts`, `app/draft/Flag.tsx` only.

## Dashboard home (Prompt 37) — phase taxonomy, STOP seams, and hub route architecture

- **Phase taxonomy locked: `pre-draft | draft | post-draft`.** Derived entirely from `draft.status` (the
  existing `DraftStatus` enum: `pending → pre-draft`; `active | paused → draft`; `complete →
  post-draft`). No new column, no new data source — the same `draft` row `loadDraftRoom` already reads.
  The `selectDashboardPhase` pure selector (`src/dashboard/selectDashboardPhase.ts`) is the single
  derivation point; it carries a `never` exhaustiveness guard so adding a new `DraftStatus` value is a
  compile error until the dashboard handles it.
- **`post-draft` phase = a minimal "tournament underway" interim.** The group-phase module set (standings,
  current-period score, matchday schedule) is the **next prompt**; playoff/complete are further deferred.
  For P37 the post-draft render is a stub CTA block (Set lineup + Vs the field) with no data modules.
- **Route ownership for `/draft`, `/lineup`, `/vsfield` promoted from `page.tsx` to
  `Dashboard`/`PrimaryBanner`.** The old `FEATURES` nav-card array (a `page.tsx`-local constant listing
  the three feature hrefs inline) is gone; the `ok → hub` branch now renders `<Dashboard data={data} />`.
  The three routes are exposed via `PrimaryBanner`'s phase-dependent `ctaHref` values and the post-draft
  stub CTAs. `selectLandingView()`, the four-outcome branch, the session read, and the
  `signin`/`unlinked`/`denied` states are **byte-for-byte unchanged**.
- **STOP seam — countdown: `scheduledStartAt` does not exist on the `draft` table.** The design's
  pre-draft banner shows a countdown to draft start. `draft` has no `scheduled_start_at` column.
  **DEFERRED: a candidate future migration adds this column.** For P37, `PrimaryBanner`'s pre-draft `sub`
  renders the honest empty: `"… — commissioner will start when everyone is ready."` (flagged `STOP(P37)`
  in source). No clock-based logic is built.
- **STOP seam — manager readiness: no per-manager ready flag exists server-side.** The design's pre-draft
  readiness grid shows each manager's online/ready dot. The `draft` and `manager` tables carry no
  `is_ready` field; readiness is Realtime **presence** in the draft room only. **DEFERRED: a candidate
  future migration (or a Realtime presence hook writing to a new column) adds this state.** For P37,
  `ReadinessModule` renders all manager dots off (gray `db-ready-dot` with no modifier class), plus the
  footer note "Live status visible in the draft room." (flagged `STOP(P37)` in source)

## Dashboard group phase (Prompt 38) — tournament phase, group modules, STOP seams

- **Tournament phase derived from `fifa_match.status + round`; NO migration.** `round: String?`
  (null = group-stage game, non-null = knockout round label e.g. "R32"/"QF"/"SF"/"Final") and
  `kickoffAt` both pre-existed on `fifa_match`. No `ALTER TABLE` required.
- **`selectTournamentPhase(matches[])` is IO-free and takes only `{status, round}`.** `kickoffAt`
  is **excluded** from the selector's input — it carries no structural information about tournament
  phase. `kickoffAt` is used only in the `loadDashboard` loader, solely to populate the
  pre-kickoff countdown display. No clock-based structural inference.
- **Composed with `selectDashboardPhase` via a private `"post-draft"` intermediate.** The exported
  `DashboardPhase` union is the six-member `pre-draft | draft | pre-kickoff | group | playoff |
  complete`; `"post-draft"` is a `type PostDraft = "post-draft"` private alias inside
  `selectDashboardPhase.ts` only — it never reaches rendered output. `selectDashboardPhase`'s
  function signature is **unchanged from P37**; the loader narrows with `if (draftPhase !==
  "post-draft")`.
- **MD "X of N" sources from provisioning-stored `period.label` + count of `kind === "group_md"`
  periods.** `period.label` (e.g. "MD1") is a stored DB column written at provisioning time, NOT
  derived at read time from `derivePeriodLabel` (an ingest-time function that sets
  `fifa_match.periodId` only). `byPeriod.length` = count of ALL provisioned `group_md` periods —
  a stable total, not a running count of completed matchdays. Null-guarded: renders `currentLabel ??
  "—"` when `byPeriod` is empty.
- **`playoff` and `complete` phases remain honest interims (`// STOP(P38)`).** No Guillotine
  bracket, no playoff-real data, no tournament-complete recap. `modulesFor("playoff")` and
  `modulesFor("complete")` both return `[]`; `PrimaryBanner` shows "Knockouts underway" /
  "Tournament complete" minimal content. Unblocked by a future Guillotine prompt..

## Profile rename / Settings route (Prompt 39)

- **`display_name` is the single user-editable manager identity.** There is no `team_name` or
  `@handle` column — those appear only in design prototype mocks and are explicitly OUT of scope.
  Adding them is a separate migration + rendering theme if the product ever needs them. `display_name`
  (TEXT NOT NULL on `manager`) is now self-service via `POST /api/manager/display-name`.

- **Self-only rename; no commissioner-renames-another path.** A manager may rename only themselves
  (any phase, including mid-draft). The framework-agnostic `handleDisplayNameRename` mirrors the
  `handleDraftPick` edge pattern: `resolveManager()` → assert `canActAsManager(scope:"self")` →
  `validateDisplayName` → DB write. The target is always the session manager's own id, so the
  `canActAsManager` call is always `true`; it is present for pattern fidelity (a future admin
  path would extend this check rather than add a new gate). There is no commissioner shortcut here.

- **Case-insensitive per-league uniqueness via a raw-SQL functional index.** A `@@unique` in the
  Prisma schema would only enforce exact-value matches. Expression-based uniqueness (`lower(display_name)`)
  requires a raw-SQL index: `CREATE UNIQUE INDEX "manager_league_id_lower_display_name_key" ON "manager"
  ("league_id", lower("display_name"))`. Applied in migration `20260610120000_manager_display_name_unique`.
  Prisma surfaces a violation as `PrismaClientKnownRequestError` code `P2002`; the route maps this to
  **409 `{ error: "name_taken" }`**. The schema.prisma `Manager` model carries a `/// Prompt 39:` comment
  pointing at the migration for discoverability (no `@@unique` added — Prisma doesn't support expression
  indexes). **Operator gate:** if existing managers in the same league already share a lower-cased name,
  the migration will fail with a unique-violation. Do NOT auto-rename — surface the colliding rows
  (`SELECT league_id, lower(display_name), array_agg(id) FROM manager GROUP BY 1,2 HAVING count(*)>1`)
  as an operator decision before applying.

- **The Settings seam is now a real, minimal route (profile-only; other sections still deferred).**
  The Prompt-20 App Shell's `TODO(confirm): avatar menu / Settings` seam is wired: `"settings"` added to
  `NavId` + `NAV_ITEMS` (the same treatment every other shipped route gets), the gear glyph added to
  `AppShell.tsx`'s `NavIcon` record. The `/settings` route is server-rendered, AppShell-mounted
  (`active="settings"`), auth-gated via `getSessionManager()`. **Built:** one "Public profile" section
  with the display-name rename form (a small client island, `SettingsClient`). **Explicitly NOT built
  and left as `TODO(confirm)` seams:** Account, Notifications, Appearance, League, Danger — building
  them now is premature without the screens being designed or the underlying features existing.

- **Realtime propagation of renames is deliberately NOT done.** A rename is not time-sensitive
  (unlike a draft pick). Renaming propagates to other clients on their next server render or navigation.
  Adding `manager` to a `postgres_changes` publication is out of scope — it would require a new RLS
  SELECT policy for the broadcast and is documented as the "RLS-publication trap" in DECISIONS.

## Pick'em pool — data layer + engine (Prompt 40)

The pool is a **per-match 1X2 pick'em** bolted onto the existing schedule, scored **separately** from
the player engine (SCORING.md addendum). Prompt 40 ships the data model + pure engine + server
write/read path. NO UI / nav / bracket / leaderboard screen / Realtime client — those are Prompt 41.

- **Option A (per-match 1X2), NOT option B (advancement bracket).** Managers pick each fixture's
  result (HOME/DRAW/AWAY for a group game; the advancer for a knockout); +1 per correct pick. A
  predictive knockout *bracket* (pick who reaches each round) was rejected as the data model — the
  "March Madness feel" is a Prompt-41 **presentation** concern layered over option A's per-match
  picks, not a different model. This reads results that ALREADY land in `fifa_match`; **no feed/ingest
  change**.

- **Phase discriminator = `period.kind`, NEVER `fifa_match.round`** (the load-bearing correction —
  Chat-caught during grounding). The prompt's first cut said "`round == null` → group"; that is
  **FALSE against the data**: `@app/ingest`'s `mapMatchRow` writes `round = round_name ??
  String(round_number)`, so `round` is the **matchday number ("1"/"2"/"3") for group games (NON-NULL)**
  and the raw round name ("Round of 16"/"Final") for knockouts, and `fifa_match.groupId`/`stageId` are
  **never populated** (`upsertMatch` omits them). Implementing the literal contract would misclassify
  all 72 group matches as knockout (DRAW silently rejected, advancer logic on null ET/pens → defensive
  null → nothing ever scores). So `derivePoolResult` takes a **resolved `periodKind`**
  (`group_md`/`knockout_round`/`null`) that the IO loader joins from `fifa_match.periodId →
  period.kind` — the same canonical signal locking / recompute / period-close already trust. The stale
  `fifa_match.round` schema comment was corrected to record the trap so it isn't re-stepped.

- **`periodKind == null` → `null` result (honest unscored), NO round-string regex fallback.** If a
  match's period isn't seeded yet, the pool declines to score it (the loader can flag it) rather than
  guessing the phase from `round` text. Symmetrically, write-time **DRAW rejection keys off
  `periodKind === "knockout_round"`**; when `periodKind` is null the write is **permissive** (all three
  allowed) and the pick simply scores null until the period is linked.

- **Result derivation.** `status !== "completed"` → null (pending). Group → HOME/DRAW/AWAY from
  full-time goals (defensive null if a score is missing). Knockout → the advancer via **full-time →
  extra-time → penalties** (never DRAW; defensive null if no decider). Robust to the feed's ET
  semantics: ET only exists when FT was level, so comparing the two ET fields yields the right advancer
  whether the feed stores ET cumulative or period-only (the equal FT portion cancels).

- **Flat +1, weight-parameterised.** `scorePick(prediction, result, weight)` = `weight` on a hit, else
  0 (a DRAW pick on a knockout scores 0 naturally — the knockout result is never DRAW).
  `weightForPeriod(periodKind, periodLabel)` returns a flat **1** today; the escalating-knockout knob
  (e.g. R32→Final 1/2/3/5/8) is a **seam** that will key off the canonical `period.label`
  (R32/R16/QF/SF/Final), **renamed** from the prompt's `weightForRound(round)` so it never reads raw
  `round`. `buildPoolLeaderboard` → `{ played, correct, points }`, sorted `points desc → managerId asc`
  (deterministic, like `standing.ts`).

- **Per-match kickoff lock; server time authoritative.** `isPickLocked(match, now)` =
  `now >= kickoffAt || status !== "scheduled"`. A submit is rejected once locked; `now` is the server
  clock (like the draft `pick_deadline_at`), never the client.

- **RLS mirrors `faab_bid`'s auth.uid()→manager→league idiom, with the pool's twists.** `pool_pick`
  carries `league_id`, so the SELECT policy is the simple `standing_select_league_member` shape (no
  SECURITY DEFINER helper — the predicate only needs the caller's own manager row). **SELECT is
  league-scoped** (a member reads the whole field's picks — the leaderboard + the post-kickoff reveal),
  NOT the blind-bid own-only secrecy faab uses. **INSERT/UPDATE are own-`manager_id` only**
  (defence-in-depth; every write also goes through the server, which bypasses RLS as table owner). No
  DELETE policy (default-deny — the write path is submit/upsert only; the prompt enumerated
  SELECT/INSERT/UPDATE).

- **Anti-copying is enforced in the read QUERY, NOT in RLS** (there is no clock in RLS). RLS only
  league-scopes reads; the read path returns the caller's OWN picks always + OTHER managers' picks ONLY
  for matches with `kickoffAt <= serverNow` (the `OR [{ managerId }, { match: { kickoffAt: { lte: now }
  } }]` WHERE clause). This is the deliberate split the prompt called out.

- **Realtime publication added now; client hook deferred to P41.** `pool_pick` is added to the
  `supabase_realtime` publication in the migration (the §RLS-publication trap: a table outside the
  publication silently delivers zero `postgres_changes`). The browser subscription
  (`realtime.setAuth(token)` before subscribe, gated on `INITIAL_SESSION`, re-subscribe on
  `TOKEN_REFRESHED`) is **Prompt 41**.

- **Migration self-test (Theme-F) — valid uuid literals + verified against a UUID-returning shim.**
  `20260610130000_pool_pick`'s embedded self-test proves cross-league read isolation + own-row write
  enforcement by evaluating each policy's exact predicate (faithful because every predicate filters
  `manager.user_id = auth.uid()`, so the owner-run result equals the role-run result). Verified on a
  throwaway Postgres pre-seeded with a **uuid-returning `auth.uid()`** (the bare-Postgres text shim
  masks the `sub::uuid` cast — the known false-green from the Prompt-13 thread); proven the cast is live
  (a non-uuid `sub` `22P02`s) and the predicate discriminates a filter-less (leaky) policy — closing
  **both** false-green traps (text-shim cast + owner-bypass). Applies clean with **zero drift**
  (`migrate diff` → empty).

- **Package layout: `@app/pool` is strictly pure.** `packages/pool` holds only the engine + error
  vocabulary (no `prismaStore` — unlike `@app/faab`/`@app/recompute`); the entire IO write/read path
  lives in `apps/web/src/pool/` (store port + memory double + Prisma adapter + the
  `handleSubmitPick`/`handleReadPicks` handlers) behind `/api/pool/pick`. Purity is grep-proven
  (`purity.test.ts`). Mirrors `standing.ts` discipline.
  This behavior is acceptable and is noted in the route's JSDoc.

### P42 — the `/pool` pick'em UI (picks + leaderboard; merged to main)

The user-facing surface on the P40 engine. **No Realtime** (deferred to P43 — reads on load/refetch,
form-driven CRUD through `POST /api/pool/pick` then `router.refresh()`). The P40 engine + RLS were
**not touched**; all UI decisions live in `apps/web/{app,src}/pool/`.

- **Leaderboard shows ALL league members.** The loader **left-joins league membership over the untouched
  `buildPoolLeaderboard`** (the pure engine still emits only managers who have picked); non-pickers are
  padded to **0/0/0** and the view is ranked **points desc → name → id** (the engine sorts by id; the
  screen re-sorts by name per the screen's contract). The engine stays pure — "show everyone" is a
  presentation concern, not a data one.
- **Knockout bracket = the fixed R32→Final skeleton, knockout phase ONLY.** In group/pre-kickoff phase
  the picks view is matchday lists only; once the tournament reaches knockout phase the full five-round
  frame renders. Empty rounds are present but fixture-less — **honest TBD, never a fabricated matchup**
  (the Guillotine "projected, not invented" principle).
- **The group↔knockout split + every result derivation key off `period.kind`** (NEVER `fifa_match.round`
  — the P40 trap holds in the UI too). `round` is read in exactly one place: feeding the reused P38
  `selectTournamentPhase`, whose own documented contract reads `round` for the tournament-level phase.
- **The reveal gate stays owned by the P40 store.** Own picks are always visible; others' picks only
  post-kickoff — enforced in `readVisiblePicks`'s query (the anti-copying gate that can't live in RLS,
  which has no clock). The UI renders exactly what that gated read returns and never bypasses it; the
  leaderboard's separate all-league read is safe because it aggregates only completed matches
  (completed ⊆ kicked-off ⊆ revealable — no individual unrevealed pick is exposed, only counts).
- **Nav entry deferred (parallel staging).** `/pool` shipped reachable by direct URL only; "pool" is not
  yet a `NavId` (adding it touches the shared `crossNav.ts` + `AppShell.tsx` glyph map). The layout
  passes a non-member `active` so nothing falsely highlights — a one-line cleanup once the nav entry lands.

### P43 — `/pool` live updates (clock-reveal + leaderboard poll; merged to main)

Makes `/pool` feel live with **NO `pool_pick` subscription** — both mechanisms are **on-read**, no
schema/migration, no stored score table, no `postgres_changes`. (The deferred P42 nav entry was wired
separately — `feat/pool-nav` → main, the P17 cross-nav pattern.)

- **No `pool_pick` subscription, by design.** The anti-copying gate is a **clock-based query**
  (`kickoffAt <= now` in `readVisiblePicks`) and **RLS has no clock**, so a raw `postgres_changes` frame
  would bypass that gate and **leak pre-kickoff predictions**. And the only pick state that ever changes
  — a pick *revealing* — coincides exactly with the pick *locking* (revealable ⇒ past-kickoff ⇒ locked),
  so there is **nothing live to stream**. Subscription = leak surface, no payoff.
- **Live feel via two on-read mechanisms.** (1) A **clock-reveal timer** scheduled to the soonest future
  kickoff among still-hidden matches; on fire it `router.refresh()`es the gated loader (the server
  re-applies the kickoff gate), so others' picks reveal the moment their match locks, then it re-derives
  the next instant. (2) A **visibility-gated leaderboard poll** (60s, Page Visibility API) that refetches
  the on-read loader while the Leaderboard tab is active *and* the document is visible (immediate on
  tab-activate + on return-to-visible; paused on the Picks tab / when hidden). The client clock only
  decides *when* to refetch; the server stays authoritative on *what* is revealed (drift shifts timing by
  seconds, not the revealed set).
- **Reveal-leak guard holds under the new refetch paths.** The client reads others' picks from nothing
  but the gated loader result (`fixture.others`); no raw pick payload from any source. The **dormant P40
  `supabase_realtime` publication entry is left in place** (out of scope to remove).

## Notifications — Web Push transport + preference model (Prompt 41a; 41b wires triggers)

- **Channel = Web Push over the PWA. NO new vendor.** Notifications ship as browser Web Push (a service
  worker + the push services FCM/Mozilla/Apple), signed with VAPID from the existing Render compute —
  it adds **no third vendor** to the two-vendor (Render + Supabase) stance. **Email is deferred** (and
  why: it needs a sending vendor + deliverability/unsubscribe handling — a separate decision; Web Push
  reuses the PWA we already ship and costs nothing).

- **41a / 41b split.** 41a lands the **transport + preference model + Settings UI** with the sender
  **inert** — `@app/notify`'s `dispatchToManager` is built + unit-tested but invoked by nothing (the
  same plumbing-first pattern as the faab/period-close crons). 41b wires the three triggers
  (draft-turn / player-not-starting / match-starting) to it in the worker. Nothing in 41a fires a
  notification except the manual `/api/notifications/test` probe.

- **Three additive tables + the idempotency ledger** (`20260610140000_notifications`):
  `push_subscription` (one row per device; `endpoint` UNIQUE), `notification_preference`
  (PK `manager_id`; three bools DEFAULT true; **lazily upserted-with-defaults on first read** — no
  provisioning step seeds it), and `notification_sent` (**UNIQUE(manager_id, kind, subject_id)**). The
  unique constraint on `notification_sent` is the **load-bearing idempotency guard** for 41b's polling
  triggers: a poller can re-fire "match starting" every minute and `claimLedger`
  (`createMany({skipDuplicates})` → `count === 1`) lets only the first claim send. `dispatchToManager`
  claims **after** confirming a subscription exists (so a no-device dispatch doesn't burn the only
  chance) but **before** sending (**at-most-once** — a transient send failure is not retried next poll;
  the chosen trade vs. spamming a lock screen).

- **Self-only RLS.** `push_subscription` (SELECT/INSERT/DELETE own) + `notification_preference`
  (SELECT/INSERT/UPDATE own) mirror the `pool_pick`/`faab_bid` `auth.uid()→manager` idiom but **self-
  only**, NOT league-scoped (a manager's subscriptions/prefs are private). `notification_sent` is **RLS
  ENABLED with ZERO policies = default-deny** for every JWT role — "service-role write only, no client
  read"; a history-read policy is an intentional `TODO(confirm)` seam. Every write also flows through a
  gated server route (Prisma owner, RLS-exempt), so RLS is defence-in-depth. Self-test verified against
  a **uuid-returning `auth.uid()`** on a throwaway Postgres (the cast-trap discipline from the pool /
  Prompt-13 threads), negative-control-proven, zero drift.

- **NO Realtime / NO publication (deliberate).** Push is **server→device** over the push services, not
  Supabase `postgres_changes`. None of the three tables is added to the `supabase_realtime` publication —
  this **sidesteps the RLS-broadcast trap entirely** (unlike `pool_pick`, which had to be published).
  Stated explicitly in the migration header.

- **Service worker = plain `apps/web/public/sw.js`** (served at `/sw.js`), manually registered by the
  Settings "Enable" button — **no `next-pwa` dependency**, no build step. It does exactly two things
  (show a push, focus/open on click) and deliberately **no fetch interception / no caching** (boring +
  reliable). The Prompt-18 manifest + metadata are untouched.

- **Package layout: `@app/notify` core is pure; IO on subpaths.** The `.` surface (payload builders,
  preference validator, `dispatchToManager`, the `NotifyStore` port, the memory double) is grep-proven
  IO-free (`purity.test.ts`); `sendPush` (web-push/VAPID) is `@app/notify/send` and the Prisma adapter
  is `@app/notify/prisma`. Mirrors `@app/faab`'s `./prisma` split. The browser enrolment lives in
  `apps/web/src/notifications/pushClient.ts` as the **injectable** `enableBrowserPush(env)` so the
  permission→register→subscribe→POST path is unit-testable in Node with fakes (the test runner has no
  DOM).

- **VAPID env on web + worker.** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (build-time inlined for the browser
  subscribe AND read server-side by `sendPush`'s `setVapidDetails`), `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`
  (server-only) — all `sync:false`, set in the Render dashboard from `npx web-push generate-vapid-keys`
  (**never committed**). The worker carries the same keypair for 41b but is inert until the triggers land.

- **Platform reality (live-deploy-only).** iOS delivers Web Push **only to an installed (Add-to-Home-
  Screen) PWA**; Android delivers in-browser **or** installed. The real OS permission prompt + actual
  device delivery are not in-session verifiable — flagged as go-live inferences.

### 41b — the three triggers wired (worker-side dispatch, sender now live)

- **Three worker-side triggers, each a PURE selector + an IO dispatch through `dispatchToManager`.** The
  selection logic (`apps/worker/src/notify/selectors.ts`) is grep-clean IO-free and unit-tested; the
  dispatch (`triggers.ts`) is the only notify layer that touches DB/web-push. **No new route/UI/schema/
  feed call**, and the pure cores (`@app/draft` controller, `@app/ingest` `lock.ts`) stay untouched.
  Idempotency is **not** re-implemented per trigger — the `notification_sent(manager, kind, subject_id)`
  UNIQUE ledger inside `dispatchToManager` collapses every re-fire to one send, so the pollers stay
  stateless and re-emit the same set each tick.

- **The three `subjectId` ledger keys** (the idempotency key):
  - `draft_turn` → **`${draftId}:${pickNo}`** — one alert per turn. **Piggybacks the existing 2s draft
    ticker** (a new injected `afterTick` hook on `startDraftTicker`, so `draft.ts` stays free of
    `@app/notify`). Catches a turn advanced by **either** a human pick (web route) or an autopick (worker
    tick) without touching the controller; the pickNo in the key makes the 2s re-fire a no-op until the
    turn advances. **No on-deck** notification (one per turn). Drops out when the draft completes.
  - `player_not_starting` → **`${matchId}:${playerId}`** — hooks the **pre-match `match_lineups` pull**
    (the same event that derives locks). `ingestLineups` now **returns the official-XI starter BDL ids**
    it already fetched (no second feed call); the worker compares them against the match's fantasy
    **is_starter** lineup slots and alerts the owner of any starter **not in the XI and still unlocked**
    (`locked_at` null). The high-value, time-sensitive one (swap window before the reserve's kickoff).
  - `match_starting` → **`${matchId}`** — on each **60s ingestion-scheduler tick**, alert managers who
    own ≥1 rostered player on **either** team of a fixture kicking off within the lead window.

- **match_starting confirm-points (defaults baked in, flagged `TODO(confirm)`):** lead = **15 min**
  (config knob **`NOTIFY_MATCH_LEAD_MIN`**); **owners-only**, "owns a player" = the **whole roster**
  (not just starters). The lead window (`[now, now+lead]`, kickoff-in-past excluded) + the ledger
  collapse the 60s re-fires to one alert per owner per fixture.

- **Worker-local trigger-read port (`apps/worker/src/notify/store.ts`), not `@app/ingest`.** The two
  reads 41b needs that the draft store doesn't cover (fantasy starters for a match's period; upcoming
  matches widened to owners on either team) live in the **worker IO layer** so `@app/ingest`'s lock
  derivation stays IO-free. Roster ownership is **global, not league-scoped** — leans on the schema's
  one-league-per-tournament assumption (a multi-league deploy would add a league filter; noted in the
  adapter). The draft-turn trigger needs **no** new read — it reuses `DraftStore.loadDraft` + the shared
  store the ticker drives, so the dispatch sees the post-autopick pointer.

- **Every trigger dispatch is isolated** (its own try/catch in the scheduler / `afterTick`) so a notify
  failure never starves the autopick loop or the ingestion/recompute work.

- **`@app/notify` added to the worker `package.json`** (the 41a note that the worker "already depends on
  @app/notify" was not yet true — only the VAPID env was wired). Device delivery remains a **live-only**
  inference (the test runner has no push service) — flagged to confirm on deploy.

## Player avatars (P46)

- **`player.country` column is never populated; country must come from the `fifa_team.name` join.** `ingestRosters` stores the national team via `team_id` FK but does not write the denormalized `player.country` text column. Any loader feeding a player card must use `team: { select: { name: true } }` in its Prisma select and map `country: p.team?.name ?? null` — the pattern established in `loadDraftRoom.toPlayer` (P34) and now mirrored in `loadLineup` (fix/avatar-flag-badge). This was the root cause of `.pa-flag` being invisible on the lineup surface: the lineup loader read the never-populated column, `FlagBadge` received `null`, and its early-return guard fired. Source-contract guards: `playerAvatarWiring.test.ts` "joins team name instead of reading player.country".

- **Player photos: generated avatars only — real photos explicitly deferred.** Neither the GOAT feed nor
  the `player` table carries an image URL; Sofascore exposes none and the scraper's player-matching is
  stubbed. `<PlayerAvatar>` renders deterministic initials + position-color disc + country flag badge with
  no network fetch, no new dependency, no schema column. Real photos are a deferred post-launch option;
  there is no clean image source today.

## Draft complete-state shows the full read-only board (P52)

- **After the draft, the full snake board is shown — not just the session manager's own squad.**
  `DraftRoomClient` now renders the existing `<Board>` + `<RosterPanel>` layout (board as the primary
  surface, squad in the rail) in the `complete` state. The design reference's squad-recap-only overlay is
  extended by deliberate product choice (managers want to review who everyone drafted).

- **Presentation-only — no loader or data-shape change.** `loadDraftRoom` already hydrates `state.picks`
  (all picks, all managers) and `state.managers` (all, slot-ordered) for every status. `buildBoard` is a
  pure function of those two fields; nothing new was fetched.

- **Read-only is free by construction.** `buildBoard` gates `isCurrent` on `state.status === "active"`,
  so no on-the-clock highlight ever renders in complete. The make-pick affordance (`<AvailableList>` /
  `<QueuePanel>`) lives exclusively in the `{live && …}` block and is never shown in complete.

- **Mobile uses the existing `show-board` CSS toggle.** The same `showBoardMobile` state and
  `.dr.show-board` CSS rule that drive the live board/rail toggle on mobile drive the complete
  "Board / Your squad" tab pair — no new CSS was added.