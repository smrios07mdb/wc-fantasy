# Claude Code — Prompt 28: Goals-conceded fix + `/scoring` rules reference page

> Paste with the four brain files (PROJECT.md, ARCHITECTURE.md, DECISIONS.md, SCORING.md) + BRAND.md
> in the repo root and Prompts 01–27 in place. Branch off latest merged main.

## Context (read first)

Read **SCORING.md §6** (goals conceded line), **DECISIONS.md → Theme A** (scoring model, the per-N bucket rationale), **ARCHITECTURE.md §1** (the ds.css / Tailwind coexistence situation and the AppShell boundary), and **BRAND.md §1** (the one color rule). Also read the `design/CLAUDE.md` integration approach and the `apps/web/app/shell/` source (AppShell and shell.css) so you know exactly where the nav lives and what you must not touch.

This prompt has **two parts** that ship together on one branch:

- **Part A** — a surgical scoring-engine fix: goals conceded changes from `−1 per 2` (floor) to `−1 per 1` (i.e., every goal conceded costs a point). One-line engine change + SCORING.md update + test snapshot update. Balance rationale: GK/DEF had too soft a floor on conceded goals; the richer-format model absorbs the tighter penalty without breaking position balance.
- **Part B** — a new authenticated route `/scoring` that surfaces the full scoring rules as an in-app reference page, permanently accessible from the cross-nav strip. The scoring system is complex enough (~25 categories, 4 position examples) that it belongs in the app — not buried in an FAQ. This is a **static, server-rendered page** with no API calls.

Guiding constraint, non-negotiable: **boring and reliable.** Brain files win over this prompt.

---

## Part A — Scoring engine fix: goals conceded −1 per 1

### What changes

**One rule, three locations:**

1. **`SCORING.md` §6** — update the table row from `−1 / 2` to `−1 / 1`. Add an inline note: *(was −1/2 before Prompt 28; updated for tighter defensive accountability).*

2. **`packages/scoring/src/engine.ts`** (or wherever the goals-conceded line is computed) — the current implementation floors `goalsConcededWhileOn / 2`. Change the divisor to `1`, i.e. the penalty is simply `goalsConcededWhileOn` (still floored, still a non-negative integer, but floor(n/1) = n). **No other scoring line changes.** Do not touch the clean-sheet threshold (still 60+ min), the role-lock logic (still role-actually-played), or any other §1–§8 line.

3. **Existing tests** — any Vitest snapshot or assertion that encodes the old `−1/2` goals-conceded arithmetic must be updated to `−1/1`. Do not silently delete tests; update them with a comment: `// updated: goals conceded now −1/1 per Prompt 28`.

### What does NOT change in Part A

Everything else in the scoring engine, the schema, the recompute pipeline, the ingestion path, and all other tests. Pure arithmetic fix, nothing structural.

---

## Part B — `/scoring` rules reference page

### Route & placement

- **Route:** `app/(shell)/scoring/page.tsx` — inside the AppShell layout (same group as `/lineup`, `/vsfield`, etc.). This is an **authenticated screen**; gated via the existing `requireManager` / `getSessionManager` pattern used on the other shell routes — copy the same auth check.
- **Nav:** add a **"Scoring"** entry to the cross-nav strip in `AppShell.tsx`. Follow the exact same pattern as the existing nav items (same element, same active-state class, same link approach). **Do not restructure the nav or touch anything else in `AppShell.tsx` / `shell.css`.**
- **Static / server-rendered:** `page.tsx` exports a plain async Server Component. No `'use client'`, no Suspense, no data fetching. All content is hardcoded from SCORING.md — the rules don't come from the database.

### Content — implement SCORING.md exactly

The page renders the complete scoring model as readable, scannable tables. Do not paraphrase or summarise — the rules must be authoritative and complete. Structure:

**Section 1 — Performance Rating (§1)**
Table: Sofascore rating band → points. Note that it only applies to players who received a rating (i.e., played), and that it is the primary tuning lever.

**Section 2 — Appearance (§2)**
Table: minute bands (1–59, 60+) → points.

**Section 3 — Goals & Assists (§3)**
Table: stat × position (GK / DEF / MID / FWD) → points. Make clear rarity = higher reward.

**Section 4 — Universal Accumulators (§4)**
Two sub-tables:
- *Per-N buckets (floor division):* stat, eligible positions, rate. Include an inline example per row (e.g. "5 tackles won → floor(5/3) = +1"). Rows: key passes, was fouled, possession lost (negative), clearances (outfield), shots blocked (outfield), interceptions (outfield), tackles won (outfield).
- *Threshold-gated flat +1 (all-or-nothing):* stat, both threshold conditions, points. Rows: dribbles, duels won, passing accuracy, long balls. Make clear both conditions must be met and there is no partial credit.

**Section 5 — Goalkeeping (§5)**
Table: stat → rate. Note it applies to whoever plays in goal (including an outfielder in an emergency — no special-case logic).

**Section 6 — Role Outcomes: GK & DEF (§6)**
Table: clean sheet (+4, 60+ min required) and goals conceded (−1 per 1 — the Part A value). Add an explicit floor example for goals conceded: "1 conceded = −1; 2 = −2; 3 = −3."

**Section 7 — Penalties (§7)**
Table: penalty won (+2), penalty committed (−2), penalty missed (−3). Note won/committed are manual tags.

**Section 8 — Discipline (§8)**
Table: yellow card, second yellow (with minute bands), straight red (with minute bands), own goal. Prose note that cards are additive (never suppressed); a second-yellow dismissal keeps the first −1 and adds its own band penalty; late dismissal (90+) lands in the ≥60 band.

**Section 9 — Example Games**
Four cards, one per position (GK / DEF / MID / FWD), showing a realistic match scenario. Each card: a header (position badge, scenario description, result + minutes + rating), then a row-by-row breakdown of every scoring line that fires (stat, the arithmetic, the points), a divider, and a bold total. Use the scenarios from the reference design below. These cards are the most important section on the page — they turn abstract rules into intuition.

**Reference design:** the HTML file at `design/design_reference/` for the Scoring screen (if it exists there) is authoritative; if it does not exist, use the layout structure from the HTML artefact Chat provided during the Prompt 28 session as the layout template — match its card structure, two-column rules grid, and four-column examples grid. **Use ds.css tokens for all colours** (do not copy raw hex values from the Chat artefact; map them to the nearest ds.css variable). All four position badge colours must come from the ds.css palette or be defined in `scoring.css` as route-scoped variables if ds.css doesn't already define them.

### Example game scenarios to hardcode

These are the canonical numbers for the four position examples. Hardcode them exactly.

**GK — "Clean sheet, busy night"** · Win 1–0 · 90 min · Rating 8.2
| Line | Stat | Pts |
|---|---|---|
| Performance rating (8.2) | — | +3 |
| Appearance (90 min) | — | +2 |
| Clean sheet | — | +4 |
| Saves inside box | 6 → ÷2 | +3 |
| Saves outside box | 3 → ÷3 | +1 |
| Punches + high claims | 4 → ÷2 | +2 |
| Possession lost | 3 → ÷3 | −1 |
| **Total** | | **14** |

**DEF — "Goal + clean sheet"** · Win 2–0 · 90 min · Rating 8.6
| Line | Stat | Pts |
|---|---|---|
| Performance rating (8.6) | — | +4 |
| Appearance (90 min) | — | +2 |
| Goal | — | +6 |
| Clean sheet | — | +4 |
| Clearances | 8 → ÷5 | +1 |
| Tackles won | 5 → ÷3 | +1 |
| Interceptions | 4 → ÷3 | +1 |
| Shots blocked | 2 → ÷2 | +1 |
| Duels won (5/7 = 71%) | ≥3 & ≥50% | +1 |
| Possession lost | 4 → ÷3 | −1 |
| **Total** | | **20** |

**MID — "Creative assist, yellow"** · Win 2–1 · 90 min · Rating 7.8
| Line | Stat | Pts |
|---|---|---|
| Performance rating (7.8) | — | +2 |
| Appearance (90 min) | — | +2 |
| Assist | — | +3 |
| Key passes | 6 → ÷2 | +3 |
| Passing (58 att, 93%) | ≥40 & ≥90% | +1 |
| Long balls (4 acc, 67%) | ≥3 & ≥60% | +1 |
| Dribbles (4 comp, 80%) | ≥3 & ≥60% | +1 |
| Was fouled | 4 → ÷3 | +1 |
| Tackles won | 3 → ÷3 | +1 |
| Possession lost | 5 → ÷3 | −1 |
| Yellow card | — | −1 |
| **Total** | | **13** |

**FWD — "Brace, monster game"** · Win 3–1 · 90 min · Rating 9.2
| Line | Stat | Pts |
|---|---|---|
| Performance rating (9.2) | — | +5 |
| Appearance (90 min) | — | +2 |
| Goals (×2) | 2 × 4 | +8 |
| Assist | — | +3 |
| Key passes | 3 → ÷2 | +1 |
| Dribbles (5 comp, 83%) | ≥3 & ≥60% | +1 |
| Duels won (4/5 = 80%) | ≥3 & ≥50% | +1 |
| Was fouled | 5 → ÷3 | +1 |
| Possession lost | 6 → ÷3 | −2 |
| **Total** | | **20** |

### Styling

- **Route-scoped stylesheet:** `apps/web/app/(shell)/scoring/scoring.css`, layered on the global ds.css token base. Do not fork ds.css. If position badge colours aren't in ds.css, define them as scoped variables in `scoring.css` — do not hardcode hex values inline.
- **Layout:** two-column rules grid (collapses to one on narrow viewports) for §1–§8; four-column examples grid (collapses to two, then one) for §9. Follow the AppShell's `.sh-content` scroll model — the page scrolls naturally inside it; do not set a fixed height or introduce a second scrollbar.
- **Color rule (BRAND.md §1):** no gold anywhere on the page body. Position badges, active highlights, and all interactive chrome use the cobalt `--accent` token or scoped palette variables. The shell topbar provides the only gold.
- **Points colour convention:** positive points → `--color-success` (or equivalent ds green); negative → `--color-error` (or equivalent ds red); neutral (0) → muted. Match whatever ds.css already names these.
- **Accessibility:** section headings use semantic `<h2>` / `<h3>`; tables use `<thead>` / `<th scope="col">` / `<td>`; position badges carry an appropriate `aria-label`. No motion or animation on this page.

---

## Explicitly OUT of scope

- Any other scoring line — only goals conceded changes.
- Recompute / backfill of already-scored matches (that is an operator step after the fix lands; flag it in your summary so Chat can include it in the runbook).
- Any other AppShell chrome (bell, avatar, More, tab-bar, sheets, commissioner surface).
- Lineup, Vs-the-Field, Draft, FAAB/waivers, Dashboard, Commissioner screens.
- The landing, auth, and hub routes.
- Tailwind / globals.css / Preflight teardown, ds.css fork, per-route ds.css de-dup — all coexist; all post-sprint.
- Deploy, DB migrations, provisioning, seeding.

---

## Tests

`pnpm test` must stay green. Required:

- **Part A:** Update any existing test that asserts the old `−1/2` goals-conceded arithmetic. Add (or update) a focused unit test in `packages/scoring` for the goals-conceded line: 0 conceded = 0, 1 = −1, 2 = −2, 3 = −3. Comment the update with `// updated: goals conceded now −1/1 per Prompt 28`. Confirm the full scoring-engine suite (all other §1–§8 lines) still passes unchanged.
- **Part B:** Light smoke in `apps/web` — the `/scoring` page renders, all eight section headings are present, all four position example cards render with their expected totals (14 / 20 / 13 / 20), and the "Scoring" nav entry is present in the shell. Do not over-test static markup or ds class names.

---

## Definition of done

- [ ] **SCORING.md §6** updated: goals conceded row reads `−1 / 1`; inline amendment note added.
- [ ] **Scoring engine** updated: `goalsConcededWhileOn / 2` → `goalsConcededWhileOn / 1` (or equivalent); no other line touched.
- [ ] All existing tests pass; goals-conceded tests updated with the amendment comment; new 0/1/2/3 conceded unit test added.
- [ ] **`/scoring`** route exists at `app/(shell)/scoring/page.tsx`; server-rendered; auth-gated via the existing manager-check pattern.
- [ ] All eight scoring sections rendered as tables matching SCORING.md exactly (including the Part A updated §6 value).
- [ ] Four position example cards render with hardcoded scenarios and correct totals (GK 14 / DEF 20 / MID 13 / FWD 20).
- [ ] **"Scoring" nav entry** added to the cross-nav strip in AppShell; links to `/scoring`; active state applies correctly on that route. **`AppShell.tsx` and `shell.css` otherwise untouched.**
- [ ] **Shell boundary holds:** page sits inside `.sh-content` scroll region without re-clipping or a second scrollbar; no fixed height on the page root; browser-verified.
- [ ] **Stylesheet discipline:** `scoring.css` is route-scoped and layers on global ds.css; no ds.css fork; no raw hex values that should be tokens.
- [ ] **Color correct:** no gold on the page body; position badges and chrome use cobalt `--accent` or scoped palette variables; points rendered green/red/muted per convention.
- [ ] Tailwind / globals.css / Preflight retained globally; landing / auth / hub / Draft / Lineup / Vs-the-Field all render and function unchanged.
- [ ] `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm --filter @app/web build` green; `/scoring` is a static (`○`) route.
- [ ] No out-of-scope churn: no other scoring lines, no other shell chrome, no other feature screens, no migrations, no Tailwind teardown.

---

## Verification discipline

State only what you directly verified (read code, ran a command, browser-checked a rendered view). Label anything non-observable in this session (live Render deploy, session auth in a real browser) as an **inference to confirm**. The goals-conceded arithmetic and the scoring page layout are fully verifiable in-session. The live auth gate and nav active state are confirmed on the live Render deploy.

**Operator note to include in your summary:** any existing `score_player_match` rows in the database that include goals conceded will have stale `breakdown_json` — a recompute run is needed post-deploy for any matches already processed. Flag this explicitly so it lands in the runbook.

---

## When done

Summarise: exact file changed for the engine fix and the line before/after; which test files were updated and which new test was added; the `/scoring` route's file path and that it is server-rendered and auth-gated; where `scoring.css` lives and that it layers on ds.css without forking; how the nav entry was added to `AppShell.tsx` (element + class used) and that everything else in the shell is untouched; explicit confirmation that the page sits in the `.sh-content` scroll region (browser-verified); which position badge colours came from ds.css vs were defined in `scoring.css`; explicit confirmation that all other §1–§8 scoring lines, all other routes, and Tailwind are untouched. Include the recompute operator note. Report `git log --oneline -1` and `git status` post-commit; branch `feat/scoring-page` off latest main, conventional commit, no force-push. **Hold the merge for Chat's clearance.** Do not start the next prompt.
