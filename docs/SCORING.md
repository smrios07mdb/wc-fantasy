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

## ⚠️ Data dependency
Values below assume a **Sofascore-grade feed**, including the proprietary **player match rating**.
The rating is only available from Sofascore data. The final data-source choice is pending
(see DECISIONS.md → Data source). If the rating is unavailable, that single line is dropped or
replaced with a proxy; the rest of the model is provider-agnostic given sufficient stat granularity.

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
| Assist | 4 | 4 | 3 | 3 |

## 4. Universal accumulators (buckets; any player)
| Stat | Rate | Eligible |
|---|---|---|
| Key passes | +1 / 2 | all |
| Successful dribbles (≥3, ≥60%) | +1 | all |
| Duels won (≥3, ≥50%) | +1 | all |
| Passing (≥40 passes, ≥90%) | +1 | all |
| Long balls (≥3 accurate, ≥60%) | +1 | all |
| Was fouled | +1 / 3 | all |
| Clearances | +1 / 5 | outfield |
| Shots blocked | +1 / 2 | outfield |
| Interceptions | +1 / 3 | outfield |
| Tackles won | +1 / 3 | outfield |
| Clearance off the line | +2 | all |

## 5. Goalkeeping — GK / role played
| Stat | Rate |
|---|---|
| Save inside box | +1 / 2 |
| Save outside box | +1 / 3 |
| Penalty saved | +5 |
| Punches + high claims | +1 / 2 |
| Successful run-out | +1 each |

## 6. Role outcomes — GK / DEF (role played)
| Stat | Value |
|---|---|
| Clean sheet (60+ min) | +4 |
| Goals conceded | −1 / 2 |

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
| Second yellow (min 0–29 / 30–59 / 60–90) | −3 / −2 / −1 |
| Red card (min 0–29 / 30–59 / 60–90) | −4 / −3 / −2 |
| Own goal | −2 |
| Offsides | −1 / 2 |
| Dispossessed | −1 / 3 |

## Balance reference
Monster games ≈ **23–26** across all positions (forward hat-trick edges highest). Floors:
GK/DEF reliable (~14), MID/FWD lower and more variable. Tune the rating ladder first if total
scoring needs to move — it's the position-neutral lever.
