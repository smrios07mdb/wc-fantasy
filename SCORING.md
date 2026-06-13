# Scoring Model — LOCKED (Theme A)

One unified model. Sofascore-inspired, position-balanced, high-scoring. No milestone bonuses.

## Core principles
1. **Every action scores for any position.** A save is a save no matter who makes it.
2. **Role-locked items follow the role actually played** (not the listed draft position):
   clean sheet, goals conceded, and the GK keeping stats. → If an outfielder is forced into
   goal (e.g., keeper sent off, no sub keeper), he earns save/punch/run-out points exactly like
   a keeper. No special-case logic needed.
3. **Fractional points allowed.** "For every N" buckets **round down** (e.g., 5 tackles ÷ 3 = 1 pt).
4. **Clean sheet requires 60+ minutes** played.
5. The **rating line applies only to players who received a match rating** (i.e., who played).
6. **A benched played starter forfeits the period** (C1 forfeit model; see DECISIONS Theme B forfeit
   amendment). The forfeit is realized through `is_starter=false` + a `lineup_slot.voided_at` stamp
   (one-way), and a manager-period recompute is enqueued so standings restate. **No point values or
   rollup logic change:** `scoreManagerPeriod` already sums STARTER slots only, so a forfeited (now
   benched) player's banked points are excluded and the player who replaced him counts. The forfeit is
   a lineup state, never a scoring rule.

## ⚠️ Data dependency
Values below assume a **Sofascore-grade feed**, including the proprietary **Sofascore player match
rating**, to which this ladder is calibrated.
**Update (Architecture thread):** BALLDONTLIE's WC feed *also* exposes a **native per-match `rating`**
(0–10), but its provenance is unknown — so **Sofascore (scraped) remains the PRIMARY rating source**,
and BALLDONTLIE's rating is the **automatic fallback** when the scrape is missing for a player-match
(applied to the same ladder; commissioner-overridable). The rest of the model is provider-agnostic
given sufficient stat granularity. See DECISIONS.md → Data source, and the per-line feed mapping in
**ARCHITECTURE.md §7**.

## 1. Performance Rating — all who play — AMPLIFIED ladder
| Sofascore rating | Points |
|---|---|
| < 6.0 | −2 |
| 6.0–6.5 | −1 |
| 6.5–7.0 | 0 |
| 7.0–7.5 | +1 |
| 7.5–8.0 | +2 |
| 8.0–8.5 | +3 |
| 8.5–9.0 | +4 |
| 9.0–10 | +5 |

## 2. Appearance — all
| Minutes | Points |
|---|---|
| 1–59 | +1 |
| 60+ | +2 |

## 3. Attacking — position-weighted
| Stat | GK | DEF | MID | FWD |
|---|---|---|---|---|
| Goal | 6 | 6 | 5 | 4 |
| Assist | 5 | 4 | 3 | 3 |

_(GK assist +4 → +5 in Prompt 29)_

## 4. Universal accumulators (buckets; any player)
| Stat | Rate | Eligible |
|---|---|---|
| Key passes | +1 / 2 | all |
| Successful dribbles | +1 / 2 | all |
| Duels won | +1 / 3 | all |
| Accurate passes | +1 / 15 | all |
| Accurate long balls | +1 / 2 | all |
| Was fouled | +1 / 3 | all |
| Shots on target | +1 / 3 | all |
| Big chances created | +1 / 1 | all |
| Accurate crosses | +1 / 4 | all |
| Touches | +1 / 25 | all |
| Clearances | +1 / 5 | outfield |
| Shots blocked | +1 / 2 | outfield |
| Interceptions | +1 / 3 | outfield |
| Tackles won | +1 / 3 | outfield |
| Ball recoveries | +1 / 5 | outfield |
| ~~Clearance off the line~~ → **dropped** (not in feed) | ~~+2~~ | all |

_(threshold-gated sub-table removed in Prompt 29; dribbles, duels won, accurate passes, and accurate long balls converted to per-N floor-division buckets)_

_(feat/scoring-promote-lines: shots on target, big chances created, accurate crosses, touches, and ball recoveries promoted out of `stat_player_match.extra` into typed columns and given the buckets above — ball recoveries is outfield-only, gated like interceptions/tackles. Aerials were considered and **rejected** — see §8 / Feed availability.)_

## 5. Goalkeeping — GK / role played
| Stat | Rate |
|---|---|
| Save inside box | +1 / 2 |
| Save outside box | +1 / 3 |
| Penalty saved | +5 |
| Punches + high claims | +1 / 2 |
| ~~Successful run-out~~ → **dropped** (not in feed) | ~~+1 each~~ |

## 6. Role outcomes — GK / DEF (role played)
| Stat | Value |
|---|---|
| Clean sheet (60+ min) | +4 |
| Goals conceded | −1 / 1 _(was −1/2 before Prompt 28; updated for tighter defensive accountability)_ |

## 7. Penalties — all
| Stat | Value |
|---|---|
| Penalty won | +2 |
| Penalty committed | −2 |
| Penalty missed | −3 |

## 8. Discipline & negatives — all
| Stat | Value |
|---|---|
| Yellow card | −1 |
| Second yellow (min 0–29 / 30–59 / ≥60) | −3 / −2 / −1 |
| Red card (min 0–29 / 30–59 / ≥60) | −4 / −3 / −2 |
| Own goal | −4 |
| ~~Offsides~~ → **dropped** (player-level n/a; only team-level exists) | ~~−1 / 2~~ |
| ~~Dispossessed~~ → **Possession lost** (feed-native remap; broader) | −1 / 10 _(was −1/3 then −1/8; recalibrated again in feat/scoring-promote-lines — possession_lost is BALLDONTLIE's BROAD turnover stat, not Sofascore "dispossessed", so it scales with touches; /10 keeps it a minor nudge)_ |

**Card handling (clarification — additive; no suppression).** Each card row scores independently
and is summed; a yellow is never removed because a later card followed. A player dismissed for a
**second yellow** keeps the first yellow's **−1** *and* takes the second-yellow minute bucket — so a
two-yellow dismissal equals a straight red at the same band, which is exactly why the second-yellow
row sits one point above the red row. A **straight red** takes its bucket with no −1; a yellow
followed by a *separate* straight red takes both. Minute bands are **lower-bound-inclusive**, and the
**top band is ≥60 (a catch-all)** so a stoppage-time dismissal at 90+N lands in it rather than scoring
0; bucket on the **effective minute** (`time_minute` + `added_time`). *Feed→input note:* the
`match_events`→engine mapping must set the first-yellow signal alongside the second-yellow and
classify a two-yellow dismissal as **second yellow, not red** (the `incident_class` confirm-in-code
item, ARCHITECTURE §7). No point values changed.

## Balance reference
Monster games ≈ **23–26** across all positions (forward hat-trick edges highest). Floors:
GK/DEF reliable (~14), MID/FWD lower and more variable. Tune the rating ladder first if total
scoring needs to move — it's the position-neutral lever.

---

## ⚠️ Feed availability (verified vs BALLDONTLIE WC OpenAPI — Architecture thread)
Scoring **values above are unchanged.** This addendum only records how each line is fed. Full
field mapping: **ARCHITECTURE.md → Appendix A**. Legend: ✅ direct · 🟡 derive · 🟠 manual · ❌ drop.

- **🟣 Rating (§1):** **Sofascore scrape = primary** (the ladder's calibration target); BALLDONTLIE's
  native `rating` = automatic fallback (provenance unknown). Resolver `[manual, scrape, balldontlie]`.
- **✅ Native / direct (BALLDONTLIE):** minutes (§2), goals/assists (§3), key passes, dribbles,
  duels, passing, long balls, was fouled, clearances, shots blocked (defensive — confirmed),
  interceptions, tackles won, **shots on target, big chances created, accurate crosses, touches,
  ball recoveries** (§4 — promoted from `extra` to typed columns in feat/scoring-promote-lines),
  saves inside box, punches + high claims (§5), yellow & red cards with minute (§8).
- **🟡 Derived:** save outside box (`saves − saves_inside_box`); penalty saved & penalty missed
  (from `match_shots` + on-pitch keeper); clean sheet & goals conceded (minutes + match score /
  event minutes); second yellow (card events + minute); own goal (`match_events` own-goal class).
- **🟠 Manual tag (Cowork — no feed field):** **penalty won (+2)**, **penalty committed (−2)**.
  A few per tournament; operator tags the player when a penalty is awarded.
- **❌ Dropped (no feed field; rare / low magnitude):** **clearance off the line (+2)**,
  **successful run-out (+1 each)**, **player-level offsides (−1/2)** (only team-level offsides
  exists; can't attribute to a player).
- **🟡 Proxy:** **dispossessed (−1/10)** → `possession_lost` (broader than Sofascore "dispossessed";
  recalibrated −1/3 → −1/8 → −1/10 since it scales with touches, keeping it a minor nudge).
- **✅ RESOLVED — aerials ⊂ duels (do NOT add an aerial line):** `duels_won` is the TOTAL (ground +
  aerial); `aerial_duels_won` is a strict subset. Verified read-only against the live API (a 51-row
  completed-match sample, 13 rows carrying aerial data): **0 superset violations** (`aerial_duels_won`
  never exceeds `duels_won`), **non-negative remainders** (`duels_won − aerial_duels_won ≥ 0`), and
  **aerial never present without duels**. A separate aerial line would double-count, so aerials stay
  **UNSCORED**; `aerial_duels_won` / `aerial_duels_lost` are retained verbatim in `extra` for reference.
- **⚠️ Confirm during the GOAT trial:** own-goal `incident_class` label; that
  `match_shots.situation` flags `penalty` reliably.

---

## ℹ️ P38 — group-phase dashboard (READ-ONLY reuse; no scoring changes)

Prompt 38 (dashboard group phase) consumed `loadVsField` output (all-play-all standings, field
record, matchday matches) **READ-ONLY** from the dashboard loader. No scoring logic, recompute
pipeline, standings math, or `score_*` / `standing` table was touched. This note records the
boundary explicitly so future readers know the P38 dashboard modules draw from the **already-computed
derived layer** (§4 "Derived layer") and introduce no new scoring path.

---

## ℹ️ P40 — the pick'em pool is a SEPARATE scoring system (do NOT conflate with §1–§8)

Prompt 40 adds a per-match **pick'em pool** (`pool_pick` + the pure `@app/pool`): managers predict each
fixture's result and earn a flat **+1 per correct pick**. This is a **distinct scoring system** from the
player engine above — do not mix the two:

- It scores **picks against match results**, not player stat lines. No rating ladder, no position
  weighting, no recompute-dirty pipeline. A pool result/leaderboard is a **pure function** of
  `pool_pick` + `fifa_match` (`derivePoolResult` / `buildPoolLeaderboard`, mirroring `standing.ts`
  purity), recomputable on read with **no stored `score_*` row**.
- **Group vs knockout** is read from `period.kind` (`group_md` → HOME/DRAW/AWAY; `knockout_round` →
  the advancer via full-time→extra-time→penalties, **never DRAW**), **never** from `fifa_match.round`
  (raw feed text — see DECISIONS → Pool). The player engine never touches picks; the pool never
  touches player scoring.
- **Weight seam:** `weightForPeriod(periodKind, periodLabel)` returns a flat **1** today; an escalating
  knockout weight (e.g. R32→Final 1/2/3/5/8) is a future knob keyed on the canonical `period.label`.
- Separate **leaderboard** (`{ played, correct, points }`, sorted `points desc → managerId asc`) —
  distinct from the all-play-all `standing`. **No §1–§8 value changed.**

## ℹ️ P54 — set-lineup formation picker (NO scoring change)

Prompt 54 adds a formation picker + roster-fillability filter to the set-lineup screen (manager selects
from the fillable ∩ lock-legal shapes; default = persisted shape else first fillable). **No change to
scoring.** Formation only determines *which* owned players start (`is_starter`); the engine already keys
on `is_starter` and scores each starter's stat line identically regardless of shape. Points per event,
the rating ladder, position weighting, and the recompute pipeline are all **untouched** — §1–§8 stand.

## ℹ️ P52 — player box-score modal (NO scoring change; breakdown_json rendered verbatim)

Prompt 52 adds a `PlayerScoreSheet` modal to the set-lineup screen — a per-player point breakdown driven
by `score_player_match.breakdown_json`. **No change to scoring.** The modal is a **read-only display
layer** only: `buildPlayerBox` (pure `@app/player-box`) maps the pre-computed `breakdown_json` lines into
`SectionView[]` grouped by SCORING.md §1→§8 and renders each `ScoreLine.detail` verbatim. There is **no
point-value hardcoding in the UI layer** — the authoritative values in §1–§8 above are always the source
of truth; the modal only renders what the engine already computed and stored. `CATEGORY_META` maps each
`SCORE_CATEGORIES` key to its display section/tag/label using the canonical section names from this
document; if the engine is updated, the recomputed `breakdown_json` automatically flows to the UI. **§1–§8
values, the rating ladder, position weighting, and the recompute pipeline are all untouched.**

## ℹ️ 2026-06-12 cross-match lock fix (NO scoring change — `locked_at` never enters scoring)

The premature-lock recurrence fix (single `lockSlot` write boundary with a team + status gate; trigger
self-heal; cleanup SQL — see DECISIONS "RECURRENCE" / ARCHITECTURE §3) touches **only** `lineup_slot.locked_at`,
which governs **swap-editability**, not points. **Scoring is unchanged.** `locked_at` is **never** a scoring
input: §1–§8 read `score_player_match` (rating, events, stats, shots) gated by the recompute **participant**
gate, and forfeits realize through `is_starter` + `voided_at` — `locked_at` appears in neither. A slot reading
locked-or-movable has **zero** effect on the points the engine computes or stores. The §1–§8 values, the rating
ladder, position weighting, and the recompute pipeline are all untouched by this fix.

---

*Note (feat/vsfield-reskin): the Vs-the-Field Direction-A reskin is presentation-only — this document
and the scoring engine are untouched; no scoring change.*
