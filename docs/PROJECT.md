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

## Working protocol  ← NEW (locked this thread)
- **One decision/theme per conversation thread.** Keeps context lean and decisions clean.
- These three files are the source-of-truth "brain":
  - `PROJECT.md` (this) — overview, surfaces, protocol, status
  - `DECISIONS.md` — running decision log across all themes + agenda for open ones
  - `SCORING.md` — the locked, build-ready scoring model
- **Start of each new thread:** attach these files (keep them in the Project's knowledge so
  every thread sees them).
- **End of each thread:** update the files with whatever was locked.

## Locked requirements (from brief)
1. Snake draft; unique player ownership per league.
2. Per-player staggered locking — each player locks when HIS match kicks off (only if he plays).
3. Pre-set subs; a sub only fires if the starter played 0 minutes.
4. Group stage: head-to-head; top X advance.
5. Playoffs: guillotine (lowest scorer eliminated each round), reduced roster.
6. Waivers: FAAB blind bid.
7. Standalone website.

## Status
| Theme | Status |
|---|---|
| A. Scoring | ✅ LOCKED (see SCORING.md) |
| Data source | ✅ LOCKED — BALLDONTLIE WC API + Sofascore rating scrape + manual failsafe |
| B. Roster & lineups | ⬜ Pending |
| C. League & format | ⬜ Pending |
| D. FAAB | ⬜ Pending |
| E. World Cup attrition (nations eliminated) | ⬜ Pending |
| Architecture & stack | ⬜ Pending |

## ⚠️ Timeline note
The 2026 FIFA World Cup is imminent. A full Sleeper-grade draft platform is a large build;
a realistic MVP + scope cut should get its own thread early.
