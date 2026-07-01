/**
 * The `signin` (logged-out front door) state — the XI marketing + login landing, recreated from the
 * design handoff (`design_handoff_landing/XI Landing.html`) as a pure server component. Layout draws
 * entirely from the vendored `ds.css` + `landing.css` (imported once in page.tsx); copy and structure
 * track the reference 1:1.
 *
 * Two deliberate departures from the prototype, both required by the prompt + the app's real auth model:
 *   1. NO self-serve join flow. The reference's inline email-capture forms (hero + CTA) are replaced by
 *      the designed "Sign in" CTA linking to the existing /sign-in magic-link page. The marketing copy
 *      stays, but nothing here creates an account — invited emails sign in at /sign-in.
 *   2. The prototype-only Tweaks panel + its <script> (accent/theme/heroviz toggles, scroll-reveal IO,
 *      email→Join redirect) are dropped (design README: "DISCARD in production"). `.lp-reveal` classes
 *      are kept but render fully visible at rest (the entrance keyframe only fires with `.in`, which no
 *      observer adds) — so the page is static, server-rendered, and needs no client boundary.
 *
 * TODO(confirm): link targets. The three built screens deep-link to their routes (/draft, /lineup,
 * /vsfield) — which auth-gate a logged-out visitor back to /sign-in. The reference's other destinations
 * (Dashboard, Standings, Guillotine, Free Agents, Waivers, Settings) have no route yet, so their cards /
 * footer links point at /sign-in to avoid 404s. Repoint them when those screens ship.
 */
import type { ReactNode } from "react";
import { BrandLink, LpRoot } from "./chrome";

/* --- repeated icons (stroke-based, sized by ds.css where it sets a rule; a default otherwise) --- */
function Check({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function Lock({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function Clock({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function Shield({ size = 13 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    </svg>
  );
}

const EXPLORE = [
  {
    href: "/sign-in",
    title: "Dashboard",
    desc: "Your status-aware home — what matters right now, this phase.",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/lineup",
    title: "Set Lineup",
    desc: "Your XI on a formation pitch, locking live as matches start.",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
  },
  {
    href: "/vsfield",
    title: "Vs the Field",
    desc: "Your live all-play-all record across the whole league.",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      </svg>
    ),
  },
  {
    href: "/sign-in",
    title: "Standings",
    desc: "The power-record table — wins, points, and the cut line.",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    href: "/draft",
    title: "Draft Room",
    desc: "Live snake draft with a clock, queue, and autopick.",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path d="M3 7h18v12H3zM3 7l3-4h12l3 4M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/sign-in",
    title: "Guillotine",
    desc: "The survival bracket — who’s safe, who’s on the blade.",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path d="M4 4h16M7 4v6l5 4 5-4V4M12 14v6" />
      </svg>
    ),
  },
];

/** The designed "Sign in" CTA — replaces the prototype's inline email-capture form (no self-serve join). */
function SignInCta({ note, centerNote = false }: { note: ReactNode; centerNote?: boolean }) {
  return (
    <div className="lp-login">
      <div className="lp-login-row">
        <a className="btn btn-primary btn-lg" href="/sign-in">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="M4 7l8 6 8-6" />
          </svg>
          Sign in
        </a>
      </div>
      <p className="lp-login-note" style={centerNote ? { justifyContent: "center" } : undefined}>
        {note}
      </p>
    </div>
  );
}

export function MarketingLanding() {
  return (
    <LpRoot>
      {/* ===================================================================== NAV */}
      <nav className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <BrandLink href="#top" />
          <div className="lp-nav-links">
            <a href="#mechanics">The mechanics</a>
            <a href="#scoring">Scoring</a>
            <a href="#how">How it plays</a>
            <a href="#explore">The product</a>
          </div>
          <div className="lp-nav-cta">
            <a className="btn btn-ghost btn-sm" href="/sign-in">
              Log in
            </a>
          </div>
        </div>
      </nav>

      {/* ==================================================================== HERO */}
      <header className="lp-hero" id="top">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-private">
              <Shield />
              Private league · invite only
            </span>
            <p className="lp-eyebrow" style={{ marginTop: 18 }}>
              World Cup 2026 · The Starting Eleven
            </p>
            <h1 className="lp-hero-h1">
              The whole World&nbsp;Cup,
              <br />
              <span className="accent">your</span> starting eleven.
            </h1>
            <p className="lp-hero-sub">
              Draft a squad, name your XI, and go to war with eleven friends. Three matchdays scored
              against the <b>entire league</b> — then a guillotine playoff that cuts the lowest
              score every week until one manager is left standing. Outpick them, or go home.
            </p>

            <SignInCta
              note={
                <>
                  <Clock />
                  No password. We email a secure sign-in link — only invited emails can join.
                </>
              }
            />

            <div className="lp-proof">
              <div className="lp-avstack">
                <span className="avatar avatar-md av-1">MR</span>
                <span className="avatar avatar-md av-2">JC</span>
                <span className="avatar avatar-md av-3">SV</span>
                <span className="avatar avatar-md av-4">WD</span>
                <span className="avatar avatar-md av-5">AL</span>
                <span className="avatar avatar-md av-6">YT</span>
              </div>
              <span className="lp-proof-txt">
                <b>11 managers in</b> · 3 spots left for the draft
              </span>
            </div>
          </div>

          {/* hero visual: live lock board */}
          <div className="lp-hero-media lp-reveal">
            <div className="lp-board">
              <div className="lp-board-bar">
                <span className="ttl">
                  <img src="/brand/trophy.png" alt="" />
                  Your XI · live
                </span>
                <span className="sub">MATCHDAY 3 · 71&rsquo;</span>
              </div>
              <div className="lp-board-rows">
                <div className="lp-prow">
                  <span
                    className="lp-kit"
                    style={{
                      background: "linear-gradient(90deg,#1B3FA0 33%,#fff 33% 66%,#C8102E 66%)",
                    }}
                  />
                  <span className="nm">
                    <b>K. Mbappé</b>
                    <span>France · FWD</span>
                  </span>
                  <span className="pts">14</span>
                  <span className="pill pill-live">
                    <span className="dot" />
                    Live
                  </span>
                </div>
                <div className="lp-prow">
                  <span className="lp-kit" style={{ background: "#fff" }} />
                  <span className="nm">
                    <b>J. Bellingham</b>
                    <span>England · MID</span>
                  </span>
                  <span className="pts">9</span>
                  <span className="pill pill-live">
                    <span className="dot" />
                    Live
                  </span>
                </div>
                <div className="lp-prow">
                  <span
                    className="lp-kit"
                    style={{ background: "linear-gradient(180deg,#C1272D 50%,#006233 50%)" }}
                  />
                  <span className="nm">
                    <b>A. Hakimi</b>
                    <span>Morocco · DEF</span>
                  </span>
                  <span className="pts">6</span>
                  <span className="pill pill-locked">
                    <Lock />
                    Locked
                  </span>
                </div>
                <div className="lp-prow is-ytp">
                  <span
                    className="lp-kit"
                    style={{ background: "linear-gradient(135deg,#009C3B 60%,#FFDF00 60%)" }}
                  />
                  <span className="nm">
                    <b>Vinícius Jr.</b>
                    <span>Brazil · FWD</span>
                  </span>
                  <span className="pts dim">—</span>
                  <span className="pill pill-ytp">
                    <Clock />
                    To play
                  </span>
                </div>
                <div className="lp-prow">
                  <span
                    className="lp-kit"
                    style={{
                      background: "linear-gradient(180deg,#008C45 33%,#fff 33% 66%,#CD212A 66%)",
                    }}
                  />
                  <span className="nm">
                    <b>G. Donnarumma</b>
                    <span>Italy · GK</span>
                  </span>
                  <span className="pts">3</span>
                  <span className="pill pill-locked">
                    <Lock />
                    Locked
                  </span>
                </div>
              </div>
              <div className="lp-board-foot">
                <span className="rec">
                  <span className="big">8–3</span>
                  <span
                    className="t-micro text-tertiary"
                    style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    beating 8 of 11
                  </span>
                </span>
                <span className="clear">
                  <Check size={14} />
                  +1 clear of the cut
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* =================================================================== BRAND */}
      <section className="lp-brandband">
        <div className="lp-container lp-brandband-inner lp-reveal">
          <img
            className="lp-bigtrophy"
            src="/brand/trophy.png"
            alt="The XI trophy mark, with a parrot peeking out from behind the figures"
          />
          <div className="lp-brandband-txt">
            <p className="lp-eyebrow">One cup. One winner.</p>
            <h2>
              Reach for glory.
              <br />
              (Yes, the parrot&rsquo;s&nbsp;here.)
            </h2>
            <p>
              Eleven friends chase one trophy. Ten of them spend the next four years explaining what
              went wrong.
            </p>
            <a className="btn btn-ghost" href="#mechanics">
              See how it plays
            </a>
          </div>
        </div>
      </section>

      {/* =============================================================== MECHANICS */}
      <section className="lp-section" id="mechanics">
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">What makes XI different</p>
            <h2>Four mechanics a generic clone gets wrong.</h2>
            <p>
              XI isn&rsquo;t a reskinned season-long app. It&rsquo;s built for a single month-long
              tournament — and the rules are unusual on purpose. Here&rsquo;s what you&rsquo;re
              actually playing.
            </p>
          </div>

          {/* 1. lock on play */}
          <div className="lp-feat lp-reveal">
            <div className="lp-feat-copy">
              <span className="lp-feat-num">01 — LOCK-ON-PLAY</span>
              <h3>Your XI is live until the whistle.</h3>
              <p>
                A player locks the instant he plays a single minute. Until then he&rsquo;s freely
                swappable — even a benched starter who hasn&rsquo;t come on. There are no auto-subs:
                who you can still move, and who&rsquo;s frozen, is always obvious in real time.
              </p>
              <ul>
                <li>
                  <Check />
                  Swap freely until kickoff — including 0-minute starters
                </li>
                <li>
                  <Check />
                  The moment he steps on, his line is locked
                </li>
                <li>
                  <Check />
                  No auto-subs, no surprises — you&rsquo;re in control
                </li>
              </ul>
            </div>
            <div className="lp-feat-media">
              <div className="lp-media-cap">Set Lineup · live</div>
              <div className="lp-lock">
                <div className="lp-lock-chip movable">
                  <span className="pos pos-FWD">FWD</span>
                  <span className="who">
                    <b>L. Martínez</b>
                    <span>Argentina · kicks off in 38&rsquo;</span>
                  </span>
                  <span className="pill pill-ytp">
                    <Clock />
                    Movable
                  </span>
                </div>
                <div className="lp-swap-note">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M7 7h10l-3-3M17 17H7l3 3" />
                  </svg>
                  Swap available — drag in any forward
                </div>
                <div className="lp-lock-chip">
                  <span className="pos pos-MID">MID</span>
                  <span className="who">
                    <b>Pedri</b>
                    <span>Spain · 63&rsquo; played</span>
                  </span>
                  <span className="pill pill-locked">
                    <Lock />
                    Locked · playing
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. all play all */}
          <div className="lp-feat flip lp-reveal">
            <div className="lp-feat-copy">
              <span className="lp-feat-num">02 — ALL-PLAY-ALL</span>
              <h3>Scored against the whole field.</h3>
              <p>
                The regular season is just <b>three matchdays</b> — and every one, you&rsquo;re
                scored against <em>every</em> other manager at once. Outscore nine of eleven and you
                bank a 9–2 week. Standings are a power record: weekly wins first, total points break
                ties. No soft schedule to hide behind.
              </p>
              <ul>
                <li>
                  <Check />
                  Three matchdays, scored against the entire league
                </li>
                <li>
                  <Check />
                  Standings rank by total wins, ties break on points
                </li>
                <li>
                  <Check />
                  Top of the table qualifies for the playoffs
                </li>
              </ul>
            </div>
            <div className="lp-feat-media">
              <div className="lp-media-cap">Standings · power record</div>
              <table className="lp-mini-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Manager</th>
                    <th>W–L</th>
                    <th className="num">PF</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1</td>
                    <td className="mgr">
                      <span className="avatar avatar-sm av-3">CH</span>Chocoyo
                    </td>
                    <td>
                      <span className="lp-rec">26–7</span>
                    </td>
                    <td className="num">150</td>
                  </tr>
                  <tr>
                    <td>2</td>
                    <td className="mgr">
                      <span className="avatar avatar-sm av-2">SB</span>Sebastián
                    </td>
                    <td>
                      <span className="lp-rec">23–10</span>
                    </td>
                    <td className="num">141</td>
                  </tr>
                  <tr className="row-me">
                    <td>3</td>
                    <td className="mgr">
                      <span
                        className="avatar avatar-sm av-5"
                        style={{ boxShadow: "0 0 0 2px var(--surface-1),0 0 0 4px var(--accent)" }}
                      >
                        YT
                      </span>
                      You
                    </td>
                    <td>
                      <span className="lp-rec">22–8</span>
                    </td>
                    <td className="num">148</td>
                  </tr>
                  <tr>
                    <td>4</td>
                    <td className="mgr">
                      <span className="avatar avatar-sm av-4">AL</span>Álvaro
                    </td>
                    <td>
                      <span className="lp-rec">22–11</span>
                    </td>
                    <td className="num">141</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. guillotine */}
          <div className="lp-feat lp-reveal">
            <div className="lp-feat-copy">
              <span className="lp-feat-num">03 — GUILLOTINE PLAYOFFS</span>
              <h3>Qualify. Reload. Survive.</h3>
              <p>
                Only the top of the table reach the playoffs — not everyone makes it. Rosters
                shrink, and a fresh FAAB waiver run lets you reload your reduced squad from the
                pool. Then it&rsquo;s guillotine: every week the lowest score is eliminated, and the
                cut manager&rsquo;s players drop back into the pool for everyone left.
              </p>
              <ul>
                <li>
                  <Check />
                  Finish high in the 3-matchday season to get in
                </li>
                <li>
                  <Check />
                  Reduced rosters, then a fresh FAAB run to reload
                </li>
                <li>
                  <Check />
                  Lowest score each week is out — cut players return to the pool
                </li>
              </ul>
            </div>
            <div className="lp-feat-media">
              <div className="lp-media-cap">Guillotine · round 2 live</div>
              <div className="lp-guil">
                <div className="lp-guil-row">
                  <span className="seed">4</span>
                  <span className="nm">Sebastián</span>
                  <span className="sc">96.4</span>
                </div>
                <div
                  className="lp-guil-row"
                  style={{ background: "var(--accent-soft)", borderRadius: 8 }}
                >
                  <span className="seed">5</span>
                  <span className="nm" style={{ color: "var(--accent)" }}>
                    You
                  </span>
                  <span className="sc">88.1</span>
                </div>
                <div className="lp-cutline">
                  <span className="rule" />
                  <span className="lbl">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M4 4h16M7 4v6l5 4 5-4V4" />
                      <path d="M12 14v6" />
                    </svg>
                    Cut line
                  </span>
                  <span className="rule" />
                </div>
                <div className="lp-guil-row is-elim">
                  <span className="seed">6</span>
                  <span className="nm">Wilmer</span>
                  <span className="sc">81.7</span>
                </div>
                <div className="lp-guil-row is-elim">
                  <span className="seed">7</span>
                  <span className="nm">Fran</span>
                  <span className="sc">74.0</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. faab */}
          <div className="lp-feat flip lp-reveal">
            <div className="lp-feat-copy">
              <span className="lp-feat-num">04 — BLIND-BID WAIVERS</span>
              <h3>Sealed bids. $100. No takebacks.</h3>
              <p>
                Free agents move on the waiver wire through FAAB blind bids — a $100 budget, sealed
                so you only ever see your own claims. It&rsquo;s how you patch your squad between
                matchdays and reload your reduced team for the playoffs. Bid on a player whose match
                already kicked off and it&rsquo;s voided and refunded.
              </p>
              <ul>
                <li>
                  <Check />
                  Sealed bids — nobody sees your number
                </li>
                <li>
                  <Check />
                  One $100 budget for the whole tournament — carries into the playoffs
                </li>
                <li>
                  <Check />
                  Void + refund if his match has already started
                </li>
              </ul>
            </div>
            <div className="lp-feat-media">
              <div className="lp-media-cap">Waivers · my claims</div>
              <div className="lp-faab">
                <div className="lp-faab-budget">
                  <div className="between">
                    <span className="amt">$63</span>
                    <span className="cap">of $100 · 1 pending</span>
                  </div>
                  <div className="meter">
                    <span style={{ width: "63%" }} />
                  </div>
                </div>
                <div className="lp-bidcard">
                  <span className="pos pos-MID">MID</span>
                  <span className="who">
                    <b>F. Wirtz</b>
                    <span>Germany · kicks off in 2h</span>
                  </span>
                  <span className="seal">
                    $24<small>Sealed</small>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= SCORING */}
      <section className="lp-section" id="scoring">
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Scoring that rewards real football</p>
            <h2>Every contribution counts.</h2>
            <p>
              Most fantasy soccer scores a handful of events — a goal, an assist, a clean sheet, a
              card. XI scores the whole performance: two dozen position-aware categories, so a
              relentless defender or a shot-stopping keeper can win you the week just as surely as a
              striker.
            </p>
          </div>

          <div className="lp-score-contrast lp-reveal">
            <div className="lp-usual">
              <span className="lp-usual-lbl">Where most fantasy stops</span>
              <div className="lp-chips">
                <span className="chip">Goals</span>
                <span className="chip">Assists</span>
                <span className="chip">Clean sheets</span>
                <span className="chip">Cards</span>
              </div>
            </div>
            <div className="lp-arrow">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
            <div className="lp-xi-count">
              <span className="big">26</span>
              <span className="t">
                scoring categories in XI — position-aware, deductions and all
              </span>
            </div>
          </div>

          <div className="lp-score-cats lp-reveal">
            <div className="lp-scol">
              <div className="lp-scol-h">
                <span className="dot" style={{ background: "var(--pos-fwd)" }} />
                <b>Attacking</b>
                <span className="ct">7</span>
              </div>
              <ul>
                <li>
                  <span className="mk pos">+</span>Goals
                </li>
                <li>
                  <span className="mk pos">+</span>Assists
                </li>
                <li>
                  <span className="mk pos">+</span>Shots on target
                </li>
                <li>
                  <span className="mk pos">+</span>Big chances created
                </li>
                <li>
                  <span className="mk pos">+</span>Key passes
                </li>
                <li>
                  <span className="mk pos">+</span>Successful dribbles
                </li>
                <li>
                  <span className="mk pos">+</span>Penalties won
                </li>
              </ul>
            </div>
            <div className="lp-scol">
              <div className="lp-scol-h">
                <span className="dot" style={{ background: "var(--pos-def)" }} />
                <b>Defending</b>
                <span className="ct">8</span>
              </div>
              <ul>
                <li>
                  <span className="mk pos">+</span>Clean sheet
                </li>
                <li>
                  <span className="mk pos">+</span>Tackles won
                </li>
                <li>
                  <span className="mk pos">+</span>Interceptions
                </li>
                <li>
                  <span className="mk pos">+</span>Clearances
                </li>
                <li>
                  <span className="mk pos">+</span>Blocks
                </li>
                <li>
                  <span className="mk pos">+</span>Ball recoveries
                </li>
                <li>
                  <span className="mk pos">+</span>Aerial duels won
                </li>
                <li className="is-neg">
                  <span className="mk neg">−</span>Goals conceded
                </li>
              </ul>
            </div>
            <div className="lp-scol">
              <div className="lp-scol-h">
                <span className="dot" style={{ background: "var(--loss)" }} />
                <b>Discipline</b>
                <span className="ct">4</span>
              </div>
              <ul>
                <li className="is-neg">
                  <span className="mk neg">−</span>Yellow card
                </li>
                <li className="is-neg">
                  <span className="mk neg">−</span>Red card
                </li>
                <li className="is-neg">
                  <span className="mk neg">−</span>Fouls conceded
                </li>
                <li className="is-neg">
                  <span className="mk neg">−</span>Own goals
                </li>
              </ul>
            </div>
            <div className="lp-scol">
              <div className="lp-scol-h">
                <span className="dot" style={{ background: "var(--pos-gk)" }} />
                <b>Goalkeeping</b>
                <span className="ct">4</span>
              </div>
              <ul>
                <li>
                  <span className="mk pos">+</span>Saves
                </li>
                <li>
                  <span className="mk pos">+</span>Penalties saved
                </li>
                <li>
                  <span className="mk pos">+</span>High claims
                </li>
                <li>
                  <span className="mk pos">+</span>Sweeper clearances
                </li>
              </ul>
            </div>
            <div className="lp-scol">
              <div className="lp-scol-h">
                <span className="dot" style={{ background: "var(--accent)" }} />
                <b>Bonus</b>
                <span className="ct">3</span>
              </div>
              <ul>
                <li>
                  <span className="mk pos">+</span>Minutes played
                </li>
                <li>
                  <span className="mk pos">+</span>Match rating
                </li>
                <li>
                  <span className="mk pos">+</span>Star man
                </li>
              </ul>
            </div>
          </div>

          <p className="lp-score-foot">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M11 12h1v4h1" />
            </svg>
            Scoring is position-aware — a keeper banks points for saves a striker never can — and
            includes deductions (−) for cards, fouls and goals conceded. Point weights are set for
            your league.
          </p>
        </div>
      </section>

      {/* ================================================================ SHOWCASE */}
      <section className="lp-section" id="showcase">
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Take the manager&rsquo;s seat</p>
            <h2>Draft it. Pick it. Live it.</h2>
            <p>
              This is the fun part — outdraft your friends, sweat every kickoff, and watch your XI
              come together on the pitch, flags and all.
            </p>
          </div>

          <div className="lp-show-grid">
            {/* draft board */}
            <div className="lp-showcard lp-reveal">
              <h3>Draft night</h3>
              <p className="cap">
                Live snake draft · 15-man squads, every player owned by one manager
              </p>
              <div className="lp-show-media">
                <div className="lp-dboard">
                  <div className="lp-dboard-head">
                    <span className="cell-h" />
                    <span className="cell-h">
                      <span className="avatar avatar-sm av-1">MR</span>
                    </span>
                    <span className="cell-h">
                      <span className="avatar avatar-sm av-2">JC</span>
                    </span>
                    <span className="cell-h">
                      <span className="avatar avatar-sm av-3">SV</span>
                    </span>
                    <span className="cell-h">
                      <span className="avatar avatar-sm av-4">WD</span>
                    </span>
                    <span className="cell-h">
                      <span className="avatar avatar-sm av-6">AL</span>
                    </span>
                    <span className="cell-h">
                      <span
                        className="avatar avatar-sm av-5"
                        style={{ boxShadow: "0 0 0 2px var(--surface-1),0 0 0 3px var(--accent)" }}
                      >
                        YT
                      </span>
                    </span>
                  </div>
                  <div className="lp-drow">
                    <span className="rlabel">R1</span>
                    <div className="lp-dc tint-FWD">
                      <div className="lp-dc-top">
                        <span className="pos pos-FWD">FWD</span>
                        <span className="pk">1.01</span>
                      </div>
                      <div className="lp-dc-nm">L. Messi</div>
                    </div>
                    <div className="lp-dc tint-FWD">
                      <div className="lp-dc-top">
                        <span className="pos pos-FWD">FWD</span>
                        <span className="pk">1.02</span>
                      </div>
                      <div className="lp-dc-nm">K. Mbappé</div>
                    </div>
                    <div className="lp-dc tint-FWD">
                      <div className="lp-dc-top">
                        <span className="pos pos-FWD">FWD</span>
                        <span className="pk">1.03</span>
                      </div>
                      <div className="lp-dc-nm">E. Haaland</div>
                    </div>
                    <div className="lp-dc tint-FWD">
                      <div className="lp-dc-top">
                        <span className="pos pos-FWD">FWD</span>
                        <span className="pk">1.04</span>
                      </div>
                      <div className="lp-dc-nm">H. Kane</div>
                    </div>
                    <div className="lp-dc tint-MID">
                      <div className="lp-dc-top">
                        <span className="pos pos-MID">MID</span>
                        <span className="pk">1.05</span>
                      </div>
                      <div className="lp-dc-nm">J. Bellingham</div>
                    </div>
                    <div className="lp-dc tint-FWD">
                      <div className="lp-dc-top">
                        <span className="pos pos-FWD">FWD</span>
                        <span className="pk">1.06</span>
                      </div>
                      <div className="lp-dc-nm">Vinícius Jr.</div>
                    </div>
                  </div>
                  <div className="lp-drow">
                    <span className="rlabel">R2</span>
                    <div className="lp-dc tint-GK">
                      <div className="lp-dc-top">
                        <span className="pos pos-GK">GK</span>
                        <span className="pk">2.06</span>
                      </div>
                      <div className="lp-dc-nm">G. Donnarumma</div>
                    </div>
                    <div className="lp-dc tint-DEF">
                      <div className="lp-dc-top">
                        <span className="pos pos-DEF">DEF</span>
                        <span className="pk">2.05</span>
                      </div>
                      <div className="lp-dc-nm">R. Dias</div>
                    </div>
                    <div className="lp-dc tint-DEF">
                      <div className="lp-dc-top">
                        <span className="pos pos-DEF">DEF</span>
                        <span className="pk">2.04</span>
                      </div>
                      <div className="lp-dc-nm">W. Saliba</div>
                    </div>
                    <div className="lp-dc tint-MID">
                      <div className="lp-dc-top">
                        <span className="pos pos-MID">MID</span>
                        <span className="pk">2.03</span>
                      </div>
                      <div className="lp-dc-nm">Rodri</div>
                    </div>
                    <div className="lp-dc tint-DEF">
                      <div className="lp-dc-top">
                        <span className="pos pos-DEF">DEF</span>
                        <span className="pk">2.02</span>
                      </div>
                      <div className="lp-dc-nm">A. Hakimi</div>
                    </div>
                    <div className="lp-dc tint-MID">
                      <div className="lp-dc-top">
                        <span className="pos pos-MID">MID</span>
                        <span className="pk">2.01</span>
                      </div>
                      <div className="lp-dc-nm">Pedri</div>
                    </div>
                  </div>
                  <div className="lp-drow">
                    <span className="rlabel">R3</span>
                    <div className="lp-dc tint-DEF">
                      <div className="lp-dc-top">
                        <span className="pos pos-DEF">DEF</span>
                        <span className="pk">3.01</span>
                      </div>
                      <div className="lp-dc-nm">A. Davies</div>
                    </div>
                    <div className="lp-dc is-now">
                      <div className="lp-dc-top">
                        <span className="pos pos-MID">MID</span>
                        <span className="pk">3.02</span>
                      </div>
                      <div className="lp-dc-nm">on the clock…</div>
                    </div>
                    <div className="lp-dc is-empty">
                      <div className="lp-dc-top">
                        <span className="pk">3.03</span>
                      </div>
                    </div>
                    <div className="lp-dc is-empty">
                      <div className="lp-dc-top">
                        <span className="pk">3.04</span>
                      </div>
                    </div>
                    <div className="lp-dc is-empty">
                      <div className="lp-dc-top">
                        <span className="pk">3.05</span>
                      </div>
                    </div>
                    <div className="lp-dc is-empty">
                      <div className="lp-dc-top">
                        <span className="pk">3.06</span>
                      </div>
                    </div>
                  </div>
                  <div className="lp-dboard-foot">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={2}
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    JC is on the clock — <span className="clk">0:42</span> · snake order reverses
                    each round
                  </div>
                </div>
              </div>
            </div>

            {/* flag pitch */}
            <div className="lp-showcard lp-reveal">
              <h3>Your XI, on the pitch</h3>
              <p className="cap">Set Lineup · pick your formation, flags and all</p>
              <div className="lp-show-media">
                <div className="lp-pitch2">
                  <div className="lp-pitch2-lane">
                    <span className="lp-node">
                      <span
                        className="kit"
                        style={{
                          background: "linear-gradient(90deg,#1B3FA0 33%,#fff 33% 66%,#C8102E 66%)",
                        }}
                      />
                      <span className="nm">Mbappé</span>
                    </span>
                    <span className="lp-node">
                      <span
                        className="kit"
                        style={{ background: "linear-gradient(135deg,#009C3B 60%,#FFDF00 60%)" }}
                      />
                      <span className="nm">Vinícius</span>
                    </span>
                    <span className="lp-node">
                      <span className="kit" style={{ background: "#fff" }} />
                      <span className="nm">Kane</span>
                    </span>
                  </div>
                  <div className="lp-pitch2-lane">
                    <span className="lp-node">
                      <span className="kit" style={{ background: "#fff" }} />
                      <span className="nm">Bellingham</span>
                    </span>
                    <span className="lp-node">
                      <span
                        className="kit"
                        style={{
                          background:
                            "linear-gradient(180deg,#AA151B 28%,#F1BF00 28% 72%,#AA151B 72%)",
                        }}
                      />
                      <span className="nm">Pedri</span>
                    </span>
                    <span className="lp-node">
                      <span
                        className="kit"
                        style={{ background: "linear-gradient(135deg,#FF0000 50%,#fff 50%)" }}
                      />
                      <span className="nm">Modrić</span>
                    </span>
                  </div>
                  <div className="lp-pitch2-lane">
                    <span className="lp-node">
                      <span
                        className="kit"
                        style={{ background: "linear-gradient(180deg,#C1272D 50%,#006233 50%)" }}
                      />
                      <span className="nm">Hakimi</span>
                    </span>
                    <span className="lp-node">
                      <span
                        className="kit"
                        style={{
                          background: "linear-gradient(90deg,#1B3FA0 33%,#fff 33% 66%,#C8102E 66%)",
                        }}
                      />
                      <span className="nm">Saliba</span>
                    </span>
                    <span className="lp-node">
                      <span
                        className="kit"
                        style={{ background: "linear-gradient(90deg,#006600 40%,#FF0000 40%)" }}
                      />
                      <span className="nm">Dias</span>
                    </span>
                    <span className="lp-node">
                      <span
                        className="kit"
                        style={{
                          background: "linear-gradient(90deg,#FF0000 25%,#fff 25% 75%,#FF0000 75%)",
                        }}
                      />
                      <span className="nm">Davies</span>
                    </span>
                  </div>
                  <div className="lp-pitch2-lane">
                    <span className="lp-node">
                      <span
                        className="kit"
                        style={{
                          background: "linear-gradient(90deg,#008C45 33%,#fff 33% 66%,#CD212A 66%)",
                        }}
                      />
                      <span className="nm">Donnarumma</span>
                    </span>
                  </div>
                </div>
                <div className="lp-dboard-foot" style={{ justifyContent: "space-between" }}>
                  <span style={{ whiteSpace: "nowrap" }}>Formation 4-3-3</span>
                  <span style={{ whiteSpace: "nowrap" }}>+ 4 on the bench</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== HOW IT */}
      <section className="lp-section" id="how">
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">From draft to final</p>
            <h2>How a season plays out.</h2>
            <p>Two phases, about a month of football. Draft, manage, and outlast your friends.</p>
          </div>
          <div className="lp-steps">
            <div className="lp-step lp-reveal">
              <div className="n">1</div>
              <h4>Draft your squad</h4>
              <p>
                Snake-draft 15 players with your friends — 2 GK, 5 DEF, 5 MID, 3 FWD. Every player
                belongs to just one manager.
              </p>
            </div>
            <div className="lp-step lp-reveal">
              <div className="n">2</div>
              <h4>Be the manager</h4>
              <p>
                Pick your formation, name your XI, and work the waiver wire. Your calls, your
                knowledge, your bragging rights.
              </p>
            </div>
            <div className="lp-step lp-reveal">
              <div className="n">3</div>
              <h4>Score the season</h4>
              <p>
                Three matchdays, each scored against the whole league. Watch points land as matches
                kick off and your XI locks.
              </p>
            </div>
            <div className="lp-step lp-reveal">
              <div className="n">4</div>
              <h4>Survive the guillotine</h4>
              <p>
                Qualify for the playoffs, reload your reduced squad, and outscore the field each
                week. Last manager standing wins.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= EXPLORE */}
      <section className="lp-section" id="explore">
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Take a look inside</p>
            <h2>Explore the product.</h2>
            <p>
              Every surface is built for matchday — fast, legible, and honest about what&rsquo;s
              locked, what&rsquo;s live, and whose turn it is.
            </p>
          </div>
          <div className="lp-peek-grid">
            {EXPLORE.map((card) => (
              <a className="lp-peek lp-reveal" href={card.href} key={card.title}>
                <span className="lp-peek-ic">{card.icon}</span>
                <span className="lp-peek-txt">
                  <h4>
                    {card.title} <span className="arr">↗</span>
                  </h4>
                  <p>{card.desc}</p>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ===================================================================== CTA */}
      <section className="lp-cta">
        <div className="lp-container lp-cta-card lp-reveal">
          <img src="/brand/parrot.png" alt="" className="lp-cta-parrot" />
          <h2>Claim your spot in the XI.</h2>
          <p>
            The draft fills as friends join. Sign in with your invited email to claim your spot and
            start planning your squad.
          </p>
          <SignInCta
            centerNote
            note={
              <>
                <Shield />3 spots left · World Cup 2026
              </>
            }
          />
        </div>
      </section>

      {/* ================================================================== FOOTER */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <a className="lp-brand" href="#top">
                {/* decorative beside the visible "XI" wordmark → empty alt (no redundant SR announcement) */}
                <img src="/brand/trophy.png" alt="" />
                <span className="lp-brand-txt">
                  <span className="lp-brand-xi">XI</span>
                  <span className="lp-brand-league">The Starting Eleven</span>
                </span>
              </a>
              <p>
                A private World Cup fantasy league for a small group of friends. Invite-only, one
                tournament, one champion.
              </p>
            </div>
            <div className="lp-footer-cols">
              <div className="lp-fcol">
                <h5>Product</h5>
                <a href="/sign-in">Dashboard</a>
                <a href="/lineup">Set Lineup</a>
                <a href="/sign-in">Standings</a>
                <a href="/sign-in">Free Agents</a>
                <a href="/sign-in">Waivers</a>
              </div>
              <div className="lp-fcol">
                <h5>The game</h5>
                <a href="#mechanics">The mechanics</a>
                <a href="#scoring">Scoring</a>
                <a href="#how">How it plays</a>
                <a href="/sign-in">Playoffs</a>
              </div>
              <div className="lp-fcol">
                <h5>Account</h5>
                <a href="/sign-in">Log in</a>
                <a href="/sign-in">Accept invite</a>
                <a href="/sign-in">Settings</a>
              </div>
            </div>
          </div>
          <div className="lp-footer-base">
            <span>© 2026 XI · WC Fantasy League</span>
            <span>Built for World Cup 2026 · Private league</span>
          </div>
        </div>
      </footer>
    </LpRoot>
  );
}
