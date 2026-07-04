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
- **REMAP**: *dispossessed* (−1/3) → feed-native **possession lost**, recalibrated to **−1/10**
  (broader stat; `possession_lost` scales with touches/involvement, not only being tackled, so the
  rate was softened from −1/3 → −1/8 → −1/10 to keep it a minor nudge rather than a per-giveaway
  penalty — see the feat/scoring-promote-lines amendment below for the −1/8 → −1/10 step).

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

### ⚠️ AMENDMENT (feat/scoring-promote-lines — five new §4 lines + possession −1/8 → −1/10)

Five `FIFAPlayerMatchStats` fields that the capture-extra-stats prompt had parked in
`stat_player_match.extra` are **promoted to typed columns and given §4 scoring lines**, and the
possession-lost rate is softened one more step. *Decisive reason:* a read-only pull of completed
prior-tournament rows confirmed these fields are populated in the GOAT feed (they are not dead
columns), so the ladder can reward involvement it was previously discarding.

- **shots on target** — **+1 / 3**, all positions.
- **ball recoveries** — **+1 / 5**, **outfield only** (gated exactly like interceptions/tackles — a
  GK's recoveries are not rewarded, mirroring the existing defensive-bucket eligibility).
- **big chances created** — **+1 / 1**, all positions (a created clear-cut chance is rare and
  high-value, so it scores 1-for-1 rather than on a bucket).
- **accurate crosses** — **+1 / 4**, all positions.
- **touches** — **+1 / 25**, all positions (a gentle volume reward; 25-per-point keeps a busy 90′
  worth ~3–4 at most).
- **possession lost** recalibrated **−1/8 → −1/10** (continuation of the Theme-A REMAP rationale: it
  scales with touches/involvement, so the softer divisor keeps it a minor nudge).

**Aerials — considered and REJECTED.** `aerial_duels_won` is a strict subset of `duels_won` (already
scored in §4), so a separate aerial line would double-count. Verified read-only against the live API
(51-row completed-match sample, 13 rows with aerial data): **0 superset violations**, **non-negative
remainders**, **aerial never present without duels**. `aerial_duels_won` / `aerial_duels_lost` stay in
`extra`, **unscored**. This **resolves** the long-open "confirm whether `duels_won` includes aerials"
feed question.

**This is a scoring change** (unlike capture-extra-stats, which was pure data-capture): a feed
re-ingest of completed matches (to populate the new columns) **then** a full recompute + standings
restate are required. Mark stat rows `dirty` → the dirty sweep re-derives via the engine;
`job:recompute` (forced restate) alone is insufficient (it only re-sums stored breakdowns). The
participant gate is unchanged; no scoring path outside §1–§8 was added.

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

### ⚠️ AMENDMENT (Prompt 44 extended to @app/faab — FAAB roster caps lifted)
**The per-position cap is lifted at the FAAB layer too — the squad is shape-unconstrained up to the
15-man total on EVERY acquisition path, not just the draft.** Prompt 44 lifted the *draft* caps but left
`@app/faab` still enforcing the 2/5/5/3 per-position ceiling, so a shape legal to *draft* (or already
held) could be rejected when reinforced via a blind bid or a $0 free-agency grab. That asymmetry is
removed: `checkDropAndRoster` (submission + $0 FA grant) and the batch resolver's `claimLegality` now gate
ONLY on the **15-man total** (`SQUAD_SIZE`) — they no longer read `SQUAD_COMPOSITION`. A manager may now
roster e.g. a 4th forward (dropping a non-forward) or a 3rd keeper. **Still enforced, unchanged:** the
15-man total, valid-drop (owned, ≠ add, required-when-full), the active-ownership-unique claim, budget,
the waiver-order tiebreak, and the all-play-all math. **Lineup/formation legality is UNCHANGED** —
`@app/lineup`'s `validateLineup` keys on `FORMATION_BOUNDS` (exactly 1 GK, min 3 DEF / 2 MID / 1 FWD) and
never read `SQUAD_COMPOSITION`, so an over-stacked squad can still be locked out of a legal XI by choice.
No schema change, no migration; `SQUAD_COMPOSITION` stays in `@app/shared` as the canonical shape
reference (it sums to `SQUAD_SIZE`) but is no longer a FAAB ceiling. Commissioner-confirmed.

**This SUPERSEDES** the commissioner-override "ALWAYS enforces … roster cap … 2/5/5/3 + 15" line in the
`commish:roster`/`commish:lineup` section below: the always-enforced roster guard is the **15-man total**
(plus valid-drop + active-ownership-unique), NOT the per-position cap.

### ⚠️ AMENDMENT (Prompt 54 — formation is manager-selectable; the cap-lift consequence resolved)
The Prompt-44 cap-lift means a squad can now be **non-4-3-3-shaped** (e.g. 3 DEF / 7 MID / 4 FWD), so a
single hardcoded default formation can be **unfieldable** — it stranded MR. ZETTA at 10 starters ("got
10"). Resolution, **within the locked formation set + Theme-B bounds (no change to either)**:
- **Formation is manager-selectable** on the set-lineup screen, from the **OFFERED set = fillable ∩
  lock-legal**. *Fillable* = the squad owns ≥ the shape's count in every position (GK ≥ 1 + the three
  outfield lanes) — the roster-supply check `validateLineup` never made (it validates a *proposed XI*,
  not whether the roster can build one). *Lock-legal* = the shape doesn't force a played starter off the
  pitch (the live mirror of the design's `formationLegal`). Only offered shapes are surfaced, so every
  pick lands on a complete, immediately-savable XI.
- **Initial formation = persisted shape, else first fillable.** A saved lineup loads its OWN shape (never
  overridden). With none saved, the default is the **first fillable** formation — canonical **4-3-3** when
  the squad can field it (the design `modeConf` default; a 4-DEF squad is unchanged), else the first
  fillable in canonical order (a 3-DEF squad opens on **3-4-3**).
- **The standard formation set and the bounds (min 3 DEF / 2 MID / 1 FWD, exactly 1 GK) are UNCHANGED**
  — only their *surfacing/selection* is added. No commissioner override, no DB writes, no new write path:
  a pick `reshape`s the starter set through the **same `validateLineup` gate + `POST /api/lineup`**.

### Locking & substitution — lock-on-play (NO auto-subs)
- **A player locks the instant he plays ≥1 minute.** Until he plays he is freely swappable
  (subject to formation legality). This is stricter than "lock at kickoff" — a benched starter
  who plays 0 minutes stays swappable.
- **No auto-subs.** Manual swaps of not-yet-played players replace the old "sub fires if starter
  played 0 min" rule (supersedes brief req #3's *mechanism* — same intent, simpler).
- **Why it's sound (no hindsight) — DIRECTIONAL (revised by the forfeit amendment below):** you can
  never watch a player bank points and *then* slot him **in** — a played player is permanently frozen
  OUT of the XI (the IN direction). The old symmetric "the only players you can move are players who
  scored nothing / every swap is forward-looking" freeze is **superseded**: a played starter *can* now
  be moved **out**, but only as a one-way FORFEIT (forfeit amendment below) — never to claim hindsight.
- **Consequence:** a bench player who *has* played stays locked **on the bench** — he cannot be
  promoted after scoring (the retained IN-direction backstop). Coverage of a blanking starter depends
  on having an *unplayed*, position-legal reserve at that moment, not on best bench score. Rewards live
  management / late-sub streaming.
- **Acquisition deadline (waivers / free agents):** you cannot pick up a player once **his match
  kicks off**. Intentionally a touch stricter than the own-player rule — avoids adjudicating live
  appearance status for free agents and prevents grabbing an in-progress performer.
- **Period close = backstop:** an unplayed starter left in the XI at period end simply scores 0.
  No auto-anything.
- **Edge cases:** abandoned / postponed matches and warmup scratches → manual override
  (Cowork failsafe).

#### ⚠️ INVARIANT — never stamp `locked_at` before the lock instant (2026-06-11 MD1 incident)
> **Diagnosis later found INCOMPLETE** — the now-gate below fixes only the *temporal* boundary. The same
> defect refired on 2026-06-12 as a cross-match / non-participant leak the now-gate cannot catch; see
> **RECURRENCE — cross-match / non-participant leak** below for the corrected root cause + the status+team gate.
- **Write invariant:** `lineup_slot.locked_at` MUST stay NULL until a player's match actually locks
  him — a starter **at/after his match kickoff** (`now >= kickoff`), a sub **at his entry minute**.
  It is **never** stamped for a scheduled / not-yet-kicked-off match, and the stored instant is the
  *true* lock instant (kickoff or entry), never "≈ now". The lock latch is monotonic (only written
  when currently NULL), so a premature stamp is permanent until a manual SQL null — which is why the
  guard lives at the write boundary, not just upstream.
- **Read predicate:** a reader treats a player as locked **iff `locked_at != null && locked_at <= now`**.
  Presence alone (`locked_at != null`) is wrong — a future-dated stamp must read as *movable*.
- **Incident root cause (MD1, 2026-06-11):** ~35 MD1 `lineup_slot` rows carried `locked_at ≈ now`
  (19:13–20:32 UTC) while their `fifa_match` was still `scheduled` with kickoff days out (e.g. James
  Rodríguez locked 19:59, kickoff Jun 18). `kickoff_lock_fallback` was false → the stamps came from
  the main play-based lock path, not the fallback. Two defects, opposite ends of the same column:
  (1) the pure lock primitives (`packages/ingest/src/lock.ts`) stamped `kickoffAt` for any official-XI
  starter / sub with **no `now` gate** — they trusted the scheduler's mode-decision to only run them
  post-kickoff; (2) the read sites derived `locked` from presence alone.
- **Fix:** the lock primitives now take `now` and emit a lock **only once its instant has arrived**
  (starter `now >= kickoff`; sub `now >= entry`) — a self-guarding write boundary that holds even if
  an upstream gate mis-fires (corrupt kickoff import, early mode decision). The two read sites now use
  the shared pure `isLockedNow` (`@app/shared`). Existing bad rows were cleared by a one-off SQL that
  nulls `locked_at` for MD1 slots whose player's fixture (via `player.team_id` → `fifa_match`
  home/away) is still `kickoff_at > NOW()`, leaving already-kicked-off (Mexico–SA) locks intact.

#### ⚠️ BACKSTOP — appeared ⇒ locked (the opposite failure: UNDER-stamping; 2026-06-12 MD1 incident; merged `e888f66`)
- **Backstop invariant (alongside, never against, the never-stamp-early rule above):** a player who
  **demonstrably appeared** in a match MUST end up with `locked_at` stamped at his lock instant — the
  two transient write paths (the one-shot pre-match XI-pull, per-event live sub-locking) are **racy**
  and silently miss appearances the 60s poller never observed (a late/missed XI confirmation, a sub
  event between polls). The settle pass holds the appearance proof but, before this fix, wrote no lock.
- **Appearance = the SAME participant set scoring uses (do not re-derive).** A player counts as appeared
  iff he is in `score_player_match` — i.e. `playerAppearedInMatch` passed: **team-in-match AND** a
  non-stub signal (a non-stub stat line, OR named in a match event, OR took a shot). The all-null
  `markStatPlayerDirty` stub is correctly excluded — it never lands a `score_player_match` row, so it
  is never locked. (Practical note: the predicate is "non-stub stat line", not literally
  `minutes_played >= 1`; a hypothetical feed stat row with a literal `minutes_played: 0` and all other
  fields null would currently read as appeared. Source-from-input refinement deferred — it is a
  consistency nicety, not the cause; the output path converges.)
- **Write rule (unchanged + period-scoped):** `reconcileAppearanceLocks` stamps every appeared player at
  **kickoff** via `setLockedAt` (`updateMany … where locked_at IS NULL` — monotonic, so a sub already
  locked at his real entry instant is **never** overwritten; it only FILLS gaps). The fixture resolution
  is **period-scoped** (`fifa_match.period_id = period`): only the slot in the match's OWN period is
  touched, never the ambiguous `player.team_id → future fixture` join (one nation has ≥3 group fixtures
  per slot — that join would let a future match null/overwrite a completed-match lock). Same write
  boundary as above: **nothing** is emitted before kickoff.
- **Incident root cause (MD1, 2026-06-12):** genuinely-played players (e.g. Raúl Rangel, Mexico–SA, 90′,
  rating 7.3) were left `locked_at = NULL` because the only writers were the racy XI-pull + live-sub
  paths; settle held the proof and wrote nothing. **5 prod slots** were under-locked and **hand-backfilled**.
- **Why the backfill was still needed AFTER the merge (the deploy-timing lesson):** `e888f66` was
  committed **2026-06-12 06:28Z**. Both completed fixtures — Mexico–SA (kickoff 2026-06-11 19:00Z) and
  Korea–Czech (kickoff 2026-06-12 02:00Z) — **finished before that commit existed**. A merged-and-pushed
  fix only self-heals a completed match if the running Render worker redeploys to that build **while the
  match is still in its settle window** (`hasRating` false, `≤ kickoff + 12h`). Past that, the match has
  dropped from `decideMatchModes` entirely. **"On `origin/main`" ≠ "running on Render"** — verify the
  worker's deployed SHA, not just the merge.
- **Residual gap — closed by the recently-completed sweep (48h window):** `reconcileAppearanceLocks` ran
  **only** inside `ingestLive` / `ingestSettle`, i.e. only while a match is `in_progress` or `completed &&
  !hasRating && ≤ kickoff + 12h`. A fix or missed settle window landing *after* that window required manual
  SQL (the 2026-06-11 Rangel incident: 5 slots hand-backfilled). **Closed by `sweepCompletedMatchLocks`**
  (added on `feat/appearance-lock-sweep`): on the hourly schedule-sync cadence the sweep selects completed
  fixtures whose kickoff is within 48h of now and runs `lockInstantsFromAppearances → setLockedAt` for each.
  The monotonic `IS NULL` latch makes it a no-op for already-locked slots; the sweep only logs
  `lock.sweep.stamped` when it actually writes (the deploy-gap / outage alert signal).
#### ⚠️ RECURRENCE — cross-match / non-participant leak (the THIRD incident; 2026-06-12 evening; `fix/premature-locks-statusgate`)
- **What the earlier records got wrong.** The "Status (reconciled 2026-06-12)" note here previously declared
  the over-stamp direction *fixed* by the now-gate (`ee4c18b`) and **retired** the `fix/premature-locks-statusgate`
  branch as zero-delta (`ed7717a`). **Both were premature.** The defect refired the same evening during the
  Canada–Bosnia live window: **44 `lineup_slot` rows in MD1** were stamped `locked_at` for **non-participants**
  — pooled WC players (France/Portugal/Argentina/… e.g. Mbappé, James Rodríguez, Ronaldo) whose own MD-fixtures
  are days out (`scheduled`, kickoff Jun 13–18). The 2026-06-11 "`≈ now`" reading was an **incomplete diagnosis**:
  the stamps were always `kickoff + a-substitution-minute`, which merely *looks* like "≈ now" mid-match. The
  now-gate fixes the temporal boundary but **cannot** catch this — those instants are legitimately past for the
  live match. The defect is **IDENTITY/SCOPING (which slot), not timing.**
- **Root cause.** `feed.matchEvents({matchId})` relies on the GOAT server `match_id` filter, which is **not
  reliably honoured** — one live pull returned substitution events belonging to **other fixtures** (their
  `match_id` not in `fifa_match`, so `upsertEvent` no-op'd → no stored trace; that asymmetry is why
  `score_player_match` stayed clean while 44 locks appeared). `ingestLive` applied the **live match's**
  `ctx.kickoffAt` + period to every such sub's `player_in` and `setLockedAt(ctx.bdlId, …)` stamped the
  stranger's slot. Fan-out is **unique per league** (the active-ownership invariant): 44 slots = ~44 distinct
  rostered `player_in` across the foreign fixtures, **one slot each** (not multi-manager). `reconcileAppearanceLocks`
  and the XI-pull were **exonerated** — both stamp only at `kickoffAt`, and the appeared set had **zero** strangers.
- **The fix (this branch) — a single status+team-gated write boundary.**
  1. **One lock writer: `store.lockSlot(matchBdlId, playerBdlId, lockedAt, now, path)`** (replaces `setLockedAt`).
     Every writer — XI-pull, sub-event, reconcile, sweep — routes through it; a structural test
     (`lockBoundary.test.ts`) fails if any other code writes `lineup_slot.locked_at`.
  2. **The categorical gate `isLockWriteAuthorized` (pure):** a stamp is authorised **iff** the player's
     `team_id` is one side of the **source** match **AND** that match's `status ∈ {in_progress, completed}`
     **AND** the instant has arrived **AND** the match has a period. A *different* live match — or a
     `scheduled` one — can **never** authorise a stamp, which kills the entire class regardless of any future
     feed/mapping bug. (`MatchStatus` enum literals confirmed against the schema; "in-play-or-later" =
     `in_progress`/`completed`, never `scheduled`/`postponed`/`abandoned`.)
  3. **Outer defences:** `ingestLive`/`ingestSettle` drop any feed row whose own `match_id ≠ ctx.bdlId`
     (logged `ingest.{live,settle}.foreign_skipped`); the feed client re-filters every match-scoped response
     by `match_id` client-side (server filter not trusted).
  4. **Diagnosability:** `lockSlot` logs `lock.slot.stamped` (slot/player/source-match/path/instant) on every
     write and `lock.slot.refused` (with reason) on every gate refusal — the next incident is greppable in Render in minutes.
- **Trigger migration `20260612220000_lineup_lock_scheduled_unlock` — scheduled-only self-heal.** `enforce_lineup_lock()`
  froze `locked_at` once set (any change, incl. `→ NULL`, raised), so the cleanup could only run under a manual
  override. The trigger now permits **`locked_at → NULL` IFF the slot's lock-source fixture is still `scheduled`**
  (a premature stamp) — player/role/is_starter unchanged; a played (`in_progress`/`completed`) lock stays immutable.
  Verified on throwaway Postgres: scheduled-clear succeeds, completed-clear raises (embedded Theme-F self-test + live demo).
- **Cleanup-vs-trigger finding (settles fact 4 — "stamped both days").** The committed
  `ops/2026-06-11-clear-premature-md1-locks.sql` does a bare `UPDATE … SET locked_at = NULL` with **no
  `app.commish_override` GUC and no `DISABLE TRIGGER`** → as written the trigger **rejects every row**. Yet live
  data shows **zero surviving Jun-11 future-fixture locks** and James now carries a **Jun-12** stamp — only
  reachable if his Jun-11 stamp was first cleared to NULL (monotonic latch). Conclusion: **same-leak-twice (the
  Jun-11 stamps WERE cleared), not never-cleaned** — and the cleanup that actually ran used a **manual override
  not captured in the committed artifact**, which is therefore trigger-unsafe. Regenerated as
  **`ops/2026-06-12-clear-cross-match-locks.sql`** (GUC-wrapped, **all periods**, future-`scheduled` only),
  flagged **post-migration-only** (deploy order: migration → cleanup → live-window verify).
- **Corrupt-kickoff theory — RETIRED (verified, not hardened).** The planned "skip/flag a missing kickoff
  instead of coalescing to `now`" (old Layer 1) is **unnecessary**: `mapMatchRow` assigns `kickoffAtIso = f.datetime`
  verbatim and `upsertMatch` does `new Date(...)`, so a missing/garbage datetime yields `Invalid Date` and the
  Prisma write **fails loudly** (caught at `ingest.schedule.error`) — it is **never** coalesced to `now`. No
  `Date.now()`/`?? now` exists in the kickoff path; `fifa_match` had zero corrupt kickoffs at incident time.
- **New invariants (canonical):** (i) **exactly one lock writer — `lockSlot()`**; no direct `locked_at` writers.
  (ii) **a slot may be stamped only by its OWN period fixture, status-gated in-play-or-later, with team-membership
  (participant) proof.** The now-gate is **only** a temporal boundary — it is explicitly NOT an identity/scoping guard.

#### Amendment — in-matchday substitutions — STRUCK (superseded by the forfeit model below)
> The earlier paired-substitution model (one-out/one-in, bench-size cap of 4 group / 2 playoff, each
> bench player subbed at most once) is **superseded** and no longer in force. Decision A replaces it:
> benching a played starter is a **standalone one-way forfeit**, with **no paired-sub requirement and
> no per-bench sub cap** — the only constraint on the rest of the XI is formation legality. The pieces
> it shared that ARE retained are restated canonically in the forfeit amendment below (block promote-IN
> of a played player; forfeit realized through `is_starter`; no auto-subs; period-close-scores-0
> backstop; abandoned/postponed manual override).

#### Amendment — the FORFEIT model (decision A + one-way door) — the canonical demote-OUT mechanism (replaces the cancelled keeper-lock)
- **A played player is NOT hard-locked — his slot stays movable (OUT direction).** This overturns the
  old symmetric lock-on-play freeze. Movability is `period.frozen_at IS NULL AND voided_at IS NULL`;
  "has played" no longer blocks movement. (`locked_at` is retired from movability — see below.)
- **Benching a played starter is a FORFEIT: FINAL and one-way (decision A + one-way door).** Recorded
  by `lineup_slot.voided_at = now()` (+ `is_starter=false`). His earned points are forfeited for the
  period AND he can never return to the starting XI this period. The only constraint on the rest of the
  XI is formation legality — **no paired-sub requirement and no per-bench sub cap** (that model is
  struck, above).
- **`voided_at` is a one-way EDITABILITY latch — NEVER a scoring input.** Scoring reads only
  `is_starter` (`scoreManagerPeriod` sums starters); `voided_at` is consumed solely by the lineup
  read/movability and the mutation guard. A forfeited player's points drop out because his slot is
  benched (`is_starter=false`), not because anything in scoring reads `voided_at`.
- **"Has played" = a `score_player_match` row exists** for (player, his match in the period) — the
  single authoritative signal (post-Issue-3 participant gate), NOT `locked_at`. `pointsAtStake` = that
  row's `points`. **Timing nuance:** the row lands at the first recompute tick, slightly after kickoff
  — surfaced, not worked around.
- **Directional latch — IN direction RETAINED:** a played player can never be promoted INTO the XI
  (`played-player-started`); a voided slot can never start again (`voided-player-started`). `locked_at`
  is **retired from movability but NOT deleted** — the lock-on-play job still stamps it and the DB latch
  still reads it as the IN-direction hindsight backstop. **Retiring the worker stamping + the latch's
  `locked_at` arm is deferred to a post-tournament follow-up** (the live lock machinery is left intact
  deliberately); the read sites no longer gate movability on `isLockedNow(locked_at)`.
- **Dormant pre-C2 (no live destructive path):** the engine voids a played starter ONLY when the caller
  confirms the player by id (`SetLineupInput.forfeitConfirmedPlayerIds`). The C1 route passes **none**,
  so benching a played starter is rejected (`forfeit-requires-confirm`) and the current UI affordance is
  byte-unchanged. The destructive-confirm UI is **C2**.
- **C2 read contract + the `slotMeta.movable` caveat:** `loadLineup` exposes per-slot
  `{hasPlayed, pointsAtStake, voided, movable}` (C1 renders none of it). `movable` follows the pinned
  `frozen_at IS NULL AND voided_at IS NULL` formula, so a **played, un-voided BENCH player reads
  `movable: true` even though promoting him is blocked** (the IN-direction latch). C2 must pair
  `movable` with `hasPlayed`/`isStarter`; the server mutation is the real gate.
- **DB co-enforcement:** `enforce_lineup_lock()` (migration `20260612120000_lineup_forfeit_voided_at`)
  permits EXACTLY the forfeit transition on a locked row (is_starter true→false WITH voided_at NULL→set)
  and back-stops the one-way door (no un-void, no start-of-voided, born un-voided). Verified on a
  throwaway Postgres with a uuid-returning `auth.uid()` shim.
- **Standings:** a forfeit save enqueues a manager-period recompute (`recompute_dirty`) in the same
  transaction so standings restate. The rollup (`scoreManagerPeriod`) is UNCHANGED — it already sums
  starters only, so a voided (benched) player is excluded and the incoming starter counts.
- **Status (2026-06-12):** the C1 forfeit engine is **merged to `main`** (`b63f0a4` engine, `9811ff4` tests +
  recompute-mirror drift guard, `121f45f` docs) — earlier "merge HELD" wording is superseded.
- **C2 forfeit UI — SHIPPED (`9bee8d1`, merged to `main`, render-verified).** The demote-OUT UI is now live.
  Four UX decisions locked and verified:
  - **Q1 — played-starter token:** pts badge + "Forfeit" affordance; NO padlock (the played slot is movable,
    not hard-locked; the icon would be misleading).
  - **Q2 — confirm cancel = full undo:** Cancel in `ForfeitConfirmSheet` reverts the in-progress bench swap
    completely — the starter is restored to the XI, no partial state.
  - **Q3 — pre-flight eligibility block:** `fillEligibleIds` empty → forfeit affordance disabled at the token
    level; manager cannot initiate an uncompletable forfeit (Save gate still backstops).
  - **Q4 — voided render:** forfeited slot renders strikethrough text + muted "Forfeited" label; non-interactive
    (excluded from the drag surface).
  Three deferred minors: `fillEligibleIds` is not formation-aware (Save gate backstops shape errors);
  no in-place undo post-save (one-way door by design); ~1-tick post-kickoff window where `hasPlayed` reads
  false until the first recompute row lands (≤60s, surfaced not worked around).
  Open: legend-copy wording ("Forfeited" vs "Played") — deferred to a UX pass.
- **Forfeit-sub spurious-error fix — SHIPPED (`9935472`, merged to `main`, render-deployed).** A forfeit-sub
  save SUCCEEDS (POST `/api/lineup` → 200 `{ok:true}`, slot voided server-side) but the screen then
  re-painted a `forfeit-requires-confirm` error in the SaveBar reason span beside the "Lineup saved." toast.
  Root cause: on success the client cleared `pendingForfeits`, so the post-save re-validation
  (`evaluateProposal` → `validateLineup` rule 4c) ran against the **still-stale immutable SSR
  `period.locks`/`slotMeta`** — which model the just-benched man as an un-voided played STARTER and are never
  refetched after a save — and re-demanded a confirm. **Fix: do NOT clear `pendingForfeits` on success**
  (client-only; validator/contract/persistence byte-untouched). Keeping the confirm keeps the no-op re-save
  inert (the controller derives voids from its OWN authoritative slot state) and a full reload loads the slot
  as voided + benched, which never re-trips the rule. Covered by an RTL regression in `ForfeitConfirm.test.tsx`
  (drives the full forfeit→fill→save path, asserts success toast + NO `is-error` forfeit reason).
  - **Known residual (tracked follow-up — its own thread):** switching period **away and back** re-arms the
    same spurious error, because `onSelectPeriod` resets `pendingForfeits` while the SSR `slotMeta`/`locks`
    remain stale (the just-forfeited slot still reads as a played, un-voided starter). The full fix is
    **contract-adjacent** — it needs a post-save `slotMeta`/`locks` refetch (or lifting the period lineups
    into refetchable state) so re-validation runs against authoritative state rather than frozen SSR props —
    so it's deferred out of this client-only patch.

### "Set multiple lineups" — defined
Pre-set lineups for **multiple upcoming match windows/periods in advance**; within a period,
edit any not-yet-locked player. NOT multiple competing entries (that's best-ball / multi-entry —
doesn't fit a private H2H league).

### Playoff reduced roster (guillotine)

> ✅ IMPLEMENTED — see the **Group→playoff transition + playoff lineup mode** block below.

- **Hard roster cap ≈ 9 = 7 starters + 2 bench.** Cuts flow into the FAAB pool (fuels the
  reinforcement churn). Bench is positional-flexible.
- **Starting shape 1 GK + 6 outfield, any complete split with ≥1 per line:** min 1 DEF / 1 MID /
  1 FWD → the **10 shapes** 1-1-4 / 1-2-3 / 1-3-2 / 1-4-1 / 2-1-3 / 2-2-2 / 2-3-1 / 3-1-2 / 3-2-1 /
  4-1-1. **(Loosened on `feat/playoff-formation-loosen`; was min 2 DEF / 2 MID / 1 FWD = {2-2-2,
  3-2-1, 2-3-1}. The old 3-shape set is a strict subset of the new 10, so no saved playoff lineup is
  invalidated and no migration is needed.)**
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

### Data source  ✅ LOCKED (amended three times — lock-on-play + verification + scraper removal)
**Hybrid: BALLDONTLIE API (stats/events/schedule + rating — CANONICAL) + manual failsafe.** (The Sofascore scrape was REMOVED — see **Amendment 3** below.)
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

**⚠️ AMENDMENT 3 (2026-06-17, CODE_PROMPT_57 — Sofascore scraper REMOVED; BALLDONTLIE rating CANONICAL).**
- **Decision (Sergio, confirmed):** scratch the Sofascore scraper entirely. **BALLDONTLIE's native
  per-match `rating` becomes the canonical rating source of record.** The resolver priority collapses
  `[manual, scrape, balldontlie]` → **`[manual, balldontlie]`** (`@app/shared`
  `DEFAULT_RATING_SOURCE_PRIORITY`); a `manual` override still beats the feed rating.
- **Rationale:** the scrape arm was **structurally inert** (AUDIT Pass-2 **F-P2-03** — empty Sofascore
  index, placeholder `__SOFA_DATA__` selector, unwired `notWiredLauncher`), so every player-match
  already resolved to the BALLDONTLIE `rating`, which has performed well in live group-stage scoring.
  This **supersedes Amendment 2(a)** ("Sofascore PRIMARY/required"): there is no longer a primary scrape
  and a fallback — BALLDONTLIE is canonical.
- **Retired findings:** the four scraper findings are now moot/closed by deletion — **F-P2-03** (inert
  arm), **F-P2-04** (single placeholder selector, no fallback), **F-P2-05** (no rating range
  validation), **F-P2-06** (wrong-row permanence).
- **Code removed:** `apps/scraper` (`@app/scraper`) + `packages/scrape` (`@app/scrape`); the
  `wc-fantasy-scraper` Render service block (⚠️ **Sergio** deletes the deployed service on the Render
  dashboard — removing the IaC block does not delete the running service).
- **DEFERRED — schema drop (post-tournament).** No migration now (a live migration is riskier than a few
  dead columns). The `RatingSource` `'scrape'` enum value, `player.sofascore_player_id`, and
  `fifa_match.sofascore_match_id` stay as dead-but-harmless artifacts. NB: the
  `packages/db/src/parity.ts` compile-time guard requires `@app/shared` `RATING_SOURCES` to mirror the
  Prisma `RatingSource` enum, so the value cannot be dropped from one side only — drop all three together
  after the tournament.

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
  - **AMENDMENT (2026-06-19, commissioner).** A TIED matchday matchup is now **recorded as a Draw**,
    reversing the original "a tie is NEITHER a W nor an L" rule. Records read **W–L–D** where
    **W + L + D = opponents compared** that period. **Seeding is UNCHANGED** — still `all_play_all_W`
    desc → `total_points` desc → `managerId` asc; **draws are informational and never affect the
    seed.** This resolves the prior design-vs-backend conflict **in the design's favor**: the backend
    now matches `design/design_reference/standings/data.jsx`, which already models W/L/D with
    `games = W + L + D`. Infra: new `standing.all_play_all_d` column (ARCHITECTURE.md §4); the pure
    `computeStandings` sums per-period ties into `allPlayAllD` (the seed comparator is untouched).
  - **Matchday-ranking rule (2026-06-19, `feat/standings-tabs` — the dedicated `/standings` page).** The
    new Matchday tab ranks managers WITHIN one period by **that period's W desc → that period's points
    desc → `managerId` asc** — the locked all-play-all tiebreak, scoped to a single period (points-only
    would diverge from the season comparator). The per-period record is the locked `periodRecords`
    helper (tie = Draw), so a genuine matchday points-tie shows both managers a **Draw**, NOT a loss
    (`L` is never `N−1−W` — the bug class T9 caught). The Cumulative tab reuses `computeStandings`
    verbatim (no forked tiebreak); both tabs are computed from the SAME period point-maps in pure
    `buildStandingsView`, so they cannot disagree (and the cumulative tab is byte-identical to the
    persisted `standing`). See ARCHITECTURE.md §23.
  - **Joint-rank DISPLAY (2026-06-19, `feat/standings-tabs`).** Both tabs use standard competition
    ranking ("1224"): rows sharing the full `(W, points)` sort key share a **joint displayed `rank`**
    and the next distinct row's rank skips. The underlying deterministic **`seed` is UNCHANGED** (the
    `managerId` fallback still totally-orders the field for bracket/seeding purposes) — only the
    *displayed* rank joins true ties. The provisional playoff cut admits exactly `fieldSize` managers by
    deterministic seed POSITION (not by displayed rank), so a boundary tie never over-admits. This is a
    presentation decision only; the seeding logic from the amendment above is not touched.
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
  - **AMENDMENT (2026-06-20, commissioner) — playoff field size now LOCKED at 10** (was "deferred /
    likely 8 or 10"). The cut schedule is `cutScheduleFor(10)` = **{2,2,2,2,1}** — the field collapses
    **10→8→6→4→2→champion** over the 5 knockout rounds. Applied for real at the group→playoff
    transition via `--field 10`. This **10** is also the provisional cut line surfaced on `/standings`:
    `DEFAULT_PLAYOFF_FIELD_SIZE` in `packages/recompute/src/standingsView.ts` is now `10` (the loader
    still may pass an explicit `fieldSize`; absent that, 10 is used). The derivation rule and the
    `cutScheduleFor` machinery are unchanged — only the chosen number is now fixed.

> ✅ IMPLEMENTED — see the **Group→playoff transition + playoff lineup mode** block below.

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

**Field size now LOCKED (2026-06-20):** the playoff field is **10** — `cutScheduleFor(10)` =
{2,2,2,2,1}, applied at the transition via `--field 10` (see the AMENDMENT above). The final manager
number remains recruiting-dependent, but the field/cut schedule no longer waits on it. Nothing else
in Theme C remains open.

**Resolved this thread (formerly open):** draft order/timer/autopick (snake; timer config; queue→best-available),
the guillotine *elimination* tiebreak (lowest cumulative tournament total points; commissioner backstop),
deviation from one-cut-per-round (cuts now adapt to field size over 5 knockout rounds), and the
late-correction-after-period-close freeze policy (final at `result_freeze_hours`≈6 after last FT,
commissioner-only after). Only the recruiting-dependent manager/field number is deferred (config).

#### ⚠️ AMENDMENT (feat/period-status-lifecycle — the `period.status` lifecycle is now WIRED; freeze ≠ close)

The **`period.status` lifecycle** (`pending → open → closed`, `PERIOD_STATUSES` in @app/shared) was
specced but never advanced in code: provisioning seeded every period `pending`, and the period-close
cron only stamped `frozen_at` (the scoring freeze) — it never wrote `status`. So a matchday opened at
seed and **never closed**.

**Why it bit (the MD1 waiver-drop freeze, unblocked by hand 2026-06-17).** `findLockedSlotPlayerIds`
(@app/lineup) gates on `period.status !== "closed"`, so a wave whose status stayed `pending`/`open`
**kept every played player locked forever** → all waiver **drops froze the instant a matchday's matches
ended**. MD1 was unblocked manually (`MD1 → closed`, `MD2 → open` via SQL); this amendment wires it so
the freeze cannot recur.

**Decision — advance status automatically inside the existing hourly period-close cron.** A new PURE
`selectPeriodStatusTransitions` (@app/recompute, the IO-free sibling of `selectPeriodsToFreeze`) returns
`{ toClose, toOpen }`:

- **Close** a period once it has ≥1 fixture and **every** fixture is `completed` and it is **not** an
  anomaly (a `postponed`/`abandoned` fixture means it isn't cleanly over → leave it; it's already logged
  for the commissioner — reuses `selectAnomalyPeriods`).
- **Open** the EARLIEST period (canonical tournament order, @app/shared `comparePeriodLabels`) that is
  not in `existing-closed ∪ to-close`, and only if it is still `pending`. This maintains **exactly one
  open period**, self-heals a bootstrap with no open period, and opens nothing at tournament end.
- Applied as ONE guarded, idempotent `$transaction` — each `updateMany` matches the expected prior
  status, so the hourly re-run (or a concurrent run) is a clean no-op, never a clobber.

**Freeze ≠ status-close — two independent clocks (the load-bearing distinction).** `frozen_at` (the
late-correction freeze above) gates **commissioner-only restatement** and waits `result_freeze_hours`
(≈6 h) after the last FT. Status-`closed` keys **purely on "all fixtures completed"**, *never* on
`frozen_at` — a wave is over the moment its matches finish, regardless of the freeze window. They are
decoupled on purpose: dropping a played player after close is safe because his **locked** lineup slot
stays (scoring reads the slot); only **unlocked** slots release. Infra: ARCHITECTURE.md §22.

#### ⚠️ AMENDMENT (feat/tick-status-advance — P1a: dual-writer status-advance removes the status-open SPOF)

**Problem.** The status-advance above runs on ONE writer — the hourly `wc-fantasy-period-close` cron — so a cron stall is a single point of failure for the `pending → open` mount (the knockout FA-window). This is worse than a delay: if the cron is down across a tight knockout round's whole open→complete span, that round's `open` is **skipped permanently**. On recovery `selectPeriodStatusTransitions` sweeps the now-completed round straight into `toClose` (`pending → closed`; the close `updateMany` WHERE is `status != "closed"`), so `open` is never emitted and the round's FA window is lost. (The cron has already stalled once — the MD3 freeze miss, 2026-06-28.)

**Decision — add a SECOND writer on the resident worker tick (additive; the cron is UNCHANGED).** The resident 60s scheduler tick now re-runs the **same UNCHANGED pure `selectPeriodStatusTransitions`** over its own unfiltered periods+fixtures read and applies the result through the **same guarded `updateMany`** shape (`apps/worker/src/period/{store,prismaStore,memoryStore,dispatch}.ts`, wired LAST in `scheduler.ts`'s tick). Because each write WHERE-matches the expected prior status, cron + tick running near-simultaneously is a clean idempotent no-op for whichever writer loses the race — the `dispatchFaabBatches` `batch_cleared_at`-latch precedent. Steady state emits empty arrays and skips the transaction. The two writers are EQUIVALENT (same selector, same guard): the tick removes the cron's single-point-of-failure on status-open without changing any outcome.

**Out of scope / deliberate non-fixes.**
- **Freeze stays cron-only.** Freeze's plain `period.update` relies on the `frozenAt: null` *query filter*, not a WHERE-guard, so it is NOT safe to dual-write and is left on the cron. (A late freeze is self-healing anyway — it only widens the auto-restatement window; it never locks a wrong value.)
- **The anomaly path is NOT bypassed.** A stuck-`open` anomalous wave blocks the next wave's open INSIDE the pure selector regardless of caller (`periodStatus.ts:85-96` — `current` resolves to the still-`open` anomalous wave, which is `open` not `pending` → empty `toOpen`), so the second writer behaves identically. Anomaly detection is tracked separately (BACKLOG).
- **No DB heartbeat.** A persisted last-run/heartbeat column for cron-stall detection was REJECTED as migration-class and made unnecessary by this redundancy. Infra: ARCHITECTURE.md §22; BACKLOG → P1a (closed) + P2 (open-before-seed readiness guard, deferred).

#### ⚠️ AMENDMENT (feat/period-close-heartbeat — A-lite: cron-resilience DETECTION via external observational signals)

**Why detection is STILL needed after the P1a dual-writer (prevention ≠ visibility).** The dual-writer above is PREVENTION: it keeps `pending → open` self-healing on the resident tick so a stall no longer silently drops a knockout FA-window. It does NOT make a failure *visible*, and it leaves two residual gaps with no alarm:

- **P1a (cron stalled / crashed).** The tick covers status-open, but **freeze stays cron-only** (above), and a dead cron is an operational fact worth knowing regardless. Nothing today *tells* anyone the hourly cron stopped — it failed silently once already (the MD3 freeze miss, 2026-06-28). Liveness alerts on the ABSENCE of a ping.
- **P1b (a HEALTHY cron blocked by an anomaly).** A `postponed`/`abandoned` prior-round fixture makes the anomaly hold (caller-independent, in the pure selector) leave the next round `pending` — and the cron runs and reports `done` every hour while this is true. **Liveness CANNOT see this** (the ping fires, the monitor is happy, the FA window passes with no panel), so the attention signal is separate and non-negotiable; it alerts on the PRESENCE of an anomaly.

**Decision — two env-gated, fire-and-forget HTTP signals from `job:period-close` (`apps/worker/src/jobs/heartbeat.ts`).**

- **LIVENESS (dead-man's-switch).** A success ping after `job.periodClose.done` ("it ran") to `PERIOD_CLOSE_HEARTBEAT_URL`; the crash path pings `…/fail` (Healthchecks.io convention) so a crash alerts immediately rather than waiting out the grace window.
- **ATTENTION (anomaly).** When a run reports `anomalies > 0` (keyed on the SAME count the `done` log already carries) ping `PERIOD_CLOSE_ATTENTION_URL` with a tiny `{anomalies, leagueId}` payload → "go run the RUNBOOK knockout pre-flight." We report **every** run truthfully and do NOT dedupe persistent anomalies in code — dedup is the external monitor's job (keeps this boring). The trigger is "anomaly exists → a human looks," deliberately NOT a hand-rolled "is this the period blocking `toOpen`" predicate: coupling the alert to the subtle resolver logic is exactly the fragility we're insuring against.

**The load-bearing safety invariant — the signals are PURELY observational.** Each ping must NEVER affect the job's real work, result, logs-of-record, or exit code. `ping` swallows everything — a throw, a ~5 s `AbortController` timeout, a DNS failure, a non-2xx response — and never rethrows; the wrappers add a SECOND isolation layer (`safePing`) so even a hypothetical contract-violating throw can neither escape into the job path nor suppress a sibling signal. An UNSET URL is a silent no-op, so the job stays behaviorally **byte-identical** in local / test / pre-monitor environments. The success+attention pings sit AFTER the `done` log inside `main()`; the `/fail` ping sits AFTER the error log in the `.catch` and BEFORE the unchanged `exit(1)` — `job.periodClose.done` / `.error` and the 0/1 exit codes are byte-UNCHANGED.

**Why external ping, not a DB heartbeat.** A persisted last-run/heartbeat column stays REJECTED as migration-class (the P1a "No DB heartbeat" bullet above; BACKLOG → P2, left as-is). The external ping is the **no-migration form of the same detection**: the monitor (Healthchecks.io-style liveness + an attention webhook) is operator-configured and OUT-OF-REPO, so the repo carries only two `sync:false` env declarations on the cron block. The **worker tick is intentionally NOT instrumented** — its liveness is self-evident from its visible 60 s activity; only the silent hourly cron needs the dead-man's-switch. If a native Render "notify on cron failure" toggle covers liveness, leave `PERIOD_CLOSE_HEARTBEAT_URL` unset (code no-ops it); the attention half is content-based (anomaly count) and is covered by NO Render toggle, so it is needed regardless — one build serves both worlds via env gating. TDD: `apps/worker/src/jobs/heartbeat.test.ts` (the never-throw property is the load-bearing test). Operator setup: `docs/RUNBOOK.md` → "Knockout transitions — pre-flight". Infra: ARCHITECTURE.md §22; BACKLOG → A-lite. **MERGED `438ae91` (2026-06-29)** — inert until the env values + external monitor are configured, and it touches the cron's deploy surface (render.yaml → cron redeploys on merge).

### D. FAAB & Waivers  ✅ LOCKED (this thread)
Tiebreak principle (previously locked) **confirmed and sharpened**; budget, processing cadence,
free-agency rules, and the load-bearing **playoff reinforcement** mechanism now fully defined.
Guiding constraint honored: **boring and reliable** (this is the standard "blind FAAB → free
agency" pattern, compressed to a daily tournament cadence; no clever machinery).

#### Budget
- **$100 one-time FAAB allowance per manager for the ENTIRE tournament (group + playoffs).** Clean and
  legible (bids read as a %), ample resolution against a huge undrafted pool (≈1,000+ unowned players),
  enough for the handful of in-tournament churn moves the WC produces.
- **The budget is NEVER reset or replenished — group-stage spend carries straight into the playoffs.**
  Whatever a manager has left after the group stage is exactly what they take into the guillotine. The
  one-time allowance IS the strategic constraint: spending hard in groups means entering the playoffs
  short, and that trade-off is the point.
  **(CORRECTION — 2026-06-28; supersedes the prior design.)** The original spec reset every advancer to a
  fresh $100 at the group→playoff transition ("equalize the qualifiers / no carryover / a fresh $100 for
  the playoff run"), and the shipped transition implemented that reset — **both were WRONG.** On 2026-06-28
  the transition ran live and reset all 10 advancers to $100; the real budgets were hand-reverted via SQL
  (`faab_budget = 100 − Σ each manager's won-bid amounts`, scoped to alive `playoff_entry`). The reset step
  was then removed from the transition (`fix/faab-budget-no-reset`); a regression test guards against its
  re-introduction. See PROJECT.md → 2026-06-28 session log + ARCHITECTURE.md §20.
- **One $100 across the whole tournament — NOT per round, NOT a fresh playoff pot.** Rationing the same
  budget across the group stage AND up to five knockout rounds is a deliberate guillotine pressure.
  Self-balancing: each round frees a cut manager's ~9 players while the field shrinks each round (e.g.
  6→5→4→3→2, or 10→8→6→4→2 with 2-cuts — the illustrative sequence scales with the field size and cut
  schedule chosen in Theme C), so late reinforcement is cheap and a single $100 lasts; budget bites
  hardest early (R32→R16).

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
- **Unchanged:** the $100 one-time tournament budget is spent across the 3 group batches AND the
  knockout-round batches (carried forward, never reset); rolling waiver-order tiebreak + playoff
  carry-forward (no re-seed).
- **Knock-on (flag for the Theme-D implementation thread):** the worker scheduler (Prompt 05a)
  changes from daily FAAB cron → per-period batch trigger; FA-eligibility ("cleared ≥1 batch
  unclaimed") collapses to "unclaimed after the period's single batch."
- **Implemented (Prompt 47, `feat/faab-per-matchday`):** per-period trigger in the worker tick
  (`apps/worker/src/faab/`; `period.waiver_batch_at` default `first_kickoff − 6h` + a `batch_cleared_at`
  idempotency latch); acquisition cutoff → the period's first kickoff in `validateBidSubmission`; daily
  cron retired. `resolveFaabBatch` is byte-unchanged. See ARCHITECTURE §3 + PROJECT.md (Prompt 47).
- **Implemented (Prompt 48, `feat/faab-fa-grant`, stacked on 47):** the instant **$0 free-agency
  grant** is now built — `POST /api/faab/free-agent`, accepted only in the free-agency phase
  (`acquisitionWindowState`), $0 (budget unchanged, no waiver order). ~~**FA eligibility = the batch-clear
  snapshot, NOT live-unowned** (a player dropped during the window is held to the next batch); chosen
  mechanism = the history predicate `NOT EXISTS roster_player WHERE player=X AND (dropped_at IS NULL OR
  dropped_at >= batch_cleared_at)` (no snapshot table).~~ **SUPERSEDED Jun 18 2026 → live-unowned (see the
  amendment below).** First-come = the `roster_player_active_ownership_uq` partial unique (exactly one
  winner; loser → clean `fa-conflict`). The Prompt-47 "$0 FA surface is a TODO(confirm)" is now CLOSED.
  See ARCHITECTURE §3 + PROJECT.md (Prompt 48).
- **AMENDMENT — FA eligibility is LIVE-UNOWNED, not the batch-clear snapshot (commissioner decision Jun 18
  2026; `feat/faab-live-unowned-fa`).** A player is a free agent the **moment he holds no active roster
  spot** — including a player dropped by a winning waiver bid AND a player dropped mid-window. **The
  anti-snipe hold is REMOVED** (the `OR dropped_at >= batch_cleared_at` term that held a freshly-dropped
  player back to the next batch is deleted). The single predicate is now `EXISTS roster_player WHERE
  league=L AND player=X AND dropped_at IS NULL` (currently rostered ⇒ ineligible), factored into the pure
  IO-free `liveOwnedWhere` (`packages/faab/src/faEligibility.ts`) and shared by ALL THREE eligibility sites
  — the waivers pool (`listFaIneligiblePlayerIds`, `snapshotAt` param dropped), the per-player re-check
  (`getFaTargetFacts.faEligible`), and the grant tx re-check (`claimFreeAgent`) — so a player shown as a
  free agent is exactly one the $0 grant accepts. **Window machinery UNCHANGED:** the sealed→free-agency
  LATCH + the kickoff cutoff (`acquisitionWindowState`, `batch_cleared_at`, `claimFreeAgent`'s `T===null`
  guard, the commish `--period` pin) are a SEPARATE gate and are not touched. `/waivers` now offers the
  live-unowned pool in EVERY phase (the phase-split snapshot branch is retired). SCORING.md untouched.
- **AMENDMENT — eliminated-team players are GATED out of adds (commissioner flag; `feat/faab-exclude-eliminated`,
  Jun 28 2026).** This **reverses** the Theme-D "natural filtering — eliminated-team players sit in the pool,
  worthless" note (§ playoff reinforcement above): a player whose WC national team has been **eliminated** is
  **removed from the FAAB pool and cannot be ADDED**. **Sourcing is MANUAL** — the commissioner sets the
  additive `fifa_team.eliminated Boolean @default(false)` flag by **raw SQL**; there is **no worker /
  derivation / standings logic** that writes it (and the `@app/ingest` team upsert writes `name` only, so a
  boot/daily roster sync never resets it). **ADD-SIDE ONLY:** dropping an eliminated-team player stays
  allowed, and an already-fielded player keeps scoring (`release.ts` and `@app/lineup/validate.ts` are
  byte-untouched — their inputs carry no team field, so the gate is structurally unreachable from them).
  ONE **second, orthogonal** pure predicate `isAddTeamEliminated(teamEliminated: boolean | null)`
  (`packages/faab/src/faEligibility.ts`; a no-team player ⇒ `null` ⇒ eligible) is kept **separate** from the
  ownership `liveOwnedWhere` (roster-only) so neither rule absorbs the other, and is applied by the IO
  adapter at **all five add sites**: the pool list (`listFaIneligiblePlayerIds` unions in eliminated-team
  ids — removes even UNOWNED ones), the per-player re-check (`getFaTargetFacts` ANDs `!teamEliminated` into
  `faEligible`, so `validateFaGrant` rejects with the **existing `fa-not-eligible`** — no validator change),
  the **grant tx race belt** (`claimFreeAgent` throws `FaConflict` beside the live-unowned re-check), the
  sealed bid (`validateBidSubmission` returns the **new `add-team-eliminated`** code; the edit path
  re-validates the fixed add so it too rejects, **cancel runs no validator** so a bid can always be
  withdrawn), and the **batch resolver** (`resolveFaabBatch` **voids+refunds** an eliminated-team winner in
  its pre-loop with the **SAME terminal semantics as a kicked-off add** — no debit, no roster change, no
  waiver-order move; a bid placed while alive, then eliminated before the batch clears, can never grant).
  **D2 — commissioner override:** `claimFreeAgent` takes `allowEliminated` (default false); `commish:roster`
  passes `true`, bypassing the belt for a deliberate manual add exactly as it already neutralizes the window
  + live-unowned eligibility. Additive migration only (no backfill — the default back-fills existing rows).
  See ARCHITECTURE §3 "Eliminated-team add gate". SCORING.md untouched.
- **Fixed (`fix/faab-sealed-bid-latch-boundary`) — the sealed→free-agency boundary is the LATCH, not first
  kickoff.** Prompts 47/48 left bid submission gated ONLY on the period's first kickoff
  (`acquisitionCutoffAt`), so the sealed-bid phase did not actually END at batch-clear. **The MD1 strand
  incident:** two $0 sealed bids submitted during the free-agency window (after `batch_cleared_at` was
  stamped, before first kickoff) were accepted by `POST /api/faab/bid` and stranded permanently — the latch
  blocks any batch re-run, so they never resolved. Fix: `validateBidSubmission` now routes through the
  shared `acquisitionWindowState` and rejects a sealed bid once the add target's period has cleared its
  batch (`batch_cleared_at IS NOT NULL` ⇒ free-agency ⇒ new `bid-window-closed`, 409 — use the $0 FA grab
  instead), keeping `add-kicked-off` (now ≥ first kickoff) as the unchanged outer "locked" bound. The
  add-period `batch_cleared_at` is threaded through `PlayerFacts` (resolved via the SAME
  `resolveAddPeriodWindow` the FA grant uses) → `BidValidationContext` → both the submit AND edit handler
  paths; `WaiversClient` maps the code to a friendly message. **`window.ts`, `resolveFaabBatch`/`resolve.ts`,
  the §D purity matrix, and the worker cadence are byte-unchanged** (the fix REUSES the existing pure
  predicate). The decision: the acquisition-window boundary is driven by the actual latch
  (`period.batch_cleared_at`), never the scheduled batch time and never the first-kickoff cutoff. See
  ARCHITECTURE §3 + PROJECT.md.

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
  twelve, **remove the eliminated managers, preserve the surviving qualifiers' relative order.** The
  budget carries forward (never reset); the waiver order does **not** reset either. Simpler — and it **keeps FAAB fully
  decoupled from Theme C seeding**: the order is draft-seeded and self-maintaining, so it never
  needs standings, at MD1 or at the playoff transition.

#### Playoff reinforcement (load-bearing — the attrition mechanism)

> ✅ IMPLEMENTED — see the **Group→playoff transition + playoff lineup mode** block below.

No bespoke machine: **reinforcement is the same daily FAAB cycle, run on the playoff field** with
the carried-forward budget (the one-time allowance, never reset) + the carried-forward rolling waiver order (eliminated managers removed). Two attrition streams feed it — (a) each guillotined
manager's freed ~9-player roster, and (b) every survivor's own roster decaying as WC teams are
knocked out — which is exactly what *forces* reinforcement each round.
- **At the group→playoff transition:** lock final standings → the **top N advance** (N = the
  Theme C playoff field, likely 8 or 10) →
  release all non-advancers' rosters → advancers **trim 15 → ≈9 (7+2)** by the **trim deadline =
  first playoff pre-dawn batch** → budgets carry forward (never reset); the rolling waiver order carries forward
  (eliminated managers removed). All released players hit
  **waivers** for that first batch. (~~Players from WC teams already eliminated in the group stage
  are in the pool but worthless — natural filtering; managers trim them first.~~ **REVERSED Jun 28 2026
  → the eliminated-team ADD GATE:** a player whose WC team is eliminated is **removed from the FAAB pool
  and cannot be added** — see *AMENDMENT — eliminated-team players are GATED out of adds* in §D below.
  "Natural filtering" let an eliminated-team player be acquired and field a 0-point slot; the gate
  prevents the acquisition. DROPS stay allowed; an already-fielded player keeps scoring.)
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
- **Rating resolver:** `first non-null of [manual, balldontlie]` (config-driven); **BALLDONTLIE's
  native `rating` is the canonical rating source of record**, `manual` overrides it. (The Sofascore
  scraper was removed in CODE_PROMPT_57 — see Amendment 3.)
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
- **Data source** — Amendments 2–3 above: rating via resolver `[manual, balldontlie]` with
  **BALLDONTLIE's native `rating` CANONICAL** (the Sofascore scraper was removed — CODE_PROMPT_57), **polling** ingestion (no webhook receiver), tier
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

### Learning + fix (2026-06-20 — P0): `faab_bid_select_settled` was anon-readable across all leagues
The `faab_bid_select_settled` policy (created in `20260603223500_invariants`) was `TO public USING (status <> 'pending')` — **no identity predicate** — so the anon/publishable key could read **every settled FAAB bid across ALL leagues** through the Data API (confirmed live: an anon SELECT returned all settled rows). RLS is permissive, so this single policy OR'd the whole settled set open. Fixed in `20260620120000_fix_faab_settled_rls`: DROP + re-CREATE `TO authenticated USING (status <> 'pending' AND <league-member EXISTS>)`. Composed SELECT visibility is now: own pending → owner-only (`faab_bid_select_own_pending`, unchanged); settled → any **league member**; others' pending → hidden (anti-copying preserved); cross-league settled → hidden; anon → nothing. (`faab_bid` is **not** in `supabase_realtime`, so the Data API SELECT was the entire anon surface.)
- **Durable RLS rule (extends the Prompt-11 trap above):** scope settled-bid visibility via the **row's own `faab_bid.league_id`** matched against the **caller's OWN `manager` row** (`m.league_id = faab_bid.league_id AND m.user_id = auth.uid()::text`) — the `draft`/`standing`/`pool_pick` idiom. Do **NOT** join through the bid owner (`manager bid_owner ON bid_owner.id = faab_bid.manager_id`): `manager_select_own` hides every manager row except the caller's inside a policy subquery, so a bid-owner join collapses "league-wide" to **owner-only** whenever viewer ≠ owner (the same silent-failure class as the `score_manager_period` trap). Because `faab_bid` **carries `league_id`**, no `SECURITY DEFINER` helper is needed — that helper is only for tables (like `score_manager_period`) that lack `league_id`.
- **Migration is DDL-only** (DROP + CREATE POLICY, no embedded self-test) so `prisma migrate deploy` — which Render runs against the LIVE DB each release via `preDeployCommand` — performs **no data writes / no seed-rollback**. No portability shims (the chain already provides `authenticated` + `auth.uid()` before this migration; verified by a bare-Postgres full-chain apply). The role-switched composed-RLS proof lives in a **DB-gated integration suite** (`packages/faab/src/faabSettledRls.integration.test.ts`, gated on `FAAB_RLS_PG_TEST_URL`) — the in-migration owner role bypasses RLS and can't prove it (cf. the Prompt-13 text-shim false-green; moving the proof to a role-switched test against a uuid-returning `auth.uid()` is the correct home). Verified: anon = 0, league member sees league-wide settled + own pending only, cross-league = 0; the test goes red on the old policy (anon leaks all settled). **MERGED + DEPLOYED `8d0c036`.**

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

## Shared player-card `.pc-*` tokens (Prompt 53 — 2026-06-13 design batch reconciled ADDITIVELY)

- **The 2026-06-13 `ds/ds.css` export was reconciled ADDITIVELY, not adopted wholesale.** Diffed
  against canonical `apps/web/app/styles/ds.css` the export diverged both ways (+50 / −30). Only the
  **net-new shared player-card block (`.pc-*`)** was adopted; the export's deletions were **rejected as
  omissions** (see below). No existing selector or token VALUE changed — this is a pure addition, no re-skin.
- **`.pc-*` promoted to the design system.** The block is the shared player-sheet vocabulary: the
  segmented **Points | Stats** tab strip (`.pc-seg`, `.pc-seg-btn`), the Stats body (`.pc-stats`,
  `.pc-tiles`/`.pc-tile*`, `.pc-log*`/`.pc-lrow*`, `.pc-statline`, `.pc-stat*`, `.pc-foot`), and the
  standalone sheet chrome (`.pc-scrim`, `.pc-sheet`, `.pc-x`, `.pc-head*`, `.pc-ovr*`). It is intended to
  be reused inside **every** player sheet (vf-psheet, sl-scoremodal) and the standalone Free Agents /
  Waivers sheets. It **references EXISTING tokens only** (`--surface-*`, `--hairline*`, `--win`, `--loss`,
  `--text-*`, `--font-display/-sans`, `--r-*`, `--fs-*`, `--fw-*`, `--e1/-3`, `--overlay`, `--dur-fast`) —
  each was confirmed present in canonical; the block defines **no new CSS custom property**.
- **Appended byte-for-byte to the canonical + all four per-route copies** (`draft`/`lineup`/`vsfield`/
  `_landing`), after the P40 backstop. All five stay byte-identical (`appShell.test.ts` enforces this).
- **Export's drops REJECTED as omissions (no design intent, no replacement, live dependencies):**
  `--kit-outline` (dark + light — vsfield kit rendering, `vsFieldSkin.test.ts`), the **P46 PlayerAvatar +
  `.flag-emoji`** block (`.player-avatar.pos-*`, `.pa-flag*`, `.flag-emoji*` — app-wide; `flagWiring.test.ts`
  + `playerAvatarWiring.test.ts`), and the **P40 backstop** `html, body { max-width:100%; overflow-x:hidden }`.
  Nothing in the new screens replaces them, so the omissions read as export drift, not intent.
- **New wiring guard:** `apps/web/src/shell/playerCardTokens.test.ts` (mirrors `flagWiring.test.ts`) asserts
  the canonical contains the `.pc-*` classes (incl. `.pc-seg`/`.pc-sheet`/`.pc-tiles`) AND that the three
  rejected-omission blocks survive — so a future wholesale re-export can't silently drop either side.
- **CSS-discipline exception (no rendered surface change).** `.pc-*` are dormant until a screen consumes
  them, so green gates + byte-identity + the new wiring test are sufficient clearance; live-Render visual
  proof transfers to the first screen that renders `.pc-*`. **Branch `feat/ds-player-card-tokens`, off
  main, isolated worktree; merge HELD.**

## Mobile nav + overflow containment (Prompt 40)

- **Mobile nav IA — bottom tab bar (phones < 640 px):**
  Primary tabs left→right: **Dashboard** (`/`) · **Set lineup** (`/lineup`) · **Vs the field**
  (`/vsfield`) · **Pool** (`/pool`) · **More**. "Dashboard" is the hub `/` relabeled — same route,
  signals the league-overview intent. More sheet order: **Scoring** · **Waivers** · **Draft room** ·
  **Settings** · identity line · POST sign-out. Desktop/tablet (≥ 640 px) keeps the top strip
  unchanged. Both navs rendered in the DOM, swapped by a pure CSS 640 px media query — no `matchMedia`,
  no JS viewport branching, no hydration fork (§18 vsfield precedent; 640 px is intentionally distinct
  from vsfield's 760 px layout swap). `MoreSheet.tsx` (`"use client"`) is the only stateful island
  (open/close + `scrollIntoView` side-effect); the 4 primary tabs are plain server-rendered `<a>` links.

- **No-element-exceeds-viewport-width rule + `ds.css` backstop:** no element may expand
  `document.documentElement.scrollWidth` past `clientWidth`. Enforced at two layers:
  (1) **real fix** — `.sh-topnav-scroll { overflow-x:auto; min-width:0; flex:1 }` + `min-width:0` on
  `.sh-app` and `.sh-topbar` so the scroll container can shrink below the 8 nav items' intrinsic width;
  (2) **document backstop** (safety net) — `html, body { max-width:100%; overflow-x:hidden }` in the
  canonical `ds.css` (global + all byte-identical per-route copies). These two layers together close
  the bug where the top strip's intrinsic width set the document scroll width, causing the whole page
  to slide sideways when a nav tab was scrolled into view.

- **"Vs the field" is the phase-aware surface that becomes the Guillotine bracket** in knockout/playoff
  phases. There is **no separate bracket destination in the nav.** The bottom bar stays
  Dashboard · Set lineup · Vs the field · Pool · More with no reshuffling across phases. Do not add a
  bracket tab; do not phase-gate the nav.

- **640 px breakpoint is intentionally distinct from vsfield's 760 px.** The 640 px threshold swaps the
  shell chrome (top strip ↔ bottom bar). The 760 px threshold is internal to the vsfield screen's
  desktop/phone cockpit layout. They must not be unified.

- **`viewport-fit=cover` (required for safe-area on iOS):** `env(safe-area-inset-bottom)` reads 0 on
  iOS unless `viewport-fit=cover` is set. The viewport export in `app/layout.tsx` now sets
  `viewportFit: 'cover'`. Real-device testing of the iOS home-indicator clearance is gated on deploy
  (Chromium cannot render the home indicator).

## Per-page mobile fit (Prompt 41) — `/lineup` pitch + `/pool` leaderboard

- **Page content must FIT the viewport — the global clip backstop is not a layout.** Prompt 40's
  `html, body { overflow-x:hidden }` backstop *clips* nested overflow; it does **not** reflow it. So a
  page whose content is *built* wider than the phone (a fixed-width pitch column, an auto-layout table)
  is cut off at the edge, not contained. Each page is responsible for fitting its own content; the
  backstop only stops the whole document sliding. Two pages were closed under this rule:
  - **`/lineup` pitch scales to width.** The mobile body grid track was bare `1fr` (= `minmax(auto,1fr)`);
    `auto` resolves to the column's **min-content**, which the 5-wide MID lane made wider than a phone, so
    the pitch column never shrank and was clipped. Fix: **`minmax(0, 1fr)`** + `min-width:0` on
    `.sl-pitchcol`/`.sl-rail` (the 0 floor lets the column shrink to the viewport), plus a `≤480`/`≤360`
    block scaling the screen gutter, pitch padding, lane gap, and **token width (78→62→52 px)** so the full
    XI shows in formation and stays tappable. `flex-wrap` on `.sl-lane` remains the narrow-width safety net.
  - **`/pool` wide table truncates.** The default `.dtable` is auto-layout, so a long team name / an
    email-address fallback in MANAGER forced the table ~670 px wide. Fix (`≤480`): **`table-layout:fixed`
    + `width:100%`**; `#`/PLAYED/CORRECT/POINTS hold narrow fixed widths; **MANAGER takes the remainder and
    truncates with an ellipsis** (prefer fit-with-ellipsis to horizontal-scrolling a leaderboard). The
    ellipsis lives on the cell's **block child** (`td:nth-child(2) > *`) so the truncating box fills the
    fixed cell — an inline child still reports full geometry past the viewport even when paint-clipped.
- **Gate refinement — assert ELEMENT BOUNDS, not document `scrollWidth`.** The Prompt-40 check
  (`documentElement.scrollWidth <= clientWidth`) passes even when content overflows inside a nested
  container, because the backstop satisfies it by clipping. Prompt 41's proof
  (`apps/web/scripts/verify-page-fit.mjs`) instead asserts **every element's `getBoundingClientRect()`
  has `left >= -1` and `right <= clientWidth + 1`** at 320/375/390/414 — `getBoundingClientRect` reports
  true geometry even under `overflow:hidden`, so it catches the clipped/nested overflow the document
  check misses. Faithful `.sl-*`/`.pl-*` DOM + real CSS, no Next server (same isolation model as
  `verify-mobile-nav.mjs`).
- **Fixes live in per-route CSS (`lineup.css` / `pool.css`), never `ds.css`** — preserves the `ds.css`
  byte-identity invariant across its global + per-route copies.

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
  concern); the **playoff waiver carry-forward** belongs to the group→playoff transition prompt
  (budgets carry forward — never reset; this engine only READS current budget/order). `faab_bid` **RLS is already present** (Theme F invariants
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

- **Tournament phase derived from `fifa_match.status` + the linked `period.kind`/`period.label`; NO
  migration.** `kickoffAt` and the `period` relation both pre-existed on `fifa_match`. No `ALTER TABLE`
  required. ⚠️ **Corrected by Prompt 44 (dedicated section below):** the original P38 cut claimed
  "`round` null = group-stage game, non-null = knockout round label". That is **FALSE against the live
  feed** — `@app/ingest`'s `mapMatchRow` writes `round = round_name ?? String(round_number)`, so group
  games carry the **matchday number ("1"/"2"/"3", NON-NULL)** in `round`, and a `round !== null` test
  mis-classifies every group matchday as knockout. The group↔knockout discriminator is `period.kind`
  (the same correction already recorded under Pool, below).
- **`selectTournamentPhase(matches[])` is IO-free and takes only `{status, periodKind, periodLabel}`.**
  `kickoffAt` is **excluded** from the selector's input — it carries no structural information about
  tournament phase. `kickoffAt` is used only in the `loadDashboard` loader, solely to populate the
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

## Dashboard/Pool tournament-phase discriminator = `period.kind` (Prompt 44)

- **`selectTournamentPhase` now keys group↔knockout on `period.kind`, NEVER `fifa_match.round`.** The
  P38 selector decided the split on `round` (`round === null → group`, `round !== null → knockout`).
  Verified against the live DB this is wrong: the BALLDONTLIE feed populates `round` with the
  **matchday number** for group games (MD1 rows carry `round = "1"`, `in_progress`/`completed`), so a
  group matchday fired the knockout branch and the dashboard rendered the **playoff interim during the
  group stage**; Pool, which reuses the same selector, raised its knockout-bracket skeleton early too.
- **The fix severs both surfaces from `fifa_match.round` entirely.** `TournamentMatchSummary` is now
  `{ status, periodKind, periodLabel }`; the Final is detected by **`period.label === "Final"`** (the
  canonical provisioning-stored label), not a `round` string. `loadDashboard` and `loadPool` both join
  `fifa_match.periodId → period.kind`/`period.label` and feed the mapped shape; neither loader reads
  `fifa_match.round` any more (`round` dropped from `loadDashboard`'s select and Pool's `MATCH_SELECT`).
  `loadDashboard`'s earliest-group-kickoff filter also moved from `round === null` to
  `period.kind === "group_md"`.
- **Same `period.kind`-is-the-discriminator learning already locked under Pool (Prompt 40).**
  `selectTournamentPhase` was the one holdout that still trusted `round`; Prompt 44 closes it.
  `periodKind === null` (period not yet linked) advances no phase — a kicked-off-but-unseeded match
  stays `pre-kickoff` rather than being guessed. No migration; pure-selector + two thin loaders + tests.

## Dashboard playoff + complete phases (`feat/dashboard-playoff-phases`)

- **The two `// STOP(P38)` interim arms are filled, sourced READ-ONLY from `PlayoffsView`** (the exact
  pattern P38 used for the group phase's `loadVsField` attach). `DashboardData` gains
  `playoffs: PlayoffsView | null`; `loadDashboard` calls `loadPlayoffs` READ-ONLY in the knockout window.
  Read/presentation only — `buildPlayoffsView` / `loadPlayoffs` / `PlayoffsView` / `resolveRoundCut` are
  **byte-untouched**; no `league.status` write; no new Realtime/RLS/publication; no second live controller
  (the live experience stays in the `/playoffs` theater the dashboard links into).

- **`PlayoffsView.complete` is the authoritative playoff↔complete render discriminator, NOT
  `selectTournamentPhase`'s own Final-FT `complete`.** Note P44 already gave `selectTournamentPhase` a
  `complete` member (Final `status === "completed"`), and `buildPlayoffsView` *independently* derives
  `complete` (every round cut + a `champion` `playoff_entry` exists). These two signals can briefly
  disagree around the Final whistle (the match flips to `completed` before/after the worker writes the
  champion row). The pure `resolveKnockoutPhase(tournamentPhase, playoffs?.complete ?? null)` resolves it
  by trusting `PlayoffsView.complete`: `(complete, false) → playoff` (Final FT'd, champion not yet
  written → never show an empty champion arm), `(playoff, true) → complete`. The `league.status → complete`
  routing remains an **OPEN** decision owned by the worker/state-machine thread; the dashboard reads the
  derivation only (same posture as the theater).

- **Module subset discipline (consume `PlayoffsView`, invent nothing).** Playoff arm = `SurvivalModule`
  (guillotine bracket = survival + current-round summary combined, as the design's `BracketModule`) +
  `ReinforceModule` (FAAB reinforcement reminder → `/waivers`). Complete arm = `ChampionModule` (champion +
  runner-up podium) + `MyFinishModule` (the viewer's knockout finish). The design's
  `lock`/`fixtures`/`activity` (playoff) and `standings`/`activity` (complete) are **dropped** — not
  PlayoffsView-derivable, the same subset call P38 made for the group arm. CSS reuses the pre-stubbed
  `.db-bracket`/`.db-podium`; only `.db-reinforce` + `.db-myrecap` (+ the `.db-br-me`/`.db-br-foot`
  survival extras) are new. Pure derivations live in `src/dashboard/playoffModules.ts` (16 unit tests).

- **GAP — CLOSED (`feat/playoffs-season-stats`): the complete-arm SEASON-stats recap.** The design's
  complete screen shows each finisher's **total title points** and the viewer's **season power record /
  total points / best week**. These are now first-class on `PlayoffsView.seasonStats` (`Record<managerId,
  {totalTitlePoints, powerW, powerL, bestWeek}>`), derived **purely** in `buildPlayoffsView` from inputs it
  already receives — the sanctioned read-model pass, NOT a loader attachment (chosen because every input is
  already threaded into the pure builder: `cumulativeTotals` → `totalTitlePoints`; the group all-play-all
  `seeds[].gW/gL` → `powerW/powerL`; `groupPeriods` ∪ `roundScores` → `bestWeek` via the pure
  `bestWeekByManager`). **Definitions (locked):** *power record* = the group-stage all-play-all W-L (the
  regular-season "power record" = `computeStandings(groupPeriods)`), NOT extended over the guillotine rounds,
  so it reads identically to the group dashboard's "season W-L"; *best week* = the max single-period total
  across ALL periods (the only `period.kind`s are group_md + knockout_round, so the two inputs cover every
  period); *total title points* = Σ all-period `score_manager_period.points`. The recap consumes them:
  `ChampionModule` shows total title points per podium row (`.db-pod-pts`, the role pill dropped),
  `MyFinishModule` renders the design's 4-cell `.db-myrecap` (finish · power record · total pts · best week),
  and the complete-arm `PrimaryBanner` surfaces them in its sub-line + secondary; the `TODO(confirm)`s are
  removed. **Scope:** READ-side only — the WRITE engine (`selectGuillotineCuts`/`resolveRoundCut`/
  `advanceStore`/transition) and the cut/classification logic are byte-untouched (the view's *output* grew);
  `loadPlayoffs` stays byte-untouched (it spreads `...core`); the theater consumes the additive field
  unchanged. No new write, no scoring-rule change (aggregations of existing scores), no migration.

## FAAB/waiver phase derives from `playoff_entry` existence, never `league.status` (P2 — `fix/league-status-phase-contract`)

- **The FAAB/waiver READ path keys its phase (roster cap 15→9, D4 participation, the R32 forfeit/trim
  hint) on `playoff_entry` row EXISTENCE — a data-existence signal — NOT the `league.status` field.** Two
  read sites violated the contract the dashboard/playoffs loaders honor: `loadWaivers.ts`
  (`const leagueStatus = league?.status; isPlayoffPhase = leagueStatus === "playoff"`) and the
  `@app/faab/prisma` `loadReleaseContext` (`status = manager.league.status; isPlayoffPhase = status === "playoff"`).
  Both now read `loadPlayoffPhaseActive(db, leagueId)` = `playoffEntry.count({ where: { leagueId } }) > 0`.
  This is the **atomic twin** of `league.status === "playoff"`: the group→playoff transition writes the
  status flip **and** the `alive` playoff_entry rows in ONE `applyTransition` `$transaction`
  (`apps/worker/src/commish/transitionStore.ts`), so the two signals never diverge in any reachable phase
  — the fix is behavior-identical on the live path, it just reads past a field that can lag the data.

- **`selectTournamentPhase` is DELIBERATELY NOT the signal here.** The dashboard's data-existence phase
  helper (above) is *kickoff-based*: it returns `group` until a knockout match kicks off and `complete`
  once the Final is FT'd. Substituting it on the FAAB path would REGRESS twice: (a) in the **R32
  pre-kickoff trim window** (post-transition, before any knockout kicks off) it returns `group`, which
  would re-open the cap to 15 and re-admit eliminated managers during the exact window the trim must hold
  9; (b) after the Final it returns `complete`, which (since `league.status` stays `playoff` — there is no
  `playoff→complete` writer, see Theme C) would likewise re-open the cap. `playoff_entry` existence is the
  only equivalence-preserving signal. (Gated PG test pins this: alive entries + `league.status='group'` ⇒
  cap 9 — `release.integration.test.ts` / `loadWaivers.integration.test.ts`.)

- **Two data-existence phase signals now legitimately coexist** — they answer different questions:
  the dashboard **display phase** (`selectTournamentPhase`, kickoff-based: what screen to render) and the
  FAAB **roster-cap phase** (`loadPlayoffPhaseActive`, entry-existence: is the guillotine regime in force).
  They agree in every phase except the R32 trim window and post-Final, where the FAAB regime must lead the
  display — hence two helpers, not one.

- **P3 (`fix/league-status-enforcement-cap`, merge HELD) closes the migration — `league.status` is fully
  removed from the `@app/faab` enforcement path.** The bid/grant/batch ENFORCEMENT path now keys BOTH its cap
  AND the playoff-participant signal on `loadPlayoffPhaseActive` (the `playoff_entry`-existence predicate) via
  `rosterCapForPlayoffPhase`, exactly like the READ sites: `loadManagerBidContext` / `loadManagerFaContext` /
  `loadBatchContext` each compute `playoffPhaseActive` ONCE and feed the cap + the participant gate, and
  `listOverCapPlayoffSurvivors` gates on it too. Provable no-op on reachable spend behavior (status⟺entry-
  existence; the divergent `complete` arm — where the old status form would re-widen the cap to 15 — is
  unreachable today, so it is robustness, not a behavior change). `rosterCapForLeagueStatus` is **DELETED**
  from `@app/shared`. **No `switch`/`never` guard was added:** a repo-wide census found NO exhaustive `switch`
  over `LeagueStatus` anywhere (the deleted helper was a ternary; every remaining `league.status` site is an
  `===`/`!==` equality), so a guard would be ceremony, not safety — the corrected final shape from the P3
  plan. The cap read stays a plain pre-commit read — it never enters the `commitBatch` / `claimFreeAgent`
  `$transaction`, so it adds no lock to the live spend path. **Survivor (by design, NOT a P3 gap):** the
  worker batch CADENCE selector `apps/worker/src/faab/prismaStore.ts:23`
  (`league: { status: { in: ["group", "playoff"] } }`) still reads `league.status` — it answers a DIFFERENT
  question (which leagues are active enough to run a batch for), a separate axis from the roster cap.
  NB: `"group"` IS load-bearing — the transition's entry gate is `updateMany WHERE status="group"` (set
  out-of-band) — so it is not dead; `"complete"` is never written.
  TDD red→green: `enforcementCap.contract.test.ts` (source-shape) + gated-PG `enforcementCap.integration.test.ts`
  (its own `FAAB_CAP_PG_TEST_URL` var — disagreement / champion / group-baseline / spend-e2e for all four loads).

- **Source-only: no schema, migration, RLS, or DB write.** The only new read is `playoffEntry.count` on
  the existing table/column. `packages/scoring` + `packages/recompute` are untouched and unread by this
  path (FAAB/waiver loaders carry no scoring-engine dependency); no scoring or standings behavior change.

- **The "eliminated manager" set is the SAME contract in set form — the `status="eliminated"` VALUE alone is
  the wrong signal (`fix/eliminated-predicate-data-existence`, Jun 30 2026, merge HELD).** The `/vsfield`
  live-field hide (§27) and the `/waivers` budgets-rail strike originally read
  `playoff_entry.findMany({ status: "eliminated" })` as "who is out." That MISSES group-phase
  **non-advancers**, who hold **no `playoff_entry` row at all** (`status` NULL) — only guillotined-during-
  playoffs managers ever carry `status="eliminated"`. The corrected predicate is the set-form negation of
  `loadIsPlayoffParticipant`: **eliminated iff `loadPlayoffPhaseActive` AND not in the `alive` set** —
  catching no-row non-advancers AND `"eliminated"` guillotines, leaving only `alive` survivors. Both surfaces
  call ONE shared helper, `loadEliminatedManagerIds(db, leagueId)` in `@app/faab/prisma`, so they cannot
  drift. It is **phase-gated to empty** pre-transition (zero survivor rows would otherwise blank the whole
  live field — the field-blanking guard). **Champion is DISPLAY-alive-equivalent:** the survivor set is
  `status IN ('alive','champion')`, so the tournament winner is NOT struck (`/waivers`) or hidden
  (`/vsfield`) — `champion` is the terminal form of "survived." This is DISPLAY-ONLY and deliberately does
  NOT touch `loadIsPlayoffParticipant` or the FAAB **enforcement**/roster-cap predicates, which stay strictly
  `status === "alive"` (a SEPARATE axis — enforcement is moot post-tournament). Counting champion in also
  CLOSES a sub-60s transient: between the manual `commish:advance --round Final --apply` (crowns the champion)
  and the ~60s tick that closes the Final period, `isLivePeriod` is still true; a strict `alive`-only set
  would have had zero survivors and blanked the whole live field. See ARCHITECTURE.md §27 (Champion =
  alive-equivalent for display).

## Quiniela (`/pool`) knockout bracket gates on `playoff_entry` existence, not `selectTournamentPhase` — the same R32 pre-kickoff blind spot as CONTRACT-P2/P3 (2026-06-28 — `worktree-pool-playoff-bracket-gate`, merge HELD)

- **The /pool (Quiniela) Picks tab now renders the knockout bracket gated on `playoffActive` —
  `playoff_entry` row EXISTENCE — NOT the kickoff-derived `selectTournamentPhase`.** This was a LIVE bug,
  mid-tournament: `league.status='playoff'`, 10 `playoff_entry` rows, all five knockout periods seeded with
  `cut_count`, every R32–Final `fifa_match` linked to its `knockout_round` period — yet the Picks tab still
  showed group matchday lists, so managers could not pick the R32 games. **Root cause:**
  `selectPoolPicksView`'s bracket-vs-lists branch keyed on the phase from `selectTournamentPhase`, which by
  design returns `group` (NOT `playoff`) while every knockout match is still `scheduled` — it flips to
  `playoff` only once a knockout match is `in_progress`/`completed`. With the first KO that night, all R32
  were `scheduled`, so the bracket never rendered. This is the **identical blind spot** the FAAB read path
  (P2) and enforcement path (P3) dodge by keying on `playoff_entry` existence (the P2/P3 block immediately
  above).

- **Shape: thread an explicit `playoffActive: boolean` into the pure `selectPoolPicksView`; derive it in
  `loadPool`.** `loadPool` adds ONE league-scoped read — `loadPlayoffPhaseActive(prisma, leagueId)` =
  `playoffEntry.count({ where: { leagueId } }) > 0`, reused VERBATIM from `@app/faab/prisma` (the SAME
  helper the waivers loader already imports into apps/web — no new dependency, no `@app/faab` internals
  dragged in) — into its existing `Promise.all`, and passes the boolean as the new 4th arg of
  `selectPoolPicksView(fixtures, phase, now, playoffActive)`. The web layer does NOT read `league.status`
  (a worker concern). `selectTournamentPhase` STAYS in the loader (it still frames the page / sets
  `PoolView.phase`), so the existing source-contract that pins it is unchanged — it just no longer gates
  the bracket.

- **The new gate is a strict SUPERSET of the old one — no prior render regresses.** Old:
  `phase === "playoff" || phase === "complete"`. New: `playoffActive || phase === "complete"`. In every
  reachable state a knockout match `in_progress`/`completed` (⇒ `phase === "playoff"`) implies
  `playoff_entry` rows exist (the transition seeds the status flip + the `alive` rows in ONE `$transaction`)
  ⇒ `playoffActive`, so the new gate fires everywhere the old one did, PLUS the R32 pre-kickoff window — the
  fix. `phase === "complete"` is a **defensive carry-over**: `playoffActive` persists through completion
  (entries are never deleted) so it already covers a finished tournament, but the explicit OR keeps the
  settled bracket airtight on pathological data — the same robustness posture P3 took toward the unreachable
  `complete` arm.

- **View-SELECTION only — nothing else moves.** Per-fixture result/scoring derivation stays keyed on
  `period.kind` (group 1X2 vs knockout 2-way advancer); the `readVisiblePicks` reveal gate, the `group_md`
  Completed archive, the leaderboard, the `@app/pool` engine, and `selectTournamentPhase`'s own dashboard
  "what screen to render" semantics are all byte-untouched. The two phase signals legitimately coexist for a
  THIRD surface now — the display phase (`selectTournamentPhase`, kickoff-based) and the data-existence phase
  (`loadPlayoffPhaseActive`, entry-existence) — exactly as the P2/P3 block frames it. No schema / migration /
  RLS / Realtime / scoring change (`packages/scoring` + `packages/recompute` unread by this path). **TDD
  red→green:** `poolView.test.ts` gains the gate case (`playoffActive` + `scheduled` knockout fixtures ⇒
  populated R32→Final frame; `playoffActive=false` ⇒ matchday lists, regression-pinned) and
  `poolContracts.test.ts` pins the loader's new read + the 4th-arg thread + a comment-stripped
  `league.status` negative guard. Full DoD gate green (typecheck/lint/format/test = 2657 passed | 48
  skipped/web build). **Review-class** (phase gate on a live surface) → **merge HELD** for Chat clearance.
  See PROJECT.md (2026-06-28 Quiniela bracket entry) + ARCHITECTURE.md → §3 pool bracket-visibility gate.

## Quiniela (`/pool`) knockout Picks — vertical round layout + TBD/non-pickable undecided matches + group phase hidden in playoff (2026-06-28 — `worktree-feat+pool-knockout-vertical-tbd`, merge HELD)

- **Vertical, round-sequential layout replaces the horizontal bracket grid.** The Picks-tab knockout
  bracket was a horizontal `.pl-bracket` flex-row of fixed-width `.pl-bcol` columns (overflow-x scroll) —
  unusable on a phone. It is now a stack of labeled `.pl-round` sections top-to-bottom (R32 → R16 → QF →
  SF → Final), each reusing the matchday section styling (`.pl-md-head` + the responsive `.pl-md-list`
  grid) so it reads like the group lists and collapses to one column at 320–414px. Headers render friendly
  titles (`R32`→"Round of 32", `QF`→"Quarter-finals", …; `roundTitle` map in `PoolClient`, falls back to
  the raw label). The engine's per-round fixture set/order (`KNOCKOUT_ROUND_ORDER`, kickoff-sorted within a
  round) is byte-unchanged — this is layout only.

- **A knockout match is pickable ONLY when BOTH sides are resolved real teams; otherwise it is TBD with NO
  pick buttons.** The live feed seeds undecided bracket slots as placeholder teams named
  `Team {balldontlie_team_id}` (e.g. "Team 273"…"Team 304") with REAL `fifa_match` rows and pick buttons —
  so a manager could "pick" a match between two unknown teams. **Detection is by team NAME, anchored
  `/^Team \d+$/` (trimmed), NOT country/flag.** Confirmed against the live DB: `fifa_team.country` AND
  `fifa_team.abbreviation` are NULL for ALL 112 teams (64 placeholder-named, 48 real), so neither can
  discriminate. The pure predicates live in `poolView.ts` — `isPlaceholderTeamName(name)`,
  `isTeamResolved(team): team is PoolTeam` (type guard), `isKnockoutFixturePickable({home, away})` — keyed
  on the team name already carried on each fixture and unit-tested directly. `TeamLabel` renders "TBD" for a
  null OR placeholder side (the raw `Team {id}` name never reaches the DOM); `FixtureCard` renders the pick
  control only when `pickable` (a "Teams to be decided" note + dashed `.is-undecided` frame otherwise). The
  predicate is correct whether the feed later re-points the fixture to a real team UUID or renames the row
  in place. Live state at write time: R32 = 16 resolved/pickable matches (first kickoff 2026-06-28);
  R16/QF/SF/Final = all placeholders → TBD.

- **The Picks tab hides the group phase once `playoffActive` — at the RENDER layer, NOT by stripping the
  pure view.** `PoolView` gained `playoffActive: boolean` (set by `loadPool` from `playoff_entry`
  existence); `PoolClient` computes `showGroup = !view.playoffActive` and renders the group matchday lists,
  the Completed archive, and the `unscheduled` section only when `showGroup` (so the playoff Picks tab shows
  ONLY the bracket — incl. dropping the unlinked 3rd-place match without sourcing/linking it). `hasAnyFixture`
  was widened to `bracket.length > 0 || (showGroup && (matchdays || unscheduled))` so the always-present
  5-round bracket skeleton counts as content (no empty banner beside an all-TBD bracket). The
  `playoffActive=false` path is byte-for-byte unchanged (regression-pin).
  **WHY render-layer, not a selector strip (the landmine the adversarial review caught):** an earlier draft
  had `selectPoolPicksView` return `{ matchdays: [], bracket, unscheduled: [], completed: [] }` when
  `playoffActive`. But `view.picks` is ALSO the sole input to the leaderboard drill-in modal
  (`selectManagerPicks → allFixtures(view.picks)`, which deliberately includes `completed` so a manager's
  settled group picks stay reachable). Stripping the buckets in the selector silently emptied that modal for
  the whole knockout phase — clicking a manager showed only their knockout picks while the leaderboard row
  still totaled their full group history. Fix = keep the pure selector phase-agnostic (full buckets always),
  hide at the render layer. Pinned by a `managerPicks.test.ts` seam test that feeds real
  `selectPoolPicksView(playoffActive=true)` output into `selectManagerPicks` (RED on the old selector strip).

- **OUT OF SCOPE (recorded, not built):** the 3rd-place match ("Match for 3rd place", `period_id` null) is
  a separate follow-up — not sourced, linked, or rendered here. A **server-side guard rejecting a pick on
  an undecided match is a RECOMMENDED FOLLOW-UP** (fairness: a crafted `POST /api/pool/pick` can still
  store a pick before teams are known) — this thread is view-selection + layout only. `@app/pool` engine /
  `derivePoolResult` / `readVisiblePicks` reveal gate / `selectTournamentPhase` / per-fixture `period.kind`
  result derivation are byte-untouched; no schema / migration / RLS / Realtime change; `packages/scoring` +
  `packages/recompute` unread.

- **TDD red→green:** `poolView.test.ts` adds scope-2 predicate cases (placeholder/real names; both-resolved
  pickable; either-placeholder/null → not pickable) + scope-3 cases pinning that the pure selector PRESERVES
  all buckets in playoff (data integrity for the modal) + the `playoffActive=false` regression-pin.
  `managerPicks.test.ts` adds the loader→selector→modal SEAM test (full group/Completed history reachable in
  playoff — RED against the rejected selector-strip). New `PoolBracket.test.tsx` (jsdom RTL, mounts the real
  `PoolClient`) pins the stacked vertical sections in order, a resolved R32 match's HOME/AWAY buttons, a
  placeholder R16 match rendering TBD with NO buttons, and NO group sections rendering in playoff even though
  the group data is present in `view.picks`. `poolContracts.test.ts` stays green. Adversarial multi-agent
  review caught the selector-strip P1 (above); fix + seam test landed before hold. Full DoD gate green
  (typecheck/lint/format/test = **2670 passed** | 48 skipped / web build). **Review-class** (live competitive
  pickability gate) → **merge HELD** for Chat clearance; live-deploy `/pool` screenshot owed.
  See PROJECT.md (2026-06-28 Quiniela knockout layout entry) + ARCHITECTURE.md → §3 pool Picks-tab layout.

## UI roster-cap gates must read the ENGINE cap, never a hardcoded squad-size constant (2026-06-28 — `feat/faab-fa-cap-parity`, merge HELD — the live R32 FA 409 incident)

- **The bug.** In live WC2026 R32, every playoff manager got **409 on `POST /api/faab/free-agent`**. The
  group→playoff transition trims the ownership cap to **9** (`rosterCapForPlayoffPhase`, keyed on
  `playoff_entry` existence — see the CONTRACT-P2/P3 entries) and the grant ENGINE enforces it, but the
  `/waivers` `FreeAgentPanel` computed `squadFull = roster.length >= SQUAD_SIZE` with the **hardcoded
  group constant `SQUAD_SIZE = 15`**. A 9-man playoff squad read `9 >= 15 = false` ⇒ not full ⇒ the drop
  selector never rendered ⇒ the grant POSTed `dropId: null` ⇒ the engine correctly returned
  `drop-required`. The engine was right; the **UI lied about "full"** against the wrong cap.

- **The decision/rule.** A UI roster-legality gate (squad-full, drop-required, add-enable) MUST key on the
  **same phase cap the engine enforces**, threaded from the server loader — never a re-derived or hardcoded
  squad-size. The loader already resolves the truth (`WaiversView.rosterCap` via
  `rosterCapForPlayoffPhase`/`loadPlayoffPhaseActive`, the SINGLE cap source per CONTRACT-P3); the fix
  threads that one value into **both** `FreeAgentPanel` and `BidComposer` and keys `squadFull` on it. No new
  `9`/`15` literal is introduced anywhere. `BidComposer`'s drop field also became conditional on the
  threaded cap — it previously ALWAYS demanded a drop (the mirror over-constraint: a below-cap playoff squad
  was needlessly forced into a 1-for-1), and `BidPayload.dropId` widened to `string | null` (the bid route
  already accepts a null `playerDropId`; the engine already requires a drop only at `squadSize >= rosterCap`
  — `checkDropAndRoster`). Group squads are always exactly full ⇒ **group behaviour byte-identical**.

- **Scope discipline.** TOTAL-cap gate ONLY. Position-minimum (DEF/MID/FWD) roster-legality is a SEPARATE,
  still-open playoff-composition decision and was left untouched. The FAAB engine is **byte-unchanged**
  (verified `git diff --stat`: `resolve.ts`, `validate.ts`, `faEligibility.ts`,
  `packages/shared/src/constants.ts` all absent) — this is a UI/loader-parity fix, not an engine change.

- **The lesson (extends the P48/P54 rule).** "A route test ≠ a working user path" — the bug existed because
  the UI acquisition path was **never tested against the playoff cap** (the engine + route had unit coverage;
  the screen's full-squad gate did not). The fix is anchored by a playoff-phase RTL test that mounts the real
  `WaiversClient` at cap 9 and proves the drop selector renders + a 1-for-1 grant SUCCEEDS, plus
  component-level cap-9-vs-15 gating unit tests. **When an engine value is phase-dependent, every UI gate
  that mirrors it must be tested in EACH phase, not just the default (group) one.**

- **Recommended commissioner unblock (while held).** A single manager's add+drop can be applied directly via
  `commish:roster --apply` (dry-run by default) from local `apps/worker` — the operator fallback recorded in
  the thread. **Merge HELD** for Chat clearance (the diff + the playoff-phase RTL test). See PROJECT.md
  (2026-06-28 FA cap-parity entry), BACKLOG → FAAB-FA-P2 (the orthogonal FA-panel-won't-surface-for-later-KO-
  rounds loader finding), and the CONTRACT-P2/P3 cap-source decisions.

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
- **Nav wired (`feat/pool-nav`, P17 cross-nav pattern).** "pool" is now a real `NavId` — added to the
  shared `crossNav.ts` (union + `NAV_ITEMS`) + the `AppShell.tsx` glyph map, with the Pool entry **placed
  after Waivers** (the gameplay cluster, ahead of the `/scoring` reference + `/settings` config). The
  layout's deferral cast is dropped (`active="pool"`), so the tab highlights on `/pool`.
- **The exhaustive `Record<NavId, ReactNode>` glyph map makes nav wiring tsc-atomic.** Because `AppShell`'s
  `NavIcon` keys its glyph map by `NavId` exhaustively, adding a member to the `NavId` union **forces** a
  matching glyph or `tsc --noEmit` fails — a missing glyph is a typecheck error, not a silent runtime gap.
  So the union edit and the glyph edit can't drift apart; the type system enforces the wiring. (The
  presentational tests are belt-and-suspenders: the suite has no JSX transform, so they assert the glyph
  source contract; compile correctness is delegated to `tsc` + `next build`.)

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

## Quiniela polish (Prompt 45) — pool display rename, ET schedule, Completed archive

- **"Pool" → "Quiniela" is a DISPLAY-COPY rename only.** Four user-read strings changed (desktop nav
  label, mobile bottom-bar label, Picks `tablist` `aria-label`, page `metadata.title`); the route
  `/pool`, the `NavId` value `"pool"` (only its label changed), `pl-*`/`pool.css`, `@app/pool`,
  `/api/pool/pick`, and `pool_pick` keep their names — renaming any would break links/PWA/nav/RLS for
  zero gain. The mobile bottom-bar label was renamed alongside the desktop one (not literally named in
  the prompt) because it is equally user-read; a split would have been inconsistent.
- **Kickoff times render in Eastern via `America/New_York`, labelled "ET" — NOT a hardcoded "EST"/offset.**
  The tournament is Jun–Jul 2026 = EDT (UTC−4); a literal "EST"/−5 would be an hour wrong all event. The
  IANA zone auto-resolves EDT now / EST in winter; "ET" sidesteps the EDT-vs-EST label confusion. The
  `Intl.DateTimeFormat` keeps an **explicit fixed `timeZone`** (not the machine's local zone) — that is
  what guarantees identical SSR + client output, the property the formatter was built for, which survives
  the zone swap.
- **A completed match older than a day sinks to a Completed bucket — kickoff-based proxy, group stage
  only.** `fifa_match` has no completion timestamp, so "completed for more than a day" is approximated as
  `status === "completed" && now − kickoffAt ≥ 24h` (`ARCHIVE_AFTER_MS`, one named constant). Matches end
  ~2h after kickoff, so this keeps a game visible until ~22h after FT (slightly conservative). Scoped to
  `group_md` matchday lists (the only surface that grows a scroll-tail as the tournament advances); the
  knockout bracket is a fixed frame and `unscheduled` is a defensive bucket — both left alone. Emptied
  matchdays are dropped (no bare MD header). The bucket sorts kickoff-desc and renders as a collapsed
  native `<details>` (no client JS). The archive `now` is the **same server instant** `loadPool` feeds
  the reveal read, so a match can't be 'revealed but un-archived' from a split clock.

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

### 2026-07-01 — Web Push status: COMPLETE in code (41a + 41b), pending operator VAPID keys (PUSH-KEYS)

Correcting two planning-time mis-framings (neither was ever committed to these docs): Web Push is **not**
"non-functional for want of keys," and it is **not** an unbuilt IO shell needing a 5-part epic. Hash-anchored
against `origin/main`: the transport, the three tables, the four routes, `sw.js` + the browser enrolment
(`f054ded`, 41a) and all three worker triggers (`2ffb3a8`, 41b) are merged and unit-tested — the 41a/41b
bullets above are the design of record. Send-dedup is the `notification_sent(manager_id, kind, subject_id)`
UNIQUE ledger claimed inside `dispatchToManager` (at-most-once). **Sole remainder = PUSH-KEYS** (operator /
dashboard, no code): set the three `sync:false` VAPID vars (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`) on `wc-fantasy-web` + `wc-fantasy-worker` and rebuild web; until then
`sendPush` is unkeyed (dormant), not broken. This **supersedes** any reading of the 41a "inert" / "inert
until the triggers land" bullets as the current end-state. See BACKLOG → Web Push notifications + PROJECT.md
→ 2026-07-01.

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

## Prompt 53 — Per-player opponent label on the lineup screen

- **One match row, two outputs.** `loadLineup` already reads each period's `fifa_match` rows for kickoff
  resolution. To avoid a second query, the same `findMany` is extended with `homeTeam/awayTeam name`
  selects. Both `kickoffByPlayer` and `opponentByPlayer` are computed in JS over the same in-memory
  `periodMatches` array — the DB hit stays single.

- **Earliest-kickoff tie-break mirrors `kickoffByTeam`.** `resolveOpponentByPlayer` uses the identical
  earliest-kickoff selection logic as `kickoffByTeam` so that in the (theoretical) edge case of a team
  playing twice in one period, both functions point to the same match row. Kickoff and opponent can never
  diverge.

- **vs/@ venue prefix.** `player.teamId === homeTeamId` → `isHome = true` → prefix "vs" (we are hosting);
  `=== awayTeamId` → `isHome = false` → prefix "@" (we are away). Standard football display convention.

- **Opponent flag reuses the sole `<Flag>`/`toIso2` surface.** `opponentNation` is set to
  `fifa_team.name` — the same value `player.country` is populated from on the roster side — so `toIso2`
  resolves it identically. No new flag-resolution code, no new background-image kit chips.

- **Null → "TBD" (no flag), matching the kickoff treatment.** A null `OpponentInfo` (no fixture, or
  either side TBD in a knockout bracket) renders as the text "TBD" with no flag, visually consistent
  with the kickoff's own "TBD" fallback. The `<OpponentTag>` is only mounted when `kickoffAt` is
  non-null, so a player with no fixture at all shows only one "TBD" line (from `<KickoffTag>`) rather
  than two.

## Prompt 54 — Period-select fix: opensAt-NULL sort + per-screen isCurrent latch (waivers + vsfield)

- **Root cause: `period.opensAt` is never populated by the provisioning CLI.** The period queries in
  both `loadWaivers` and `loadVsField` used `ORDER BY opens_at ASC, label ASC`. With `opens_at` null
  for every row the DB falls back to `label ASC` (alphabetical), which puts "Final" (F) before "Group
  MD1" (G). Both screens resolved to the Final period on opening day — waivers showed the Final batch
  time; vsfield bound its Realtime subscription and lineup/score reads to the Final period.

- **Fix: `selectCurrentPeriod<T>(periods, isCurrent)` in `@app/shared/periodOrder.ts`.** Sorts in JS
  by `matches[0].kickoffAt` (populated by schedule sync; correct regardless of when `opensAt` lands)
  rather than relying on the DB sort order. The `status === "open"` fast-path is retained for
  future-safety. The `isCurrent` predicate is injected because the correct latch differs by screen.

- **`period.status` DOES transition — the `open`/`closed` arms are LIVE (corrected 2026-06-28).** An
  earlier version of this bullet said "`period.status` never transitions … dead paths" — that was
  STALE; it predated the 2026-06-17 `feat/period-status-lifecycle` merge (see the AMENDMENT above +
  ARCHITECTURE §22). The hourly `wc-fantasy-period-close` cron (`apps/worker/src/jobs/periodClose.ts`,
  via the pure `selectPeriodStatusTransitions`) is the **SOLE** writer of `status='open'`/`'closed'`:
  it closes a wave once its fixtures all reach `completed`, and opens the next wave — group matchdays
  AND each knockout round (R16→QF→SF→Final) — ~1 day before that wave's first kickoff. So the `open`
  arm of `selectCurrentPeriod` is selected in prod, not a dead path. (Freeze still stamps `frozenAt`;
  the FAAB cadence still stamps `batchClearedAt` — separate clocks.) **Do not re-derive the "status
  never transitions" premise** — it produced the false FAAB-FA-P2 report (closed not-a-bug 2026-06-28).

- **Waivers latch: `p => p.batchClearedAt === null`.** The batch has not yet run for this period —
  it is still the active waiver window. This matches the worker's `selectPeriodsToClear` gate (fires
  when `effectiveBatchAt = firstKickoff − DEFAULT_FAAB_BATCH_LEAD_MIN ≤ now`). The cleared period
  stays relevant until the next period's batch fires.

- **Vsfield latch: `p => now < matches.at(-1).kickoffAt + MATCH_DURATION_MS`.** At least one match
  in this period is still live. Using `batchClearedAt` for vsfield is **wrong**: it is stamped ~6h
  BEFORE first kickoff. During MD1 `batchClearedAt` is non-null — yet MD1 matches are actively being
  played. Using it as the latch would advance vsfield to MD2 mid-match, binding the Realtime
  subscription, lineup slot query, match status query, and `score_manager_period` reads to the wrong
  period. `MATCH_DURATION_MS = 120 * 60 * 1000` covers regulation + extra time.

- **`loadVsField` period query extended.** The prior query fetched only `take: 1` (first kickoff per
  period) and did not select `batchClearedAt`. The updated query fetches all matches (no `take`) so
  `matches.at(-1)` gives the last scheduled kickoff; `batchClearedAt` removed from the select.
  `loadWaivers` query unchanged (already had `batchClearedAt: true` + `take: 1`).

- **`selectCurrentWaiverPeriod` removed from `waiversLogic.ts`.** Hoisted to `@app/shared` as the
  generic `selectCurrentPeriod`; `waiversLogic.ts` is now a pure display-logic module with no
  period-selection code.

- **`resolveFaabBatch` / `resolve.ts` / purity matrix byte-unchanged.** Period selection is a
  display/loader concern; the batch resolver operates on explicit period + bid inputs.

- **`// TODO(confirm)` for overlapping group waves.** The sequential-period assumption holds for the
  WC group stage. Overlapping waves (two matchdays running concurrently) are scoped out; the comment
  marks the seam.

- **SCORING.md untouched.** This is a display-only addition; scoring algorithm, resolver, engine, purity
  matrix, and Realtime contract are byte-for-byte identical.

## Prompt — Wire the $0 free-agency grant into the Waivers tab (the route was never surfaced)

**The incident.** Prompt 48 shipped `POST /api/faab/free-agent` (the instant $0 free-agency pickup:
`handleFaGrant` / `faabGate` / `validateFaGrant` / `claimFreeAgent`) **with passing route + engine
tests** — and it was marked complete. But **no UI ever called it.** The Waivers tab rendered only the
sealed-bid claim form, so during a period's free-agency window (post-batch, pre-first-kickoff) a manager's
only action was a sealed bid that **wouldn't clear until the next batch** — i.e. the headline feature of
the window was unreachable. Verified live on prod (MD1 in free-agency, 1077 snapshot-eligible players, the
BatchBar already saying "Free agency open").

**The lesson (the load-bearing one).** **Route-level tests ≠ a working user path.** A green test on
`handleFaGrant` proves the handler is correct; it says nothing about whether any button reaches it. This is
the same class of gap P54 hit with the FormationPicker (a source-contract smoke can't prove a control
renders). The fix here is matched by an **end-to-end RTL/jsdom test that mounts the real `WaiversClient`
and drives the Add control** — asserting it actually POSTs `/api/faab/free-agent` and refreshes — plus the
`fa-conflict` (409) path. That test is the thing P48 lacked.

**What was wired (UI only — engine/route/schema untouched).**
- **`FreeAgentPanel`** (new) renders the free-agent list + instant Add/drop in the free-agency phase,
  reusing the sealed composer's `droppableRoster` drop picker + `claimableFreeAgents` pool + the
  `KitChip`/`NationFlag`/`Pos` atoms (no duplicated drop/roster logic). `WaiversClient.handleGrant`
  round-trips `POST /api/faab/free-agent` → `router.refresh()`, mirroring the bid path; the FA error codes
  (`fa-conflict` / `fa-window-closed` / `fa-not-eligible`) join the friendly-message table.
- **Phase switch, driven by the SAME `acquisitionWindowState` the BatchBar uses:** sealed-bid → the
  existing sealed claim form (unchanged); free-agency → the FA list (Add enabled); locked → Add disabled.
- **Snapshot-eligible pool, predicate reused not re-derived.** The loader's `freeAgents` was the naive
  live-unowned complement — WRONG for FA (it includes players dropped *this* window, which the grant
  rejects). In the free-agency phase the loader now offers the snapshot pool via a new
  `listFaIneligiblePlayerIds` (`@app/faab/prisma`), and the FA snapshot predicate is factored into ONE
  `snapshotOwnershipWhere` shared by it and the per-player `getFaTargetFacts` re-check — so the offered
  list and the accepted grant **cannot drift** (a stale list only falls through to the route's
  `fa-conflict` 409, surfaced inline). No new eligibility logic, no schema change (history-derived).
- **HARD STOPS held:** `resolveFaabBatch` / `resolve.ts` / the purity matrix / scoring are byte-unchanged;
  the route + `validateFaGrant` + `claimFreeAgent` are untouched (consumed, not modified).
- **Test infra:** added a `@/` alias to `vitest.config.ts` so jsdom component tests can mount real
  app-router components (`WaiversClient` → `@/components/NationFilter`) — reusable, same spirit as P54's
  jsdom addition.

## Prompt — Commissioner-override CLI (`commish:roster` / `commish:lineup`)

A Render-Shell tool for the commissioner to repair "our-fault" moves the app's (previously missing)
free-agency UI blocked — the same incident the FA-grant Waivers UI above addressed, from the operator
side. Two sub-commands under `apps/worker/src/commish/` (`pnpm --filter @app/worker commish:roster|lineup`),
**dry-run by default, `--apply` to execute.**

**The line: what it BYPASSES vs what it ALWAYS enforces.** This is the whole design.

- **Bypasses (deliberately, commissioner-only):**
  - `commish:roster` — the FA/waiver acquisition **window** (it calls `claimFreeAgent` directly, never the
    `validateFaGrant` window/snapshot gate; the validator is reused with `windowState:"free-agency"` +
    `faEligible:true` + `dropLocked:false` so ONLY those gates are neutralized) and the **drop-lock**.
  - `commish:lineup` — the lineup **edit-window lock** (via `relaxPeriodLock`: `validateLineup` runs with
    `status:"open"` + `closesAt:null`, so its phase-1 window check is a no-op).
- **ALWAYS enforces (never bypassed — reused from the engines, not re-derived):**
  - roster: the **15-man squad cap** (`validateFaGrant`/`checkDropAndRoster` total-15 via `SQUAD_SIZE`;
    the per-position 2/5/5/3 cap was lifted — see the "Prompt 44 extended to @app/faab" amendment above),
    **valid-drop** (drop owned, ≠ add, required-when-full), the **active-ownership unique** +
    **slot-release** + the atomic drop/insert (all inside `claimFreeAgent`'s one transaction). $0 — no
    budget / waiver-order change.
  - lineup: **formation/position legality**, **ownership**, the **11-distinct XI**, and the **lock-on-play
    latch** (the per-play freeze stays — `validateLineup` step 4 + `saveLineup`'s write-time re-check + the
    DB trigger `enforce_lineup_lock()`, which is NOT bypassable from app code anyway).
  - both: the **commissioner gate** (`is_commissioner` flag OR the `smrios07@gmail.com` fallback, mirroring
    `canActAsManager({scope:"admin"})`), a **required `--reason`**, **idempotency** (skip if the end state
    already holds), and a **structured audit line** per applied action (`commish-override {json}` on stdout).

**The post-kickoff integrity caveat (the one genuinely dangerous bypass).** A roster move on a player whose
match has already kicked off is an integrity hazard: his points are (becoming) known, so a retroactive
add/drop can rewrite history. The per-player **kickoff guard is ON by default and BLOCKS** such a move; it
is honored only with an explicit per-move `--allow-post-kickoff`, and when used it **logs LOUDLY** (player,
match, kickoff time, "points already known") before applying. The dry-run plan always surfaces the
add-match kickoff + whether it has already played.

**STOP SEAMS held.** No engine/route/schema change and **no migration** — the audit is structured stdout,
not a new table. `claimFreeAgent` + the `@app/lineup` validate/service are reused verbatim (their
validation is never re-derived). The pure core (resolver / gate / kickoff-guard / idempotency / audit) and
the injected-deps orchestrators are unit-tested (resolver name→id + ambiguity, gate refusal, kickoff
default-block vs `--allow-post-kickoff`, roster cap kept under window-bypass, formation legality kept under
lock-bypass, dry-run applies nothing); the IO `cli.ts` is `tsc`-covered like the provisioning CLI. New dep:
`@app/lineup` added to `apps/worker`.

### Follow-up — period-pin + lock-on-play carve-out (FWD-cap removal HELD by the gate)

Four related fixes surfaced applying the MD1 "our-fault" repairs. **Three shipped; the verification gate held the fourth.**

- **`commish:roster --period "MD1"` (period-pin, #1+#2).** An already-played-MD1 player's *next* fixture is MD2 (still sealed → `batch_cleared_at` NULL), so the unpinned grant resolved the MD2 snapshot and wrongly threw `fa-conflict`, and the kickoff guard read MD2's (future) kickoff and falsely passed "not yet kicked off." With `--period`, BOTH the FA snapshot (`claimFreeAgent` → `resolveAddPeriodWindow`'s new pinned branch reads *that* period's `batch_cleared_at`) and the kickoff guard (`getAddMatch` filters fixtures to that period) key off the named period instead of the next-fixture inference. Optional + commissioner-only; unpinned behaviour is byte-unchanged (the live FA route never passes it). Recorded in the dry-run plan + audit (`"period"`). `getFaTargetFacts`'s port is left unchanged — the override discards its window/`faEligible` (it hard-codes `free-agency`/eligible), so only `claimFreeAgent`'s snapshot is observable.
- **`commish:lineup --allow-locked-slot` (lock-on-play carve-out, #3) — the ONE schema touch.** Relaxes the played-player freeze for a deliberate commissioner repair while KEEPING formation/position legality, ownership, the 11-XI, the gate and the required `--reason`. The latch lives in THREE places and the flag relaxes all three: `validateLineup` phase-4 (the orchestrator passes an EMPTY `lockState`), `saveLineup`'s write-time re-check (skipped + the locked row overwritten), and the **DB trigger** via a transaction-local GUC. Migration `20260611120000_lock_on_play_commish_override`: `enforce_lineup_lock()` short-circuits when `current_setting('app.commish_override', true) = 'on'`; the Prisma `saveLineup` issues `SET LOCAL app.commish_override = 'on'` ONLY under the flag, in the same write tx. Unset (every normal write + the lock-on-play job, which also runs as service_role) ⇒ NULL ⇒ enforce — the exact constraint the original Invariant-3 TODO insisted on (no blanket role exemption). `search_path = ''` stays pinned (`current_setting` is pg_catalog, so the empty search_path holds). Self-test (sentinel-rollback, valid-UUID-format ids) asserts blocked-without-GUC + allowed-with-GUC; **verified on a throwaway Postgres** (independent probe: `blocked_without_guc=t allowed_with_guc=t`). Recorded in the audit (`"lockOverride"`).
- **FWD-cap removal — HELD; the gate caught a conflict (#4 NOT done).** The follow-up asked to remove a "retired per-position roster cap" from `checkDropAndRoster`. **It is NOT the retired cap.** Prompt 44 lifted per-position caps for `@app/draft` ONLY ("only that per-position *draft* ceiling is removed"); the FAAB cap in `checkDropAndRoster` (`2/5/5/3 + 15`) is re-affirmed above as "ALWAYS enforces (never bypassed)," and a forward add is blocked only when it would be a *4th* FWD without dropping a forward (the cap working as designed, not a bug). No decision retires the FAAB-side cap — so removing it is a **separate, commissioner-confirmed decision that must be recorded here FIRST** (and would also touch `resolve.ts`'s `claimLegality` + the `schema.prisma` comment). `checkDropAndRoster` + `resolve.ts` are byte-unchanged. (Sergio confirmed: hold #4, ship #1–3.)

STOP SEAMS held: `resolveFaabBatch`/`resolve.ts`/purity/scoring untouched (`resolve.ts` byte-unchanged); the trigger migration is the only schema touch. Gate green (1719 tests). `feat/commish-fixes`, merge HELD for Chat clearance.

### 2026-06-11 — Only match participants are scored; conceded requires team-in-match (`fix/score-nonparticipants`)
- **Invariant (NEW, do not reopen): a `score_player_match` row exists ONLY for a player who actually appeared in that match.** A dirty `(match, player)` marker is necessary but not sufficient. `recomputePlayerMatch` (packages/recompute) now gates on the pure `playerAppearedInMatch(bundle)` = **team-in-match** (player's `team_id` is the match's home or away team) **AND** an appearance signal (a real non-stub stat line, a named match event, or a shot). A non-participant gets **no row**: any pre-existing bogus row is **deleted** (new `RecomputeStore.deleteScorePlayerMatch`), the affected `(manager, period)` is re-enqueued, and dirty is cleared. **Defense in depth:** `concededByPlayerTeam` (adapter) now also requires team-in-match.
- **The incident (LIVE MD1).** `score_player_match` rows were generated for non-participants. Trigger: the completed **Mexico–South Africa** fixture — every rostered **GK/DEF** whose team was neither home nor away was charged **−1** (the match's goals counted as conceded by their uninvolved team), dragging the whole field negative; MID/FWD non-participants scored 0. Root cause = TWO defects on the per-match scoring path: (1) it scored ANY `(match, player)` with a dirty row, with **no participation check** — and `markStatPlayerDirty` mints all-null stub rows + an upstream player↔match mis-join can tag cross-team rows; (2) `concededByPlayerTeam` counted `scorerTeam != playerTeam` with **no team-in-match guard**, and §6 goals-conceded is gated on **role only, not minutes**, so a stub GK/DEF still scored −1. The **manager-period rollup was CORRECT** (starters-only) and was NOT touched — `recomputeManagerPeriod`/`job:recompute` only re-sum.
- **Remediation is delete-then-restate, not restate-alone.** `job:recompute` only re-sums existing `score_player_match` rows, so the bogus rows must be **deleted first**. `ops/2026-06-11-clear-nonparticipant-scores.sql` deletes cross-team score + stub raw rows (safe across ALL matches — a correct row is never cross-team), then `pnpm --filter @app/worker job:recompute -- --period "MD1"` restates manager-periods + standing. Verification query asserts zero cross-team rows + FENIX → 0.
- **Scope discipline.** Fix confined to the per-match scoring path (recompute adapter/orchestration/store + one new store method); the engine (`@app/scoring`), the rollup, ingest, and the lock fix are **untouched**. The upstream "why does a cross-team/stub row arise" (feed-mapper / `markStatPlayerDirty` join) is the per-match path's job to refuse at score time — NOT reopened here.
- **Adjacent reminder — `locked_at` is a DB-trigger latch.** A bad `locked_at` is NOT repairable by a plain `UPDATE`: `enforce_lineup_lock()` rejects edits to a locked slot. It is corrected only inside a transaction that issues `SET LOCAL app.commish_override = 'on'` (the `commish:lineup --allow-locked-slot` path; migration `20260611120000`). This remediation touches only `score_*` rows, never `locked_at`.
- 8 regression tests (1719→1747): non-participant gets no row + no conceded line; a real away-team defender legitimately −1; the team-in-match guard rejects an uninvolved team; the end-to-end sweep restates FENIX → 0. Full gate green. `fix/score-nonparticipants`, merge HELD for Chat clearance.

### 2026-06-12 — Player box-score modal: server-only data flow + surface-agnostic modal (Prompt 52)

**Decision: `score_player_match` + `stat_player_match` never read by the browser (Theme F extension).**
The box-score breakdown is served via `GET /api/player-box` (Prisma owner-bypass, `import "server-only"`
in the loader). The browser never holds `breakdown_json` in its bundle or component state — it receives
only the already-mapped `PlayerBoxView`. This extends Theme F (server-authoritative, no browser-direct
table reads) to cover the scoring tables. No new RLS policy or Realtime publication is needed.

**Decision: `PlayerScoreSheet` is surface-agnostic.** The modal is wired into `/lineup` (Prompt 52) but
has no lineup-specific coupling — it only takes `{ periodId, playerId, onClose }`. Prompt 53 can mount
it on `/vsfield` without modification, matching the reuse precedent set by `buildVsField` / `@app/vsfield`.

**Decision: query params are `?periodId=` not `?matchId=`** because the client only knows `activeId`
(the period the manager is editing). The server resolves the `fifa_match` from `(playerId, periodId)` —
no match ID is threaded to the client and no additional prop is needed on any lineup component.

**Decision: `ScorePill` uses `stopPropagation`, not a separate outer element.** Played-starters need two
co-existing behaviors on the same token: tap the token body = forfeit confirm, tap the pts badge = score
modal. `stopPropagation` on the pill's click handler is the minimal implementation; no structural change
to `PitchToken` is needed.

**Decision: `isLive` dot on `ScorePill` uses `slotKind === "locked"` as the heuristic.** A locked
(kicked-off, no score row yet) slot is "possibly live"; a played-starter or played-bench slot has a
confirmed appearance. This is approximate (~≤60s stale after final whistle) but consistent with the
~1-tick window already documented for the forfeit affordance.

**Decision: `BenchRow` locked rows are clickable (score modal), not `disabled`.** Previously locked
bench rows had `disabled={!movable}` which blocked all clicks. Removing `disabled` and routing
`!movable → onScore` restores interactivity for players who have already played. The `is-locked` class
is retained for visual dimming (opacity); `aria-disabled` was also removed since the element is now
interactive.

## Vs-the-Field box-score drill-in (Prompt 52/53 reuse)

**Decision: Vs-the-Field gets the box-score modal as INFO-ONLY — no forfeit affordance, ever, for ANY
player (own XI included).** Tapping a manager surfaces that manager's XI as named, tappable players in
the H2H drill-in; tapping a played/locked player (own OR an opponent's) opens the shared
`PlayerScoreSheet` rendered with **no `forfeitProps`**, so the "Bench & forfeit" section never appears.
Vsfield never edits lineups — Set Lineup is the only surface that mutates the XI. To-play players are
identifiable but inert (no pill, no modal); there is no swap/drag anywhere on vsfield. The forfeit
section is gated purely on the optional `forfeitProps`, so omitting it is the whole mechanism.

**Decision: the modal read is reachable for opponents because `/api/player-box` is league-scoped, not
owner-scoped.** Verified in discovery: `loadPlayerBox` filters score/stat rows by `(playerId, periodId)`
only — no roster/`managerId` predicate — and `handlePlayerBox` gates on league membership (401 no-session
/ 403 not-allowlisted / 403 no-manager) with **no** "not-your-manager" 403. So surfacing opponents'
breakdowns required **no** RLS, publication, route, or auth change.

**Decision (Prompt 41, 2026-06-13 — SUPERSEDES the "Option 2, modal-only" decision below): per-player
points ARE carried in the server-composed vsfield snapshot (path a).** `StarterInput`/`StarterView` gained
exactly `points: number`; `buildVsField` maps it verbatim (purity preserved — no clock/derivation).
`loadVsField` (shared by the SSR page + the `GET /api/vsfield` refetch) adds ONE whole-field
`score_player_match` read for the current period — the SAME owner-bypass source `loadPlayerBox` reads,
joined via `match.periodId` (~N×11 rows) — and joins `points` per starter, defaulting a starter with no
scored row (yet-to-play, or live-but-not-yet-appeared) to 0 (pure exported `playerPointsLookup`). **Theme
F's REAL invariant (the browser's direct read scope) holds:** the read is SERVER-side owner-bypass, so the
browser still reads ONLY `score_manager_period` + `standing` directly — NO RLS policy, NO publication
entry, NO migration, NO new endpoint, NO browser-direct `score_player_match` read. The points reach the
client exclusively inside the snapshot JSON, so the existing change-nudge→`/api/vsfield` refetch updates
the chip live for free (Realtime payload/subscription unchanged). No privacy delta — the same points are
already league-readable via the box-score modal (`/api/player-box`). Path (a) was chosen over a batch
points endpoint (path b) for "boring and reliable." Guarded by `src/vsfield/pointsPath.test.ts` (the
browser path contains no `score_player_match`; the server loader does).

**Decision (SUPERSEDED by the above; retained for history): per-player POINTS stay OUT of the vsfield SSR
payload — Option 2, modal-only.** `loadVsField` then carried only `name` + `nation`; per-player points
were fetched on demand by the box-score modal. The revision changed the *product* decision (what the
server composes into the payload), NOT the Theme-F boundary (the browser's direct read scope is unchanged).

**Decision: nation on the drill-in comes from the `fifa_team.name` join, NEVER `player.country` (P34).**
`player.country` is unwritten by ingestion; `loadVsField` resolves `nation` via `player.team.name`,
matching `loadPlayerBox` / `loadLineup`. The `<Flag>`/`toIso2` surface is reused, not reinvented.

**Decision: `PlayerScoreSheet` relocated to `apps/web/components/` (single source) with Set Lineup
byte-unchanged in behavior.** The component is the shared single source (consumed by `/lineup` with
`forfeitProps` and `/vsfield` without); lineup's only change is the import path. `app/lineup/lineup.css`
is left untouched, so Set Lineup stays visually identical; the modal's `.sl-sm-*` styles reach the
vsfield route via a focused, co-located `apps/web/components/PlayerScoreSheet.css` imported by the
vsfield layout. The small CSS duplication is a conscious trade-off (zero Set-Lineup regression risk,
since gates are jsdom and don't cover visual CSS); single-sourcing both copies of the modal CSS is a
clean follow-up.

**RESOLVED by Prompt 41 (was DEFERRED): the per-player points chip on the vsfield XI ships** — via path
(a) (widen the server-composed snapshot; NOT a batch endpoint), per the SUPERSEDING decision above. Each
jersey now carries a points chip in a fixed slot under it, the NUMBER as headline (vsfield-local
`.sl-jersey-score`, ported from the handoff `vsfield_points/v2.css` `.sl-tok-score` and scoped under
`.da-pitch` — lineup.css owns `.sl-tok*`). Three states off `StarterView.state`: playing = dark pill + red
pulsing dot + N PTS · played = the SAME dark pill + N PTS, no dot (the dot is the sole live↔played cue) ·
yet-to-play = dashed "– TO PLAY", no number; `dimLive` suppresses the dot. Gold-free (neutral pills,
`--live` dot). The tap-to-open box-score modal is UNCHANGED; still-to-come stays a COUNT (no projection).

Post-deploy visual confirmed on deploy 2026-06-12.

**FOLLOW-UP: modal CSS duplicated across `lineup.css` + `components/PlayerScoreSheet.css` after the P54
relocation** — unify into the shared sheet (drop the `lineup.css` copies; both layouts import shared)
post-launch; until then any modal-style edit must touch both files. The literal overlap is 20 selectors:
`.sl-forfeit-overlay`, `.sl-scoremodal`, `.sl-sm-close`, `.sl-sm-head`, `.sl-sm-name`, `.sl-sm-pts-hero`,
`.sl-sm-match`, `.sl-sm-empty`, `.sl-sm-section`, `.sl-sm-section-label`, `.sl-sm-row`, `.sl-sm-tag`,
`.sl-sm-lbl`, `.sl-sm-row-pts`, `.sl-sm-total-row`, `.sl-sm-total-num`, `.sl-sm-tracked`,
`.sl-sm-tracked-head`, `.sl-sm-tracked-row`, `.sl-sm-season`. (The shared copy is a SUBSET — the
forfeit-section classes `.sl-sm-forfeit` / `.sl-sm-forfeit-msg` and the lineup-token classes
`.sl-scorepill` / `.sl-forfeit-sheet` stay lineup-only, since vsfield renders neither.)
## Vs-the-Field Direction-A reskin (feat/vsfield-reskin)

**Decision: Direction A ("split cockpit") is the built direction; Direction B was NOT built.** The
handoff's `vsfield2/` is the new design (the older `vsfield/` folder is the P11 reference it replaced);
within it, `directionA.jsx` + `shared.jsx` + `mobile.jsx` are ported and the `.db-*` Direction-B CSS is
dropped entirely.

**Decision (F1): jersey kits are ISO2-keyed and resolve through the EXISTING flag mapper — no second
nation table.** `kitOf.ts` rekeys the design's `JERSEY_BG_V2` from FIFA alpha-3 to ISO 3166-1 alpha-2
and resolves `StarterView.nation` (the `fifa_team.name` join) via the shared `toIso2`
(`src/draft/flag.ts`). England has no ISO2 code, so home nations resolve by NAME via `isHomeNation`
first — the exact `<Flag>` precedent; Scotland (no kit in the 8-kit library) and every unmapped nation
fall back to `var(--surface-4)`, never a broken kit.

**Decision (F1.1): kit map expanded 8 → 30 nations (`feat/vsfield-nation-kits`).** The 22 remaining
WC2026 nations were ported into `kitOf.ts` VERBATIM from the approved Claude Design jersey-gradients
handoff (`design/design_handoff_jersey_gradients`) — gradient values are locked, so they are dropped in
as literal strings, not re-expressed via the original helper builders (which still build the original 8,
byte-identical). Name resolution rides the **existing** shared `toIso2` and its pre-existing alias table
(`czechia` / `türkiye` / `south korea` / `côte d'ivoire` incl. **both** apostrophe forms U+0027 `'` and
U+2019 `’` — Node's `Intl.DisplayNames` returns the curly form). All 22 prod feed strings were verified
against `fifa_team` rows with **zero misses** → NO shared-mapper edit, NO kit-local normalizer, and the
earlier "promote a kit alias into the shared mapper" follow-up is now **MOOT**. Scotland (still no ISO2)
resolves by name via `isHomeNation`, which already contained it; only its saltire kit was added to
`HOME_NATION_KITS`. **Croatia upgraded** from the plain red/white/blue tricolor to a conic šahovnica
**checkerboard** dot over the tricolor, specifically to break the **NED↔CRO collision** (the new clean
Netherlands kit was also red/white/blue); a test locks `kitOf("Croatia") !== kitOf("Netherlands")`. The
no-`background-size:cover` render-contract guard now covers all 30 kits incl. CRO. Final suite: **1896
tests** green.

**Decision (F2): CompareBand ships Facts 1+2 only; Fact 3 (player-by-player lineup edge) is DEFERRED.**
Fact 3 needs per-player points. As of **Prompt 41** that data IS now in the snapshot
(`StarterView.points` — the loader reads `score_player_match` server-side, path a), so Fact 3 is no longer
*blocked* on Theme F; building the band-level Fact 3 is a separate scope step (not done this prompt). The
deferral is pinned by a note in `components.tsx`. (The old "no per-player score renders on any token"
assertion is itself superseded — the pitch now shows the points chip; see the points-chip decision above.)

**Decision: LbRow (and every leaderboard/compare row) renders MANAGER identity — initials Avatar, NOT
PlayerAvatar.** PlayerAvatar's flag badge is player/nation-scoped; managers have no nation. PlayerAvatar
remains absent from vsfield components (test-enforced).

**Decision: `--kit-outline` is a GLOBAL SHARED design token (vsfield + lineup), defined in
`styles/ds.css` `:root` (dark `rgba(255,255,255,.82)`) + `[data-theme="light"]`
(`rgba(20,28,42,.5)`), with ALL FIVE ds.css copies synced byte-identically** (the byte-identity
invariant is now machine-enforced across all four per-route copies — see the appShell test). It is
APPLIED only on vsfield in this build; lineup has no jerseys today (PlayerAvatar discs), so lineup kit
adoption is a deferred feature, not a retrofit. **(T13, 2026-06-24 — now SHIPPED; see the kit
neutralization decision directly below.)**

**Decision (T13, 2026-06-24): lineup kit adoption SHIPPED, and the kit primitive is NEUTRALIZED into a
shared home.** The set-lineup pitch + bench now render flag-kit jersey chips in place of the
position-color `PlayerAvatar` disc, closing the deferred feature above. The chip is a shared `.sl-kit`
silhouette (geometry promoted from the `feat/t13-bench-kit-chips` `.sl-bench-kit` reference: a clip-path
jersey outlined against the turf with the GLOBAL `--kit-outline` token, over a `var(--surface-4)` base);
the resolved per-nation kit gradient is applied INLINE per the roster `.rt-kit` convention — **never
`background-size: cover`** (the multi-layer kit gradients collapse under it). The existing flag badge
(`FlagBadge`, now EXPORTED additively from `components/PlayerAvatar.tsx`) is overlaid as a SIBLING of the
clipped silhouette (a child would be cut by the clip-path); the real-XI availability medallion/glow and
the lock-on-play dims (`is-locked` / `sl-tok-played`) + `ScorePill` are byte-unchanged (the chip swaps
in inside the existing `.sl-av-anchor`). **Resolver neutralized:** `JERSEY_BG_V2` / `KIT_FALLBACK` /
`kitOf` were MOVED to a surface-agnostic home `apps/web/src/kit/kitOf.ts`; `app/vsfield/kitOf.ts` is now
a one-line re-export shim (`export *`), so vsfield + game-detail keep importing `vsfield/kitOf`
byte-identically while lineup imports the neutral module directly — no screen "owns" the kit primitive,
and lineup never reaches into the vsfield route. **There is NO name-keyed `JERSEY_BG` map in apps/web**
(that was a design-prototype construct only; the app keys kits by ISO-2 through `kitOf()`, resolving
`fifa_team.name` via the shared flag mapper) — do not re-introduce one. Presentation + module relocation
only: NO loader (`country` = `team?.name`, already loaded — loadLineup.ts:96), engine/scoring,
data-contract, RLS, Realtime, or migration change; the `--kit-outline` 5-copy byte-identity invariant is
untouched (the chip reuses the existing global token). Tests: jsdom render proof in
`ForfeitConfirm.test.tsx` (kit chip + flag badge + medallion + lock state + tap route) + pure-Node
source contract in `lineupKit.test.ts` (no `background-size: cover`; neutral-module wiring). Merge HELD
(review-class: module extraction + cross-surface test). The vsfield jersey-class collision guard above
still holds — lineup's `.sl-kit` is unique and never collides with vsfield's `.sl-tok-jersey`/`.sl-jersey`.

**Decision: the jersey token class is `.sl-tok-jersey` scoped under `.da-pitch` — NEVER bare
`.sl-tok`.** The design reuses lineup's `.sl-tok`/`.sl-tok-name` names, but lineup.css already owns
those with different rules and Next.js route CSS persists across client navigation (both sheets can be
live at once). Vsfield therefore uses vsfield-unique inner names (`.sl-jersey`, `.sl-jersey-name`,
`.sl-jersey-state`) under the `.da-pitch` ancestor; on-kit text is rgba white with a dark halo in BOTH
themes (the turf stays green in light mode — a theme-flipped text token would sink into the kit).

**Decision: the FeedTicker stays a no-op stub.** It needs event-level feed data that is not in
`VsFieldView`; the stub carries the data-gap TODO. The mobile You/Opp pitch toggle is a LOCAL
`useState` in `MaH2H` (F3) — pure presentation, not Realtime-coupled. Selection state is `effSel`:
the `'field'` sentinel | a managerId (UUIDs — no collision); desktop resolves null → `'field'`,
mobile keeps null as the leaderboard-first home.

## Tabbed player card: Points | Stats (Prompts 54 + 55, 2026-06-13)

### Data delivery: player-scoped endpoint, eager-parallel fetch (Prompt 54)

**Decision: tournament stats are served from a dedicated player-scoped endpoint (`GET
/api/player-tournament-stats?playerId=`), NOT bundled into the period-scoped `player-box` endpoint
and NOT fetched lazily on tab select.**

- *Data scope = endpoint scope.* The Stats tab aggregates all of a player's completed tournament
  matches; adding a `periodId` dimension would force the waivers/FA surface (which has no period
  context) to invent one. A period-less endpoint is the honest contract.
- *Reusability.* The same endpoint is wired into the Free Agents / Waivers card when that surface
  is built — no new endpoint needed.
- *Eager + parallel fetch keeps both tabs hot.* The client fires both `player-box` and
  `player-tournament-stats` concurrently when the sheet opens. Either tab is instantly renderable;
  no spinner on tab switch.

### Tile set: position-aware per the 2026-06-13 design (Prompt 54)

**Decision: the Stats tile/line set is position-specific, sourced from the design's `PC_TILEKEYS` /
`PC_LINEKEYS` constants — not a fixed five tiles for all positions.**

The design is authoritative. GK, DEF, MID, FWD each surface a different hero-stat grid because
the position-relevant scoring contributions differ. The constants are consumed directly; no run-time
tile-selection logic is built outside what the design specifies.

### Participation gate on tournament-stats aggregation (Prompt 55)

**Decision: the tournament-stats query MUST gate on team participation at the query level.**

Without the gate, stub `stat_player_match` rows for non-participant players (see the phantom-row
incident below) inflate the aggregate. The query-level gate is:

```
match.status = 'completed' AND (match.homeTeamId = teamId OR match.awayTeamId = teamId)
```

The regression guard asserts the gate is present on the `findMany` call args. Asserting on the
result would be invisible to a mocked DB (a mock cannot filter rows); asserting on the args fails
the test immediately if the WHERE clause is dropped.

### Phantom-row incident (2026-06-13 ~19:50 UTC) — tracked, NON-URGENT

A one-off ingest/backfill wrote `stat_player_match` stubs (all stats null) for every rostered player
for exactly two completed MD1 matches — **South Korea–Czechia (bdlId 376)** and **Canada–Bosnia &
Herzegovina (bdlId 415)**, 791 rows total.

**Scoring impact: ZERO.** `score_player_match` had 0 phantom rows and 0 non-zero points for those
players — the participant gate in `recomputePlayerMatch` held. The standings are correct.

**Not recurring.** Every completed match ingested after the incident is clean (the live ingest path
does not produce pool-wide stubs; the backfill that triggered this is no longer running).

**Remediation:**
- **(a) Query-level participation gate** — shipped in Prompt 55; prevents phantom rows from
  surfacing in the Stats tab aggregate.
- **(b) One-time operator DELETE** of the 791 stub rows — Sergio to run; low-urgency since they
  have no scoring or UI impact today, but they will appear in the Stats tab if not deleted.

**Open item:** root-cause the offending backfill write path. Low priority — the incident is not
recurring and had no standings impact; the query-level gate is the durable fix.

## FA / Waivers player card — open vs. add (Prompt 56 — feat/fa-player-card)

The tabbed Points | Stats player card (the shared `PlayerScoreSheet`, live on vsfield + lineup)
explicitly deferred the standalone Free Agents / Waivers surface "to a later prompt"; this lands it.
Resolutions:

- **Dedicated trailing open control; the select tap is UNCHANGED.** A picker row's primary tap still
  binds to select-for-acquisition (`setSelected`). The card opens from a SIBLING `.wv-comp-fa-info`
  button (`stopPropagation` so the open tap never also selects) — never nested in the select `<button>`.
  The extracted shared `FaPickRow` wraps the byte-identical select button + the trailer; both pickers
  (`BidComposer`, `FreeAgentPanel`) consume it, so the acquisition path is provably untouched.
- **The standalone card is VIEW-ONLY.** Our acquisition is the existing right-panel select→submit, so —
  unlike the design's `FaPlayerCard` (which carries an in-card acquire CTA) — `FaPlayerCardSheet` has NO
  acquire/add/drop/mutation. It is purely informational; the design's open-vs-acquire split is adapted,
  not copied.
- **It uses the design's standalone `.pc-scrim`/`.pc-sheet` chrome, NOT the shared sheet's
  `.sl-scoremodal`.** The shared `PlayerScoreSheet` Points tab is hard-wired to a per-period
  `/api/player-box` read; the waivers surface has no live period, so it gets its own chrome whose Points
  tab is a light per-surface OVERVIEW (the way the design itself factors the card).
- **Points overview = real `WvPlayer` fields only; the design's "Projected next" is DROPPED.** Two honest
  rows — Season points (`seasonPoints`, renders `—` when null) + Acquisition (`CutoffTag` off
  `kickoffAt`; "No upcoming fixture" when null). `WvPlayer` has no `proj` field, so we do not fabricate
  one (same posture as the tabbed-card prompt dropping the synthetic game-log). No opponent/fixture row —
  `WvPlayer` carries no opponent. The Points tab is intentionally light here; the Stats tab is the
  substance.
- **z-index:** the card can be opened from inside the bid-composer modal (`.wv-scrim`, z 90); a
  route-scoped `.wv-app .pc-scrim { z-index: 95 }` in `waivers.css` lifts it above — the global ds.css
  `.pc-scrim` token (z 80) is left untouched.

New styles in `waivers.css` only; ds.css + schema untouched; no migration; no scoring/recompute/
ingestion change. Gates green (typecheck/lint/format/test 2005 + `@app/web` build, `/waivers` ƒ 8.21 kB).
**Live-Render screenshot on `/waivers` owed before merge.**

## `[skip render]` is evaluated against the PUSH's tip commit (zero-rating-line thread, 2026-06-14)

Render decides whether to skip a deploy by inspecting the **tip commit of the push**, not each commit
in it. A docs commit carrying `[skip render]` pushed on top of a code commit therefore suppresses the
code deploy for the **whole push**. Observed this thread: the push of engine `788a312` + docs tip
`21ced34` (`[skip render]`) was skipped wholesale, leaving the goals-conceded/rating engine change
merged-but-not-live.

**Rule:** never let a `[skip render]` commit be the tip of a push that also contains code. Either push
code-bearing commits without a skip-render tip, or push docs-only `[skip render]` commits in a
separate push. **Recovery:** a manual "Deploy latest commit" in the Render dashboard overrides the
skip and ships the merged-but-unbuilt tip.

## Post-deploy remediation for a `scorePlayerMatch`/breakdown change is RE-DIRTY → SWEEP, not `job:recompute`

`job:recompute` (`forcedRestate`) restates **only rollups** (`recomputeManagerPeriod` +
`recomputeStanding`); it never re-runs `scorePlayerMatch`, so it does **not** rewrite
`score_player_match.breakdown_json`. To regenerate stored breakdowns from current inputs after an
engine-rule change, mark the affected rows dirty:

```sql
UPDATE stat_player_match SET dirty = true;  -- scope to affected (match, player) rows
```

This is conflict-safe — `dirty` is a flag-only boolean that never clobbers stats
(`packages/db/src/dirty.ts`). The scheduler then sweeps (`runRecomputeSweep`, ~60s tick) and drains
the dirty rows via `recomputePlayerMatch`. **Verify AFTER a tick or two plus a page refresh** — an
immediate read shows pre-sweep/stale state. For a display-only change (the scored line is `+0`),
totals and standings are byte-identical; only the stored breakdown text changes.

## Recompute sweep Phase-1 — atomic claim-then-clear + failure isolation (beb1bec)
- Phase-1 now CLAIMS dirty (match,player) keys atomically: `claimDirtyPlayerMatches` runs one
  `updateManyAndReturn` per raw table (Prisma 6.19.3 / PostgreSQL) flipping `dirty=true→false` AND
  returning the keys in the same statement — replacing `listDirtyPlayerMatches` (read) + per-unit
  `clearRawDirty` (clear-last). Clearing BEFORE the recompute read closes the read→compute→clear
  lost-update: a raw write committing after its row is claimed re-sets `dirty=true` and is reprocessed
  next sweep, so a committed write is never cleared without being incorporated. `recomputePlayerMatch`
  no longer clears dirty.
- Failure isolation: per-key try/catch; on throw the key is re-dirtied (`markPlayerMatchDirty`,
  replaces `clearRawDirty`), surfaced via `opts.onPlayerMatchError` (worker wires it to the structured
  logger so a poison row is visible and re-fires every tick), counted in
  `SweepResult.playerMatchFailures`, and the loop CONTINUES. Every claimed key ends with either a fresh
  score or `dirty=true` — never `dirty=false`-and-stale.
- Provenance (honest): surfaced during the Antonee Robinson rating-omission investigation, which was
  NOT a defect — a 6.5–6.9 rating scores 0 by design and the breakdown merely omitted the 0-point line
  (fixed separately by `feat/scoring-show-zero-rating-line`). This branch fixed no live incident; it is
  PREVENTIVE hardening.
- BINDING GATE: the race is dormant while raw-layer writers are serialized in the worker; it becomes
  load-bearing once the Sofascore scraper writes ratings CONCURRENTLY (currently stubbed). The
  real-Postgres atomicity of `updateManyAndReturn` is validated ONLY by
  `packages/recompute/src/sweepClaimClear.integration.test.ts` (describe.skipIf(!RECOMPUTE_PG_TEST_URL),
  SKIPPED in the merge gate). REQUIRED before the scraper begins concurrent rating writes: run that
  integration test GREEN against a real Postgres. Merged dormant on unit-green; the real-DB gate is
  deferred to when the race goes live, not waived.

## vsfield self/field cockpit shows the viewer's OWN detailed jersey XI (feat/vsfield-self-xi)
- DECISION: the self/field view (`YouVsField`, shown when `effSel` resolves to field/self) renders the
  viewer's **own detailed jersey XI** — the same `XIPitch`/`XIToken` the H2H compare draws, fed with the
  viewer's own `StarterView[]` — replacing the abstract dot-node `PitchMini` + `XILegend` hero pitch.
- WHY now (not a reopening): per-player `points` for the current period already ship in the
  server-composed snapshot (Prompt 41 / path a) and `PlayerScoreSheet` is already wired on /vsfield, so
  showing the viewer's own per-player points is strictly LESS sensitive than the opponents' points the
  H2H already renders. Theme-F boundary unchanged: no browser-side `score_player_match` read,
  `pointsPath.test.ts` stays green.
- HOW: pure presentation/reuse — `YouVsField` gained `onOpenPlayer`/`dimLive` props; both `VsFieldClient`
  call-sites pass the already-wired `setBoxPlayer` (no new modal/fetch/endpoint). The still-to-come /
  playing / played side-count column is kept; the lone self pitch is framed by `.v2-agg-xi` and stacks on
  phones. `PitchMini`/`XILegend` + dead `.vf-pitch*`/`.vf-node`/`.vf-legend2` CSS removed (zero
  call-sites). Self-view-only; the opponent H2H compare and loader/engine/RLS are untouched.
- `MaYou` is the compact standings-list hero and never carried a pitch — unchanged; the mobile self
  *detail* view is `YouVsField` under `.ma-scroll`, so the swap already covers phones.

## Match-scoped feed queries scope server-side via `match_ids[]`, not the ignored scalar `match_id` (feat/feed-match-ids)
- DECISION: the five paginated match-scoped helpers (`matchLineups`/`matchEvents`/`playerMatchStats`/
  `teamMatchStats`/`matchShots`) now send the **bracketed array** filter `match_ids[]=<id>` at
  `per_page=100`, so a single fixture resolves in **one page**. Confirmed against the official GOAT
  OpenAPI (`www.balldontlie.io/openapi/fifa.yml`): the FIFA WC **paginated** endpoints honour the
  `match_ids[]` array filter; the **scalar `match_id` is NOT a recognized filter on them** — it is valid
  only on the non-paginated `/odds/player_props` (a different endpoint). A scalar `match_id` sent to a
  paginated endpoint is **silently ignored**, so the server returns the **unfiltered tournament firehose**.
- ROOT CAUSE this closes: every match-scoped pull previously sent the ignored scalar, so `getAll` walked
  the **entire tournament dataset** (~1,800 req / ~3 min per single-match peek), monopolizing the rate
  budget and stalling live polling via the re-entrancy guard. It is also the **deeper** cause of the
  2026-06-12 cross-match lock leak above: "the server `match_id` filter is not reliably honoured" was
  really "the scalar is ignored → the response was never scoped at all", which is exactly why substitution
  events for OTHER fixtures arrived. `match_ids[]` scopes at the source.
- HOW: `matchScoped` builds its own params `{ cursor, per_page: p.perPage ?? 100, match_ids: [p.matchId] }`
  and passes them through the SAME `toQuery` array path rosters uses for `team_ids[]`/`player_ids[]`
  (`toQuery` emits `${k}[]` per array item). `playerProps` is UNCHANGED — it still scopes via the scalar
  `match_id` through the now-props-only `scoped()` helper (the one endpoint that honours it).
  `FIFAMatchLineupEntry` + the `res.data` mapping (c9e8990) are byte-untouched.
- RETAINED: the client-side `r.match_id === p.matchId` re-filter in `matchScoped` stays as
  **belt-and-suspenders** — a firehose response can never reach ingest even if server scoping ever
  regresses (defence in depth after the 2026-06-12 leak).
- KEY LEARNING: **GOAT FIFA paginated endpoints honour bracketed ARRAY filters
  (`match_ids[]`/`team_ids[]`/`player_ids[]`); SCALAR id params are silently ignored → full-dataset scan.**
  When adding a new filtered pull, use the array param and assert the built query string carries the `[]`.

## Group→playoff transition + playoff lineup mode (Phases 1+3, merged) COMPLETE ✅

**Commits:** `feat/playoff-transition` 87a7e1a→b7dc9d3 (7 commits) + `feat/playoff-lineup-mode` 706351d + 3952e62; ff-merged to `main`. 2115 tests ✓.

### Survival state — `playoff_entry` table

Dedicated `playoff_entry` table (chosen over columns-on-manager): `(id, league_id, manager_id, seed, status, eliminated_round, eliminated_at, created_at, updated_at)`, `@@unique([league_id, manager_id])`, `@@index([league_id, status])`, FKs `ON DELETE CASCADE`. Enum `PlayoffEntryStatus = alive | eliminated | champion` (row existence = field membership; `eliminated_*` NULL while alive/champion). **Row exists only for advancers** — non-advancers have no row. RLS mirrors `standing`/`pool_pick`: league-scoped authenticated SELECT, no write policies (server-only); Phase 2 flips `status`, Phase 4 reads it. Added to the `supabase_realtime` publication (guarded `ADD-TABLE` idiom) so Phase 4's subscription isn't silently empty (Theme F trap). Migration verified on throwaway PG under a uuid-returning `auth.uid()` (sub::uuid cast), RLS self-tests green, drift-clean.

### `knockout_round` PeriodKind + validator anchor

`knockout_round` is a pre-existing `PeriodKind` value (not added/migrated). Both the lineup validator and the transition anchor on the string literal `"knockout_round"` checked against the `PeriodKind` type — a value rename breaks at compile time, closing the silent-switch class. (`KNOCKOUT_PERIOD_KIND` is **not** a separate named export; the check reads `period.kind === "knockout_round"` typed as `PeriodKind`.)

### Cut-schedule rule (canonical, now implemented)

Distribute `field − 1` eliminations across the 5 WC knockout rounds (R32→R16→QF→SF→Final), **front-loaded** (non-increasing), each ≥ 1. Deterministic: `base = ⌊(field−1)/5⌋`, remainder `r = (field−1) mod 5`; the first `r` rounds cut `base + 1`, the rest cut `base`. Because `field ≥ 6 ⇒ base ≥ 1`, every round cuts at least one. Pure `cutScheduleFor` in `packages/recompute/src/transition.ts`, exhaustively tested fields 6–40. **Locked examples:** 6→{1,1,1,1,1}, 8→{2,2,1,1,1}, 10→{2,2,2,2,1}, 12→{3,2,2,2,2}. **This supersedes the design handoff's illustrative 6-round cut-schedule preset** — that preset is retired; the derivation rule above is the single source of truth. (Theme C's existing field-size sequences already match this rule.)

### The transition job (`commish:transition`)

`commish:transition --as <email> --field <n> --reason <text> [--apply]` (dry-run default; `--apply` is the boolean flag). Dry-run prints: field + seeds, cut schedule, release/trim plan, and a `standings: FINAL ✓ / ⚠ NOT FINAL` line — mutates nothing. `--apply` runs ONE `$transaction`:

0. Conditional `league.status` `group→playoff` claim; 0 rows ⇒ abort (idempotent, belt-and-suspenders with the orchestrator skip).
1. Write `cut_count` onto the 5 knockout periods (upsert by `(league, label)` — they pre-exist from provisioning).
2. One `alive` `playoff_entry` per top-N seeded manager.
3. Release non-advancers' active rosters → FAAB pool (`droppedAt = now`). **FAAB budgets are NOT reset — the one-time tournament allowance carries forward (2026-06-28 correction; the prior "reset to a fresh $100" step was removed).** **Stale-surface RESOLVED (2026-07-01, FAAB-COPY-P1, `fix/faab-copy-reset-strings` `4e98f1d`):** the UI strings now match this decision — `/playoffs` `ReinforceModule` + `PLAYOFF_EXPLAINER` (and the sibling `/waivers`, dashboard, and marketing-landing copy) were rewritten to the carry-forward rule (one $100 for the whole tournament, group spend carries into the playoffs, never reset); the misnomer `FAAB_RESET` local was renamed `FAAB_TOURNAMENT_BUDGET`. Copy-only, no engine change. See BACKLOG → FAAB-COPY-P1 (DONE) + PROJECT → 2026-07-01.
4. Two-phase waiver carry-forward (NULL everyone first, then assign survivors `1..K` — respects the non-deferrable unique; eliminated managers end NULL; no re-seed, surviving relative order preserved).

**D6 precondition:** `--apply` refuses while any `group_md` period is unfrozen (`frozen_at IS NULL`), with an explicit `--allow-incomplete-standings` override (irreversible-op guard). **Upsert-label pin:** `validateConfig` requires knockout labels to equal `KNOCKOUT_ROUNDS` exactly — a config-drift label fails loud at provision time, not silently at the irreversible transition.

### FAAB roster-cap split — `playoff_entry` existence (P3), NOT `period.kind`

The squad cap (15 group / 9 playoff) is a **league-phase property**, resolved by `rosterCapForPlayoffPhase(loadPlayoffPhaseActive(leagueId))` (the boolean cap helper in `@app/shared/src/constants.ts` + the `playoff_entry`-existence predicate in `@app/faab/prisma`), threaded to the validators as a plain number (validators stay phase-agnostic). Per CONTRACT-P3 this keys on the **data-existence playoff phase**, NOT the `league.status` field — the `rosterCapForLeagueStatus(league.status)` form was DELETED (see the P2/P3 decision block above) — and NOT the lineup mode's per-period `period.kind` axis (both axes coincide in practice — playoff phase ⟺ knockout periods). **Enforced at BOTH sites:**
- Submission validator (`validateBidSubmission` / `validateFaGrant` in `@app/faab`)
- Batch resolver (`resolveFaabBatch` in `@app/faab/resolve.ts`) — the batch site is a correctness necessity, not scope creep: submission can't catch cumulative awards (a manager at 8 stacking two no-drop bids → 10 > 9).

Group cap byte-unchanged.

### Playoff lineup mode

`validateLineup` branches on `period.kind === "knockout_round"` → enforces `PLAYOFF_ROSTER` (cap ≤9, 7 starters = 1 GK + 6 outfield). Position bounds are derived from `PLAYOFF_ROSTER` mins (each pos max = 6 − the other two mins). **Loosened to min 1 DEF / 1 MID / 1 FWD (`feat/playoff-formation-loosen`; was 2/2/1):** the complete 6-outfield shapes are now every split with ≥1 per line — the **10 shapes** 1-1-4 … 4-1-1 (the old {2-2-2, 2-3-1, 3-2-1} is a strict subset, so no saved lineup is invalidated; no migration). GK stays exactly 1; the maxes keep deriving (now 4). **There is no `FORMATIONS_PO` constant** — the set is computed at module load by the now-**exported** `playoffXIShapes()` (`packages/lineup/src/validate.ts`), the SINGLE source consumed by BOTH the validator (`canFieldPlayoffXI` / the bound check) AND the UI offer-set. **Drift-guard reality (corrected):** a true set-equality test did NOT previously exist — the set was pinned only by hardcoded `it.each` acceptance literals over a *private* enumerator. It is now REAL: `packages/lineup/src/playoffShapes.test.ts` asserts `Set(playoffXIShapes keys) == the 10` (normalized, order-independent), and the web layer (`formation.test.ts`) asserts `PLAYOFF_FORMATIONS keys == the derived set`. Group mode byte-unchanged; forfeit / lock-on-play reused, not forked.

**UI:** period-driven switch (`loadLineup` reads `period.kind` → seeds via `formationSetForKind`; `SetLineupClient` derives the offer-set; `LockHero` shows "Playoff XI · 7 starters" vs "Starting XI · 11"). `PLAYOFF_FORMATIONS` (`apps/web/src/lineup/view.ts`) is now **DERIVED from `playoffXIShapes()`** (was a hardcoded 3-shape literal, correct only at the old 2/2/1 bounds) — so picker and validator can never drift; the picker offers the fillable subset of the 10, default still `2-3-1`. `kind` is required on `PeriodLineup` (`apps/web/src/lineup/types.ts`); the package validator's `PeriodWindow.kind` stays optional (back-compat).

### ⚠️ CUT-TIMING INVARIANT (D5)

The 9-cap is a **GATE, not a DRIVER.** It blocks operating over 9; it does not pull a 15-man advancer down to 9, and the derived trim "deadline" (= the first R32 FAAB batch; no schema column) ≠ the R32 lineup lock. A survivor who never voluntarily trims is **blocked from setting an R32 lineup → forfeits** (by design — trimming is the roster decision). Safe with: (a) a clear at-lineup-attempt signal (Phase 3's `playoff-roster-cap` error), (b) runway before R32, (c) the **manager release-to-9 flow + commish force-trim backstop** shipped in the trim-down phase (below).

**Side-effect of the formation loosening (`feat/playoff-formation-loosen`) — D5 unchanged:** widening the legal shape set to 1/1/1 can only **REDUCE** release-/trim-unfillability (more squads can field a legal XI), never increase it — the old legal set ⊂ the new, so every previously-fillable squad stays fillable. The `release-unfillable` confirm gate still fires, only for an emptier end-state (an empty lane, or <6 outfield bodies — the lane max of 4 never binds because the other two lanes always supply ≥2). The cut-timing invariant itself is untouched: the 9-cap is still a gate, and a survivor who never trims still forfeits.

### ✅ Trim-down phase (BUILT) — the release-to-9 net-shed

The four seams below are CLOSED. Locked decisions:

- **(iv) Trim window structure — NO NEW PERIOD.** The trim window is **R32's pre-lock window inside `status='playoff'`** (R32 already provisioned by the transition). Two framing instants, both shown as **static timestamps** (no countdown): the **forfeit bound** = the league-wide R32 first kickoff (a deliberately CONSERVATIVE earliest-possible-per-player lock; a survivor's own earliest kickoff may be later), and the **reinforcement line** = the next FAAB batch (reuses `effectiveBatchAt`).
- **(i) Release-to-9 = an immediate, pure, DROP-ONLY mutation** (NOT a deferred batch, NOT a swap). The 9-cap is a gate that nothing pulls down — every FAAB path forces a net-zero swap (`resolve.ts` award-legality), so the net-shed had to be a new path: pure `validateRelease` + a `releaseRoster` store primitive in **`@app/faab`** (`packages/faab/src/release.ts` + `prismaStore`/`memoryStore`). Fillability rule: **hard-block below `PLAYOFF_ROSTER.starters` (7)** (could never field an XI), and a 7..cap end state that can't field a legal playoff XI is a **CONFIRM-GATED soft-warn** (`release-unfillable`) — mirroring the lineup-forfeit confirm pattern; ANY post-count in 7..cap is allowed (no forced exactly-9). The fillability check is **single-sourced** as `canFieldPlayoffXI(counts)` in `@app/lineup` (alongside `playoffBounds()`); `apps/web`'s `formationFillable` consumes the same `squadCoversFormation` primitive (no second source, no `apps/web` import from a package).
- **(iii) D4 non-advancer gate = defense-in-depth on `status==='alive'`** (not row-exists — Phase-2 forward-compat). `participant = (league.status !== 'playoff') || alivePlayoffEntryExists`. Three layers: the submission validators (`isPlayoffParticipant` flag + a `notParticipant` rule), the resolver backstop (`participantManagerIds` voids+refunds any non-participant bid that reaches the batch), and the UI (`WaiversView.isParticipant` hides bid/FA/release affordances). **INERT in the group phase** — everyone participates → group flows byte-identical. The release route applies the same gate. **⚠️ Audit F-P0-01 (P0, fixed):** the resolver backstop was real but DEAD on the production batch path — `runFaabBatch` (the controller `loadBatchContext` → `resolveFaabBatch` → `commitBatch` orchestration) built the resolver input WITHOUT `participantManagerIds`, and the field being optional meant the omission type-checked while `undefined != null` left `nonParticipant` permanently false. Dormant in the group phase (the set is `null` regardless) but live at the group→playoff cutover, where a pre-cutover pending bid from an eliminated manager would resolve normally and could out-bid a survivor. The submission/FA/release validators were already gated (synchronous, at the handler boundary), so this was unique to the async batch path. **Fix = thread `ctx.participantManagerIds` into the `resolveFaabBatch(...)` call** (one line; resolver/store/load untouched), now covered by a **controller-level regression test** (`controller.test.ts` D4 block: eliminated bid voided+refunded + does-not-win, alive control wins; group-null + both-alive no-op controls) and a **dispatch-level** one (`apps/worker/.../dispatch.test.ts`) proving it end-to-end through the worker tick — closing the F-P2-01 gap (the gate had only pure-resolver coverage, never the controller boundary).
- **(ii) Commish force-trim = a DEDICATED `commish:trim`** (NOT `commish:roster`, which is irreducibly add-centric). It imports the SAME `releaseRoster(..., {allowLocked})` primitive — no new store port, no release logic in the CLI. `--drop <csv> | --keep <csv>` (keep ⇒ drop the complement), `--reason` required, dry-run default, `--allow-locked-slot` → the `app.commish_override` GUC (release a played player's locked slot); a `--report`/no-target mode lists survivors over cap and NEVER auto-cuts (the cut choice is the operator's). Runs from the **local Mac** (`apps/worker`), not the Render shell (Render prunes `tsx`).

**Lock model (critical):** faab never reads `locked_at` — it delegates to `@app/lineup/prisma`'s `findLockedSlotPlayerIds` (status-scoped: a `locked_at IS NOT NULL` slot in a non-`closed` period). During the R32 pre-kickoff window that set is ∅ → every survivor droppable; once an R32 player has played, he is in the set and un-droppable (manager path) until the commish `--allow-locked-slot` GUC path. The manager `releaseRoster` releases only UNLOCKED slots and **fails loud** (`ReleaseStaleLockError`, transaction aborted) if any dropped player is left with a still-locked slot — a stale-lock TOCTOU is never silently swallowed.

## Playoff per-round cut application (`commish:advance`) — Phase 2 ✅ (BUILT, merge HELD)

The WRITE side of the guillotine ladder: applying each knockout round's cut. Sits AFTER the transition (which seeds the `alive` field + each round's `cut_count`) and reuses the untouched pure `selectGuillotineCuts`. Built on `feat/playoff-round-application` (commits A→B→C→brain). **No DB migration** — the `playoff_entry` status lifecycle uses existing columns; the only schema-adjacent change is widening the `AuditRecord.command` TS union with `"advance"` (mirrors how `"trim"` was added).

### Cadence — a commissioner CLI, dry-run-first, per round (NOT automatic)
`commish:advance --as <email> --round <R32|R16|QF|SF|Final> --reason <text> [--break-tie <labels>] [--allow-incomplete] [--apply]`. Dry-run default (prints the plan, mutates nothing); `--apply` runs the IRREVERSIBLE cut. Rationale: the adjudication tie inherently needs a commissioner, and this is consistent with "commissioner owns irreversible ops" (same shape as `commish:transition`/`commish:trim`). Run from the local Mac (`apps/worker`), not the Render shell.

### The resolution glue — `resolveRoundCut` (pure, `@app/recompute`)
`packages/recompute/src/playoffRound.ts` is the glue ABOVE `selectGuillotineCuts` (which it does NOT reimplement). Given the alive round scores + cumulative totals + `cut_count` it returns `determined` / `needsCommissioner` / `invalid-tiebreak`. `championAfterCut(aliveIds, eliminated)` is the lone-survivor predicate. **`--break-tie` adjudication never touches the selector's math:** it re-invokes `selectGuillotineCuts` with the named managers' cumulative totals sunk below all (and the spared tied managers' raised above), so the selector deterministically cuts exactly `(the already-determined cuts) ∪ (the named)`. Validated: named ⊆ `tied`, count == `cutsRemaining`; never an auto-cut.

### The application (atomic, idempotent, frozen-gated)
The orchestrator `runRoundAdvance` (`apps/worker/src/commish/advance.ts`) + the store `applyRoundCut` (`advanceStore.ts`) apply the resolved cut in ONE `$transaction`: flip each eliminated manager `alive → eliminated` (+ `eliminated_round = <label>`, `eliminated_at = now`), then if exactly ONE `alive` remains flip it `alive → champion`. Guards (in front, in the orchestrator): commissioner gate, required reason, real round label, **frozen precondition** (`period.frozen_at` set — overridable with `--allow-incomplete`, the irreversible-op escape hatch mirroring the transition's `--allow-incomplete-standings`), an **ordering guard** (earlier knockout rounds must be cut first, so the alive set is current), and cheap **champion/schedule sanity checks** (a lone survivor must coincide with the Final; the Final must resolve to exactly one). The store's FIRST statement is the conditional `alive → eliminated` claim — 0 rows ⇒ a prior run already cut this round ⇒ no-op (the same idempotency shape as the transition's status claim).

### Idempotency signal — migration-free
"This round already cut" = ≥1 `playoff_entry` stamped `eliminated_round == <round label>` (every round cuts ≥ 1, so the mark always exists). The orchestrator skips a re-run; the store's conditional claim is the atomic backstop. **No idempotency column was needed** (the STOP-and-flag check passed — no migration).

### Audit
One `commish-override` audit line per applied cut (per eliminated manager, `action: "eliminated"`) + one for the champion flip (`action: "champion"`), each carrying the `round`, `reason`, and `tieAdjudicated` flag. Reuses `formatAudit` (structured stdout, no table).

### Scope (what this phase does NOT do)
Status lifecycle only (`alive → eliminated`, `alive → champion`). It does NOT trim rosters, touch FAAB (the D4 gate keys on `status==='alive'` so an `eliminated`/`champion` flip auto-removes them — a champion has 0 `alive` entries so FAAB naturally competes nobody), recompute scores (it READS `score_manager_period`), or flip `league.status`. **⚠️ Seam (open — routing not yet decided):** the `league.status` `playoff → complete` flip is still deferred. The next thread's design step must first resolve: (a) does the UI derive "tournament complete" from the champion `playoff_entry` row existing (preferred — single source of truth, no write, no drift), or does it keep `league.status` as the phase source? If (b) is chosen, the `playoff → complete` flip is a WRITE belonging in the commish/application layer — folded into the champion `$transaction` in `applyRoundCut`, or a dedicated commish step — **not** in the read-only `loadPlayoffs` loader / UI thread. Either way: functionally harmless while deferred (a champion league has 0 `alive` entries, so the FAAB gate and standings logic already exclude them).

### `loadPlayoffs` read contract — ✅ IMPLEMENTED (`feat/playoff-loader`, merge HELD); SCREENS still next
The playoff view-model the UI loader assembles (drawn from `design/design_reference/playoffs/data.jsx` `buildGuillotine`). **Now IMPLEMENTED by the loader (`feat/playoff-loader`): the pure `buildPlayoffsView` (`packages/recompute/src/playoffsView.ts`, mirroring the write-side `resolveRoundCut`) + the thin read-only `loadPlayoffs` edge (`apps/web/app/playoffs/loadPlayoffs.ts`). Only the SCREENS remain.** See **ARCHITECTURE.md §21** for the full shape + the flagged refinements. Key points: per-round `{ status: past|live|future, fieldCount, cutCount, survives, ranked: [{ managerId, seed, points, rank, safe|zone|eliminated }], survivors, eliminatedIds }`; the seeds + `seedOf`; the **live/provisional cut line** (computed by reusing `resolveRoundCut` — the SAME pure decision the apply orchestrator calls, which reuses `selectGuillotineCuts` verbatim — so the live "facing the blade" zone matches the eventual cut, with an unbroken boundary tie surfacing the whole tied set); the viewer's reduced-lineup reference; and the FAAB reinforcement state. The applied (`past`) rounds read straight from `playoff_entry` (`status`/`eliminated_round`); the `live` round is derived (provisional) and the `future` rounds are skeletons (cut counts from `period.cut_count`). **Flagged additive refinements** (the loader, not the contract, is authoritative now): `totalRounds` = count of present knockout periods (field-size-flexible, "(5)" is the max); `me` is a `RankedRow` superset (state may be `eliminated` when complete); ADDED `champion`/`complete` (derived read-only — every round cut + a `champion` entry; the loader NEVER reads or writes `league.status`, so the `playoff → complete` routing below stays OPEN for the SCREENS thread); `reducedLineup`/`reinforcement` realized by threading the existing `loadLineup`/`loadWaivers` reads.

## Playoff theater SCREEN — ✅ SHIPPED (`feat/playoff-theater`, merge HELD)

The live `/playoffs` route — the READ/PRESENTATION layer over `loadPlayoffs` (ARCHITECTURE.md §21 → Theater SCREEN). It consumes the read-model and reuses the vsfield Realtime pattern; it does not touch the engine. Decisions locked this thread:

- **Route gate = data-existence, NOT `league.status`.** The web never reads `league.status` (a worker concern). The page gates on `getSessionManager`, then `loadPlayoffs` → null = the pre-playoff state, else the client — equivalent to "playoff/complete" because the knockout ladder + seeded field exist ONLY post-transition. Reuses the established `loadVsField`/`loadPool` idiom (the prompt's "gate on league.status" wording is satisfied by this equivalent, codebase-consistent gate). The `league.status → complete` routing (the open seam above) STAYS open + unused — the screen derives "complete" from the champion `playoff_entry` row (the preferred single-source option (a)), writing nothing.
- **SCOPED read-model exception — the names map.** The screen needs field-wide manager NAMES (survivor rows + guillotined avatars); `PlayoffsViewCore`/`buildPlayoffsView` are name-free (keyed by managerId). Resolution (commissioner-confirmed Option 2): a server-composed `managerNames: Record<managerId,name>` attached in the `loadPlayoffs` LOADER edge (a `manager.findMany`) — NOT in `@app/recompute` (byte-untouched) and NOT a browser-direct read (Theme F). The exception is confined to `loadPlayoffs.ts` + the composed `apps/web` `PlayoffsView` type + its contract test. Both the SSR load and the `GET /api/playoffs` refetch attach it identically.
- **Unfiltered Realtime bindings (the scope/Theme-F call).** The browser subscribes to `score_manager_period` + `playoff_entry` ONLY, BOTH **unfiltered**. `score_manager_period` has no `league_id`; `playoff_entry`'s `league_id` filter would require a `leagueId` on the snapshot — deliberately NOT added (names is the SOLE read-model change). The single permanent league (ARCHITECTURE §4) + both tables' RLS SELECT policies scope delivery in effect, and settled periods don't change, so in practice only the live round's writes nudge a refetch. `standing` is NOT subscribed (frozen at the transition). **TODO(confirm):** attach `leagueId` (+ `currentRoundPeriodId` for precise live-round score scoping, the vsfield `currentPeriod.id` analog) and filter precisely only if the single-league invariant is ever relaxed.
- **Reduced-pitch live state.** The viewer's reduced XI renders the server-composed lock (`locks` ∪ `slotMeta.hasPlayed`) + points (`slotMeta.pointsAtStake`) from the threaded `reducedLineup` — recomposed per refetch, no browser-direct read. The design's per-node **live(playing) split is dropped**: `SlotMeta` carries only `{hasPlayed, pointsAtStake}` (the "playing now" split is the vs-the-field surface, out of the @app/lineup loader's scope), so a node reads movable ("—") vs locked/played (banked pts) — fact-wins-over-flourish (design/CLAUDE.md §1). A per-player live flag would be a loader/recompute change (out of this thread's scope).
- **Post-deploy gate.** The Realtime BROWSER delivery (JWT-authed `postgres_changes` actually arriving) is verified ONLY on a real deploy — Node/jsdom green proves the controller's pure logic, not live delivery. Sergio merges → pushes → triggers the Render deploy → confirms the live ConnPill + cut-line movement in the browser.
- **Pre-merge gate now includes `pnpm --filter @app/web build`** for any web/CSS thread. The merged Node gate (typecheck/lint/format:check/test) does NOT run `next build`, so CSS-loader/postcss errors (e.g. a `*/` token inside a CSS comment prematurely closing the block) stay invisible until the Render web deploy. Run the full gate WITH `next build` before holding a web/CSS thread for merge. [skip render]

## Tournament end leaves `league.status='playoff'` — never `complete` (Phase B, 2026-06-16)

**Decision: at tournament end (Final full-time + a `champion` `playoff_entry`), `league.status` STAYS `'playoff'`. Nothing writes `'complete'`.** This resolves the open `playoff → complete` routing seam flagged twice above — in *Playoff per-round cut application — Phase 2* (Scope: "routing not yet decided") and reaffirmed in *Playoff theater SCREEN* (route gate). The chosen branch is option (a): **"tournament complete" is DERIVED read-only from the champion `playoff_entry` row** (the `PlayoffsView`/dashboard `complete` arm); the status column is never flipped. No code change — this is the docs ratification of a settled decision.

### Why not write `'complete'` — nothing writes it (the one read is inert), and writing it has a broad blast radius

**Nothing WRITES `league.status = 'complete'`, and the single place that READS it is inert.** The only `status: "complete"` *writes* in the tree are on child entities — `draft.status` (`packages/draft/src/prismaStore.ts:120`) and `faabBatch.status` (`packages/faab/src/prismaStore.ts:301`) — neither is `league`; the `status: "complete"` *read* on the waivers path filters a child row too (`apps/web/app/waivers/loadWaivers.ts:220`, `where: { leagueId, status: "complete" }`, a cleared-batch lookup). The ONLY `league.status === 'complete'` read anywhere is the group→playoff transition's idempotency guard (`apps/worker/src/commish/transition.ts:193`, `leagueStatus === 'playoff' || leagueStatus === 'complete'` → "already in the … phase, nothing to do") — it lumps `'complete'` with `'playoff'` as a no-op skip, so it neither depends on `'complete'` ever being set nor changes behavior because it never is. No live FAAB/cap/cadence path keys behavior on `'complete'`.

Writing `'complete'` would FIX NOTHING. **Post-CONTRACT-P3 the FAAB cap + participant gates are ROBUST to it** — they derive from `playoff_entry` existence, not `league.status`: the cap stays 9 (`rosterCapForPlayoffPhase`; `rosterCapForLeagueStatus` is deleted), and the resolver participant filter, `listOverCapPlayoffSurvivors`, and the release phase gate (`loadReleaseContext`'s `isPlayoffPhase`) all key on `loadPlayoffPhaseActive`, so none of them flips. The ONE residual effect is the worker batch CADENCE selector (`apps/worker/src/faab/prismaStore.ts:23` — `league: { status: { in: ["group", "playoff"] } }`), which would DROP a `'complete'` league from future batches — harmless post-tournament (scoring is over), but it is the remaining reason the status is deliberately held at `'playoff'`.

### Post-tournament FAAB safety map (with status held at `'playoff'`)

- **FA grant: FULLY SHUT.** `resolveAddPeriodWindow` (`packages/faab/src/prismaStore.ts:485-504`) → `null` (no `scheduled|in_progress` fixture remains) → `acquisitionWindowState` (`packages/faab/src/window.ts:30-34`) → `"sealed-bid"` → `validateFaGrant` rule (1) (`packages/faab/src/validate.ts:142-157`, the `windowState !== "free-agency"` check at L150) → `faWindowClosed` / 409. `claimFreeAgent` (`packages/faab/src/prismaStore.ts:613-669`) double-guards: `T === null` → `FaConflict` (L633). No mutation.
- **Bid submit: ACCEPTED-BUT-INERT.** `periodFirstKickoff` (`packages/faab/src/prismaStore.ts:73-91`) → `null` → `acquisitionCutoffAt: null` → the cutoff guard (`packages/faab/src/validate.ts:96-98`, `acquisitionCutoffAt !== null && …`) is SKIPPED → an alive participant's unowned-player bid gets 200 + a pending row (`faabGate`, `apps/web/src/faab/gate.ts`, is identity-only). It NEVER executes in normal operation: the ONLY two writes to `batch_cleared_at` in the tree are both the runtime cadence batch (`packages/faab/src/prismaStore.ts:223-224` + the worker `apps/worker/src/faab/prismaStore.ts:49-50` `stampBatchCleared`) — there is no transition-seeded clear (`apps/worker/src/commish/transitionStore.ts:79` merely READS `r32.batchClearedAt` into the transition context, it does not write `batch_cleared_at`), and `selectPeriodsToClear` (`apps/worker/src/faab/selectors.ts:37`) skips already-cleared periods.
- **Release: OPEN, drop-only, benign.** `handleRelease` (`apps/web/src/faab/handleRelease.ts:72-80`) gates on `ctx.isPlayoffPhase` = `(status === 'playoff')` (`packages/faab/src/prismaStore.ts:721`) → since status stays `'playoff'`, release stays OPEN; it is a pure DROP-ONLY mutation (no add, no budget change).

### Known residual (ACCEPTED, not a bug)

A post-tournament bid returns a misleading **200 + pending row**. IF a period ever lingered uncleared (a worker-outage class of event), the worker — status still `'playoff'`, `batch_cleared_at IS NULL` — would clear it on resume and EXECUTE the bid. This has **no competitive effect**: scoring is over, so it is a phantom budget debit / roster swap on a dead league. The contained fix, IF ever wanted, is a single tournament-over guard on the bid-submit handler reusing the read-model's existing tournament-over predicate (Final period + closed + a `champion` `playoff_entry`, per the `PlayoffsView`/dashboard `complete` arm). **DEFERRED** — declined now because adding a tournament-over predicate to LIVE code risks mis-firing and shutting FAAB DURING live play, which is worse than the consequence-free residual it prevents.

**Evidence.** `vitest run packages/faab apps/worker/src/faab apps/web/src/faab` → **204 passed, 5 skipped** (12 files passed + 1 skipped; the skipped suite is the env-gated `packages/faab/src/release.integration.test.ts`). [In this monorepo `pnpm exec vitest …` trips pnpm's recursive-exec wrapper — run the root `"test": "vitest run"` binary directly.] [skip render]

## VAR-overturned goals no longer inflate goals-conceded (Route A + reconciliation guard, 2026-06-17)

**The bug.** `score_player_match` over-charged goals conceded on any match with VAR activity. Two
defects on the event-derived conceded path in `packages/recompute/src/adapter.ts`:
1. **VAR-substring.** `isGoalEvent` tested `label(e).includes("goal")`, where `label =
   incident_type + incident_class`. That matched `varDecision` rows whose class merely CONTAINS
   "goal" — `goalAwarded`, `goalNotAwarded`, `vip_for_goal` — so every VAR review around a goal was
   counted as an extra conceded goal.
2. **Disallowed goals stayed counted.** The feed leaves a VAR-disallowed goal's `goal/*` row in
   place (`rescinded=false`); the only overturn signal is a sibling `varDecision/goalNotAwarded`.
   Nothing read it, so a chalked-off goal still conceded.

Reference (live GOAT data): **Argentina 3-0 Algeria** — Chaïbi's min-8 goal (`goal/regular`) was
awarded (`varDecision/goalAwarded` min-8) then disallowed (`varDecision/goalNotAwarded` min-9);
`away_score` ended **0**. The old engine charged Argentina's keeper **3** conceded (the goal row +
both varDecision rows) and wiped his clean sheet. Correct answer: **0 conceded, clean sheet +4**.

**The fix (Route A — derive the truth from the event list).**
- `isGoalEvent` keys on `incident_type` EXACTLY (`norm(incident_type) === "goal"`); real goals are
  always `goal/{regular,penalty,ownGoal}`, so VAR rows are no longer goals.
- `overturnedGoals` pairs each `varDecision/goalNotAwarded` to the nearest not-yet-voided same-player
  goal within **≤3 effective minutes** (one void cancels one goal); `goalAwarded` / `vip_for_goal`
  and every other VAR class are ignored. `goalsConcededWhileOn` skips rescinded **or** overturned
  goals. Goal CREDIT (§3, stat-based) and `teamGoalsAgainst` (the match score, already VAR-correct)
  were untouched — only the event-derived conceded path changed. No §1–§8 value moved.

**Why Route A over trusting a flag:** the feed does not set `rescinded` on a VAR-disallowed goal, so
there is no per-row truth to read — the event list is the only source. To catch any VAR shape we did
not model, a **reconciliation invariant** rides alongside: for each team the count of non-overturned
conceded `goal` events MUST equal `teamGoalsAgainst`. Tests assert equality; at runtime
`buildScoreInput` `console.warn`s (`matchId` + both counts) on divergence and **never throws** — live
scoring continues on the windowed non-overturned count, just flagged. `reconcileConceded` is the pure
helper, and `buildScoreInput` only warns when the comparison is even COMPUTABLE:
`reconciliationApplies` gates it to (a) team-in-match, (b) a KNOWN final score (home/away are NULL
early-live, where the event count legitimately leads the not-yet-ingested score), and (c) a
resolvable scorer team for every standing goal (`player.team_id` is patchy). Without that gate the
per-player warn would FLOOD on ordinary live data — a defect caught by the adversarial-review pass;
with it, only a genuine VAR-shape mismatch on a settled, fully-attributed match warns.
`MatchTeamContext.matchId` (a new OPTIONAL field) is populated by `prismaStore.getPlayerMatchInput`,
so the warn names the fixture.

**Residual (accepted; spec-pinned heuristic).** The overturn pairing IS the spec's chosen rule —
nearest same-`playerId` goal within **≤3 effective minutes**, one void per goal. If the live feed ever
stamps a `goalNotAwarded` >3 effMinute from its goal, attaches it to a different/empty `playerId`, or
emits it with no goal row, the pairing misses; the reconciliation guard flags the divergent ones
(→ `ok=false` → warn). One silent corner remains: an equidistant same-scorer tie can void the wrong
goal while the whole-match count still matches the score (no warn). Widening the window or changing
the pairing key is a one-line follow-up IF live data shows it's needed — surfaced for clearance, not
silently changed.

**Deploy / restate.** An adapter change behaves like a `scorePlayerMatch` change for restatement —
`job:recompute` (`forcedRestate`) only re-sums rollups and never re-runs the adapter, so it is
INSUFFICIENT. Restating already-scored VAR matches is the standard **RE-DIRTY → SWEEP**: AFTER the
code deploys, `UPDATE stat_player_match SET dirty = true WHERE match_id IN (…VAR-affected matches…);`
the ~60s `runRecomputeSweep` re-derives `score_player_match` through the new adapter and cascades to
manager-period + standings. Full gate green (2317 passing). `feat/fix-var-conceded`, merge HELD for
Chat clearance. `[skip render]`

## Card classifier keys on incident_type EXACTLY (sibling of the isGoalEvent / conceded fix, 2026-06-19)

**The change.** `classifyCard` (`packages/recompute/src/adapter.ts`) no longer substring-matches the
combined `label(e)` (= `incident_type` + `incident_class`). It now keys on `incident_type` EXACTLY —
the same exact-gate that fixed `isGoalEvent` and the VAR-conceded path directly above:
1. `if (norm(incidentType) !== "card") return null;` — non-card types never enter.
2. discriminate `norm(incidentClass)` by **exact equality**: `red` → red, `yellow` → yellow, else null.
The old `label(e).includes(...)` admission and the `(yellow && red)` second-yellow heuristic are gone.

**Why it was correct only by luck before.** A live `varDecision/cardUpgrade` row cleared the old
`includes("card")` admission (its class contains "card") yet matched no colour branch, so it fell
through to `null`. So the old code already excluded cardUpgrade — but a future upgrade label carrying a
colour token (a hypothetical `varDecision/red`) would have minted a **phantom red** beside the real
card it annotates. The exact `incident_type === 'card'` gate immunises against that.

**Live data — exclusion is correct, change is byte-identical (no sweep).** 3 `varDecision/cardUpgrade`
rows across 2 matches (MD1 `4358…`, MD2 `5f6c…`), each **paired to a materialised `card/red`** that
already scored the red — all correctly scored *pre-fix*. Excluding the cardUpgrade annotation is correct
**because the feed carries the upgrade on a real card row** (it replaces, it does not append a separate
scorable row). Verified **byte-identical across the full 18-pair `incident_type`×`incident_class`
vocabulary** (Q4 2026-06-19, zero flips on live rows). Therefore **NO data remediation**: stored
`score_player_match` breakdowns are already correct — do **not** mark `stat_player_match` dirty and do
**not** run a sweep. The change only immunises future rows.

**Two follow-ups recorded as watch-items (NOT fixed here):**
- **(a) Two-yellow banding is an unbuilt cross-row aggregation gap.** The feed has **no second-yellow
  class token** (Q4: classes are only `red` / `yellow`); a two-yellow dismissal surfaces as two
  separate `card/yellow` rows. Per-row classification cannot detect it, so `classifyCard` no longer
  mints `second_yellow` (the dead branch was dropped; `CardKind` keeps the member, still read by
  `onPitchWindow`/`cardsFor`). Today such a dismissal scores only the single yellow **−1**, under-counting
  the correct −1 + second-yellow band. The correct fix is pairing two `card/yellow` rows for the same
  (player, match) in the **discipline aggregation**, a separate thread — see the SEAM comment in
  `classifyCard` and ARCHITECTURE.md §7 / Appendix A.
- **(b) cardUpgrade coexisting with a still-present `card/yellow` for the same offence would
  double-count.** Not present today — the feed **replaces** (materialises the upgraded `card/red`), it
  does not append. If that ever changes, the pre-upgrade yellow + the upgraded red would both score.

Engine-only; `pnpm typecheck && lint && format:check && test` green. `feat/card-classifier-exact` — the
engine (code) commit is the push tip (the docs commit is `[skip render]`) so the worker redeploys.

## Merge policy — hold by default, user owns the merge; contained work delegable by explicit preauthorization (2026-06-19)

**The change.** The three-role workflow's prior default — *Claude Code merges
autonomously on green gates for contained changes* — is RETIRED. New default:
once a feature reaches a fully green DoD gate (typecheck, lint, format, build,
tests) WITH implementation + tests + docs delivered, Code **holds** and waits
for the user's merge decision. Merge authority sits with the user by default.

**The carve-out (intent unchanged, now explicit).** The user OWNS the merge on
all high-risk / critical changes — resolver, purity, migration, shared-validator,
and anything touching live scoring or production data — these ALWAYS hold. For
*simple, contained* changes the user may **preempt** and explicitly authorize Code
to commit, `--ff-only` merge, push, and deploy on green. Absent that explicit
authorization, Code holds. Principle: strategic delegation — hand Code the merge
when it clearly saves a round-trip; hold when the blast radius isn't obvious.

**Why.** The old auto-merge-on-green default put contained changes through before
the user had eyes on them. Flipping the default to hold keeps the user in the loop
without adding friction for the cases that matter, while still allowing fast-path
delegation when the user calls for it.

**Operational home.** Repo-root **CLAUDE.md** (§ Definition of Done / Merge Policy)
is the quick-reference; this entry is the rationale record. CLAUDE.md also pins the
worktree, TDD/testing, documentation, and output conventions. Docs-only; `[skip render]`.

---

## Claude Code tooling layer — hooks, skills, auditor subagent (2026-06-19)

**Decision.** Adopt a three-tier automation model in `.claude/`: deterministic hooks
for must-always rules, explicit skills for ergonomic gate runs, and a read-only
subagent for audit work. Auto-invocation never drives a side-effectful action.

**What shipped.**
- `.claude/skills/gate/SKILL.md` — explicit-only `/gate` (`disable-model-invocation: true`); runs the full DoD gate (typecheck → lint → format:check → test, +build for web threads); holds merge by default.
- `.claude/skills/braindocs/SKILL.md` — model-invocable `/braindocs`; updates the four brain docs with cross-refs; outputs diffs only, never pushes.
- `.claude/agents/auditor.md` — read-only auditor subagent (tools: Read/Grep/Glob, model: opus); traces one lane per invocation, reports P0–P3 findings with path:line.
- `.claude/hooks/guard-git.sh` — `PreToolUse(Bash)` hook; blocks `--force` / `--force-with-lease` / `-f` pushes deterministically; exit 2 = block.
- `.claude/settings.json` — wires the two hooks (`PreToolUse(Bash)` → guard-git, `Stop` → background typecheck).
- `CLAUDE.md §Tooling` — quick-reference for all five surfaces.

**Rationale.** Determinism matched to stakes: hooks enforce invariants that must NEVER break (no-force-push), skills handle things that are useful but don't need to run on every action, the subagent keeps audit work read-only and scoped. The Stop typecheck is informational only (`|| true`), never blocking.

**Supersedes.** Nothing; this is additive tooling config only. No app logic, no migration, no scoring change.

**Auditor P2/P3 findings parked.** The 2026-06-19 auditor run surfaced two findings — P2 (`loadWaivers.ts` + `prismaStore.ts:678` read `league.status` violating the data-existence phase contract; see ARCHITECTURE.md §21 KNOWN-EXCEPTION) and P3 (no switch+never exhaustiveness on `league.status`; `"complete"` is a dead branch). Both are parked for their own clearance-required threads; neither is fixed inline here. Decision: scope isolation + live-FAAB caution (the waivers/FAAB path is live and the risk of an inline fix outweighs the drift).

---

## Pool leaderboard → manager picks drill-in = reveal-gate reuse, no new read path (2026-06-20)

**Decision.** The `/pool` "tap a leaderboard manager → see their picks" drill-in (`feat/pool-manager-picks`, merged `f9ae476`) is a **pure re-projection of the already-gated `PoolView`** — it introduces **no new read path**. Opening the panel does not fetch, query, or hit `/api`; it derives entirely from the props the server already handed down.

**Why it cannot leak pre-kickoff picks.** The anti-copying reveal gate is **inherited, not re-implemented**. Every per-manager prediction in `PoolView` already lives in two server-built fields: `fixture.myPick` (the viewer's own — always revealed) and `fixture.others[*]` (other managers' picks the server chose to reveal — ONLY for matches past kickoff, via the Prompt-40 §3 `store.readVisiblePicks` gated read that `loadPool` is built solely from). The pure `selectManagerPicks(view, managerId)` (`apps/web/src/pool/managerPicks.ts`) reads only those two fields, so a not-yet-kicked-off pick of **another** manager is simply absent from `fixture.others` and can never appear in the panel.

**Self vs others = viewer identity, not the leaderboard flag.** `isViewer = (managerId === view.managerId)` is the SINGLE source of truth for BOTH the data branch (`myPick` vs `others`) AND the displayed `isMe` / panel title — so the picks shown can never diverge from whose name labels them. The leaderboard row supplies only the display name (`nameOf`, left-joined so every member resolves). The viewer's own pre-kickoff picks ARE shown (you may see your own predictions before lock); everyone else's are gate-withheld.

**Scope.** READ-ONLY, pool-surface only (`apps/web/src/pool/*`): pure `selectManagerPicks` + `ManagerPicksView`/`ManagerPickRow` (chronological revealed rows, settled-only `outcome` grading) + the `components.tsx` panel + `PoolClient.tsx` wiring + `pool.css`. No engine/schema/migration/RLS/`/api`/scoring change. The drill-in also surfaces the **Completed archive** (unlike `poolLive.flattenPickFixtures`, which omits completed). Tests: `managerPicks.test.ts` (gate inheritance — other-manager pre-kickoff absent, self pre-kickoff present, grading, chronology) + `ManagerPicks.test.tsx` (RTL panel) + `poolContracts.test.ts`. **2415 passed | 21 skipped.** See PROJECT.md (2026-06-20 entry).

## 2026-06-20 — Waivers FA picker shows each free agent's next opponent (opponent-threading reuse)

**Decision: the free-agent picker's "next opponent" tag is the SAME derivation as set-lineup's `OpponentTag`, reused read-only — never re-derived.** `loadWaivers` (`apps/web/app/waivers/loadWaivers.ts`) imports the pure `resolveOpponentByPlayer` from the set-lineup view (`apps/web/src/lineup/view.ts`, exported Prompt 53 / T8) and threads the resolved `OpponentInfo` (also imported from `apps/web/src/lineup/types`, re-exported through `waivers/types.ts`) onto the free-agent pool only — the lone picker surface that renders it. Each FA's opponent ("vs/@ + flag + name") renders via a new `OpponentLine` in `components.tsx`, reusing the sole `<NationFlag>` flag surface; **null → "TBD"** when the player's team has no still-acquirable fixture this period (eliminated / knockout side undecided), never a broken glyph.

**Why reuse, not a parallel resolver.** The waivers loader already builds per-team next-kickoff from `fifaMatch.findMany({ status: { in: ["scheduled","in_progress"] } })`. The opponent is reshaped from the **same** `upcomingMatches` rows into the helper's `PeriodMatch` contract (ISO kickoff + the newly-selected `homeTeam.name` / `awayTeam.name`), and `resolveOpponentByPlayer` uses the **same earliest-kickoff tie-break** as the cutoff clock — so a free agent's lock deadline and his displayed opponent always reference one and the same fixture and can never diverge. A second resolver would risk exactly that drift.

**Scope.** Waivers-surface only, additive: `loadWaivers.ts` (one `import`, two team-name selects, a `periodMatches` reshape, one `resolveOpponentByPlayer` call, opponent attached onto free agents), `waivers/types.ts` (optional `opponent?: OpponentInfo | null` on `WvPlayer` + the type re-export), `components.tsx` (`OpponentLine` + one render in `FaPickRow`), `waivers.css` (`.wv-fa-opp` ellipsis line). **Does NOT touch the `league.status` phase-gating, the FAAB engine, RLS, `/api`, schema/migration, or scoring/recompute.** Tests: `freeAgentOpponent.test.tsx` (jsdom mount of the real `FreeAgentPanel` — vs/@/TBD render proof) + `opponentWiring.test.ts` (pure-Node source-contract smoke for the loader thread, since `loadWaivers` needs a live DB). **2426 passed | 21 skipped**, `@app/web` build green. Shipped `6776212` on `main`. See PROJECT.md (2026-06-20 entry).

**Tracked P3 (inherited, deferred).** A null `fifa_team.name` would surface a raw team UUID instead of a name: `resolveOpponentByPlayer` falls back `opponentName: m.awayTeamName ?? m.awayTeamId` (`view.ts:170`). This is **inherited from the set-lineup `OpponentTag`** (the waivers reuse does not introduce it) and is fixable only once, in the shared resolver — so it is parked rather than patched on the waivers side, to preserve the single-derivation guarantee. In practice `fifa_team.name` is populated by roster ingestion, so this is a defensive edge, not an observed defect.

## 2026-06-20 — Vs-the-field H2H shows opponent + own bench (display-only sibling, engine byte-untouched)

**Decision: the live "vs the field" head-to-head now renders each manager's BENCH (the 4 non-starters) at the bottom — composed in the `loadVsField` loader as a sibling of the snapshot, never through the `@app/vsfield` engine.** The scoring engine (`buildVsField`) is built around the scoring XI and has **no bench concept**; benches are a scouting affordance, not a scored input. So the bench data is partitioned out in the apps/web loader and carried alongside the engine output — `buildVsField`'s input and output stay **byte-identical**.

**Premise correction (why a code change was needed at all).** `loadVsField` was **starters-only** — its current-period `lineup_slot` read filtered `where: { isStarter: true }`, so the bench rows were never fetched. (This is unlike `loadLineup`, which already reads the full squad for the editor.) The minimal change: **drop the `isStarter: true` filter** so ONE query returns the full current-period lineup, **select `isStarter`**, then partition in JS — starters feed `buildVsField` exactly as before (`if (!s.isStarter) continue` before the lineups-by-manager group), bench rows (`is_starter = false`) compose the new `benches` sibling. No second query, no new read path.

**Why a sibling field, not an engine change.** The engine is purity/scoring-sensitive (Theme A/B). Threading benches through it would mean a bench player could touch the scored snapshot — exactly the surface to keep clean. Instead the loader returns `VsFieldViewWithBenches = VsFieldView & { benches: ManagerBench[] }` (`apps/web/src/vsfield/benches.ts`), a **width-compatible superset**: every existing `VsFieldView` consumer (incl. `loadDashboard`, which ignores `benches`) keeps reading the same fields, and the typecheck confirms assignability. A bench entry carries **identity only** — name + nation kit (`fifa_team.name`, NEVER `player.country` — P34) + role — with NO live state / points / lock-on-play, because bench players never score.

**Scope.** Vsfield-surface only, server-side (no new Realtime / RLS / migration / `/api` shape change beyond the additive `benches` field): the pure `groupBenchesByManager` (extracted + exported like `playerPointsLookup`, ordered GK→DEF→MID→FWD for stable display), `benches.ts` (the three display types), the loader widening, plus the presentational `components.tsx` / `VsFieldClient.tsx` / `vsfield.css` and the refetch clients (`liveController.ts`, `snapshotClient.ts`) re-typed to the widened return. **`@app/vsfield` is byte-untouched.** Tests: `loadVsField.benches.test.ts` (pure partition/sort — bench-only grouping, starter rows skipped, GK→FWD order) + `Benches.test.tsx` (jsdom mount of the bench surface). Full gate green (typecheck/lint/format/test/web build); **2436 passed | 21 skipped**. Clean rebase onto `7ffd1c6`; shipped `7929512` on `main`. See ARCHITECTURE.md → §24 + PROJECT.md (2026-06-20 entry).

## 2026-06-20 — Dashboard standings rows link to the manager's scores (dead click fixed, held at the vsfield boundary)

**Decision: the dashboard's group-phase standings rows, previously inert `<div>`s, are now `<a href="/vsfield?manager=<id>">` links — a dashboard-surface display change only.** Each `StandingsModule` row already carried the manager's `id`; the click target was simply never wired. The fix is a presentational swap (`<div>` → `<a>`) plus the link styling in `dashboard.css`; the underlying `loadDashboard` read (which now consumes T1's widened `VsFieldView` type) is **untouched**.

**Held at the vsfield boundary.** The link carries a `?manager=<id>` query param, but `/vsfield` does **not yet consume it** — the screen still selects the head-to-head via client `useState`, with no URL-driven pre-selection and no per-manager `[id]` route (see [[dash-team-scores-layer]]). So the param is **deliberately a forward hook**: clicking a row lands the user on `/vsfield`, and wiring the param to pre-select that manager is a **separate vsfield follow-up**, intentionally out of scope here. This keeps the change contained to the dashboard surface and avoids touching the route-scoped vsfield client/CSS in the same branch.

**Scope.** `apps/web/app/_dashboard/Dashboard.tsx` (row `<div>`→`<a href>`), `apps/web/app/_dashboard/dashboard.css` (link styling), `apps/web/src/dashboard/dashboard.test.ts` (asserts the `href`/param). No engine, no Realtime, no RLS, no migration, no `/api` change. Clean rebase onto `0e67028`; full gate green (typecheck/lint/format/test/web build); **2440 passed | 21 skipped**. Shipped `4923765` on `main`. See PROJECT.md (2026-06-20 entry).

## 2026-06-20 — Vsfield consumes the `?manager=` deep-link (pre-selects the H2H, server-validated, mount-only)

**Decision: `/vsfield` now consumes the `?manager=<id>` deep-link from the dashboard standings rows — it pre-selects that manager's head-to-head on first paint, closing the "param carried but not yet consumed" boundary the prior entry held open.** This completes the dashboard→vsfield pinpoint round-trip: clicking a standings row lands the viewer on `/vsfield` already focused on that manager's H2H, rather than on the default cockpit.

**Validated server-side, seeded mount-only.** `page.tsx` reads `?manager=` (Next 15 `searchParams` is a `Promise`) and passes it through the pure guard `seedManagerSelection(rawManager, view.field)` (`apps/web/src/vsfield/seedSelection.ts`) **before** the client ever sees it. The guard returns `null` — falling back to the client's existing default selection — for any param it can't trust: absent, empty string, duplicated (`?manager=a&manager=b` → `string[]`), or an id not present in the loaded field. Only a valid, in-field id seeds. The validated seed is threaded as `initialSelection` and consumed as the `useState` **initializer** for `effSel` (`VsFieldClient.tsx`) — so it applies on mount **only**: live refetches and any later manual selection are never overridden or re-seeded.

**Self-id collapses to `"field"`.** Deep-linking to your OWN row resolves to `"field"` (the aggregate cockpit), mirroring the existing client `select()` collapse where clicking your own leaderboard row never opens an H2H against yourself — the guard returns `match.isMe ? "field" : match.managerId`.

**Why a guard at all (the failure it prevents).** Without validation, a stale/typo'd/hand-edited `?manager=` would seed `effSel` with a non-existent managerId and render an empty/broken head-to-head. Guarding server-side keeps the bad value from ever reaching React state. The guard is **pure** (no Next/React/IO), so the validation table is unit-tested directly.

**Scope.** Vsfield-surface, presentation/wiring only: `apps/web/src/vsfield/seedSelection.ts` (+`.test.ts`, +6 unit tests: valid→seed, self→`"field"`, absent/empty/array/unknown→`null`), `apps/web/app/vsfield/page.tsx` (read+validate `searchParams`), `apps/web/app/vsfield/VsFieldClient.tsx` (new optional `initialSelection` prop → `effSel` initializer). **No loader / data-shape / engine / Realtime / RLS / migration / `/api` change** — `loadVsField` and `@app/vsfield` are byte-untouched. Branch base was `origin/main` (`3cc05a2`) so the rebase was a no-op; full gate green (typecheck/lint/format/test/web build); **2446 passed | 21 skipped**. Shipped `4231da0` (`--ff-only`) on `main`. See PROJECT.md (2026-06-20 entry) and [[dash-team-scores-layer]].

## 2026-06-21 — Forfeit confirms are per-period client state, survive period switches (T7 — Theme B addendum)

**Decision: in the set-lineup screen, a forfeit-substitution confirmation is keyed by period (`forfeitsByPeriod`), not held in a single global `Set`.** A forfeit-sub had been succeeding (HTTP 200, "Lineup saved.") yet a spurious `forfeit-requires-confirm` error painted alongside the success, and switching periods re-tripped the same false error. Both are the same class of bug: re-validating a mutation against **un-refetched SSR props**. The earlier fix (`9935472`) stopped clearing the pending-forfeit confirm on save (client-only; the validator was left untouched). This addendum (`0003f50`) extends that fix so the confirm is tracked **per period** — exactly as `lineups` already is — so a period switch no longer wipes a global confirm `Set` and re-fires rule 4c against the prior period's immutable locks/`slotMeta`.

**Why per-period client state, not a server `slotMeta` refetch.** The validator `validateLineup` (Theme B, purity-sensitive) is the wrong place to absorb this: the spurious error stems from the SSR-supplied locks/`slotMeta` being immutable and never refetched after the successful sub, so a benched-but-already-voided played starter still reads as a played starter and rule 4c re-fires. Refetching `slotMeta` server-side would touch the lineup read path and risk perturbing the validator's inputs; instead the confirm is remembered **client-side, per period**, which the validator never sees. **The shared validator stays byte-untouched** — the same Theme-B guarantee that governs every lineup change. See [[lineup-t7-periodswitch-t8-uuid]], [[lineup-sub-error-fix]], and PROJECT.md (2026-06-21 entry).

## 2026-06-21 — `pool_pick` SELECT RLS clock-gates the reveal at the DB layer (P1 — Theme F, the nested-RLS lesson)

**Decision: the `pool_pick` SELECT policy now enforces the reveal rule in the database — own picks always, others' picks only after their fixture has kicked off — via the `SECURITY DEFINER` helper `pool_pick_match_kicked_off(match_id)`.** The prior policy was league-member-only and `pool_pick` is in the `supabase_realtime` publication, so a rival's pre-kickoff picks were readable cross-member through the Data API / Realtime — bypassing the `readVisiblePicks` loader gate (anon = 0, but cross-member = leak). The new USING clause mirrors the loader exactly: `league-member AND (own-pick OR pool_pick_match_kicked_off(match_id))`. Fixed in `20260621120000_fix_pool_pick_realtime_rls`; `pg_policies` confirms the predicate and `prosecdef=t` on the helper. Deployed + live-verified 2026-06-21.

**Why a `SECURITY DEFINER` helper, not an in-policy join to `fifa_match` (the nested-RLS lesson).** `fifa_match` is RLS **default-deny** (no SELECT policy for `authenticated`), so a kickoff check written as an in-policy subquery `EXISTS (SELECT 1 FROM fifa_match WHERE id = match_id AND kickoff_at <= now())` would evaluate that subquery **under the caller's RLS** and find **zero rows for everyone** — silently hiding every not-own pick **forever**, even after kickoff. This is the same silent-failure class as the `score_manager_period` / `manager_select_own` traps (Theme F): an RLS-gated table read **inside** another table's policy collapses to default-deny. The helper runs as definer (RLS-bypassing) so the kickoff fact is read truthfully, and exposes **only** a boolean — no `fifa_match` rows leak. Regression coverage lives in the DB-gated role-switched suite `poolPickRls.integration.test.ts` (red on the old league-member-only policy where a rival's pre-kickoff picks leak; green on the new clock-gate). See [[pool-pick-realtime-rls-fix]], the `faab_bid` settled-RLS learning above, and PROJECT.md (2026-06-21 entry).

## 2026-06-21 — Game detail is a read-only server snapshot; no Realtime widening (T5/T6 — Theme F / read-surface)

**Decision: the new `/games/[matchId]` match-detail screen is a server-rendered snapshot over already-scored data — it reuses the existing server-only Prisma owner-bypass read path (the one `loadPlayerBox` / `loadVsField` use) and adds NO Realtime publication, NO RLS policy, and NO migration.** Per-player live points come from `score_player_match`, which is read by the Prisma owner server-side and is deliberately **not** browser-readable and **not** in the `supabase_realtime` publication. The vsfield Realtime subscription is only a change-*nudge* over `score_manager_period` + `standing`; it never carries `score_player_match` rows. So a full-match box score (all participants' points) is deliverable with zero Realtime/RLS/migration surface — the boring, reliable first cut. If sub-second freshness is ever wanted, the page can ride the existing vsfield-style nudge/visibility-gated poll (refetch a `GET` endpoint) **without** widening any publication; that is explicitly deferred.

**Why the full box score is backed by stored data (the coverage gate).** `score_player_match` + `stat_player_match` exist for **every match participant**, not only fantasy-rostered players: recompute's candidate set is every dirty raw stat row (`claimDirtyPlayerMatches`, no roster join) and the only filter on who gets a score row is `playerAppearedInMatch` (team-in-match AND an appearance signal — the live-MD1 cross-team fix). The ownership overlay (`started`/`benched`/`owned`) is the only fantasy-layer piece that needs a fantasy period; it is keyed on `fifa_match.period_id` (via `lineup_slot` + `roster_player`), and a null period degrades to **box-score-only, no overlay** rather than erroring.

**Scope / invariants.** New read-only files only: pure `apps/web/src/games/{types,buildGameDetail}.ts` + thin `apps/web/app/games/[matchId]/loadGameDetail.ts` + the route/client/CSS; click wirings on the dashboard `MatchRow` (`<a>` to `/games/<id>`) and a **separate** `.pl-fx-view` tap target on the Quiniela fixture card (the HOME/DRAW/AWAY pick buttons untouched). Nation via `fifa_team.name` (never `player.country`); team names via the join with `UNNAMED_OPPONENT` fallback (never a raw UUID); the per-player drill-in reuses `PlayerScoreSheet` verbatim (info-only). **Out of scope (specified):** two-yellow→red banding — cards shown as `classifyCard` classifies them. Review-class (new cross-surface loader) → **merge HELD** for Chat clearance. See PROJECT.md (2026-06-21 game-detail entry) and ARCHITECTURE.md → §25.

## 2026-06-21 — Prior-matchday selector: one period-aware read path, started-only selectable set, prior = read-only (T11 — Theme B / Theme F / read-surface)

**Premise correction (Chat-cleared).** The T11 prompt assumed a vsfield "reveal gate" (`readVisiblePicks`) that gates the current live period. **There is none — vsfield shows every manager's XI by design** (Theme F / ARCHITECTURE §5: squads are public from the draft, lineups are public on the field; only pick'em *picks* are secret, and `readVisiblePicks` is the **pool** surface, not vsfield). The reveal-gate language in the prompt was disregarded; T11 builds on the existing public-XI posture. Chat approved Option 1 (build on the existing read posture, no new gate).

**Decision: the prior-matchday selector adds period SELECTION only — every period read (current and prior) flows through the EXISTING period-aware read model with a `periodId` param; no parallel/ungated read path is introduced.** The box-score path (`PlayerScoreSheet` → `/api/player-box` → `loadPlayerBox`, period-scoped, no clock gate) was already period-aware and is reused verbatim. A single shared pure helper (`apps/web/src/period/selectablePeriods.ts`) defines the selectable set for all three surfaces, so they agree on the boundary.

**The selectable set is started-only; future is never selectable.** A period is selectable iff its FIRST fixture has kicked off — `isPickLocked` (`@app/pool`) on `matches[0]` (the canonical per-match started predicate; **no new clock predicate**), ordered by `sortByPeriodOrder`. A future/unstarted period is excluded, and `resolveDisplayedPeriodId` rejects a future-period request server-side (a crafted `?period=<future>` falls back to the default). This is the reveal-safety line: the selector can surface completed priors (fully revealed because over) and the live wave, but never a not-yet-locked matchday. The surface's current/live default is force-included so the default view always has a tab, even in the inter-matchday gap — without admitting a genuinely future period.

**Prior views are STRICTLY READ-ONLY, anchored on the fixtures' clock, NOT `period.status`.** `period.status` stays `"pending"` in prod until the hourly close cron, so it is not a reliable done/started signal; read-only keys on `periodIsDone` (last kickoff + `MATCH_DURATION_MS`). On the lineup surface the client gates every mutation off this (formation picker, Save, AND the tap-to-swap `onSelect` — a never-appeared bench player has no `locked_at`, so the swap path needs the explicit `readOnly` gate). **The data-integrity backstop is the server write path, which is UNCHANGED:** POST `/api/lineup` → the `@app/lineup` controller + `validateLineup` reject any edit touching a played slot via the lock-on-play latch + the forfeit play-state rules (Theme B). The selector adds **no new write path**. Residual (documented, benign, UI-unreachable): the validator has no period-done gate, so a crafted POST swapping two NEVER-appeared squad players in a completed period is not rejected there — non-appearing players score nothing; hardening is a separate backlog item.

**Per-surface threading.** Lineup keeps period selection as client tab state (`PeriodTabs` extended with read-only priors the manager played; default pinned to the live wave). Vsfield threads `?period=` → `loadVsField(periodId)` (server re-render; the live Realtime subscription is suppressed for a static prior, which reads "Final"). Waivers re-scopes ONLY the drill-down (the FA pool / claims / batch window stay live/global per the Jun 18 2026 commish decision): a prior selection swaps the card from the period-less `FaPlayerCardSheet` to `PlayerScoreSheet`.

**Out of scope — recorded, not fixed (BACKLOG SEC-P3).** Vsfield reveals the next wave's XIs during the inter-matchday gap (`selectCurrentPeriod` advances to the next wave once the prior one ends, before its kickoff). This is **pre-existing** — the default selection is byte-identical pre/post-T11 and T11's started-only set does not widen it — and is flagged for a commish decision (accept public lineups, or add a per-fixture reveal gate mirroring the pool clock gate). **No new table / RLS / migration / Realtime publication change.** See PROJECT.md (2026-06-21 prior-matchday-selector entry) and ARCHITECTURE.md → §26.

## 2026-06-22 — Mobile game-detail pitch: formation-grid, definite-height chain, full-token budget, halfway-line containment

**Context.** The `/games/[matchId]` pitch (`feat/game-detail-reskin`, T16) used a per-band `flex-wrap` column layout — an approach that worked on desktop but produced three compounding failures on a real iPhone (NED–SWE, ARG–AUT, densest MD2 fixtures with substitutes and two-digit fpts chips):
1. The column layout forced horizontal scroll on narrow viewports instead of filling width.
2. The tab body height collapsed to zero on a real device because the cqh size container (`gd-tabwrap`) lacked a definite-height ancestor.
3. Dense real lineups (every player rated, ~half subbed-off, two-digit fpts) overflowed each team's 50 % half and collided across the halfway line — the fantasy-points `<b>` tag was pinned at a fixed `13px` on mobile (the `.gd-tok-foot .gd-fpts` rule resized only the `<span>`), and `.gd-phalf` had no containment, so the overshoot bled across centre.

**Decision 1 — Formation grid (bands across width, no horizontal scroll).** The column layout is replaced by a per-half CSS grid where each row is one formation band and each column is one player slot. The grid fills the full container width; token widths are derived from `--gd-col-w = 100cqw / (--pitch-cols + 1)` so the worst-case formation (5 defenders) auto-distributes. No `flex-wrap` overflow escape hatch. The gate for this decision: **render on the densest real fixture** (the one with the most substitutes / highest player count per half); a formation grid holds formation shape and never overflows sideways. See commits `33e71e5` (reland) and prior `0939112`.

**Decision 2 — Definite-height chain via `:has(.gd-host)`.** `height:100cqh` on `.gd-tabwrap` requires a definite-height chain from the document root. `min-height:100dvh` yields a **used** (not definite) size — cqh sees `auto`, the container collapses to zero, the pitch is invisible on a real iPhone. Fix: the games route layout wrapper receives `class="gd-host"`, and the root-level selector `:root:has(.gd-host)` sets `height:100%` on `html`, `body`, and the unclassed `<div data-theme>` wrapper — without touching those elements globally. This is the minimum structural change: one class on the layout wrapper, one `:has`-scoped block in `games.css`. The **shell chain rule**: never assume a parent resolves to a definite height from `dvh` alone; if you need cqh, you need real `height:100%` on every ancestor back to `<html>`. See commit `33e71e5`.

**Decision 3 — Full-token budget: `--gd-line-h` must account for padding + inter-band gaps.** `--gd-line-h = 50cqh / --pitch-rows` is wrong when `.gd-phalf` has vertical padding and each `.gd-pcol` band has sub-line gaps — the real per-token height is those pixels less. Correct formula: `calc((50cqh - var(--gd-phalf-pad) * 2 - var(--gd-pcol-gap) * (--pitch-rows - 1)) / --pitch-rows)`. Token height must fit fully in its row; the `--shirt` variable that scales jersey + chip derives from this. See commit `d7efad8`.

**Decision 4 — Halfway-line containment: `.gd-phalf` clips, never bleeds.** The game-detail pitch is split into two halves (`.gd-phalf`). Each half owns exactly 50 % of the pitch. When token height is overestimated (rule 3 violated), the bottom band of the attacking team bleeds past `.gd-phalf`'s lower border and collides with the opposing formation. Fix: `.gd-phalf { overflow: hidden }` combined with the corrected `--gd-line-h`. **No cross-half bleed is acceptable.** The halfway line is the boundary invariant: content of each `.gd-phalf` must be fully contained within its 50 % region at all viewport widths. See commit `d7efad8`.

**Layout-guard standard (applies to any cqh-dependent pitch on mobile).** Before declaring a mobile pitch done, verify all four:
1. **Real shell chain** — trace `height:100%` from `<html>` through every ancestor to the size container; `dvh`/`min-height` breaks the chain.
2. **Non-collapse floor** — the cqh container's `block-size` must resolve to a positive definite value on a real device; a zero collapse is silent in devtools if JS hasn't loaded.
3. **Dense worst-case fixture** — proof must use the fixture with the most substitutes / two-digit fpts chips / longest team names (the densest real MD), not a pristine fixture. Compact fixtures mask both token-overflow and halfway-line bleed.
4. **No-cross-halfway-line assertion** — each `.gd-phalf` must clip (`overflow:hidden`) and the last band's bottom edge must sit above the halfway line at `≤390 px` viewport width.

**iPhone on the densest match is the gate.** A pitch that passes on desktop but is not verified on an iPhone with a dense real fixture is NOT done. The two reverts (`ff8c3d2`, `246fc7c`) that preceded the final landing (`33e71e5`, `d7efad8`) exist because the earlier versions were merged before this gate was applied. See PROJECT.md (2026-06-22 entry).

## Draft Realtime resilience (Prompts 31–32 + hotfix `55faff2`) — self-heal layer; native-API receiver rule

### Decisions & learnings

- **Injectable native browser APIs (timers, DOM event methods, fetch) must be invoked with their `window`/`document` receiver — pass `window.*`-bound lambda wrappers, never bare refs.** Storing `globalThis.setInterval` as a plain object property strips the receiver; browsers brand-check that the receiver is `Window` before executing native timer calls and throw `"TypeError: Illegal invocation"`. Node/jsdom skip the check, so unit tests pass (invisible gap). The invariant: any `timerFns`-style abstraction must use `(fn, ms) => window.setInterval(fn, ms)` (lambda captures `window` at call time, preserves the receiver) and never `setInterval: globalThis.setInterval` (bare ref loses receiver at first invocation as a method). Structural regression guards (source-text assertions that the lambda form is present) are added alongside tests that exercise this path, because the runtime proof is a browser load — not the test suite.

- **Draft board self-heals via resume-refetch + 20s polling backstop; server stays authoritative; countdown source (`pick_deadline_at`) unchanged.** The three event listeners (`visibilitychange`, `online`, `pageshow`) all call the same `handleResume` — a single authoritative fetch of `GET /api/draft/state` followed by a conditional resubscribe if the channel dropped. The `startPolling` backstop ticks every 20s regardless of Realtime health, skips when `document.hidden`, and self-cancels when it sees `status === "complete"`. Both paths feed the same `applyDraftRowChange` patch so the board is a pure function of the authoritative row. **Known transient:** if `handleResume` fires before `TOKEN_REFRESHED`, the re-subscription momentarily uses a stale token; `TOKEN_REFRESHED` fires within seconds and corrects it; the 20s polling backstop covers the gap without user-visible staleness.

- **Known minor gap (deferred, harmless): polling is not `active`-status-gated.** The §5 spec asked the backstop to run only during `active` status; the current `startPolling` ticks during `pending`/`paused` too. The tick is idempotent (refetch + patch is safe at any status; the self-cancel fires on `complete`) and the poll interval is 20s, so the extra ticks are negligible. Deferred — not blocking go-live.

### Operator gate (required before the draft — cannot be proven in-session)
Two live verifications are mandatory:
1. **Phone background→foreground mid-draft:** put the phone to sleep or switch apps, wait >20s, return to `/draft` — the board should self-heal (current pick, deadline) within one polling interval without a manual reload.
2. **>1h draft (token-expiry case):** after an hour of drafting, confirm in the Supabase Auth dashboard logs that `TOKEN_REFRESHED` fired and that the `setAuth` call re-authorized the Realtime socket — the board should keep streaming without a reload. The `onAuthStateChange` → `resubscribe` → `subscribeDraft` → `setAuth` chain is wired (H2 confirmed — no new code was needed), but live confirmation is the only proof.

## 2026-06-26 — Game-detail Standings tab: a STANDALONE self-contained `group_standing` table (T18 — migration-class, the first new ingested table since launch)

**Context.** The game-detail Standings tab (deferred from T16) needs a real-football WC group table (rank/P/W/D/L/GD/GF/Pts), which the app did not store — it only stores the **fantasy power-record** (`computeStandings` over `score_manager_period`). This is the FIRST game-detail tab that is NOT display-pure: it requires a new ingest path + new storage, i.e. a **migration + RLS**. Sergio is merge authority and applies the prod migration + backfill himself.

**Premise correction (the load-bearing finding).** The brief assumed group identity was absent and a new column might be needed. The repo says otherwise: `fifa_group`/`fifa_stage` and `fifa_team.group_id`/`fifa_match.group_id` **already exist** in the schema (from the init migration) — but **nothing populates them**. The match mapper (`packages/ingest/src/map.ts`) reads `f.group?.name` ONLY transiently to derive the period label (`derivePeriodLabel`); it never upserts a `fifa_group` row or sets the `group_id` FKs. So in prod `fifa_group` is empty and the `group_id` columns are NULL. **Consequence:** a match's group MUST be derived from the standings rows' own `team_id`, never from `fifa_match.group_id`. (This is the same family of trap as the Pool `round`-discriminator: a schema column that *looks* authoritative but isn't wired.)

**Decision 1 (D1) — self-contained `group_standing`, group identity DENORMALIZED.** A single new table keyed `team_id` (one row per team, WC2026-only) carrying `bdl_group_id` + `group_name` directly (NOT a FK to `fifa_group`), plus the stat columns + `season` (default 2026). **NO** FK to `fifa_group`, **NO** column on `fifa_team`/`fifa_match` (their dormant `group_id` columns stay untouched). Rationale: smallest blast radius — writes ONLY the new table, touches no shared/dormant table, and the group is fully recoverable from the denormalized columns. The match's group is derived by looking up its two teams' rows here. (The alternative — populate `fifa_group` + FK to it — was rejected to avoid writing a currently-dead shared lookup table.)

**Decision 2 (D2) — no `Last`/form column in v1.** The design handoff shows a `Last` form-chips column, but the BALLDONTLIE `group_standings` feed object has **no form field** (form lives only on the separate `match_team_form` endpoint). Rather than pull a second endpoint, v1 omits the column; the optional follow-up derives form in the PURE builder from the group's completed `fifa_match` scores (no schema/feed change). See BACKLOG → T18-form.

**Decision 3 — RLS = global authenticated read, like `match_lineup_entry`.** Group standings are non-sensitive public football facts, so the policy is `FOR SELECT TO authenticated USING (true)` (NOT league-scoped), NO anon, NO Realtime publication (read on the server-rendered page load). The server reads owner-bypass (Prisma), so the policy is defense-in-depth; the table is never RLS-disabled or anon-readable. Proven by a role-switched gated integration test on real Postgres (anon→0 rows, authenticated→all, owner→all).

**Decision 4 — refresh cadence: CLI backfill + a daily render.yaml cron.** Group standings change after every group match, so beyond the one-time post-deploy backfill CLI (`job:ingest-group-standings`, mirroring `job:ingest-team-stats`), a daily `wc-fantasy-group-standings` cron (mirroring the period-close cron) refreshes the table during the group stage. The cron was added by mirroring an existing render.yaml scheduled-job precedent (no new scheduler invented); the operator may suspend it once the group stage ends.

**Fantasy-safety (genuinely display-only, UNLIKE T16b's `event_match`).** A brand-new table with zero engine readers cannot be a scoring input — grep-confirmed: `packages/scoring`+`packages/recompute` have ZERO references to `group_standing`/`GroupStanding` and NO file under them changed; the engine reaches the DB only via statically-named Prisma accessors (no `$queryRaw`, no dynamic `prisma[...]`). The ingest job marks nothing dirty and triggers no recompute. NO change to `computeStandings`/the fantasy engine.

**Build discipline.** Discovery→plan→HOLD→implement on an isolated worktree off `df7b92e`. A read-only STEP-0 live smoke (against the real GOAT key, no DB writes) confirmed the feed shape (48 rows, 0 null cols, `group.name`="Group A") BEFORE any storage was built; the migration was proven on a throwaway Postgres; a live end-to-end ingest (real feed → throwaway DB) confirmed the foreign-guard + write path. See PROJECT.md → 2026-06-26 (T18) + ARCHITECTURE.md → `group_standing` / §25 + BACKLOG.md → T18.

## 2026-06-28 — T-3RD: the 3rd-place play-off surfaced in the Quiniela via IO-loader period-kind synthesis (`period_id` stays NULL) — migration-class

**Context.** The "Match for 3rd place" is the lone `fifa_match` with `period_id = NULL` — `derivePeriodLabel` returns null for it because its stored round string ("Match for 3rd place") matches none of the five `KNOCKOUT_ROUNDS` patterns and isn't a group game. The product goal: make it a pickable 2-way knockout fixture in `/pool` (HOME/AWAY winner, +1 cumulative like any knockout pick), **without** affecting the guillotine cut ladder or `commish:advance` (it is NOT a cut round; champion = the Final winner).

**Decision — Option B (loader synthesis), Option A REJECTED.** Discovery proved Option A (give it a real `knockout_round` period) is **unsafe**: `loadPlayoffs.ts:58` fetches playoff rounds by **`period.kind`** (not the five labels), so a 6th `knockout_round` period enters `rounds` and `playoffsView.ts:256-259` pegs `liveIdx` on the never-cut "3P" round → `isComplete = false` **forever**, so the champion is never crowned on `/playoffs` or the dashboard. A real period would also leak into `bestWeekByManager`, the lineup matchday tabs (`loadLineup` filters periods by done-ness, not kind), and `score_manager_period`. So the match **must stay period-less** to remain invisible to all period-keyed systems.

**Mechanism.** The pure `@app/pool` engine's contract already designates the IO loader as where `periodKind` is resolved (`fifa_match.periodId → period.kind`; `packages/pool/src/pool.ts`). So the 3rd-place fixture is special-cased at exactly **one seam** — a pure `resolvePoolPeriod(match)` helper (`apps/web/src/pool/`) that maps `is_third_place` → a synthetic `{ "knockout_round", "3P" }` for the pool engine, and passes every other fixture through with its real period. The pure engine (`pool.ts`) and `poolView.ts` are **byte-untouched**: `derivePoolResult` scores it as a 2-way (FT→ET→pens), `buildPoolLeaderboard`'s flat per-pick sum counts the +1, and `selectPoolPicksView`'s defensive non-canonical-label branch renders "3P" as its own bracket round after the Final. `isKnockoutFixturePickable` already gates on both teams being resolved real names, so it is correctly non-pickable until the semifinals fill the sides (~Jul 15).

**The two IO seams + the marker.** `loadPool` routes both projections — the fixtures view **and** the separate `leaderboardMatches` projection (a distinct raw read; without synthesizing here the pick would derive a null result and the +1 would never count) — through `resolvePoolPeriod`; the phase input is left RAW on purpose (the consolation fixture must not influence `selectTournamentPhase`; harmless since the bracket's real gate is `playoffActive` and phase only contributes via the "Final"-keyed `complete`). The write path (`prismaStore.getMatchFacts`) routes through the same helper so `validatePickSubmission` sees `knockout_round` and **rejects a DRAW** (a period-less match would otherwise wrongly accept DRAW). Identity is a new additive column **`fifa_match.is_third_place`** set by `@app/ingest mapMatchRow` on `/3rd place|third place/i`; `derivePeriodLabel` is guarded to return null for it **before** the `/final/` branch, and `ingestSchedule` defensively forces `period_id = null` when the flag is set — belt-and-suspenders so the match can never acquire a period even if a hostile feed string matched both `/3rd place/` and a knockout regex.

**`"3P"` is POOL-LOCAL.** It is the pool bracket label only; it is deliberately **NOT** added to `@app/shared KNOCKOUT_ROUNDS` (the guillotine cut ladder must stay exactly the five rounds R32→Final). A guardrail test pins `KNOCKOUT_ROUNDS` to the five and asserts `"3P"` is not a member.

**Risk + gate.** Review-class + migration-class (additive, defaulted, NO RLS, NO backfill — existing rows default false). Engine + `poolView` + guillotine/`transition`/`advance`/provision + lineups + playoffs + RLS all untouched. Full DoD gate green; the migration was proven on a throwaway Postgres (`migrate deploy` applies all migrations incl. `is_third_place`; pool-RLS + advance-store gated integration suites pass). Sergio is merge authority and applies `prisma migrate deploy` in prod. See PROJECT.md → 2026-06-28 (T-3RD) + ARCHITECTURE.md → §pool + BACKLOG.md → T-3RD.

## 2026-06-28 — SEC-P4: server-side guard rejects a Quiniela pick on an UNDECIDED knockout match (one shared resolved-team predicate) — review-class, no migration

**Context.** The `/pool` Picks UI hides the pick buttons on an undecided knockout match — pickable only when BOTH sides are resolved real teams (placeholders are feed-named `Team {balldontlie_team_id}`, detected by `/^Team \d+$/`; `fifa_team.country`/`.abbreviation` are NULL for all teams, so NAME is the only signal). That gate was **client-side only**: `validatePickSubmission` (`@app/pool`) and `POST /api/pool/pick` → `handleSubmitPick` did NOT reject a pick on a fixture whose teams aren't both resolved, so a crafted POST could store a pick on a TBD knockout match before its teams are known. UI-unreachable and currently moot (R16→Final + the 3rd-place match are all TBD until the semis ~Jul 15), so this is fairness/integrity **defense-in-depth** — same posture as SEC-P3b. It had to land BEFORE the sides resolve: once teams are known an unguarded undecided-match pick becomes craftable against real fixtures.

**Decision.** Add the write-path backstop in the pure engine. `validatePickSubmission` gains a knockout-only rejection — a new typed `pickOnUndecidedMatch()` error (`"pick-on-undecided-match"`, mapped to **HTTP 409** by the route's existing `pickErrorResult`, exactly like `drawNotAllowedKnockout`). Guard order is `lock → undecided → DRAW`: an undecided knockout rejects ANY prediction (the matchup doesn't exist yet), so undecided takes precedence over the DRAW rule.

**Single source of truth (no UI/server drift).** The pure name predicate `isPlaceholderTeamName` (regex `/^Team \d+$/`) was **lifted from `poolView.ts` into `@app/pool`** (plus a name-level `isTeamNameResolved(name|null)`). Both gates now bottom out in that ONE regex: the server validator calls `isTeamNameResolved`; `poolView.isTeamResolved` / `isKnockoutFixturePickable` (the UI gate, consumed in `components.tsx`) consume the same lifted predicate (`poolView` re-exports `isPlaceholderTeamName` for its existing callers). **Dependency direction:** `poolView` (apps/web view) → `@app/pool` (engine) — the edge already existed (poolView imports `buildPoolLeaderboard`/`isPickLocked`); no new edge, no view→engine inversion, and the engine imports neither the view nor IO (purity preserved — `purity.test.ts` still green). A `undecidedGuard.test.ts` matrix pins that the server gate and `isKnockoutFixturePickable` agree on the same fixtures.

**Where team identity lives on the server.** `getMatchFacts` (`prismaStore.ts`) previously selected only `status / kickoffAt / period / isThirdPlace` — NO team identity. It now also selects `homeTeam.name` / `awayTeam.name` (mirroring `loadPool`'s `MATCH_SELECT`) and returns them on `PoolMatchFacts` as `homeTeamName` / `awayTeamName` (null when the team FK is unset — `fifa_match.homeTeamId`/`awayTeamId` are nullable). The engine's validator input is a NEW sibling interface `PoolPickFacts extends SubmittableMatch { homeTeamName, awayTeamName }` — kept SEPARATE from `PoolMatch` so the scoring/leaderboard projection (`derivePoolResult` / `scorePick` / `weightForPeriod` / `buildPoolLeaderboard`) and its fixtures stay **byte-untouched** (this is an input-validation gate, not a scoring change).

**3rd-place play-off (SEC-P4 × T-3RD).** `getMatchFacts` already routes through `resolvePoolPeriod`, which synthesizes `knockout_round` for the `is_third_place` match — so the new guard covers it for free: while the semis are unplayed both sides are `Team {id}` placeholders → the pick is rejected `pick-on-undecided-match`; once the semis resolve its two sides, a pick is accepted (pinned in `thirdPlace.test.ts` + `handlePick.test.ts`).

**Boundary (deliberate, recorded — surfaced by adversarial review).** The guard keys on `periodKind === "knockout_round"`, so group (1X2) fixtures (always two resolved teams) never trip it, AND an UNSEEDED fixture (`periodKind` null — period row not linked) no-ops it, mirroring the engine's documented permissive-when-unseeded stance (the pick scores null until the period links). In steady state provisioning seeds all five knockout periods, so live knockout fixtures carry `knockout_round`; the residual (an unseeded fixture with a placeholder side) is data-integrity-only — it cannot affect scoring or the anti-copying reveal. Widening the undecided check to the null-period case would need a matching UI gate (which today applies only to bracket-classified fixtures) to avoid drift, so it is intentionally out of scope here.

**Risk + gate.** Review-class (live pool write path; a rejection that must not over-reject real picks). NO schema / migration / RLS / Realtime / scoring change. TDD RED→GREEN (the RED run proved a crafted undecided pick was accepted today). Full DoD gate green: `pnpm -r typecheck` + `lint` + `format:check` + `vitest run` (2720 passed / 48 gated-skipped, +23) + `@app/web build`. Adversarially reviewed (4-lens workflow: over-rejection / bypass / drift / scope → drift + scope + over-reject CLEAN; the lone substantive finding is the deliberate unseeded-period boundary above). Docs-only-adjacent code change, no migration → Chat-cleared; MERGED to main `184391a` (2026-06-29, `--ff-only`) on a green gate. See PROJECT.md → 2026-06-28 (SEC-P4) + ARCHITECTURE.md → §6 (Pool UI) + BACKLOG.md → SEC-P4. Related: [[T-3RD]] (3rd-place synthesis), SEC-P3b (sibling defense-in-depth write-path gate).

## 2026-06-30 — T2: Waiver Watchlist — private per-manager "star", owner-only RLS, scope-agnostic decoupled toggle (migration-class)

**Context.** T2 adds a **private, per-manager bookmark** ("star a player to track") surfaced on `/waivers`. It is the second new ingested/owned table since launch after `group_standing` (T18) — a **migration + RLS** change, so Sergio was merge authority and applied the prod migration himself. Built on `feat/waiver-watchlist` off `d15a470`; **MERGED `fb808bf`**.

**Decision 1 — owner-only RLS mirroring `faab_bid`'s strictly-private family, NOT `pool_pick`'s reveal.** A star is strategic information; revealing it would leak acquisition intent to rivals. So the table is private forever: **exactly ONE SELECT policy and it is owner-only**, gating on `EXISTS (SELECT 1 FROM manager m WHERE m.id = watchlist.manager_id AND m.user_id = (auth.uid())::text)` — the same predicate `faab_bid`'s owner-only family uses (ownership alone fully scopes the row; no league predicate needed). Four policies, one per CRUD verb (`watchlist_select_own` USING / `_insert_own` WITH CHECK / `_update_own` USING+WITH CHECK / `_delete_own` USING), **each `TO authenticated`** (the SEC-P0 lesson — never the older bare `TO public` form). `faab_bid`'s `status = 'pending'` gate is dropped (a star has no lifecycle) and its league-visible `faab_bid_select_settled` reveal is deliberately OMITTED, as is any `pool_pick`-style league-scoped SELECT. `ENABLE` (not FORCE) RLS, so the Prisma owner / worker / `service_role` bypass and RLS bites only the JWT roles — RLS is defence-in-depth behind the server write path.

**Decision 2 — DDL-only migration + gated-suite test strategy (no in-migration self-test); BOTH portability shims included.** The migration `20260630120000_watchlist` is **DDL-only** — the `prisma migrate diff` output verbatim (zero drift), with **no embedded DO-block self-test, no `supabase_realtime` publication entry, no `SECURITY DEFINER` helper** — mirroring the `group_standing` 20260626120000 + `fix_faab_settled_rls` posture rather than `pool_pick`'s self-tested template. The RLS proof instead lives in the gated Postgres integration suite (Decision 5). **Both portability shims (`authenticated` role + `auth.uid()` function) ARE included** — copied from `pool_pick` 20260610130000 — because the owner-only policies **read the JWT** via `(auth.uid())::text`. This is `group_standing`'s own stated principle applied: `group_standing` omits the `auth.uid()` shim only because its policy is global `USING (true)` and never reads the JWT; a JWT-reading table includes it. No `SECURITY DEFINER` helper is needed because the predicate touches only `manager` (resolvable via the existing `manager_select_own` policy), not an RLS-default-deny table — same reason `faab_bid`'s owner-only policies need none.

**Decision 3 — scope-agnostic write API, fully decoupled from FAAB/roster/scoring.** Endpoint `POST /api/manager/watchlist` (under `manager`, not `faab`, to signal the decoupling), body `{ playerId, watched }`. The **WRITE API is scope-agnostic** — it accepts any valid `playerId` with no FA / roster / phase check; "free agents only" is a UX-surface choice, not a server constraint (the FA-row + card + "Watched"-filter surfaces all live on `/waivers`). A star is **fully decoupled**: the handler and store touch no `faab_bid` / `faab_batch` / `roster_player` / `lineup_slot` / budget row and trigger no engine / recompute / dirty-mark / Realtime (pinned by the `watchlistDecoupling.test.ts` source-contract: no `@app/faab`/`@app/lineup` import, no faab/roster/lineup accessor, handler imports no Prisma). `managerId` is resolved server-side from the session via `getSessionManager()` (401/403 BEFORE any DB access) — the client-supplied manager id is never trusted; `watched:true` → idempotent upsert on the unique key, `watched:false` → delete (missing row still 200), malformed → 400. A single toggle endpoint (a `watched` boolean) was chosen over two verbs for the boring scope.

**Decision 4 — id-set on the view, NOT a `WvPlayer` boolean.** `loadWaivers` reads the viewer's stars with one self-scoped `prisma.watchlist.findMany({ where: { managerId: viewerManagerId }, select: { playerId: true } })` in its existing `Promise.all`, surfaced as `WaiversView.watchedPlayerIds: readonly string[]` — an **id-set**, deliberately not a per-row boolean on `WvPlayer`, so the client computes `watchedSet.has(player.id)` for any row (FA / card) without re-shaping the row mapper. The pure `watchedFreeAgents(freeAgents, watchedSet)` filter helper mirrors the existing `freeAgentNations` pattern; the client hydrates a `Set` from the id-set, toggles optimistically, and `router.refresh()` re-reads it.

**Decision 5 — the 22P02 / uuid-cast verification (SEC-P1 trap).** The real Supabase `auth.uid()` casts the JWT `sub` to `uuid`, so `(auth.uid())::text` round-trips against `manager.user_id` (text); the bare-Postgres TEXT shim masks that cast. The RLS proof therefore runs under a **uuid-returning** `auth.uid()` with valid-uuid `sub` literals or it 22P02s on real Supabase / passes silently on the shim. Gated `watchlistRls.integration.test.ts` (own `WATCHLIST_RLS_PG_TEST_URL` var + SAFE `DATABASE_URL===TEST_URL` guard, distinct from the FAAB/release suites so the wipe-suites never co-run) — **11 tests**: owner reads own only · league-mate reads own only (the key privacy assertion distinguishing this from `pool_pick`) · cross-league 0 · anon 0 · Prisma-owner bypass reads all · owner insert/delete own · cross-owner insert blocked by WITH CHECK · anon insert default-denied · unique key blocks a duplicate · non-uuid `sub` 22P02s. Verified on a throwaway Postgres: full-chain `migrate deploy` applies clean, `migrate diff` from the migrated state is empty (zero drift).

**Risk + gate.** Migration-class (new table + RLS) → Sergio was merge authority and applied `prisma migrate deploy` in prod. Engine / FAAB / scoring / recompute byte-untouched; no Realtime publication (private, server-refresh). TDD-equivalent throughout; full DoD gate green: typecheck + lint + format:check + `vitest run` (**2761 passed / 59 skipped**) + `@app/web build` + gated-PG RLS 11/11. **MERGED `fb808bf`.** See PROJECT.md → 2026-06-30 (T2) + ARCHITECTURE.md → `watchlist` table + BACKLOG.md → T2 + `docs/design/T2_waiver_watchlist_DESIGN.md`. Related: `faab_bid` (strictly-owner-only family), `pool_pick` (the reveal model + portability scaffold this deliberately diverges from), `group_standing` (the DDL-only / no-self-test precedent), [[rls-migration-verification]] (the 22P02 trap).

## 2026-06-30 — `/playoffs` Chocoyo hero re-skin: the blade choreography is a CLIENT-side state machine; the merge gate is a REAL-BROWSER render proof (presentation-only, review-class)

**Context.** The live `/playoffs` guillotine hero is re-skinned to the CHOCOYO "theater" design (`design/design_reference/screens_2026-06-14/theater/{parrot,screen,app}.jsx`) — the parrot mascot, peeking out of the pixel-art trophy mark, hoists a machete over the doomed. The prior tiny `.po-parrot` header glyph had shipped INVISIBLE (its source-contract smoke passed while the live render was a 24px chip, not the intended hero — the third "source-smoke-green-but-render-wrong" bug of the session).

**Decision 1 — the mascot is JSX/SVG-first, with no blocking raster.** The machete is a PURE inline SVG (its belly carries the `--elim` cutting edge, `.po-machete-edge`) so the functional blade paints with ZERO asset dependency. The figure is the already-vendored `/brand/trophy.png` (the pixel-art trophy with Chocoyo peeking out), rendered as a plain `<img>` — the SAME personality-moment pattern the screen already used (`.po-parrot`) and the landing (`.lp-cta-parrot`), NOT `next/image` (which the isolated render harness can't run). Chosen over authoring a from-scratch SVG parrot (there is none: `parrot.jsx`'s `TrophyMark`/`ParrotMascot` are `<img>`; only `Machete` is SVG) and over blocking on a new export — the trophy is already in `public/brand`.

**Decision 2 — the blade choreography is CLIENT-side + clockless, driven by a transition latch (a STOP seam held).** `loadPlayoffs` is CLOCKLESS by design (no "just happened" timestamp — adding one would be a loader/view-model change, the explicit STOP seam). So the wind→drop→"CHOP!" animation is a client-side state machine in `PlayoffsClient.tsx`: a latch over per-round-idx `status` fires a ONE-TIME swing ONLY when a round the client watches flips `live→past` between refetches (`focusIdx` centres the CHOP on the just-cut round mid-swing, then settles onto the new live round). Resting states are static (live = raised/idle-sway, past/complete = settled) — a round cut days ago does NOT re-swing on load; the drop never loops and never fires on mount for an already-past round. Fully gated behind `prefers-reduced-motion` (JS skips the choreography; CSS gates every keyframe — sway/swing AND the trophy `po-squawk` wobble — behind `no-preference`).

**Decision 3 — the hero owns the endgame; victim strike = cross-surface parity.** The complete/champion state is rendered by the hero IN-PLACE (celebratory trophy, replacing the CHOP framing), retiring the standalone `ChampionBanner`. The "on the block" doomed (`round.eliminatedIds`) and the survivor/ladder/mobile rows are struck with the SAME treatment as `/waivers` + `/vsfield` + the landing guillotine: `--text-tertiary` + `line-through` with `text-decoration-color: var(--elim)`.

**Decision 4 — the merge gate is a REAL-BROWSER render proof, not a source smoke.** Because a jsdom source smoke cannot prove a screen renders (the `.po-parrot` precedent), the gate is `apps/web/scripts/verify-playoffs-hero.mjs` (Playwright + inlined real ds.css/playoffs.css + served `/brand/*.png`): it asserts by true paint geometry that the trophy image LOADED (naturalWidth > 0, not a broken box), the machete PAINTED, the blade rotates raised→down on the drop, and the swing/sway animations are wired — desktop + mobile, live + dropped + champion (12/12). `chocoyoHero.test.ts` pins the real component to the harness replica so it can't drift. An adversarial 4-lane (opus) review of the diff caught 3 real issues — ungated `po-squawk` under reduce-motion, mobile champion rendered in elimination-red, champion state uncovered — ALL FIXED (the champion coverage now pins the first two).

**Invariants + gate.** `buildPlayoffsView` / `guillotine` / `playoffRound` / `loadPlayoffs` are git-verified BYTE-UNTOUCHED; no migration/RLS/Realtime; route-scoped CSS only (`ds.css` untouched — the `--elim` tokens are already global); `/playoffs` stays `ƒ`. Full DoD gate green (typecheck/lint/format/**2802 passed / 59 skipped**/`@app/web` build). **Review-class + high-visibility live screen mid-tournament → merge HELD** for Chat clearance + Sergio; live-verify (hero paints + blade animates on a real cut) is Sergio's on the Render deploy. Flagged (out of scope, untouched ladder): the pre-existing `.po-col .po-col-future` selector bleeds onto the future-column header tag — a 1-char child-combinator fix for a separate contained pass. See PROJECT.md → 2026-06-30 (Chocoyo hero) + ARCHITECTURE.md → §21 (Chocoyo hero re-skin) + BACKLOG.md → Recently shipped. Related: [[render-build-ci-gate]], the vsfield/landing/waivers elim-strike family, [[no-reopening-spec-pinned-decisions]].

## 2026-07-01 — Commissioner console Thread 1: `commish_audit` ledger shape + RLS posture, commissioner-only read, view-as is a read-only inspector (migration-class)

**Context.** The first commissioner-only surface (`/commish`) + the cross-cutting `commish_audit` table that every later write slice (Threads 2–5: penalties/corrections → roster/lineup repair → freeze → field-lock) will write into. Thread 1 is read-heavy: the table ships EMPTY, no write path is wired.

**Decision 1 — `commish_audit` shape + RLS posture.** An additive append-only ledger: `id, league_id (FK→league Cascade), actor_user_id (FK→app_user SetNull, NULLABLE), action_type (TEXT), summary, detail?, reason?, target_ref (JSONB?), delta?, reversible (bool default false), reversed_at?, reversed_by_user_id (FK→app_user SetNull?), created_at`, indexed `(league_id, created_at)`. RLS = ENABLE (not FORCE, so the owner client bypasses) + **exactly one** `FOR SELECT TO authenticated` commissioner-only policy + **zero** write policies (client writes default-denied; all inserts flow through the server owner client). **No SECURITY DEFINER helper** — the SELECT predicate (`EXISTS manager m WHERE m.league_id = commish_audit.league_id AND m.user_id = auth.uid() AND m.is_commissioner`) reads only the caller's OWN `manager` row (visible via `manager_select_own`); a helper is needed only when a policy must read an RLS-default-deny table or a foreign row, and `commish_audit` carries its own `league_id` (same reasoning as `watchlist`/`standing`). **Not** published to Realtime (commissioner-only rows must never reach the postgres_changes/Data-API surface). Chosen over the prompt's alternative "SECURITY DEFINER `is_commissioner(uid)` helper" because the inline own-row predicate is strictly simpler and matches the established `standing`/`watchlist` idiom; chosen over "deny-to-authenticated + service-role-read only" because a commissioner-only SELECT policy is free defense-in-depth and lets a future authenticated read work without a migration.

**Decision 2 — `action_type` is an app-level `@app/shared` union, NOT a Postgres/Prisma enum.** `commish_audit.action_type` is free TEXT; the closed set lives as `COMMISH_ACTION_TYPES`/`CommishActionType` (`packages/shared/src/commish.ts`, in its OWN file — `enums.ts`'s header mandates its values mirror Prisma enums, which this deliberately does NOT). **Why:** a later write slice adding a new action string must NOT require a schema migration + a `pnpm --filter @app/db generate` + a deploy just to persist a new discriminant. TEXT + a TS union gives compile-time safety at the call sites (`recordCommishAudit`, the audit renderer's tone map) with zero DB-migration coupling for new slices. The trade is no DB-level CHECK on the value — acceptable, since the only writer is the server-side `recordCommishAudit` typed to the union.

**Decision 3 — the audit read is commissioner-only FOR NOW; widening to all league members is one policy change.** Thread 1 scopes both the RLS SELECT policy and the `loadCommish` read to commissioners. If a future "league activity log" surface wants every member to see (a redacted view of) commissioner actions, that is a single `CREATE POLICY … USING (league-member)` (or a second, broader SELECT policy) — the table shape, the write path, and `recordCommishAudit` do not change. Recorded so the widening isn't mistaken for a redesign.

**Decision 4 — the app-layer commissioner gate honors the email fallback; the RLS policy is flag-only (a safe asymmetry).** The `/commish` app gate + the worker CLI both use `resolveCommissioner` = `is_commissioner` flag **OR** the `smrios07@gmail.com` email (from the validated JWT — not user-supplied, not spoofable by a non-commissioner). The `commish_audit` RLS SELECT policy is `is_commissioner`-flag ONLY (SQL can't cheaply express the email fallback, and RLS never gates the app's real owner-bypass read — it only hardens the Data API). This is strictly safe: flag-only RLS is the tighter set, and the email fallback only ever grants the permanent commissioner (whose `is_commissioner` is set in prod anyway). Documented in the migration header so the asymmetry isn't read as a bug.

**Decision 5 — view-as is a READ-ONLY inspector; session impersonation is explicitly rejected.** The view-as feature is a commissioner-gated READ of a selected manager's public-ish state (record+seed via `loadStandings`, `faabBudget`, owned roster), same-league-only, URL-driven (`?as=<id>` → server re-render). It **never** mints a token, swaps the acting identity, or lets the commissioner mutate as another manager. Session impersonation was rejected for safety: an acting-identity swap is a large attack surface (a bug could let a commissioner submit lineups/bids as a rival, or leak sealed intent), buys nothing Thread 1 needs, and the read-only inspector already answers "what does manager X have?". The reads deliberately avoid `faab_bid`/`pool_pick` (no sealed-intent leak): `faabBudget` is the settled remaining budget, roster reads settled ownership.

**Decision 6 — the gated nav entry is threaded via an optional prop, not sourced inside the shared shell.** `AppShell`/`MoreSheet` gained an optional `isCommissioner?` prop; a dedicated `COMMISH_NAV_ITEM` (kept out of the always-rendered nav lists) renders only when it's truthy. The hub page (which already resolves the `ok` outcome) + the `/commish` layout thread it, so a commissioner reaches the console from Home. Rejected: making `AppShell` async + calling `getSessionManager()` itself — that would add a second `getUser()` network round-trip to EVERY authenticated page render (`getSessionManager` isn't request-memoized), a global latency regression introduced by one read-only feature. Surfacing the entry on every screen is a documented follow-up seam (thread the flag from each layout, or wrap `getSessionManager` in React `cache()` and have the shell source it).

**Invariants + gate.** Byte-untouched: scoring/recompute/the resolver/`enforce_lineup_lock`/the FAAB engine/the transition-advance engines/existing RLS/any Realtime publication. Full DoD gate green (typecheck/lint/format/**2831 passed / 68 skipped**/`@app/web` build) + gated-PG RLS suite 9/9 (RED-verified) + `migrate deploy` on a throwaway PG; a 6-lane adversarial review returned zero findings. **Migration-class + new privileged surface → MERGED** (`e29e0eb`, verified ancestor of `origin/main`; Sergio applied the migration on `DIRECT_URL`, then merged). See PROJECT.md → 2026-07-01 (Commissioner console Thread 1) + ARCHITECTURE.md → §28 + BACKLOG.md → Commissioner console. Related: [[rls-model]], [[rls-migration-verification]], the `watchlist`/`pool_pick` owner-only RLS family, [[auth-gate]].

## 2026-07-01 — Commissioner console Thread 2: penalty entry + rating override (the first `recordCommishAudit` callers; source-only)

**Context.** The first two commissioner WRITES (Stat-corrections tab, Tier-1). The scoring plumbing is already DONE: the adapter maps `manual_stat_player_match.penalty_won/committed` → `ScoreInput` (+2/−2), and the resolver prefers `rating_player_match` source=`manual`. So this thread only writes the two feed-gap rows + records an audit row + fires a re-score. **Engine byte-untouched** (grep-verified: zero diff to `packages/scoring` + `packages/recompute`). All three tables already exist → **no migration**.

**Decision 1 — the re-score trigger is a SYNCHRONOUS call to `recomputePlayerMatch`, not a dirty-flag-and-wait.** The discovery rule was "call `recompute-one-(match,player)` synchronously IF safely importable, else set `dirty=true` and let the worker sweep." It IS importable: `apps/web` already imports `@app/recompute/prisma` (`loadCumulativeTournamentTotals` in `loadPlayoffs`), and `recomputePlayerMatch` + `createPrismaStore` are public `@app/recompute` exports with no worker-context entanglement. So the write handlers fire `createCommishRescore(prisma)(matchId, playerId)` right after the committed write — `score_player_match` updates immediately. `dirty=true` on the written raw row is the belt-and-suspenders backstop: the sweep's Phase-1 claim (`claimDirtyPlayerMatches`) unions stat + rating + **manual**, so the worker also re-scores within ≤60s even if the sync call fails. No pipeline internals touched — only public orchestration functions are called.

**Decision 2 — a FROZEN-period correction MUST still re-score → the trigger restates the rollup with `allowFrozen:true`.** The freeze gate lives at `recomputeManagerPeriod` (skips a frozen period unless `allowFrozen`), NOT at `recomputePlayerMatch` (which always scores). The worker sweep runs WITHOUT `allowFrozen`. So a correction on a frozen period would update `score_player_match` but the manager-period rollup — and thus the leaderboard — would stay stale (the marker accumulates as `skippedFrozen`, awaiting a commissioner-override sweep nobody triggers in Thread 2). To keep the freeze gate from silently swallowing the correction, `createCommishRescore` runs the FULL chain for the affected keys — `recomputePlayerMatch` → `recomputeManagerPeriod(..., {allowFrozen:true})` → `recomputeStanding` — the DECISIONS commissioner-override path. `allowFrozen:true` is a no-op on non-frozen periods, so the trigger is uniform. The frozen state is SURFACED (not hidden): `frozenOverride` in the API response, a note in the audit `detail`, and a banner in the panel. **The freeze TOGGLE itself is Thread 4** — this thread only overrides the gate for a correction, it does not build freeze/unfreeze.

**Decision 3 — the audit `action_type` is the pre-seeded `penalty_applied`, not the prompt's prose `penalty_entry`.** The prompt narrated the penalty action as `penalty_entry`, but `COMMISH_ACTION_TYPES` (`@app/shared`) already reserved **`penalty_applied`** for exactly this slice, the audit-log renderer's `ACTION_META` already maps it to a label+tone, and Thread 1's gated fixture already seeds it. Using the pre-seeded value needs no union extension and keeps the renderer working (an invented `penalty_entry` would fall to the generic fallback). `rating_override` matched the union verbatim and is used as-is. This is a reversible one-line change if a reviewer prefers `penalty_entry` (extend the union + swap the string + add a renderer case) — flagged for veto, not silently chosen.

**Decision 4 — "bad (match, player)" = match+player exist AND the player's team is one of the match's two teams.** Server-side validation (`invalid_match_player`, 404) mirrors the adapter's `teamInMatch` participant gate: a player paired with a match their team wasn't in is rejected. It deliberately does NOT require a pre-existing `stat_player_match` row — that would defeat the purpose of a feed-gap manual entry (the operator may be tagging a penalty before the feed stat lands). Consequence (documented property, not a bug): a manual row for a player with no feed participation yet is written but held out of scoring by the adapter's participant gate until a stat/event/shot arrives, then folded in by the sweep. The common case (a penalty/rating belongs to a player who played) scores immediately.

**Decision 5 — Thread 2 / Thread 2b split.** Thread 2 ships ONLY the two Tier-1 actions (penalty, rating) scoped to a (match, player). The GENERAL stat-line editor — editing any feed stat via `manual_stat_player_match.extra` + an adapter overlay — is **Thread 2b** (resolver-class: it touches how the adapter reconciles a manual overlay against the feed stat row, a heavier correctness surface than the two additive rows here). A `// TODO(2b)` marker sits in the Stat-corrections panel. Thread 2b slots into BACKLOG BEFORE Thread 3 (roster/lineup repair).

**PART A — the two Thread-1 confirms.** Proven before any write (RED-first discipline; both GREEN as characterizations of correct existing behavior). (1) The `commish_audit` SELECT policy gates on "commissioner in this league," never authorship — proven with a foreign-actor row + a null-actor row both visible to the commissioner (and the non-commissioner author reading zero). (2) `isCommissionerActor` ≡ `resolveCommissioner` across the (flag × email) matrix incl. the `smrios07` fallback — the Thread-1 delegation is a pure pass-through.

**Invariants + gate.** Engine byte-untouched (empty `git diff --stat` on both packages). Full DoD gate green: typecheck/lint/format/**2873 passed / 72 skipped**/`@app/web` build + gated-PG on throwaway `postgres:16` — `commishAuditRls` 10/10 (incl. confirm-1) + `commishStatWrite` 3/3 (atomic write+audit; idempotent penalty clear; rating set/clear). **Source-only → MERGED** (`9da186e`, verified ancestor of `origin/main`; Sergio merged Thread 1 with its migration first, then this — deploy fired, no `migrate deploy`). See PROJECT.md → 2026-07-01 (Commissioner console Thread 2) + ARCHITECTURE.md → §28 + BACKLOG.md → Commissioner console. Related: the Thread-1 [[recompute-pipeline]] dirty model, [[scoring-rule-change-deploy]] (the dirty-flag vs re-sum distinction), [[playoff-loader-layer]] (the `@app/recompute/prisma` web-import precedent).

## 2026-07-01 — Commissioner console Thread 2 follow-up: a transient re-score throw after commit → saved-but-restate-pending, not a bare 500 (`fix/commish-tier1-writes`, additive)

**The gap.** In `handleStatCorrection.ts` the write + `commish_audit` row commit in ONE `$transaction` (`store.applyPenalty`/`applyRating`), and ONLY THEN does the synchronous `deps.rescore(matchId, playerId)` fire. On a FROZEN correction that re-score runs the override rollup `recomputeManagerPeriod(..., {allowFrozen:true})` (Decision 2 above). If that call THROWS **after** the transaction committed, the correction is durably persisted but the leaderboard is not yet restated — and the naked throw propagated straight out of the handler, so the route returned a **bare 500**. That 500 is a lie by omission: it reads as "nothing happened," hiding the persisted write + audit row and inviting the commissioner to re-enter (harmless, since the writes are idempotent, but confusing) or to assume the correction was lost.

**Decision — catch the post-commit throw and return a distinguishable, actionable 200.** `fireRescore(...)` wraps the re-score; a throw is converted to a **200 partial-success** carrying `restatePending: true` + `warning: "restate_pending"` + a human `message`, alongside `scored: false` and the existing `frozenOverride`. This mirrors the existing `no_match_participation` 200 shape (write durable, score not yet reflected); `outcomeFields(scored, restatePending)` gives restate-pending **precedence** so the feed-participation warning never co-appears. The body conveys the four facts the operator needs: the write persisted, the audit was recorded, the re-score failed, and the leaderboard is not yet restated.

**Why 200, and why this is DISTINCT from a validation reject.** A **pre-write** failure (missing reason, bad counts, bad (match, player)) still rejects cleanly with a 4xx `{ error }` and persists NOTHING — those are unchanged. The restate-pending case is the opposite: the mutation the commissioner asked for **did** land durably; only the derived restate is deferred. Returning 200-with-signal (not a novel status) keeps the client's partial-success handling uniform with `no_match_participation`, while `restatePending`/`ok:true` make it unambiguous versus the `{ error }` rejects.

**Remedy = re-submit the identical correction.** The writes are ABSOLUTE + idempotent (a penalty/rating is SET to the same value, never accumulated — the Thread-2 idempotent-SET proof), so a repeat is safe and lands on the same score. This is not merely convenient: for a FROZEN period it is the **only** restate path. The worker sweep's `dirty=true` backstop runs WITHOUT `allowFrozen`, so it will re-score `score_player_match` but leave the frozen manager-period rollup (the leaderboard) stale forever — only the write path's own `allowFrozen` override restates it, and re-submitting is how the operator re-fires that override.

**Invariants + gate.** Additive only — no engine/adapter/resolver/recompute edit (empty `git diff --stat main -- packages/scoring packages/recompute`); `commishStatStore.ts` untouched (the throw is handled entirely in the pure handler). Full DoD gate green: typecheck/lint/format/**2878 passed / 74 skipped**/`@app/web` build + gated-PG `commishStatWrite` **5/5** — the added 5th assertion drives the REAL Prisma store on a frozen period with an injected throwing rescore and proves the manual row + audit are DURABLE while the response carries the `restatePending` signal (not a 500); two handler unit tests cover the penalty + rating throw paths and the reject-vs-restate distinction. **Additive follow-up → MERGED** (`b90b5a5`, verified ancestor of `origin/main`; stacked on Thread 2). See ARCHITECTURE.md → §28.2 (saved-but-restate-pending response shape) + PROJECT.md → 2026-07-01 + [[commish-tier1-writes-layer]].

## 2026-07-01 — Commissioner console Thread 2b: general stat-line editor (source-only; the adapter overlay) (`feat/commish-stat-editor`)

**Decision 1 — sparse field-level overlay; manual-wins / feed-passthrough; wholesale-replace REJECTED.** Per allowed raw field the manual value wins via `n(overlay[f] ?? feed[f])` — nullish, so an explicit 0 corrects a stat DOWN to zero; a field the operator didn't touch passes through the feed and is NEVER zeroed. Row-level replace was rejected: a partial overlay must not blank untouched feed fields.

**Decision 2 — allowlist = 23 scoring-relevant fields, not 27.** The engine scores only the `completed`/`won`/`accurate` numerators, so `dribblesAttempted`/`duelsLost`/`passesTotal`/`longBallsTotal` are carried into `ScoreInput` but never read — overriding them is a points no-op, so they are excluded from `OVERRIDABLE_STAT_KEYS`. This "23" is guarded STRUCTURALLY (not by hand-count): a probe in `adapter.test.ts` bumps each `StatRow` field per role and asserts the set whose points move EQUALS the allowlist; a `Record<keyof StatRow, true>` literal forces the classification of any future 28th field. (Chat cleared this from the part-1 discovery, which had provisionally said 27.)

**Decision 3 — the overlay must NEVER reach the participant gate (the decisive correctness invariant).** `playerAppearedInMatch` gates on `statHasData(b.stat)`. If the overlay were merged into `b.stat`, a manual-only correction on a player with no feed footprint would falsely pass the gate and mint a phantom score — diverging from Thread 2's `scored:false`/pending semantics. So the overlay is carried on `ManualRow.statOverrides` and merged ONLY inside `buildScoreInput`; the gate reads `b.stat` (raw) and never `b.manual`. Verified at the unit level and on real Postgres.

**Decision 4 — storage: namespaced `extra.statOverrides`, read-modify-write, preserving `rolePlayed`.** The overlay shares the `manual_stat_player_match.extra` JSON with the §3 `rolePlayed` role override (which has a reader — `roleFrom` — but no writer yet, so the stat overlay is likely the FIRST `extra` writer). Namespacing under a `statOverrides` sub-key leaves `roleFrom` byte-untouched; the write read-modify-writes so `rolePlayed` (and any other key) survives, and clear-all drops ONLY the sub-key (empty extra → SQL NULL via `Prisma.DbNull`). Penalty columns stay dedicated (Thread 2 untouched). ⚠️ `stat_player_match.extra` (feed overflow) is a DIFFERENT column on a different table — never conflated.

**Decision 5 — audit `delta` = raw field-change string, not a points total.** One `commish_audit` row per save (`action_type=stat_correction`), `delta` like `goals feed→2 · assists 1→feed` (overlay transitions, computed from the prior overlay); the engine owns points and the re-score restates them. The write is absolute + idempotent (SET, `dirty:true`) — a re-submit is a points no-op but still records a governance row.

**Invariants + gate.** `packages/scoring` diff EMPTY; the sole `packages/recompute` edit is the additive `adapter.ts` overlay + the `prismaStore.ts` parse. Gate green (typecheck/lint/format/**2920 passed / 74 skipped**/`@app/web` build) + gated-PG `commishStatWrite` **8/8** (+3 2b: multi-field SET re-scores + idempotent, rolePlayed-survives-clear, gate-isolation on real Postgres). **Source-only → MERGED** (`db2a2bc`, verified ancestor of `origin/main`; stacked on Thread 1+2). See design/COMMISH_2B_stat_editor.md + ARCHITECTURE.md → §28.3 + PROJECT.md → 2026-07-01 (Thread 2b) + [[commish-tier1-writes-layer]].

## 2026-07-02 — Commissioner console Thread 3a: SAFE repairs implemented — relocation, post-mutation audit, conservative restate (`feat/commish-roster-repair`)

**Decision 1 — reuse via RELOCATION, not duplication (cleared design ruling 2).** The worker DI orchestrators + core helpers moved VERBATIM into new `@app/commish-core` (`193193a`, all seven files `R100`; package.json/tsconfig/index-barrel are the only new files; worker imports re-pointed, CLI byte-identical). Web and CLI now share ONE runner implementation — zero re-derivation, and a future 3b slice (if ever cleared) changes runner call-sites, not logic copies. Supersedes the design's Option-2 fallback (web re-orchestrates).

**Decision 2 — 3a = SAFE slice only, GUC unreachable BY CONSTRUCTION (cleared ruling 1).** The web handlers hardcode `allowPostKickoff:false` / `allowLocked:false` / `allowLockedSlot:false` as literals; the request bodies have no such fields and smuggled flags are unit-proven ignored. A locked-slot attempt fails CLOSED (409, zero writes, no GUC, message names the deferred 3b/CLI path — `release-locked`, `forfeit-requires-confirm`, `played-player-started`, the `saveLineup` latch `conflict`, the kickoff `blocked`). THE DECISIVE gated-PG proof: trigger-armed canary + locked-bystander-immovable through a 3a repair + rollback-verified negative guards (`commishRepair.integration.test.ts`, own `COMMISH_REPAIR_PG_TEST_URL`). NO dangerous-bypass controls render in the UI (not even disabled).

**Decision 3 — audit is POST-MUTATION, `audit_pending` on failure (cleared ruling 3, B4).** The reused primitives own their `$transaction`s and accept no injected audit insert; folding the audit in would mean editing a primitive (forbidden). So the `commish_audit` row lands in its OWN tx after the mutation commits; on an audit-write throw the route returns **200 with `audit_pending:true` AND the complete would-be payload** (action_type, target_ref, detail incl. bypass flags, delta, reversible) for manual recovery — never a bare 500, never a silent unlogged mutation. Honest contingent reversibility per A3: 3a repairs record `reversible:true`.

**Decision 4 — action strings reused, no union edit (cleared ruling 4).** `roster_repair` for add/add-drop AND trim (trim marked in `detail`: `trim:true · drop-lock bypass · N released`); `lineup_repair` for the XI edit. Both pre-existed in `COMMISH_ACTION_TYPES` — no `@app/shared` edit, no migration.

**Decision 5 — restate = the A6 rollup tail with the B3 conservative scope.** `createCommishRestate` runs `recomputeManagerPeriod(..., {allowFrozen:true})` + `markManagerPeriodProcessed` per period, then `recomputeStanding` once — NOT `createCommishRescore` (wrong entrypoint: a repair changes slot membership, not a player's `score_player_match`). Scope: lineup repair = exactly the edited period; roster/trim = the league's **not-closed** periods ∪ the pinned period (named sub-decision — a released unlocked slot in a CLOSED period scores 0 by definition, so the bounded set is sufficient; a pure add is a cheap no-op re-sum). A restate throw → `restate_pending` 200 (the Thread-2 `fireRescore` pattern), with the idempotent-skip remedy stated.

**Decision 6 — one gate, shared.** Thread-2's `gate()` is now exported from `handleStatCorrection.ts` (with `email` added to `GatePass` for the runner actor) and reused by the repair handlers — one 401-before-403 ordering across Threads 2/2b/3a rather than a copied predicate.

**Invariants + gate.** ZERO edits to `packages/faab`/`packages/lineup`/`packages/recompute`/`packages/scoring` (empty `git diff --stat main...HEAD` on all four). Full DoD gate green: `pnpm -w typecheck`/`lint`/`format:check`/**2951 passed / 83 skipped** (RED spine `a979abe` in history)/`@app/web build` + gated-PG `commishRepair` 6/6, `commishStatWrite` 8/8, `commishAuditRls` 10/10, faab `release` 6/6 on a throwaway `postgres:16`. **Source-only → merge HELD** for Chat clearance (roster/lineup mutations on a live tournament — Sergio's call). See PROJECT.md → 2026-07-02 + ARCHITECTURE.md → §28.4 + design/COMMISH_3_roster_lineup_repair.md + [[commish-tier1-writes-layer]].

## 2026-07-02 — Commissioner console Thread 4: freeze/unfreeze semantics, guard, and idempotency (`feat/commish-freeze`)

**Decision 1 — ship the REAL semantics, not the design prototype's.** The admin prototype's freeze copy ("Lineups locked · scoring paused") describes machinery `frozen_at` does not touch. Step-0 discovery pinned the truth: the ONLY consumer of `frozen_at` as a gate is `recomputeManagerPeriod` (skips unless `allowFrozen`; the sweep leaves the skipped marker unprocessed — `recompute.ts:99,192`). Console copy therefore states: freeze = results final now (auto-restatement stops); unfreeze = re-open auto-restatement (pending corrections apply on the next sweep). Supersedes the prototype wording only — no code semantics changed anywhere.

**Decision 2 — idempotency = typed 409, not a silent 200.** An already-frozen freeze (or not-frozen unfreeze) returns `already_frozen`/`not_frozen`. Rationale: a 200 without an audit row breaks the ribbon's "every action is logged" contract, and inserting an audit row for a no-op logs an action that never happened. The store enforces it race-safely: conditional `updateMany` (expected prior state in the WHERE, mirroring the cron's status transitions) + the audit insert in ONE `$transaction`; count 0 → null → 409, no write, no audit row. The realistic race is the hourly cron stamping concurrently — benign by construction.

**Decision 3 — freeze guard = status-closed OR all-fixtures-FT; anomalies stay unfreezable.** Never a live/future wave. A period with a postponed/abandoned fixture can't satisfy either arm (the status lifecycle also keys on all-completed), so the cron's anomaly escape hatch ("needs manual commissioner override") is NOT this endpoint — flagged for a later slice if ever needed.

**Decision 4 — no restate trigger on unfreeze; the worker does it.** Freeze-skip deliberately leaves `manager_period` markers claimable, so unfreeze needs no `createCommishRestate`/`createCommishRescore` call — the ≤60s sweep restates on its own. The response instead surfaces `pendingDirty` (counted pre-write, stamped into the audit `detail`) so the commissioner knows a restatement will fire. The manual-unfreeze → hourly-cron RE-FREEZE interaction (verified: the cron's `frozenAt: null` query has no exclusion) is surfaced as an explicit warning string in the response + panel copy (~1h correction window).

**Decision 5 — shared guard predicates.** `periodFreezable`/`periodLive` live in `handleFreeze.ts` and are imported by `loadCommish.buildOps`, so the panel's disabled-button state and the server's 409 guard are the same function — the §28.5 no-disagreement rule. `period_freeze`/`period_unfreeze` already existed in `COMMISH_ACTION_TYPES` (seeded by Thread 1), so Thread 4 edits NOTHING outside apps/web.

**Invariants + gate.** packages/scoring + packages/recompute + periodClose cron + schema byte-untouched (empty diffs). Gate green: typecheck/lint/format/**2974 passed / 88 skipped**/`@app/web build` + gated-PG `commishFreeze` 5/5 (freeze-blocks-sweep, unfreeze-restates, allowFrozen-unaffected, audit-rollback atomicity, race guard) on `COMMISH_FREEZE_PG_TEST_URL`. **Source-only → merge HELD** for Chat clearance (touches the gate protecting FINAL results). See PROJECT.md → 2026-07-02 (Thread 4) + ARCHITECTURE.md → §28.5 + [[commish-tier1-writes-layer]].

## 2026-07-02 — Commissioner console Thread 5: round-advance surface — relocation, atomic audit, pinned overrides (`feat/commish-advance`)

**Decision 1 — relocate the advance orchestrator to `@app/commish-core`, Prisma adapter behind a subpath.** `advance.ts` + `advanceStore.ts` moved as pure git renames (100% similarity, SHA-256 identical pre/post — the `193193a` precedent); worker keeps CLI + tests with import re-points only. The Prisma adapter + memory double export via `@app/commish-core/advanceStore` (NOT the root) so importing the orchestrator never pulls the `@app/db` runtime graph into pure handlers/tests — the `@app/faab/prisma` subpath pattern. The orchestrator's internal `@app/commish-core` self-import resolves via the package's `exports` field (Node self-reference), so the moved file needed zero edits.

**Decision 2 — the web store re-owns the apply transaction (audit atomic with the cut).** The relocated adapter's `applyRoundCut` opens its own `$transaction`, and Prisma interactive transactions don't nest — so the web adapter (`commishAdvanceStore.forAdvance`) delegates READS to the verbatim adapter but re-implements the WRITE as the same two conditional `updateMany` claims + exactly ONE tx-bound `recordCommishAudit` insert (`round_advance`, `reversible:false`) — the Thread-4 freeze-store shape. Mirror-drift risk is pinned by the gated-PG suite (exact-cutCount flip, FK-rollback atomicity, already-cut no-op writes no ledger row). Rejected: a `$transaction`-shim proxy over the tx client to reuse the verbatim write (clever, fragile against Prisma internals — "boring and reliable" wins); post-mutation audit in its own tx (the 3a contingency) — unnecessary here because the claims are plain updateMany, not reused engines that own their transactions.

**Decision 3 — `allowIncomplete` never rides the web surface.** `parseAdvanceBody` doesn't read the flag; the handler hardcodes `false` (3a smuggled-flags precedent; test pins an `allowIncomplete:true` body still refusing an unfrozen round). Cutting an unfrozen round is the CLI-only emergency path (`--allow-incomplete`).

**Decision 4 — dry-run synthesizes a fixed preview reason.** The orchestrator front-guards on a non-empty reason even for dry-runs (CLI ergonomics). The panel's initial plan render is a persist-nothing read, so `handleAdvance` threads the constant `ADVANCE_PREVIEW_REASON` on apply:false and enforces the REAL reason (400 `reason_required`) only on apply:true — the boundary where anything persists. Alternative rejected: editing the orchestrator's front-guard (breaks byte-verbatim).

**Decision 5 — status→HTTP: 200 for planned/applied, typed 409 for skipped/needs-commissioner/refused.** Every orchestrator refusal is a current-state conflict (already cut, tie awaiting adjudication, precondition unmet) → 409, body always carrying the discriminated `status` + plan when present so the console renders the blocked ladder; 400 stays reserved for malformed input (bad shape, unknown round label, missing apply-reason). Never a silent 200 masking a refusal on apply (Thread-4 typed-409 idempotency rule).

**Decision 6 — a boundary tie is resolved by a SERVER re-dry-run, never client math.** In `needsCommissioner` the resolution carries only `{tied, cutsRemaining}` — deriving the outright-cut set client-side would re-implement `selectGuillotineCuts` boundary math. The panel's chip picker (exactly `cutsRemaining` selections) triggers a breakTie DRY-RUN; the orchestrator adjudicates and returns the DETERMINED plan naming the full eliminated set + champion, which feeds the type-to-confirm copy. The apply then re-sends the same breakTie.

**Invariants + gate.** packages/scoring + packages/recompute byte-untouched (empty diffs); apps/worker = import re-points only; no schema/migration/RLS/Realtime (`round_advance` joins the free-TEXT union). Gate green: typecheck/lint/format/**2999 passed / 94 skipped**/`@app/web build` + gated-PG `commishAdvance` 6/6 on `COMMISH_ADVANCE_PG_TEST_URL` + the relocated worker `advanceStore` PG 3/3. **Source-only → merge HELD** for Chat clearance (surfaces the irreversible `playoff_entry` cut on live data). Thread 5 also reconciled the Thread-4 BACKLOG drift (merge HELD @ `9961c7f` → MERGED + DEPLOYED `d367d41`, verified `merge-base --is-ancestor`). See PROJECT.md → 2026-07-02 (Thread 5) + ARCHITECTURE.md → §28.6 + BACKLOG.md → Commissioner console.

## 2026-07-02 — Commissioner console Thread 6: console closeout (`feat/commish-closeout`, source-only, LAST thread)

**Decision 1 — Draft-setup tab removed, not left as an inert placeholder.** The draft ran and completed pre-tournament; a "Draft setup" control on `/commish` can never execute again, so keeping it as a 5th inert tab (Thread-1 precedent for a genuinely upcoming feature) mischaracterizes it as future work. Tab entry + placeholder markup + the dead `adm-*` CSS for it are deleted; `/draft` itself (the historical draft room) is untouched. Console goes from 5 tabs → **4** (Audit log, Stat corrections, Roster & lineup, Game operations, Playoff cuts — correction: the spec's premise of "4→3" was factually wrong going in, and no pre-existing tab-count test existed to update; this thread adds the first one).

**Decision 2 — close the `DECISIONS.md:3397` nav seam by threading `getViewerIsCommissioner()` per layout, not by making `AppShell` async.** Thread 1's Decision 6 explicitly deferred global surfacing and named two options: (a) thread the flag through each layout, or (b) wrap `getSessionManager()` in React `cache()` and have the shell source it itself. Chosen: **(a) with (b) underneath** — `getSessionManager()` is memoized via `cache()` (one Supabase+Prisma round-trip per request, shared by every caller in that request rather than re-fetched per layout) and a new pure `getViewerIsCommissioner()` IO edge wraps it; each of the 10 feature layouts (`dashboard`, `draft`, `lineup`, `vsfield`, `waivers`, `pool`, `standings`, `playoffs`, `games/[matchId]`, `settings`) calls it and passes `isCommissioner` into `<AppShell>`. `deriveIsCommissioner` (the pure predicate — delegates to the same `resolveCommissioner` the `/commish` gate uses) is split into its own dependency-free module so it stays unit-testable without pulling in the `server-only` guard that `manager.ts` carries. Rejected: making `AppShell` itself async and calling `getSessionManager()` from inside the shared shell — collapses to the same network cost once memoized, but couples every route's shell render to the auth IO edge and forecloses layouts that want to gate on something else later. Pinned by a 10-layout block in `appShell.test.ts` (each layout asserted to import `getViewerIsCommissioner`, be `async`, and thread `isCommissioner` into `AppShell`) + `deriveIsCommissioner.test.ts` (4 cases: flagged commissioner, allowlist-email-without-flag, non-commissioner, every non-ok outcome).

**Decision 3 — the blocked-banner copy maps exactly ONE orchestrator refusal, at the display layer, not the orchestrator.** `packages/commish-core/src/advance.ts`'s "not frozen" front-guard reads naturally on the CLI (`--allow-incomplete` is a real flag there) but `handleAdvance.ts` hardcodes `allowIncomplete: false` on the web surface (Thread-5 Decision 3) — so telling a commissioner to "pass --allow-incomplete" points them at a flag the console will never honor. `mapAdvanceRefusal()` (new, `apps/web/src/commish/advanceRefusalCopy.ts`) pattern-matches ONLY that string and rewrites it to `"round {label} is not frozen — freeze the round in Game operations first."`; every other refusal reason (already-cut, tie-awaiting-adjudication, etc.) passes through verbatim. Applied at both read sites — `handleAdvance.ts`'s `toHttp()` (the POST response's skipped/needs-commissioner/refused bodies) and `loadCommish.ts`'s SSR dry-run preview — so the banner reads the same on first paint and after a blocked apply. The orchestrator string itself is untouched; `packages/commish-core` diff is empty.

**Decision 4 — reverse-action execution on audit rows is WON'T-BUILD, not a deferred TODO.** The `commish_audit` ledger is a reversibility RECORD (what happened, by whom, why, and whether it's reversible), not a control surface for undoing itself. A generic "replay the opposite of this row" action would need to re-derive commissioner intent per `action_type` — a `penalty_applied` reversal is "re-apply the prior value," a `stat_correction` reversal is "restore the prior overlay," a `round_advance` reversal is impossible by design (`reversible:false` — `playoff_entry` flips are irreversible, per Thread 5). The reversible cases already have dedicated undo paths (delete/clear the manual penalty, rating, or stat-overlay row via the existing repair tabs), so a generic reverse-action button would duplicate those paths for the reversible rows while lying about capability for the irreversible ones. Closed as WON'T-BUILD, not carried forward as backlog.

**Invariants + gate.** `packages/` diff EMPTY (`git diff --stat packages/` and `git status --porcelain packages/` both empty — verified before this entry). Full DoD gate green: typecheck (17/17 workspace projects) + lint + format:check + **3019 passed / 94 skipped** (+17 over Thread 5's 2999) + `@app/web build` (all 10 re-wired layouts render `ƒ` dynamic). No schema/migration/RLS/Realtime. **Source-only → MERGED `--ff-only`** (feature commit `351ab09`, Sergio-authorized merge per CLAUDE.md's "simple, contained changes" delegation — code-autonomous merge/push/deploy/teardown). See PROJECT.md → 2026-07-02 (Thread 6) + ARCHITECTURE.md → §28.7 + BACKLOG.md → Commissioner console (now CLOSED). Related: [[commish-tier1-writes-layer]] (Thread 1's Decision 6, the seam this thread closes).

## 2026-07-03 — T-LAUNCH: public multi-league relaunch — UCL retarget, distribution, and process decisions (`audit/launch-readiness`, docs-only)

**Decision (a) — launch timing: post-WC2026 final, no mid-tournament changes.** The relaunch (multi-league, UCL, native stores) does not begin until after the World Cup 2026 final on 2026-07-19. The live private league keeps running byte-untouched through the tournament; every finding and thread from `audit/AUDIT_LAUNCH_readiness.md` is diagnosis for AFTER that date, not a call to start migrating a live single-league season mid-flight.

**Decision (b) — relaunch target is UEFA Champions League, current Swiss-model format.** 36 clubs in one league-phase table, 8 matches per club against 8 different opponents, top-8 straight to the R16, seeds 9–24 play a two-legged playoff round, R16→SF two-legged, single-match Final. No groups; club identity, not national teams. This is the format the schema/engine work in the 11-thread decomposition (PROJECT.md → 2026-07-03) targets — chosen over sticking with a national-team format because it is the audit's explicit mandate, not a re-opened option (`[[no-reopening-spec-pinned-decisions]]`).

**Decision (c) — product model is multi-league: self-serve private leagues.** XI moves from one hardcoded league (today's global `league.findFirst()` / global commissioner / global allowlist singletons — Lane C's 96-row structural inventory) to N independently-provisioned leagues a user can create and invite others into. This is the decision that makes Lane C's tenant-identity findings (F-C01 through F-C19) migration-class work rather than optional cleanup — MT-1/MT-2 in the thread decomposition exist because of this choice.

**Decision (d) — distribution is Apple App Store + Google Play, App Store bar = best-in-class, not minimum-pass.** Both native stores are in scope (not web-only or PWA-only); Google Play ships via a TWA/Bubblewrap wrapper (a lighter lift once the public-web gate is READY), Apple ships via a Capacitor wrapper needing its own auth bridge (magic-link PKCE does not survive WKWebView) and a native push transport (Web Push/VAPID is dead inside a non-PWA iOS wrapper). "Best-in-class" — not "passes review" — is the explicit bar, which is why STORE-3 (native quality layer: offline views, haptics, share sheets, widgets) is a scoped thread rather than deferred indefinitely.

**Decision (e) — PROCESS: model selection for agent lanes — Opus default, Fable for heavy orchestration/synthesis, never Sonnet.** Locked after the 2026-07-03 launch audit's Sonnet-lane failures (broad-scope lanes died in a loop: huge read sweep → giant single-shot StructuredOutput → schema-validation fail → retry → "Prompt is too long" → respawn — three manual interventions were needed before the run was moved to Opus). See `[[no-sonnet-subagents]]` memory for the full failure mode and the narrow-scope + output-cap mitigation that went with the model change (model choice alone was not sufficient).

**Invariants + gate.** Docs-only — no code, schema, or brain-content change beyond this entry and the two upstream audit commits (`AUDIT_LAUNCH_readiness.md` @ `9c71375`, docs-only). Commit carries `[skip render]`. **Docs-only + pre-authorized → MERGED `--ff-only`**, worktree + branch torn down. See PROJECT.md → 2026-07-03 (T-LAUNCH readiness audit) + BACKLOG.md → T-LAUNCH.

## 2026-07-03 — T15-CUT: "The Cut" unified knockout — composition boundary, demote-lite, and the exclusions (`feat/the-cut-reskin`, review-class)

**Decision (a) — Shape B locked: `/vsfield` is THE knockout surface ("The Cut"); `/playoffs` demotes to the ceremonial Theater (no logic).** One ladder owns the knockout mental model — the tab where you see how you stand against everyone. The theater keeps the Chocoyo hero/blade choreography/champion endgame/OnTheBlock and the mechanics explainer; deleting it would break nothing. The old hides-vs-shows conflict (ARCH §27 hide vs the reference's show-the-fallen) resolves as **one ladder, two sections**: the §27 live-field filter stays byte-identical for the alive ladder; the fallen are an ADDITIVE loader-composed sibling from the PRE-filter engine output.

**Decision (b) — the displayed blade always projects from the engine's cut derivation, never a re-derivation.** `buildKnockoutContext` consumes `buildPlayoffsView`'s live round (`ranked[].state`, tie-widened provisional zone via `resolveRoundCut` + the shared cumulative tiebreak). A naive "bottom N by round score" would drift from the commish apply path on boundary ties — pinned by a widened-zone unit test. The cut LINE stays count-based (`entrants − cutCount`) while zone TAGS are authoritative, so a tie honestly shows more tagged rows than below-the-line slots.

**Decision (c) — knockout copy truth.** The reference ceremony's aftermath FAAB line (a fresh $100 at the transition) is the banned stale copy — EXCLUDED from the port (rider A); shipped copy reads carry-forward truth and `theCutSkin.test.ts` tripwires any `resets` regression across every knockout surface + the demoted theater. The pend arm invents no clock ("official after stat corrections", no fabricated time). The reference bundle itself stays byte-as-landed (a read-only design record); the design DOCS (README/CLAUDE/COMPONENT_MAP) were truth-fixed this pass.

**Decision (d) — nav is a phase relabel, never a new tab.** `navItemsForPhase` derives over the SAME shared arrays (group returns them by reference — the group nav is byte-identical); knockout/complete relabel exactly two slots (vsfield → "The Cut" + machete glyph + live dot; playoffs → "Theater"). The dot means A KNOCKOUT ROUND IS UNDERWAY — dark in the pend window and post-final. AppShell reads phase via one `cache()`-memoized request-scoped query and degrades to group labels on failure (chrome never 500s a screen).

**Decision (e) — the drill-in sheet rides `?manager=`** (the existing server-validated T3 deep-link param — no new param, no new API surface) via native pushState, so back-gesture dismissal is free; the sheet is pinned to the MANAGER and mounts on phones only (matchMedia-gated because it carries a body-scroll lock). **Sheet z110 / ceremony z120 sit above the z100 bottom nav with scroll locks — a documented screen-local step toward T15-2's global scrims-above-nav pass**, shaped to slot into it.

**Decision (f) — rider rulings recorded:** future-round period-strip chips DROPPED (T11 strip ships unchanged); **F-P3-A3** (mobile top chrome: brand + ConnPill + notifications entry) explicitly DEFERRED as the remaining T15-4 leftover awaiting its own product mini-decision; the vsfield `playoff_entry` Realtime binding MUST be league-filtered (`league_id=eq.<leagueId>`) — the /playoffs channel's unfiltered shape is the flagged anti-pattern, never copied (descriptor-pinned). `loadPlayoffs`'s now-UI-unused `reducedLineup`/`reinforcement` pass-throughs stay (loader byte-identical this pass) — recorded as a future contained trim.

**Invariants + gate.** `packages/` diff EMPTY (scoring/vsfield/recompute/lineup/faab byte-untouched); no schema/migration/RLS/Realtime-publication change; loader delta = additive read-only composition. Full DoD gate green (typecheck/lint/format/**3071 tests**/web build) + `verify-the-cut.mjs` 36/36 + `verify-playoffs-hero.mjs` green unmodified. Review-class → merge HELD at checkpoint 2; cleared + **MERGED `--ff-only`**. See PROJECT.md → 2026-07-03 (T15-CUT) + ARCHITECTURE §27 + BACKLOG → T15.
