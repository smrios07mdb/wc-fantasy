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
import type { ManagerPickRow, ManagerPicksView } from "./managerPicks";
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
        {/* The teams-score area is a SEPARATE tap target → the real-match detail (T6). It is NOT a
            card-wide link: the HOME/DRAW/AWAY pick buttons below stay their own controls, untouched. */}
        <a
          className="pl-fx-mid pl-fx-view"
          href={`/games/${fixture.matchId}`}
          aria-label="View match detail"
        >
          {hasScore ? (
            <span className="pl-score mono">
              {fixture.homeScore}–{fixture.awayScore}
            </span>
          ) : (
            <span className="pl-vs">v</span>
          )}
          <span className="pl-fx-when t-micro text-tertiary">
            {kickoffText}{" "}
            <span className="pl-fx-chev" aria-hidden="true">
              ›
            </span>
          </span>
        </a>
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

export function LeaderboardTable({
  rows,
  onSelectManager,
}: {
  rows: readonly PoolLeaderRow[];
  /** Open a manager's revealed-picks drill-in (T4). The picks themselves come from the gated view. */
  onSelectManager: (managerId: string) => void;
}) {
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
              <button
                type="button"
                className="pl-mgr-link"
                onClick={() => onSelectManager(r.managerId)}
                aria-label={`View ${r.isMe ? "your" : `${r.managerName}’s`} picks`}
              >
                {r.isMe ? "You" : r.managerName}
              </button>
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

// ── manager picks drill-in (T4) ───────────────────────────────────────────────
// A modal showing ONE manager's REVEALED picks, projected from the already-gated `PoolView` (see
// `selectManagerPicks`). It renders only what the server revealed — for another manager that excludes
// every not-yet-kicked-off pick — so the panel cannot expose a pre-kickoff prediction. No data fetching.

/** Render a manager's prediction as the predicted side's name (Home/Away) or "Draw". */
function predictionText(row: ManagerPickRow): string {
  if (row.prediction === "HOME") return row.home?.name ?? "Home";
  if (row.prediction === "AWAY") return row.away?.name ?? "Away";
  return "Draw";
}

function OutcomeChip({ outcome }: { outcome: ManagerPickRow["outcome"] }) {
  if (outcome === "correct")
    return (
      <span className="pl-mp-out is-correct">
        <IcoCheck />
        Correct
      </span>
    );
  if (outcome === "wrong") return <span className="pl-mp-out is-wrong">Missed</span>;
  return <span className="pl-mp-out is-pending">Pending</span>;
}

function ManagerPickLine({ row }: { row: ManagerPickRow }) {
  const hasScore = row.homeScore !== null && row.awayScore !== null;
  return (
    <div className="pl-mp-row">
      <div className="pl-mp-fx">
        <TeamLabel team={row.home} align="l" />
        <span className="pl-mp-mid">
          {hasScore ? (
            <span className="pl-score mono">
              {row.homeScore}–{row.awayScore}
            </span>
          ) : (
            <span className="pl-vs">v</span>
          )}
        </span>
        <TeamLabel team={row.away} align="r" />
      </div>
      <div className="pl-mp-meta">
        {row.periodLabel && <span className="t-micro text-tertiary">{row.periodLabel}</span>}
        <span className="pl-mp-pred">
          Picked <b>{predictionText(row)}</b>
        </span>
        <OutcomeChip outcome={row.outcome} />
      </div>
    </div>
  );
}

export function ManagerPicksModal({
  picks,
  onClose,
}: {
  picks: ManagerPicksView;
  onClose: () => void;
}) {
  const title = picks.isMe ? "Your picks" : `${picks.managerName}’s picks`;
  return (
    <div className="pl-modal-overlay" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="pl-modal card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pl-modal-head">
          <span className="t-h3 pl-modal-title">{title}</span>
          <button
            type="button"
            className="pl-modal-close"
            onClick={onClose}
            aria-label="Close"
            autoFocus
          >
            ✕
          </button>
        </div>
        {picks.rows.length === 0 ? (
          <div className="pl-modal-empty t-sm text-tertiary">
            {picks.isMe
              ? "You haven’t made any picks yet."
              : "No revealed picks yet — a manager’s pick appears once that match kicks off."}
          </div>
        ) : (
          <div className="pl-modal-list">
            {picks.rows.map((row) => (
              <ManagerPickLine key={row.matchId} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
