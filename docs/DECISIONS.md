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
  reinforcement (Theme D); 9 = 7+2 is the working default.

### ⚠️ Knock-on
Lock-on-play changes the Data-source assumption (locking is no longer purely schedule-driven) —
see the amendment under **Data source** below.

---

## Open themes — agenda for future threads

### Data source  ✅ LOCKED (amended this thread)
**Hybrid: BALLDONTLIE API (primary) + Sofascore scrape (rating only) + manual failsafe.**
- **Live scoring** (not settled-only) — frequent polling / webhooks during match windows.
- **BALLDONTLIE FIFA World Cup API** = primary feed: schedule, rosters, lineups, events
  (with minutes), per-match player & team stats, live scores. Covers WC 2018/2022/2026.
  Free tier + paid tiers (GOAT / ALL-STAR / ALL-ACCESS); real-time + HTTP-notification webhooks.
  → live per-match stats + webhooks likely require a PAID tier; confirm which.
- **Sofascore scrape** = ONLY the proprietary Sofascore **rating** line. BALLDONTLIE has its
  own ratings for top-5 leagues but NOT Sofascore's. Scraping one field per player keeps the
  fragile surface tiny — far more reliable than scraping everything.
- **Manual input** = failsafe / corrections (BALLDONTLIE also has a Google-Sheets integration).
- Ingestion via **scheduled cron / serverless job** (not a Cowork agent). Cowork = manual
  overrides/corrections only.
- ~~Locking is schedule-driven (kickoff times) — independent of the live feed.~~
  **← SUPERSEDED by the lock-on-play amendment below.**

**⚠️ AMENDMENT (lock-on-play, Theme B):** locking is **no longer purely schedule-driven.** To
lock on *actual play* you need:
- confirmed starting XIs at kickoff (official lineup) → lock all starters;
- **live substitution / appearance events with minute** → lock each sub the instant he enters;
- players never subbed on simply never lock.
The starter half is one lineup pull per match. The **substitution half is now a hard dependency**
— a sub must lock at entry to stay hindsight-proof — so the live feed is **required for locking**,
not optional. Add "live substitution / appearance events" to the OpenAPI verification list
(alongside card minutes). Fallback if live appearances aren't available: revert that match to
kickoff-locking (robust but reintroduces the benched-starter 0), handled via manual override.

**⚠️ OPEN VERIFICATION (do at start of Code):** map every SCORING.md category to a BALLDONTLIE
WC field via the OpenAPI spec (https://www.balldontlie.io/openapi/fifa.yml). Niche lines may be
missing — saves split inside/outside box, punches + high claims, successful runs-out, clearance
off the line, was fouled, dispossessed. For any gap: drop the line, or source it from the
Sofascore scrape. Confirm the WC endpoint exposes card **minutes** (for 2nd-yellow/red timing)
**and live substitution events** (for lock-on-play).

**Live nuance:** event-based points update live; the Sofascore rating settles near/after
full-time, so that component lags and adjusts during a match.

### C. League & format  🟨 PARTIALLY LOCKED (this thread)
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
- **Manager count: target 12** (top 6 advance); **8–10 fallback** if recruiting is light.
  Even-number preference **dropped** (all-play-all has no pairings; odd counts sort fine). 12 is a
  natural ceiling: 6-of-12 keeps ~half the league in playoff contention and preserves the clean
  guillotine cadence.
- **Playoff field = 6**, mapping **one cut per WC knockout round**
  (R32 → R16 → QF → SF → Final = 6 → 5 → 4 → 3 → 2 → 1 champion). This is the default cadence.
- **Caution:** all-play-all punishes inactive managers (a non-setter is a free win for everyone
  compared against him that week, inflating records) → recruit for commitment.

**Still open:** final manager number (recruiting-dependent); draft order / timer / autopick
rules; tiebreakers beyond total points; whether to ever deviate from one-cut-per-knockout-round.

### D. FAAB  🟨 tiebreak principle locked; rest open
- **Locked principle:** FAAB amount is primary; **ties broken by a rolling waiver order**, seeded
  by **reverse draft order** (last pick = first priority), and the **winner of a tied bid drops to
  the bottom**. Works identically in the group stage and the guillotine (no standings needed).
- **Open:** starting budget (and whether it resets for playoffs); bid timing / processing windows
  and how they mesh with the per-player kickoff acquisition deadline; $0 / free-agent vs. waiver
  rules.
- **Now also owns** the **playoff reinforcement** mechanism (see Theme E) — load-bearing for
  attrition.

### E. World Cup attrition  ✅ RESOLVED (folded into playoffs + FAAB)
Handled by the **playoff transition itself**: not all managers advance (freeing their players
back to the pool); lineup requirements shrink (reduced roster, Theme B); guillotine
(everyone-vs-everyone, lowest score eliminated per knockout round); **survivors reinforce via
FAAB**, topped up by freed players from eliminated / non-qualifying managers. No separate
replacement-draft or roster-reduction machinery needed. → Theme D must define the reinforcement
windows/cadence and budget.

### Architecture & stack  ⬜ Pending
- Pragmatic stack + hosting; scheduled jobs; real-time draft room (live order/timer/autopick);
  auth; persistent multi-user state.
- **NEW requirement (UI) — live "vs the field" screen** (made essential by all-play-all). Because
  players lock individually as their matches kick off across several days, a raw "current points"
  leaderboard mid-matchday is misleading (a manager whose players are all done looks ahead of one
  whose stars haven't kicked off). So it must show **points-so-far alongside how much is still to
  come.** Components:
  - live matchday leaderboard of every manager's running score + your provisional weekly record
    (e.g., "6-3 so far");
  - per-manager count of starters yet to play (so the standings are readable live);
  - your head-to-head outcome vs each opponent this week;
  - season view: overall all-play-all record + total points (the seeding tiebreak).
  → Claude Design / Code deliverable.
