# T15-7 — /scoring rulebook truth reconciliation (DIAGNOSIS ONLY)

**Thread:** T15-7-DIAGNOSE · 2026-07-05 · read-only, no code/copy edits
**Ground truth:** `packages/scoring/src/index.ts` (the engine). Cross-confirmed against
`SCORING.md` and `packages/scoring/src/scorePlayerMatch.test.ts` — all three agree with each
other on every value below. The `/scoring` page (`apps/web/app/scoring/page.tsx` +
`apps/web/src/scoring/scoringData.ts`) is the drifted surface.
**Status derived:** origin/main = `17aa83e` at thread start (expected, unchanged).

Scope = the three T15-A findings: F-P1-J1 (§1 ladder + 0-band), F-P1-J2 (§4 ÷10 error +
five missing categories + all four §9 examples), F-P1-J3 (§8 red values).

---

## 1 · Corrected-values table (every discrepancy, page vs engine)

| # | Section | Page shows (WRONG) | Correct value | Engine source |
|---|---------|--------------------|---------------|---------------|
| 1 | §1 rating | `7.5 – 8.4 → +3` (one merged band) | Two bands: `8.0 – 8.4 → +3`, `7.5 – 7.9 → +2` | `ratingPoints`: `index.ts:43-44` (`<8.0 → 2`, `<8.5 → 3`) |
| 2 | §1 rating | `7.0 – 7.4 → +2` | `7.0 – 7.4 → +1` | `ratingPoints`: `index.ts:42` (`<7.5 → 1`) |
| 3 | §1 rating | `6.5 – 6.9 → +1` | `6.5 – 6.9 → 0` (the 0-band — must render, see note) | `ratingPoints`: `index.ts:41` (`<7.0 → 0`); zero-band render behavior `index.ts:92-105` |
| 4 | §4 possession lost | `−1 / 3`, example `5 → floor(5/3) = −1` | `−1 / 10`, example `5 → floor(5/10) = 0` (needs 10+ to cost a point) | `index.ts:244-248` (`floorPer(possessionLost, 10)`); rationale comment `index.ts:241-243`; SCORING.md:125 |
| 5 | §4 | Five categories entirely absent | See §2 below (shots on target, big chances created, accurate crosses, touches, ball recoveries) | `index.ts:150-184` |
| 6 | §8 straight red | `−5 / −4 / −3` | `−4 / −3 / −2` (min 0–29 / 30–59 / ≥60) | `redCardPoints`: `index.ts:61-65`; SCORING.md:122 |
| 7 | §9 GK example | Possession-lost line `3 → ÷3 = −1`; total **14** | Line worth 0 at ÷10 (engine omits 0-lines); total **15** | recomputation in §3 below |
| 8 | §9 DEF example | Possession-lost line `4 → ÷3 = −1`; total **20** | Line worth 0; total **21** | §3 below |
| 9 | §9 MID example | Possession-lost line `5 → ÷3 = −1`; total **17** | Line worth 0; total **18** | §3 below |
| 10 | §9 FWD example | Possession-lost line `6 → ÷3 = −2`; total **21** | Line worth 0; total **23** | §3 below |
| 11 | Header copy | "across ~25 categories" | 33 canonical categories | `SCORE_CATEGORIES`, `types.ts:94-128` |

Placement note (not a value error): the engine models possession lost as a **§8**
negative (`index.ts:241-248`, SCORING.md §8 remap of "dispossessed"); the page displays it
in §4. Where it lives on the page is a copy decision for the fix thread — but whichever
section it lands in, the rate is −1/10.

Sections verified CORRECT as-is (no change needed): §2 appearance (1–59 → +1, 60+ → +2;
`index.ts:107-111`), §3 goal/assist weights (GK/DEF/MID/FWD = 6/6/5/4 and 5/4/3/3;
`index.ts:68-70`), §4 rates for key passes ÷2 · was fouled ÷3 · dribbles ÷2 · duels ÷3 ·
passes ÷15 · long balls ÷2 · clearances ÷5 · blocked shots ÷2 · interceptions ÷3 ·
tackles won ÷3 (`index.ts:128-177`), §5 goalkeeping (inside ÷2, outside ÷3, pen saved +5,
punches+claims ÷2; `index.ts:187-203`), §6 (clean sheet +4 @60′, conceded −1/1;
`index.ts:206-218`), §7 penalties (+2 / −2 / −3; `index.ts:221-227`), §8 yellow −1,
second yellow −3/−2/−1, own goal −4 (`index.ts:230-240`, `secondYellowPoints:54-58`).

### Corrected §1 table in full (8 rows; page currently has 7)

Bands are lower-bound-inclusive (`index.ts:33-47`):

| Rating band | Points |
|---|---|
| 9.0+ | +5 |
| 8.5 – 8.9 | +4 |
| 8.0 – 8.4 | +3 |
| 7.5 – 7.9 | +2 |
| 7.0 – 7.4 | +1 |
| 6.5 – 6.9 | 0 |
| 6.0 – 6.4 | −1 |
| Below 6.0 | −2 |

The 0-band is not cosmetic: the engine deliberately renders a 0-point rating line
(feat/scoring-show-zero-rating-line, `index.ts:92-105`) so a 6.8-rated player doesn't look
"un-rated". The page suppressing/mislabeling this band (+1) directly contradicts what
managers see on their score breakdowns.

---

## 2 · The five missing §4 categories (F-P1-J2)

All from `index.ts:150-184` and `types.ts:44-51` (feat/scoring-promote-lines):

| Stat | Eligible | Rate | Engine source |
|---|---|---|---|
| Shots on target | All | +1 / 3 | `index.ts:151-155` (`floorPer(shotsOnTarget, 3)`) |
| Big chances created | All | +1 / 1 (each) | `index.ts:156-160` (`floorPer(bigChancesCreated, 1)`) |
| Accurate crosses | All | +1 / 4 | `index.ts:161-165` (`floorPer(crossesAccurate, 4)`) |
| Touches | All | +1 / 25 | `index.ts:166` (`floorPer(touches, 25)`) |
| Ball recoveries | **Outfield only** | +1 / 5 | `index.ts:178-183`, inside the `isOutfield` gate — same gating as interceptions |

---

## 3 · Regenerated §9 worked examples (computed through engine logic)

Method: same stat inputs as the current cards, pushed through `scorePlayerMatch`'s actual
rules — corrected rating ladder, possession lost ÷10, engine's omit-at-zero line rule
(`index.ts:82-84`: a 0-point line is not emitted, except the always-shown rating line).
Every changed cell is marked.

### GK — "Clean sheet, busy night" · Win 1–0 · 90 min · Rating 8.2

| Line | Calc | Pts |
|---|---|---|
| Performance rating (8.2) | 8.0–8.4 band (`index.ts:44`) | +3 |
| Appearance (90 min) | ≥60 (`index.ts:109`) | +2 |
| Clean sheet | 90′, 0 against (`index.ts:208-210`) | +4 |
| Saves inside box | floor(6/2) (`index.ts:188-192`) | +3 |
| Saves outside box | floor(3/3) (`index.ts:194-195`, derived saves−inside) | +1 |
| Punches + high claims | floor(4/2) (`index.ts:197-202`) | +2 |
| ~~Possession lost~~ | floor(3/10) = 0 → **line omitted** (`index.ts:82-84,244-248`) | ~~−1~~ 0 |
| **Total** | | **15** (was 14) |

### DEF — "Goal + clean sheet" · Win 2–0 · 90 min · Rating 8.6

| Line | Calc | Pts |
|---|---|---|
| Performance rating (8.6) | 8.5–8.9 band (`index.ts:45`) | +4 |
| Appearance (90 min) | ≥60 | +2 |
| Goal | 1 × 6 (DEF weight, `index.ts:68`) | +6 |
| Clean sheet | 90′, 0 against | +4 |
| Clearances | floor(8/5) (`index.ts:170`) | +1 |
| Tackles won | floor(5/3) (`index.ts:177`) | +1 |
| Interceptions | floor(4/3) (`index.ts:172-176`) | +1 |
| Shots blocked | floor(2/2) (`index.ts:171`) | +1 |
| Duels won | floor(5/3) (`index.ts:138`) | +1 |
| ~~Possession lost~~ | floor(4/10) = 0 → **line omitted** | ~~−1~~ 0 |
| **Total** | | **21** (was 20) |

### MID — "Creative assist, yellow" · Win 2–1 · 90 min · Rating 7.8

| Line | Calc | Pts |
|---|---|---|
| Performance rating (7.8) | 7.5–7.9 band (`index.ts:43`) — same +2 the card already shows (consistent with the ENGINE, inconsistent with the page's own wrong §1 table, which would give 7.8 → +3) | +2 |
| Appearance (90 min) | ≥60 | +2 |
| Assist | 1 × 3 (MID weight, `index.ts:70`) | +3 |
| Key passes | floor(6/2) (`index.ts:128`) | +3 |
| Accurate passes | floor(54/15) (`index.ts:139-143`) | +3 |
| Long balls | floor(4/2) (`index.ts:144-148`) | +2 |
| Dribbles | floor(4/2) (`index.ts:133-137`) | +2 |
| Was fouled | floor(4/3) (`index.ts:129`) | +1 |
| Tackles won | floor(3/3) (`index.ts:177`) | +1 |
| ~~Possession lost~~ | floor(5/10) = 0 → **line omitted** | ~~−1~~ 0 |
| Yellow card | (`index.ts:230`) | −1 |
| **Total** | | **18** (was 17) |

### FWD — "Brace, monster game" · Win 3–1 · 90 min · Rating 9.2

| Line | Calc | Pts |
|---|---|---|
| Performance rating (9.2) | ≥9.0 band (`index.ts:46`) | +5 |
| Appearance (90 min) | ≥60 | +2 |
| Goals (×2) | 2 × 4 (FWD weight, `index.ts:68`) | +8 |
| Assist | 1 × 3 (FWD weight, `index.ts:70`) | +3 |
| Key passes | floor(3/2) (`index.ts:128`) | +1 |
| Dribbles | floor(5/2) (`index.ts:133-137`) | +2 |
| Duels won | floor(4/3) (`index.ts:138`) | +1 |
| Was fouled | floor(5/3) (`index.ts:129`) | +1 |
| ~~Possession lost~~ | floor(6/10) = 0 → **line omitted** | ~~−2~~ 0 |
| **Total** | | **23** (was 21) |

**Copy option for the fix thread:** with the same inputs, all four possession-lost lines
vanish at ÷10 (none of the current example counts reach 10). Either drop the row from the
cards (what the engine would actually emit) or bump the input to a realistic double-digit
count (e.g. `12 → floor(12/10) = −1`) so the examples still demonstrate the negative line.
The second option teaches better; either is engine-faithful. Decision is Sergio's, in the
fix thread. New totals under drop-the-row: GK 15 · DEF 21 · MID 18 · FWD 23.

**Why the §9 drift survived:** `scoringData.test.ts` asserts each card's rows *sum to its
stated total* — internal consistency only. Nothing checks the rows against the engine, so
a wrong-rate row plus a matching wrong total passes green.

---

## 4 · Assessment: generate the tables from engine constants at build time (recommendation only — NOT built)

**Feasibility: high for §9, medium for §1–§8.** Two different problems:

**§9 examples — generate them (clean win, low risk).** `/scoring` is a server component
already importing pure data; `@app/scoring` is pure/no-IO by contract (`index.ts:1-12`),
so the page (or `scoringData.ts`) can import `scorePlayerMatch` directly. Shape: replace
each card's hand-written `lines`/`total` with a `ScoreInput` fixture; derive the rendered
rows and total from the returned `ScoreBreakdown` (its `detail` strings already contain
the arithmetic, e.g. `"5 tackles won ÷ 3"`). The existing sum-check test becomes an
engine-equality test for free. This makes §9 drift **structurally impossible** — any
future rule change flows into the examples on the next build. No engine changes needed.

**§1–§8 tables — don't refactor the engine for it; pin with a probe test instead.** The
constants the tables need are mostly *function-internal literals* (the `ratingPoints` /
`secondYellowPoints` / `redCardPoints` ladders, the inline `floorPer` divisors). True
generate-from-constants requires lifting them into an exported rules manifest that both
the engine and the page consume — a refactor inside the purity-critical, fence-critical
package where the whole point is that it never churns. Two saner options, in preference
order:
1. **Additive rules manifest** — export a `RULES` const from `packages/scoring`
   describing divisor/eligibility/ladder per category, plus a unit test that probes
   `scorePlayerMatch` with synthetic inputs to prove the manifest matches the functions
   (e.g. rating 7.7 → +2, red at 75′ → −2, possessionLost 10 → −1). Page renders §1–§8
   from the manifest. Engine functions stay byte-untouched; the probe test is what makes
   the manifest trustworthy. Kills drift for practical purposes.
2. **Probe-only drift test** (cheapest) — keep the page's hardcoded JSX, add one test that
   asserts every displayed rate/band against engine probes. Drift then fails CI instead of
   reaching production. Doesn't kill drift, but catches it.

**Recommendation:** do the §9 generate-from-engine in the T15-7 fix thread (it *is* the
fix for the four examples), plus option 1's manifest for §1–§8 if appetite allows,
falling back to option 2's probe test if not. Any of these prevents a recurrence of
exactly this incident; the status quo (page copy verified only against itself) guarantees
one.

---

## 5 · Fence compliance

Zero code/copy/CSS/config/test edits this thread. The only file written is this doc.
Next step is Sergio's review of the table above; the copy fix is a separate
clearance-gated thread.
