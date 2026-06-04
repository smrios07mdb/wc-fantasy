# Card Handling — clarification for Prompt 02 (SCORING.md §8)

> Hand to Claude Code as a supplement to CODE_PROMPT_02. It resolves the one §8
> ambiguity (does a second-yellow dismissal also incur the first yellow's −1?) and
> the stoppage-time minute edge. **Boring and reliable: score every card event by
> its own §8 row; suppress nothing.** SCORING.md still wins — this only disambiguates
> a point it left open. **Action for Code:** reconcile the existing card logic with
> the rule below (it may already match — if so, just add the tests; if not, fix to
> match), then add the test matrix. Fold the RULE back into SCORING.md §8 at
> end-of-thread.

## The rule (additive; no suppression)
Card penalties are **additive across distinct bookings**. The engine scores each
card event by its own §8 row and **never removes a yellow because a later card
occurred**:

- **Yellow card → −1.** A player dismissed for a second yellow also received a first
  yellow, so that **−1 still applies, in addition to** the second-yellow bucket.
- **Second yellow → its minute bucket** (−3 / −2 / −1). It is **not** also scored as a
  straight red — it has its own row.
- **Straight (direct) red → its minute bucket** (−4 / −3 / −2), with **no** −1 (no
  caution preceded it). If a player is cautioned and *later* shown a *separate* direct
  red, **both** apply: −1 + the red bucket.

Consequences this produces (sanity checks, not extra rules):
- A two-yellow dismissal = −1 + (−3/−2/−1) = **−4/−3/−2**, i.e. **identical to a
  straight red at the same minute band** — which is exactly why §8's second-yellow row
  sits one point above the red row (the missing −1 is the first yellow).
- A late (60–90) second yellow scores **−2**, strictly worse than a lone yellow (−1).
  The no-stacking reading would make them equal — the reason this rule is stacking.
- The engine needs **no "this yellow was upgraded" suppression logic**; it just sums
  rows. That is the boring/reliable reason to stack rather than subsume.

## Minute buckets (state the convention; the top band is a ≥60 catch-all)
Use **lower-bound-inclusive** bands on the booking's match minute (matching the
rating-ladder convention), with the **top band extended from "60–90" to ≥60**:

| Match minute | Second yellow | Straight red |
|---|---|---|
| `minute < 30` | −3 | −4 |
| `30 ≤ minute < 60` | −2 | −3 |
| `minute ≥ 60` (catch-all) | −1 | −2 |

The ≥60 catch-all is load-bearing: a **stoppage-time dismissal at 90+N** (where
`time_minute + added_time` exceeds 90) must land at −2, **not fall through to 0**.
Bucket on the effective minute, including `added_time` if the feed splits it. (This
≥60 extension is the only place this clarification goes beyond §8's literal text.)

## Input-shape requirement (feed → ScoreInput; next prompt — flag only)
For the −1 to stack, the input must represent a two-yellow dismissal as **both** a
yellow **and** a second-yellow — the engine can only sum what it's given. So the
`match_events` → `ScoreInput` mapping (later prompt) must set the first-yellow signal
alongside the second-yellow, and must classify the dismissal as **second yellow, not
red** (this is the `match_events.incident_class` "second-yellow vs red" item already
flagged confirm-in-code in ARCHITECTURE §7; misclassifying it as a red would both
double-dip and over-penalize). The engine itself stays a pure sum.

## Tests to add (Vitest; §8 card matrix)
Isolated `scorePlayerMatch` cases. Assert the **card subtotal** and the
**presence/absence of each card line** (reference lines via the existing
`SCORE_CATEGORIES` keys, not new strings):

1. **Second-yellow dismissal stacks.** first yellow + second yellow @ 70′ →
   yellow line −1 **and** second-yellow line −1 (≥60) = **−2**; assert **no red line**.
2. **Straight red, no prior yellow.** red @ 20′, no yellow → red line **−4**;
   assert **no yellow line** (no −1).
3. **Yellow + separate straight red.** yellow + red @ 50′ → yellow line −1 **and**
   red line −3 = **−4**; assert **both** lines present.
4. **Stoppage-time catch-all.** red @ 90+3 (effective minute ≥ 60) → red line **−2**,
   not 0. (Mirror: second yellow @ 90+N → −1.)
5. **Baseline single yellow** (regression guard). one yellow, no dismissal → **−1**.
6. **Boundary minutes** (pin the lower-bound-inclusive convention): red @ 29′ → −4;
   red @ 30′ → −3; red @ 59′ → −3; red @ 60′ → −2.

If anything here ever conflicts with a fresh read of SCORING.md §8, **SCORING.md wins**
and leave a `// TODO(prompt-NN):` naming the section rather than inventing a rule.
