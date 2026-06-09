/**
 * The /scoring rules reference — AUTHENTICATED (ARCHITECTURE.md §6), static and fully server-rendered.
 * It gates on the same session→manager resolve as the other shell screens (Prompt 07): no session →
 * /sign-in; not-allowlisted / no linked manager → /auth/denied. There is NO data fetching beyond the
 * gate — every rule and example is hardcoded from SCORING.md. The content is fully static; the route is
 * nonetheless rendered dynamically (`ƒ`) because the auth gate reads the session cookie, exactly like
 * the other shell screens. It renders the §1–§8 model plus the four §9 position examples (data in
 * `@/src/scoring/scoringData`).
 *
 * Styling is the route-scoped `./scoring.css` layered on the global ds.css tokens — no gold (BRAND.md
 * §1); position badges reuse ds's `--pos-*`, points use `--success`/`--danger`. The page scrolls inside
 * the shell's `.sh-content` region (no fixed height).
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { EXAMPLE_CARDS, type ExampleLine } from "@/src/scoring/scoringData";
import "./scoring.css";

/** Render a points value with the green/red/muted convention and an explicit sign. */
function Pts({ value }: { value: number }) {
  const cls = value > 0 ? "sc-pos" : value < 0 ? "sc-neg" : "sc-zero";
  const text = value > 0 ? `+${value}` : `${value}`;
  return <span className={cls}>{text}</span>;
}

function ExampleRows({ lines }: { lines: readonly ExampleLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <tr key={l.line}>
          <td>{l.line}</td>
          <td className="text-tertiary">{l.calc}</td>
          <td className="sc-num">
            <Pts value={l.pts} />
          </td>
        </tr>
      ))}
    </>
  );
}

export default async function ScoringPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  return (
    <div className="sc-page">
      <header className="sc-head">
        <h1>Scoring rules</h1>
        <p>
          How every fantasy point is earned. Scoring keys off the role a player actually played in a
          match — not their draft position — across ~25 categories. The example games at the bottom
          turn the rules into intuition.
        </p>
      </header>

      <div className="sc-rules-grid">
        {/* §1 — Performance Rating */}
        <section className="sc-section" aria-labelledby="sc-s1">
          <h2 id="sc-s1">1 · Performance Rating</h2>
          <p className="sc-note">
            Applies only to players who received a Sofascore rating (i.e. actually played). This is
            the primary tuning lever for the whole model.
          </p>
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">Rating band</th>
                <th scope="col" className="sc-num">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>9.0+</td>
                <td className="sc-num">
                  <Pts value={5} />
                </td>
              </tr>
              <tr>
                <td>8.5 – 8.9</td>
                <td className="sc-num">
                  <Pts value={4} />
                </td>
              </tr>
              <tr>
                <td>7.5 – 8.4</td>
                <td className="sc-num">
                  <Pts value={3} />
                </td>
              </tr>
              <tr>
                <td>7.0 – 7.4</td>
                <td className="sc-num">
                  <Pts value={2} />
                </td>
              </tr>
              <tr>
                <td>6.5 – 6.9</td>
                <td className="sc-num">
                  <Pts value={1} />
                </td>
              </tr>
              <tr>
                <td>6.0 – 6.4</td>
                <td className="sc-num">
                  <Pts value={-1} />
                </td>
              </tr>
              <tr>
                <td>Below 6.0</td>
                <td className="sc-num">
                  <Pts value={-2} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* §2 — Appearance */}
        <section className="sc-section" aria-labelledby="sc-s2">
          <h2 id="sc-s2">2 · Appearance</h2>
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">Minutes played</th>
                <th scope="col" className="sc-num">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1 – 59 min</td>
                <td className="sc-num">
                  <Pts value={1} />
                </td>
              </tr>
              <tr>
                <td>60+ min</td>
                <td className="sc-num">
                  <Pts value={2} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* §3 — Goals & Assists */}
        <section className="sc-section" aria-labelledby="sc-s3">
          <h2 id="sc-s3">3 · Goals &amp; Assists</h2>
          <p className="sc-note">
            Rarity = higher reward: defenders and keepers score the most per goal.
          </p>
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col" className="sc-num">
                  GK
                </th>
                <th scope="col" className="sc-num">
                  DEF
                </th>
                <th scope="col" className="sc-num">
                  MID
                </th>
                <th scope="col" className="sc-num">
                  FWD
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Goal</td>
                <td className="sc-num">
                  <Pts value={6} />
                </td>
                <td className="sc-num">
                  <Pts value={6} />
                </td>
                <td className="sc-num">
                  <Pts value={5} />
                </td>
                <td className="sc-num">
                  <Pts value={4} />
                </td>
              </tr>
              <tr>
                <td>Assist</td>
                <td className="sc-num">
                  <Pts value={3} />
                </td>
                <td className="sc-num">
                  <Pts value={3} />
                </td>
                <td className="sc-num">
                  <Pts value={3} />
                </td>
                <td className="sc-num">
                  <Pts value={3} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* §4 — Universal Accumulators */}
        <section className="sc-section" aria-labelledby="sc-s4">
          <h2 id="sc-s4">4 · Universal Accumulators</h2>
          <p className="sc-subhead">Per-N buckets (floor division)</p>
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col">Eligible</th>
                <th scope="col">Rate</th>
                <th scope="col">Example</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Key passes</td>
                <td>All</td>
                <td>+1 / 2</td>
                <td className="text-tertiary">6 → floor(6/2) = +3</td>
              </tr>
              <tr>
                <td>Was fouled</td>
                <td>All</td>
                <td>+1 / 3</td>
                <td className="text-tertiary">4 → floor(4/3) = +1</td>
              </tr>
              <tr>
                <td>Possession lost</td>
                <td>All</td>
                <td>−1 / 3</td>
                <td className="text-tertiary">5 → floor(5/3) = −1</td>
              </tr>
              <tr>
                <td>Clearances</td>
                <td>Outfield</td>
                <td>+1 / 5</td>
                <td className="text-tertiary">8 → floor(8/5) = +1</td>
              </tr>
              <tr>
                <td>Shots blocked</td>
                <td>Outfield</td>
                <td>+1 / 2</td>
                <td className="text-tertiary">2 → floor(2/2) = +1</td>
              </tr>
              <tr>
                <td>Interceptions</td>
                <td>Outfield</td>
                <td>+1 / 3</td>
                <td className="text-tertiary">4 → floor(4/3) = +1</td>
              </tr>
              <tr>
                <td>Tackles won</td>
                <td>Outfield</td>
                <td>+1 / 3</td>
                <td className="text-tertiary">5 → floor(5/3) = +1</td>
              </tr>
            </tbody>
          </table>

          <p className="sc-subhead">Threshold-gated flat +1 (all-or-nothing)</p>
          <p className="sc-note">
            Both conditions must be met — there is no partial credit. Falling short on either yields
            0.
          </p>
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col">Both conditions</th>
                <th scope="col" className="sc-num">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Dribbles</td>
                <td>≥3 completed &amp; ≥60%</td>
                <td className="sc-num">
                  <Pts value={1} />
                </td>
              </tr>
              <tr>
                <td>Duels won</td>
                <td>≥3 won &amp; ≥50%</td>
                <td className="sc-num">
                  <Pts value={1} />
                </td>
              </tr>
              <tr>
                <td>Passing accuracy</td>
                <td>≥40 attempted &amp; ≥90%</td>
                <td className="sc-num">
                  <Pts value={1} />
                </td>
              </tr>
              <tr>
                <td>Long balls</td>
                <td>≥3 accurate &amp; ≥60%</td>
                <td className="sc-num">
                  <Pts value={1} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* §5 — Goalkeeping */}
        <section className="sc-section" aria-labelledby="sc-s5">
          <h2 id="sc-s5">5 · Goalkeeping</h2>
          <p className="sc-note">
            Applies to whoever plays in goal — including an outfielder forced into an emergency.
            There is no special-case logic; the lines key off the role actually played.
          </p>
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col">Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Saves inside box</td>
                <td>+1 / 2</td>
              </tr>
              <tr>
                <td>Saves outside box</td>
                <td>+1 / 3</td>
              </tr>
              <tr>
                <td>Penalty saved</td>
                <td>+5 each</td>
              </tr>
              <tr>
                <td>Punches + high claims</td>
                <td>+1 / 2</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* §6 — Role Outcomes: GK & DEF */}
        <section className="sc-section" aria-labelledby="sc-s6">
          <h2 id="sc-s6">6 · Role Outcomes: GK &amp; DEF</h2>
          <p className="sc-note">Applies to the role actually played ∈ {"{GK, DEF}"}.</p>
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">Outcome</th>
                <th scope="col" className="sc-num">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Clean sheet (60+ min required)</td>
                <td className="sc-num">
                  <Pts value={4} />
                </td>
              </tr>
              <tr>
                <td>Goals conceded (−1 per 1)</td>
                <td className="sc-num">
                  <Pts value={-1} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="sc-note">
            Every goal conceded costs a point: 1 conceded = −1; 2 = −2; 3 = −3.
          </p>
        </section>

        {/* §7 — Penalties */}
        <section className="sc-section" aria-labelledby="sc-s7">
          <h2 id="sc-s7">7 · Penalties</h2>
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col" className="sc-num">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Penalty won</td>
                <td className="sc-num">
                  <Pts value={2} />
                </td>
              </tr>
              <tr>
                <td>Penalty committed</td>
                <td className="sc-num">
                  <Pts value={-2} />
                </td>
              </tr>
              <tr>
                <td>Penalty missed</td>
                <td className="sc-num">
                  <Pts value={-3} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="sc-note">Penalty won and committed are manual tags (no feed field).</p>
        </section>

        {/* §8 — Discipline */}
        <section className="sc-section" aria-labelledby="sc-s8">
          <h2 id="sc-s8">8 · Discipline</h2>
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col" className="sc-num">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Yellow card</td>
                <td className="sc-num">
                  <Pts value={-1} />
                </td>
              </tr>
              <tr>
                <td>Second yellow (min 0–29 / 30–59 / ≥60)</td>
                <td className="sc-num">−3 / −2 / −1</td>
              </tr>
              <tr>
                <td>Straight red (min 0–29 / 30–59 / ≥60)</td>
                <td className="sc-num">−5 / −4 / −3</td>
              </tr>
              <tr>
                <td>Own goal</td>
                <td className="sc-num">
                  <Pts value={-2} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="sc-note">
            Cards are additive, never suppressed. A second-yellow dismissal keeps the first
            yellow&apos;s −1 and adds its own minute-band penalty on top. A late dismissal (90+)
            lands in the ≥60 band.
          </p>
        </section>
      </div>

      {/* §9 — Example games */}
      <section className="sc-examples" aria-labelledby="sc-ex">
        <h2 id="sc-ex">9 · Example games</h2>
        <div className="sc-examples-grid">
          {EXAMPLE_CARDS.map((card) => (
            <article key={card.position} className="sc-card">
              <div className="sc-card-head">
                <span
                  className="sc-badge"
                  data-pos={card.position}
                  aria-label={`Position: ${card.position}`}
                >
                  {card.position}
                </span>
                <span className="sc-card-title">{card.title}</span>
                <span className="sc-card-meta">
                  {card.scenario} · {card.meta}
                </span>
              </div>
              <table className="sc-table">
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col">Stat</th>
                    <th scope="col" className="sc-num">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <ExampleRows lines={card.lines} />
                </tbody>
              </table>
              <div className="sc-card-total">
                <span>Total</span>
                <b>{card.total}</b>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
