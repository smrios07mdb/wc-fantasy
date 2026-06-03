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
- These three files are the source-of-truth "brain":
  - `PROJECT.md` (this) — overview, surfaces, protocol, status
  - `DECISIONS.md` — running decision log across all themes + agenda for open ones
  - `SCORING.md` — the locked, build-ready scoring model
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
4. Group stage: head-to-head — **all-play-all ("power record"); top 6 advance** (refined from 1v1
   and "top X").
5. Playoffs: guillotine (lowest scorer eliminated each round), reduced roster.
6. Waivers: FAAB blind bid.
7. Standalone website.
8. **Live "vs the field" screen** — required by all-play-all; must show points-so-far alongside
   how much is still to come (see DECISIONS.md → Architecture).

## Status
| Theme | Status |
|---|---|
| A. Scoring | ✅ LOCKED (see SCORING.md) |
| Data source | ✅ LOCKED — BALLDONTLIE WC API + Sofascore rating scrape + manual failsafe (**amended:** locking is play-driven → needs live substitution events) |
| B. Roster & lineups | ✅ LOCKED — 15-man squad (2/5/5/3), XI of 11, lock-on-play / no auto-subs, multiple-lineups defined, playoff cap ≈9 (7+2) |
| C. League & format | 🟨 PARTIAL — all-play-all regular season, period = matchday, target 12 (top 6), playoff field 6, one cut per knockout round; draft mechanics + tiebreakers open |
| D. FAAB | 🟨 PARTIAL — tiebreak principle locked (rolling waiver order); budget / windows / playoff reinforcement open |
| E. World Cup attrition | ✅ RESOLVED — folded into the playoff transition + FAAB |
| Architecture & stack | ⬜ Pending (now incl. live "vs the field" screen) |

## ⚠️ Timeline note
The 2026 FIFA World Cup is imminent. A full Sleeper-grade draft platform is a large build;
a realistic MVP + scope cut should get its own thread early. With the rules now largely locked
(A, B, E done; C and D mostly settled), **architecture / MVP-scope is the near-term priority**
once FAAB (Theme D) is closed.
