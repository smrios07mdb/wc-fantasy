# World Cup Fantasy — Project Brain

## Product summary
A standalone web app for a **private friends' league**: a FIFA World Cup fantasy game
modeled on Sleeper.com's polish and feature depth, redesigned for a **single-tournament**
format. Snake draft (unique player ownership per league), staggered per-match player
locking, head-to-head group stage, guillotine playoffs on a reduced roster, FAAB waivers.
Not client-facing — fun with friends. Guiding constraint: **"boring and reliable" over clever.**

## Build surfaces (who owns what)
- **Claude Code** — implementation
- **Claude Cowork** — progress tracking + manual/operational steps (draft kickoff, stat
  overrides/corrections, FAAB processing oversight)
- **Claude Chat** — ideation, planning, decisions (this surface)
- **Claude Design** — UX/UI

## Working protocol
- **One decision/theme per conversation thread.** Keeps context lean and decisions clean.
- These files are the source-of-truth "brain":
  - `PROJECT.md` (this) — overview, surfaces, protocol, status
  - `DECISIONS.md` — running decision log across all themes + agenda for open ones
  - `SCORING.md` — the locked, build-ready scoring model
  - `ARCHITECTURE.md` — the locked, build-ready stack / infra spec (split out the way SCORING.md was)
- **Start of each new thread:** attach these files (keep them in the Project's knowledge so
  every thread sees them).
- **End of each thread:** update the files with whatever was locked.

## Locked requirements (from brief)
1. Snake draft; unique player ownership per league.
2. Per-player staggered locking — **a player locks the instant he plays ≥1 minute; until then he
   stays swappable** (refined from "locks at his match kickoff" — a benched 0-minute starter is
   *not* locked).
3. ~~Pre-set subs; a sub only fires if the starter played 0 minutes.~~ **Superseded (Theme B): no
   auto-subs.** Substitution is manual — swap any not-yet-played player. Lock-on-play delivers the
   original 0-minute protection.
4. Group stage: head-to-head — **all-play-all ("power record"); top N advance** (refined from 1v1
   and "top X" — N is the playoff field, set at the transition; likely 8 or 10, see Theme C).
5. Playoffs: guillotine (lowest scorer eliminated each round), reduced roster.
6. Waivers: FAAB blind bid. **(Full rules locked — see DECISIONS.md → Theme D: $100 budget,
   daily pre-dawn batch, free-agency fallthrough, reverse-seed rolling tiebreak, playoff
   reinforcement.)**
7. Standalone website.
8. **Live "vs the field" screen** — required by all-play-all; must show points-so-far alongside
   how much is still to come (see ARCHITECTURE.md → Real-time layer).

## Status
| Theme | Status |
|---|---|
| A. Scoring | ✅ LOCKED (see SCORING.md) — **amended:** 6 verification-forced line changes from the BALLDONTLIE field map (3 drops, 2 keep-via-manual, 1 remap); balance untouched |
| Data source | ✅ LOCKED — BALLDONTLIE WC API (stats/events) + Sofascore rating scrape + manual failsafe (**amended twice:** (1) locking is play-driven → needs live substitution events; (2) verification — **Sofascore scrape is the PRIMARY rating source** (calibration target), BALLDONTLIE's own `rating` = automatic fallback (provenance unknown); ingestion is **polling** (no webhooks at our tier); tier confirmed **GOAT $39.99/mo**) |
| B. Roster & lineups | ✅ LOCKED — 15-man squad (2/5/5/3), XI of 11, lock-on-play / no auto-subs, multiple-lineups defined, playoff cap ≈9 (7+2) |
| C. League & format | ✅ LOCKED — all-play-all regular season (seed by record, ties by total points), period = matchday wave; **snake draft, per-pick timer = config, autopick queue→best-available**; **playoff field flexible (likely 8 or 10), per-round cut ≈2 tapering to 1 over the 5 WC knockout rounds, fixed at the transition**; **guillotine elimination tie = lowest cumulative tournament total points** (commissioner backstop); **late-correction freeze ≈6h after last FT, commissioner-only after**. Only the recruiting-dependent manager/field number is deferred (config) |
| D. FAAB & Waivers | ✅ LOCKED — $100 (resets to a fresh $100 at the playoffs; single budget across knockout rounds); daily pre-dawn blind-bid batch + $0 free-agency fallthrough; per-player kickoff void+refund; rolling waiver-order tiebreak (seeded once by reverse draft order, carried forward into the playoffs — no re-seed; move-to-bottom only when the tiebreak is used); reinforcement = same FAAB cycle on the playoff field |
| E. World Cup attrition | ✅ RESOLVED — folded into the playoff transition + FAAB (reinforcement now fully specified in Theme D) |
| Architecture & stack | ✅ LOCKED (see ARCHITECTURE.md) — TypeScript/Next.js, Postgres via Supabase (+ Auth + Realtime), Render compute (web + workers + cron), polling ingestion, recompute scoring pipeline, lock-on-play live consumer; live "vs the field" screen + draft-room infra specified (draft *rules* now locked in Theme C) |
