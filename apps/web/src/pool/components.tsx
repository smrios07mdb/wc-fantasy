/**
 * Presentational pieces for the /pool pick'em screen (Prompt 42) — net-new (no design reference exists),
 * built on the ds.css conventions: ZERO hex (tokens only), the lock-on-play visual language reused from
 * setlineup/vsfield (a steel "Locked" pill + disabled controls), the shared `<Flag>` surface for nation
 * imagery, and the global `.dtable` + `.row-me` styling for the leaderboard. No IO, no data fetching: the
 * client shell owns state + the `/api/pool/pick` round-trips and passes everything down.
 */
import type { PoolPrediction } from "@app/shared";
import { Flag } from "@/app/draft/Flag";
import { toIso2 } from "@/src/draft/flag";
import type { PoolFixture, PoolLeaderRow, PoolTeam } from "./types";

// ── icons ─────────────────────────────────────────────────────────────────────
function IcoLock() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function IcoCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      aria-hidden="true"
    >
      <path d="M5 12.5 10 17 19 6.5" />
    </svg>
  );
}

// ── atoms ─────────────────────────────────────────────────────────────────────

/** A nation badge — the shared emoji/SVG `<Flag>` + the side's name (or a TBD slot when undecided). */
function TeamLabel({ team, align }: { team: PoolTeam | null; align: "l" | "r" }) {
  if (!team) {
    return (
      <span className={"pl-team is-tbd pl-team-" + align}>
        <span className="pl-tbd-dot" aria-hidden="true" />
        <span className="pl-team-name">TBD</span>
      </span>
    );
  }
  return (
    <span className={"pl-team pl-team-" + align}>
      <Flag code={toIso2(team.code)} label={team.name} />
      <span className="pl-team-name">{team.name}</span>
    </span>
  );
}

/** The steel "Locked" pill — always colour + icon + word (the setlineup/vsfield lock language). */
export function LockPill() {
  return (
    <span className="pl-lock">
      <IcoLock />
      Locked
    </span>
  );
}

// ── the per-match pick control ──────────────────────────────────────────────────

interface PickButton {
  readonly value: PoolPrediction;
  readonly label: string;
}

/**
 * The pick control: group → 3-way Home / Draw / Away; knockout → 2-way (the two advancers). Disabled when
 * locked (past kickoff or non-scheduled). The selected pick is highlighted; once a result is in, the
 * correct outcome is marked. DRAW is never offered on a knockout (the engine + route reject it — §4).
 */
export function PickControl({
  fixture,
  knockout,
  locked,
  busy,
  onPick,
}: {
  fixture: PoolFixture;
  knockout: boolean;
  locked: boolean;
  busy: boolean;
  onPick: (prediction: PoolPrediction) => void;
}) {
  const homeLabel = fixture.home?.name ?? "Home";
  const awayLabel = fixture.away?.name ?? "Away";
  const buttons: PickButton[] = knockout
    ? [
        { value: "HOME", label: homeLabel },
        { value: "AWAY", label: awayLabel },
      ]
    : [
        { value: "HOME", label: homeLabel },
        { value: "DRAW", label: "Draw" },
        { value: "AWAY", label: awayLabel },
      ];

  return (
    <div
      className={"pl-pick" + (knockout ? " is-2way" : " is-3way")}
      role="group"
      aria-label="Your pick"
    >
      {buttons.map((b) => {
        const selected = fixture.myPick === b.value;
        const isResult = fixture.result !== null && fixture.result === b.value;
        // Once a result is in, mark the viewer's own pick correct (it matched) or wrong (it didn't).
        const graded =
          selected && fixture.result !== null ? (isResult ? " is-correct" : " is-wrong") : "";
        const cls =
          "pl-pickbtn" + (selected ? " is-picked" : "") + (isResult ? " is-result" : "") + graded;
        return (
          <button
            key={b.value}
            type="button"
            className={cls}
            disabled={locked || busy}
            aria-pressed={selected}
            onClick={() => onPick(b.value)}
          >
            {isResult && <IcoCheck />}
            <span className="pl-pickbtn-lbl">{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── others' revealed picks (post-kickoff only — server enforced) ──────────────────

export function OthersReveal({ fixture }: { fixture: PoolFixture }) {
  if (fixture.others.length === 0) return null;
  const text = (p: PoolPrediction) =>
    p === "HOME"
      ? (fixture.home?.name ?? "Home")
      : p === "AWAY"
        ? (fixture.away?.name ?? "Away")
        : "Draw";
  return (
    <div className="pl-others">
      <span className="t-micro text-tertiary">League picks</span>
      <div className="pl-others-chips">
        {fixture.others.map((o) => (
          <span
            key={o.managerId}
            className="pl-other-chip"
            title={`${o.managerName} → ${text(o.prediction)}`}
          >
            <b>{o.managerName}</b>
            <span className="pl-other-pred">{text(o.prediction)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── a single fixture card ─────────────────────────────────────────────────────

export function FixtureCard({
  fixture,
  knockout,
  locked,
  busy,
  error,
  kickoffText,
  onPick,
}: {
  fixture: PoolFixture;
  knockout: boolean;
  locked: boolean;
  busy: boolean;
  error: string | null;
  kickoffText: string;
  onPick: (prediction: PoolPrediction) => void;
}) {
  const hasScore = fixture.homeScore !== null && fixture.awayScore !== null;
  return (
    <div className={"pl-fx" + (locked ? " is-locked" : "")}>
      <div className="pl-fx-top">
        <TeamLabel team={fixture.home} align="l" />
        <div className="pl-fx-mid">
          {hasScore ? (
            <span className="pl-score mono">
              {fixture.homeScore}–{fixture.awayScore}
            </span>
          ) : (
            <span className="pl-vs">v</span>
          )}
          <span className="pl-fx-when t-micro text-tertiary">{kickoffText}</span>
        </div>
        <TeamLabel team={fixture.away} align="r" />
      </div>

      <div className="pl-fx-act">
        <PickControl
          fixture={fixture}
          knockout={knockout}
          locked={locked}
          busy={busy}
          onPick={onPick}
        />
        {locked && <LockPill />}
      </div>

      {error && <div className="pl-fx-error">{error}</div>}
      <OthersReveal fixture={fixture} />
    </div>
  );
}

// ── leaderboard ─────────────────────────────────────────────────────────────────

export function LeaderboardTable({ rows }: { rows: readonly PoolLeaderRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="pl-empty">
        <b>No managers yet.</b>
        <span className="t-sm text-tertiary">
          The leaderboard fills in as picks are made and matches finish.
        </span>
      </div>
    );
  }
  return (
    <table className="dtable pl-board">
      <thead>
        <tr>
          <th style={{ width: 36 }}>#</th>
          <th>Manager</th>
          <th className="num">Played</th>
          <th className="num">Correct</th>
          <th className="num">Points</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.managerId} className={r.isMe ? "row-me" : ""}>
            <td className="mono">{i + 1}</td>
            <td>
              <b>{r.isMe ? "You" : r.managerName}</b>
            </td>
            <td className="num mono">{r.played}</td>
            <td className="num mono">{r.correct}</td>
            <td className="num mono">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
