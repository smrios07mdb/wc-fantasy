# Handoff: Vs the Field — points-at-a-glance on the formation pitch

## Overview
On the **Vs the Field** screen each manager's XI renders as a vertical formation pitch of
flag-kit jerseys. The problem this handoff fixes: a player's **points were only visible after
tapping** him — at a glance the pitch showed status words ("Played" / "TO PLAY") where the
score should be, so you couldn't scan the board for who's scoring.

The fix: **every jersey now carries a points chip in a fixed slot directly under it, and the
points number is the dominant element.** Lock-on-play status no longer competes for that slot —
it reads through a single **live dot** instead. Tapping a player still opens the full
categorized points breakdown (unchanged).

This is a small, surgical change to ONE component (the pitch token) plus its chip styles. The
rest of Vs the Field is untouched.

## About the design files
The files in this bundle are **design references created in HTML/JSX** — a working prototype of
the intended look and behavior, **not production code to paste in**. The task is to **recreate
this token treatment in the real app** (Next.js App Router + React + TS + Tailwind, per the
project) using its existing components and tokens. Map the CSS values below onto the app's
Tailwind theme / design tokens rather than copying the raw CSS.

The prototype's `vsfield2/` React + plain-CSS files are scaffolding for the mockup; production
should express the same result in the app's component for the XI pitch token.

## Fidelity
**High-fidelity.** Final colors, sizes, weights, and states are specified exactly below.
Recreate pixel-faithfully, themed through the app's token system.

## The component: pitch token (`XIToken`)
One button per player on the pitch. Top-to-bottom it stacks three things, centered, `gap: 5px`:

1. **Jersey** — flag-kit shirt, 46×46, clip-path shirt silhouette. (Unchanged by this work.)
2. **Name** — `F. Surname` (first-initial + surname), 700 / 10.5px, white with a dark text
   halo so it holds on any kit.
3. **Points chip** — THE NEW HEADLINE. A pill in a fixed slot showing the number.

### Three player states → three chip treatments
Status comes from the player's match clock (lock-on-play): `live` (his match is in play),
`final`/`played` (his match finished), `ytp` (yet to play — match hasn't kicked off).

| State | Chip | Notes |
|---|---|---|
| **live** (playing now) | dark pill · white text · **red pulsing dot** + `<b>N</b>` + `PTS` | the red dot is the ONLY thing distinguishing live from played |
| **played** (done) | **identical dark pill** · white text · `<b>N</b>` + `PTS`, no dot | same background/border as live — NOT greyed out |
| **ytp** (to play) | faint dashed pill · `–` + `TO PLAY` | no number yet; keeps the slot so the eye still lands there |

Key decisions made with the user, in order, all reflected here:
- The **number is the headline** (bold 17px mono), not a tiny caption.
- Played kits are **NOT dimmed** — full brightness, full-opacity name. (We removed an earlier
  `brightness(.5)` dim on played jerseys.)
- The **live red dot is the sole differentiator** between playing and played — a player with no
  dot has inherently already played, so no extra greying/labeling is needed.
- The **played points pill gets the same dark background as the live pill** — only the dot
  differs. Good contrast on both themes.

## Exact styles (from `vsfield2/v2.css`)
These reference CSS custom properties from the project design system (`ds/ds.css`):
`--font-mono` (JetBrains Mono), `--font-sans` (Hanken Grotesk), `--r-pill`, `--live` (`#FF4D4D`),
`--text-tertiary`, `--ease-standard`.

```css
/* token container */
.sl-tok      { display:flex; flex-direction:column; align-items:center; gap:5px;
               background:none; border:0; padding:2px; cursor:pointer; position:relative;
               transition:transform var(--dur-fast) var(--ease-standard); }
.sl-tok:hover{ transform:translateY(-2px); }

/* jersey — played is NO LONGER dimmed (same filter as default) */
.sl-tok.s-played .sl-jersey { /* identical drop-shadow filter as base .sl-jersey, no brightness() */ }
.sl-tok.s-played .sl-tok-name{ opacity:1; }

/* points chip — the at-a-glance headline */
.sl-tok-score   { display:inline-flex; align-items:baseline; gap:3px;
                  font-family:var(--font-mono); font-weight:800; line-height:1;
                  padding:3px 8px; border-radius:var(--r-pill);
                  box-shadow:0 1px 4px rgba(0,0,0,.3); }
.sl-tok-score b { font-size:17px; letter-spacing:-.01em; }      /* the NUMBER */
.sl-pts-u       { font-size:8.5px; font-weight:800; text-transform:uppercase;
                  letter-spacing:.04em; opacity:.62; }          /* the "PTS" unit */

/* live AND played share one dark pill — only the dot differs */
.sl-tok-score.s-live,
.sl-tok-score.s-played { color:#fff; background:rgba(7,11,17,.86);
                         border:1px solid rgba(255,255,255,.22); }
[data-theme="light"] .sl-tok-score.s-live,
[data-theme="light"] .sl-tok-score.s-played { color:#0E1726; background:rgba(255,255,255,.96);
                                              border-color:rgba(0,0,0,.12); }

/* a true 0 reads slightly softer but still legible */
.sl-tok-score.is-zero   { opacity:.78; }
.sl-tok-score.is-zero b { opacity:.55; }

/* yet-to-play: dashed, no shadow, em-dash instead of a number */
.sl-tok-score.s-ytp { color:var(--text-tertiary); background:rgba(7,11,17,.42);
                      border:1px dashed rgba(255,255,255,.22); box-shadow:none; }
[data-theme="light"] .sl-tok-score.s-ytp { color:#6B7588; background:rgba(255,255,255,.55);
                                           border-color:rgba(0,0,0,.16); }
.sl-pts-dash { font-size:14px; font-weight:800; line-height:1; opacity:.7; }
.sl-tok-score.s-ytp .sl-pts-u { opacity:.85; }

/* live pulse dot — the sole live↔played differentiator */
.sl-score-dot { width:5px; height:5px; border-radius:50%; align-self:center;
                background:var(--live); animation:livepulse 1.4s var(--ease-standard) infinite; }
@keyframes livepulse { 0%,100%{ opacity:1 } 50%{ opacity:.35 } } /* see ds.css for canonical */
```

## Markup / JSX (from `vsfield2/directionA.jsx`)
```jsx
function XIToken({ r, onScore, dimLive }){
  // r.status: 'live' | 'final'(played) | 'ytp'  ;  r.pts: number  ;  r.p: player
  const sCls = r.status==='live' ? 's-live' : r.status==='final' ? 's-played' : 's-movable';
  return (
    <button className={'sl-tok sl-tok-jersey '+sCls+(dimLive?' is-dim':'')}
            onClick={()=>onScore(r.p)} title={r.p.first[0]+'. '+r.p.last+' · tap for points'}>
      <span className="sl-jersey" style={{ background:kitOf(r.p.nat) }}></span>
      <span className="sl-tok-name">{r.p.first[0]}. {r.p.last}</span>
      {r.status==='ytp'
        ? <span className="sl-tok-score s-ytp">
            <span className="sl-pts-dash">–</span><span className="sl-pts-u">to play</span>
          </span>
        : <span className={'sl-tok-score s-'+r.status+(r.pts===0?' is-zero':'')}>
            {r.status==='live' && !dimLive && <span className="sl-score-dot"></span>}
            <b>{r.pts}</b><span className="sl-pts-u">pts</span>
          </span>}
    </button>
  );
}
```
Notes:
- `dimLive` is true when the realtime connection is stale/reconnecting — it suppresses the live
  pulse dot (so a frozen feed doesn't imply live action). Keep that behavior.
- `s-live`/`s-final` map to the live/played chips; the `is-zero` modifier softens a literal 0
  without hiding it.
- `onScore` opens the existing `PlayerScoreSheet` (floating categorized breakdown) — tap-for-
  detail is preserved; this change only makes the headline number always visible.

## Interactions & behavior
- **At a glance:** scan the pitch → every player shows a points number (or `– TO PLAY`).
- **Live vs played:** red pulsing dot = playing right now; no dot = already played. Identical
  pill otherwise.
- **Tap a player:** opens the full categorized points breakdown sheet (unchanged).
- **Stale connection:** live dots are suppressed (`dimLive`).
- **Hover:** token lifts 2px.

## Design tokens used
- Live red: `--live` `#FF4D4D`
- Chip dark bg: `rgba(7,11,17,.86)` (dark theme) / `rgba(255,255,255,.96)` (light)
- Chip border: `rgba(255,255,255,.22)` / `rgba(0,0,0,.12)`
- Points number: JetBrains Mono 800, 17px, `letter-spacing:-.01em`
- Unit "PTS": 8.5px, 800, uppercase, `letter-spacing:.04em`, `opacity:.62`
- Radius: `--r-pill`; chip shadow `0 1px 4px rgba(0,0,0,.3)`

## Assets
None new. Flag-kit jerseys are CSS `background` gradients (`JERSEY_BG_V2` / `kitOf()` in
`directionA.jsx`). **Gotcha:** kit backgrounds are multi-layer `background` shorthands — never
set `background-size:cover` on the jersey, it collapses every layer.

## Files in this bundle (design reference — runnable)
Open **`Vs the Field.html`** in a browser to see the live prototype. The component this handoff
is about:
- `vsfield2/directionA.jsx` — the pitch + **`XIToken`** (the changed component)
- `vsfield2/v2.css` — all `.sl-tok*` chip styles (the lines quoted above)
- `Vs the Field.html` — entry point that loads the stack

Supporting files (`vsfield/*`, `vsfield2/shared|mobile|app.jsx`, `ds/ds.css`, `tweaks-panel.jsx`,
`logo/icons/*`) are included only so the reference runs — they are the broader prototype, not
part of this change.

## Open items (flag, don't invent)
- Point **values are illustrative** pending `SCORING.md` — the UI sums canonical live events and
  marks the rest illustrative. Wire to real scoring when available.
