# Handoff: WC Fantasy League — full product

> **You are Claude Code. This is a complete, feature-complete design package for a private
> World Cup fantasy web app.** Your job is to implement it in a real codebase. Read this
> README top to bottom first, then `COMPONENT_MAP.md`, then open the HTML design references.

---

## 0. The prompt (read this first)

Build a **standalone web app for a private World Cup fantasy league** from the design references
in this package. The complete UI/UX is already designed — 15 screens, a design system, and a
component map. **Do not redesign.** Recreate these designs faithfully in a real framework, wiring
them to the (separately-owned) data schema and scoring backend.

**Recommended stack** (the design was authored against it): **Next.js (App Router) + React +
TypeScript + Tailwind CSS**. If the target repo already has a stack, use *its* conventions and
component libraries instead — the HTML here is a **design reference**, not code to paste.

**What makes this app unusual — and why a generic fantasy clone gets it wrong.** The mechanics
below ARE the product identity. The single most important design goal, which your implementation
must preserve, is making them **instantly legible**. When a visual flourish and a fact compete,
**the fact wins** — the score, the lock status, whose turn it is.

1. **Lock-on-play** — a player locks the *instant he plays ≥1 minute*. Until then he's freely
   swappable, *including a benched 0-minute starter*. **No auto-subs.** Every lineup/roster surface
   must make "who can I still move right now vs who's frozen" obvious, live, during matches.
2. **All-play-all ("power record")** — each scoring period you're scored against *every* other
   manager. Standings = weekly **W-L record + total points**; ties break on total points.
3. **Guillotine playoffs** — lowest scorer(s) eliminated each knockout round on a *reduced roster*;
   survivors persist and reinforce via FAAB.
4. **FAAB blind-bid waivers** — $100 budget, **sealed** bids, rolling waiver order breaks ties,
   **void + refund** if you bid on a player whose match already kicked off. The $100 is **one-time
   for the entire tournament — never reset at the playoff transition** (group-stage spend carries
   forward; DECISIONS is authoritative — some older prototypes still demo a stale "reset").
5. **Acquisition cutoff** — you can't pick up a player once *his* match kicks off.
6. **Roster** = 15 (2 GK / 5 DEF / 5 MID / 3 FWD), unique ownership league-wide. **Lineup** = XI
   (1 GK + 10 outfield) within formation bounds, + 4 bench. **Playoff** reduced lineup = 7 + 2.

**Hard constraints (locked — do not change):**
- **Variable N managers** — read the count from data, **never hardcode 12**.
- **Theme** dark-first, light first-class.
- **Accent = cobalt `#4D8DFF`** — marks *you* + primary actions **only**, never a functional state.
  **Gold is removed entirely — never reintroduce it.**
- **Functional colors are always color + icon + word**, never color alone.
- **Time** is UTC-stored; league-local is a *display* concern — be explicit when rendering times.
- **League name is a placeholder: `"WC Fantasy League"`.** No locale/country flavoring, no
  geographic team names, `@example.com` emails only. (Swap points listed in `COMPONENT_MAP.md` §0.)
- **Scoring values are illustrative** — `SCORING.md` was never finalized. Build the box-score
  *layout*; keep point values data-driven, not hardcoded.

---

## 1. Fidelity

**High-fidelity.** Every design reference is a pixel-level mockup with final colors, typography,
spacing, component states, and live interactions. Recreate the UI faithfully using the target
codebase's libraries and patterns. Exact tokens are in `design_reference/ds/ds.css` — treat that
file as the styling contract and port it to Tailwind theme tokens / CSS variables.

---

## 2. About the design files

The files under `design_reference/` are **design references created in HTML/React-via-Babel** —
runnable prototypes showing intended look and behavior. They are **not** production code to copy.

- **The task is to recreate these designs in the target app's environment** (Next.js/React/Tailwind
  recommended), using its established patterns — not to ship the HTML.
- **Each screen is wrapped in a "presenter stage"** — a fit-scaled desktop browser frame + an iOS
  phone frame shown side-by-side, with a demo "sim bar" (play/scrub clock, phase switcher, feed-state
  toggles). **This scaffold is for design review only. Discard it in production.** In the real app you
  render one responsive screen inside the global shell layout, and the "live" states come from real
  data, not the sim bar. The scaffold pieces to drop: `vf-stage` / `vf-frames` / `vf-browser` /
  `vf-phone`, `useFitScale`, the `IOSDevice` bezel, and every per-screen sim bar.
- **The component logic and data-shaping is real and worth porting** — see `COMPONENT_MAP.md` §4 for
  the exact `data.jsx` exports (records, locks, FAAB, seeding) so you don't re-derive them.

To view a prototype: open any `design_reference/*.html` in a browser (they load sibling module
folders + `ds/ds.css` by relative path, so keep the folder structure intact).

---

## 3. What's in this package

```
design_handoff_wc_fantasy/
├── README.md                  ← you are here (the prompt + guide)
├── COMPONENT_MAP.md           ← THE map: one vocabulary, screen→component→state, data modules, gaps
├── CLAUDE.md                  ← project memory: every locked decision + rationale, in depth
└── design_reference/
    ├── Design System.html     ← token + component showcase (start here visually)
    ├── Component Map.html      ← browsable on-brand twin of COMPONENT_MAP.md
    ├── App Shell.html          ← the navigable product: global nav + hosted home
    ├── <15 screen>.html        ← one HTML per screen (list in §6)
    ├── ds/ds.css               ← single source of truth for tokens + component classes
    ├── tweaks-panel.jsx        ← design-review control panel (NOT product UI — discard)
    └── <module folders>/       ← per-screen {data,components,desktop,mobile,app}.jsx
```

**Read order:** `README.md` → `COMPONENT_MAP.md` → open `Design System.html` and `App Shell.html`
in a browser → skim `CLAUDE.md` for the "why" behind any decision → implement screen by screen.

---

## 4. Architecture guidance for the build

- **Global shell first.** `App Shell.html` + the `shell/` module is the canonical chrome and IA.
  Build the layout shell (desktop sidebar **or** top-bar — both are designed; pick one or make it a
  user pref, the design Tweaks both), the mobile tab-bar + Market/More sheets, the persistent bell
  (unread count) and avatar menu, and the commissioner-only gated entry. Then every screen is a route
  rendered inside this shell. IA is in `shell/data.jsx` (§3 of `COMPONENT_MAP.md`).
- **One component vocabulary.** Build each canonical component **once** (PositionBadge, KitChip,
  LockTag, ScorePill, StandingsRow, Countdown, ConnPill, Module, PrimaryBanner, …) and reuse it.
  `COMPONENT_MAP.md` §1 lists every one and where it's defined in the references.
- **Port the data/logic modules, don't re-derive them.** The `*/data.jsx` files already compute
  records, lock states, FAAB budgets, seeding, cut lines, the notification feed, etc., consistently
  across screens. `COMPONENT_MAP.md` §4 is the index. Re-implement these as typed selectors/services
  against your real schema — but keep the *semantics* identical (e.g. standings rank by total wins,
  ties on total points; FAAB ties on rolling waiver order).
- **Tokens → Tailwind.** Port `ds/ds.css` `:root` custom properties into your Tailwind theme (or keep
  them as CSS variables and reference via Tailwind's `theme.extend`). Honor `[data-theme]`,
  `[data-accent]`, `[data-density]` on the document root — the Settings screen's appearance picker
  drives these and they are *real product settings*, not just review toggles.
- **Lock-on-play is live.** It derives from each player's match clock. Architect a single source of
  truth for "match state → player lock state" and feed it to every lineup/roster/free-agent surface,
  rather than recomputing per screen.
- **Responsive, not two codebases.** The references show desktop + mobile side-by-side via the
  scaffold, but they are the *same* responsive screen. Build one responsive component per screen.

---

## 5. Design tokens (summary — full set in `ds/ds.css`)

- **Fonts:** display/scores = Schibsted Grotesk · UI/body = Hanken Grotesk · timers/raw stats =
  JetBrains Mono. Tabular figures wherever numbers align.
- **Accent (you + primary actions only):** cobalt `#4D8DFF`. Alternates: emerald `#2FD39A`,
  violet `#8B7CFF`. **No gold, ever.**
- **Functional (color + icon + word):** live `#FF4D4D` · locked/frozen `#7E8DA8` · yet-to-play
  orange `#E2873C` (dark) / `#C26A1A` (light) · win `#2FBF71` · loss `#E5484D` · draw `#8B95A7` ·
  eliminated `#B05563` · refund `#F09030` · danger `#E5484D` · success `#2FBF71` · info `#4D9BFF`.
- **Position badges (fixed, accent-independent):** GK slate `#5E6E8C` (white text) · DEF `#4DA8FF` ·
  MID `#19E08A` · FWD `#FF6B8A`.
- **Density:** comfortable default; compact available.
- Spacing, radii, shadows, the full component class list (`.btn`, `.pos`, `.pill`, `.dtable`,
  `.countdown`, `.meter`, `.pcard`, …) are all defined in `ds/ds.css` — reuse those semantics.

---

## 6. Screens (the index — full detail in `COMPONENT_MAP.md` §2)

| Screen | File | What the user does |
|---|---|---|
| **App Shell** | `App Shell.html` · `shell/` | Navigate the whole product; global nav + live home |
| Draft Room | `Draft Room.html` · `draft/` | Snake draft, 60s pick clock, queue, autopick |
| Vs the Field | `Vs the Field.html` · `vsfield/` | Live all-play-all for a scoring period; lock-on-play pitch |
| Set Lineup | `Set Lineup.html` · `setlineup/` | Set XI + bench within formation bounds; live locking |
| Dashboard / Home | `Dashboard.html` · `dashboard/` | Status-aware home; phase-adaptive modules |
| My Team / Roster | `My Team.html` · `roster/` | 15-man squad, legality 2/5/5/3, lock status, drops |
| Player Box Score | `Player Box Score.html` · `boxscore/` | Per-player scoring detail, period + season |
| Standings | `Standings.html` · `standings/` | Power-record table; rank by wins, ties on points; cut line |
| Free Agents | `Free Agents.html` · `fa/` | Waiver wire; acquisition cutoff per player |
| Waivers / FAAB | `Waivers.html` · `waivers/` | Blind sealed bids, batch results, void+refund |
| Guillotine Playoffs | `Guillotine Playoffs.html` · `playoffs/` | Survive the cut; reduced roster; reinforce |
| Commissioner | `Commissioner.html` · `admin/` | Gated admin: field lock, stat fixes, ops, audit, view-as |
| Join / Auth | `Join.html` · `auth/` | Private-league magic-link + invite/allowlist gate |
| Notifications | `Notifications.html` · `notifs/` | Alert center grounded in the league's mechanics |
| Settings / Profile | `Settings.html` · `settings/` | Profile, **appearance (real settings)**, sessions |
| — | `Design System.html` · `ds/` | Token + component showcase (reference, not a route) |
| — | `Component Map.html` | Browsable handoff doc (reference) |

---

## 7. Open gaps — flag, don't invent (full text in `COMPONENT_MAP.md` §5)

These were never finalized in the source spec. They are surfaced in-UI as provisional/illustrative;
your implementation should keep them **data-driven and configurable**, not hardcoded:

1. **`SCORING.md`** — exact scoring categories & point values. Box-score layout is final; values are illustrative.
2. **Final playoff field size (8 vs 10)** + exact per-round guillotine cut counts — commissioner-set, TBD.
3. **Group-stage period count** feeding seeding + weekly-record tie handling beyond total points.

**Resolved — don't reopen:** FAAB ties break on the rolling waiver order · gold removed project-wide ·
league name stays the `"WC Fantasy League"` placeholder.

---

## 8. Assets

No external image/font binaries beyond the Google Fonts imported in `ds/ds.css` (Schibsted Grotesk,
Hanken Grotesk, JetBrains Mono). National "flag kits" are generated with pure CSS gradients
(`JERSEY_BG` in `setlineup/data.jsx`) — not image files. All player/manager names are illustrative
placeholders. The league name is a placeholder (see §0). No real brand assets are used.

---

*This package is feature-complete: 15 screens + design system + component map. If you implement
only one thing first, implement the global shell (§4) — everything else is a route inside it.*
