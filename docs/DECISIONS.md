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

## Open themes — agenda for future threads

### Data source  ✅ LOCKED
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
- Locking is **schedule-driven** (kickoff times) — independent of the live feed.

**⚠️ OPEN VERIFICATION (do at start of Code):** map every SCORING.md category to a BALLDONTLIE
WC field via the OpenAPI spec (https://www.balldontlie.io/openapi/fifa.yml). Niche lines may be
missing — saves split inside/outside box, punches + high claims, successful runs-out, clearance
off the line, was fouled, dispossessed. For any gap: drop the line, or source it from the
Sofascore scrape. Confirm the WC endpoint exposes card **minutes** (for 2nd-yellow/red timing).

**Live nuance:** event-based points update live; the Sofascore rating settles near/after
full-time, so that component lags and adjusts during a match.

### B. Roster & lineups
- Squad size; starting formation constraints; bench size.
- Exact meaning of "set multiple lineups" (pre-set future match-window lineups vs multiple entries).
- "Reduced roster" size for playoffs.
- Edge cases on the 0-minute sub rule (late warmup withdrawal vs unused bench player).

### C. League & format
- Managers per league; draft order / timer / autopick rules.
- Round-robin schedule + tiebreakers; the exact "top X advance" number.
- Guillotine cadence (eliminate per match-window vs per round).

### D. FAAB
- Starting budget; bid timing/processing windows; tie-breaking; waiver vs free-agent rules.

### E. World Cup attrition
- How shrinking player availability is handled as nations are eliminated
  (replacement draft / FAAB-only backfill / roster-size reductions tied to rounds).

### Architecture & stack
- Pragmatic stack + hosting; scheduled jobs; real-time draft room (live order/timer/autopick);
  auth; persistent multi-user state.
