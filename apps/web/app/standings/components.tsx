/**
 * Presentational pieces for the /standings page (ported from design/design_reference/standings/
 * components.jsx + desktop.jsx + mobile.jsx). These are PURE render functions — no hooks, no IO; the
 * tab / selected-period / expanded-row state lives in `StandingsClient`, which threads it down.
 *
 * Both tabs render the same `StandingsRow` shape from the pure `buildStandingsView`. The cumulative
 * table is the ported power-record table (form strip + expandable per-period detail + seed + move +
 * provisional cut line); the matchday panel is the within-period all-play-all ranking. Accent (cobalt)
 * marks only YOU (`.is-me`); the cut is `--elim`, the live chip is `--live`. No gold (BRAND.md §1).
 */
import type { StandingsRow, StandingsPeriodInput } from "@app/recompute";

export type ConnState = "live" | "reconnecting" | "loading";

/** Connection pill — the live/degraded indicator (mirrors the vsfield / playoffs ConnPill). */
export function ConnPill({ state }: { state: ConnState }) {
  const map = {
    live: { cls: "pill-live", label: "Live" },
    reconnecting: { cls: "pill-loss", label: "Reconnecting" },
    loading: { cls: "pill-neutral", label: "Loading" },
  } as const;
  const { cls, label } = map[state];
  return (
    <span className={`pill ${cls} st-conn`}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Up to two initials from a display name — a compact, dependency-free manager avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function MgrAvatar({ name }: { name: string }) {
  return (
    <span className="st-avatar" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Seed badge — the rank number; muted when below the provisional playoff cut. */
function Seed({ rank, qualified }: { rank: number; qualified: boolean }) {
  return <span className={"st-seed" + (qualified ? "" : " is-out")}>{rank}</span>;
}

/** Movement indicator vs the standings through COMPLETED periods only (▲ up / ▼ down / – flat). */
function Move({ n }: { n: number | undefined }) {
  if (!n) {
    return (
      <span className="st-move st-move-flat" title="No change">
        –
      </span>
    );
  }
  const up = n > 0;
  return (
    <span
      className={"st-move " + (up ? "st-move-up" : "st-move-down")}
      title={up ? `Up ${n}` : `Down ${-n}`}
    >
      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
        {up ? (
          <path d="M5 1l4 6H1z" fill="currentColor" />
        ) : (
          <path d="M5 9 1 3h8z" fill="currentColor" />
        )}
      </svg>
      {Math.abs(n)}
    </span>
  );
}

/** One period's all-play-all mini-record chip (e.g. 8–3), colored by win/loss/level; live = red ring. */
function FormChip({ cell }: { cell: NonNullable<StandingsRow["perPeriod"]>[number] }) {
  const k = cell.w > cell.l ? "win" : cell.w < cell.l ? "loss" : "draw";
  const dPart = cell.d ? `–${cell.d}` : "";
  return (
    <span
      className={`st-fc st-fc-${k}` + (cell.live ? " is-live" : "")}
      title={`${cell.name}: ${cell.w}–${cell.l}${dPart} · ${cell.points} pts`}
    >
      <span className="st-fc-lab">
        {cell.label}
        {cell.live && <span className="st-fc-dot" aria-hidden="true" />}
      </span>
      <span className="st-fc-rec mono">
        {cell.w}
        <span className="st-fc-sep">–</span>
        {cell.l}
      </span>
    </span>
  );
}

function FormStrip({ cells }: { cells: NonNullable<StandingsRow["perPeriod"]> }) {
  return (
    <span className="st-form">
      {cells.map((c) => (
        <FormChip key={c.periodId} cell={c} />
      ))}
    </span>
  );
}

/** A W–L–D record block (D shown only when > 0, like the design). */
function Record({ w, l, d }: { w: number; l: number; d: number }) {
  return (
    <span className="st-rec">
      <b className="st-rec-w">{w}</b>
      <span className="st-rec-sep">–</span>
      <b className="st-rec-l">{l}</b>
      {d > 0 && (
        <>
          <span className="st-rec-sep">–</span>
          <b className="st-rec-d">{d}</b>
        </>
      )}
    </span>
  );
}

const pct = (winPct: number): number => Math.round(winPct * 100);

/** Expansion: the per-period breakdown + a season-total row. */
function RowDetail({ row }: { row: StandingsRow }) {
  const cells = row.perPeriod ?? [];
  return (
    <div className="st-detail">
      <table className="st-detail-table">
        <thead>
          <tr>
            <th scope="col">Matchday</th>
            <th scope="col" className="st-num">
              Record
            </th>
            <th scope="col" className="st-num">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {cells.map((c) => (
            <tr key={c.periodId}>
              <td>
                {c.name}
                {c.live && <span className="st-fc-dot" aria-hidden="true" />}
              </td>
              <td className="st-num">
                {c.w}–{c.l}
                {c.d ? `–${c.d}` : ""}
              </td>
              <td className="st-num mono">{c.points}</td>
            </tr>
          ))}
          <tr className="st-detail-total">
            <td>Season total</td>
            <td className="st-num">
              {row.w}–{row.l}
              {row.d ? `–${row.d}` : ""}
            </td>
            <td className="st-num mono">{row.points}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** One cumulative-tab row (a button that expands its per-period detail). */
function StandRow({
  row,
  expanded,
  onToggle,
}: {
  row: StandingsRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cls = [
    "st-row",
    row.isMe ? "is-me" : "",
    row.qualified ? "is-in" : "is-out",
    expanded ? "is-open" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <button type="button" className="st-row-main" onClick={onToggle} aria-expanded={expanded}>
        <span className="st-c-seed">
          <Seed rank={row.rank} qualified={row.qualified} />
        </span>
        <span className="st-c-mgr">
          <MgrAvatar name={row.displayName} />
          <span className="st-mgr-name">{row.displayName}</span>
          {row.isMe && <span className="st-you">YOU</span>}
        </span>
        <span className="st-c-rec">
          <Record w={row.w} l={row.l} d={row.d} />
        </span>
        <span className="st-c-pct mono">
          {pct(row.winPct)}
          <small>%</small>
        </span>
        <span
          className={"st-c-pf mono" + (row.tiedWins ? " is-tiebreak" : "")}
          title={row.tiedWins ? "Level on wins — total points breaks the tie" : undefined}
        >
          {row.points}
        </span>
        <span className="st-c-form">{row.perPeriod && <FormStrip cells={row.perPeriod} />}</span>
        <span className="st-c-move">
          <Move n={row.move} />
        </span>
        <span className="st-c-chev" aria-hidden="true">
          <svg viewBox="0 0 12 8" width="11" height="8" className="st-chev">
            <path
              d="M1 1l5 5 5-5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {expanded && <RowDetail row={row} />}
    </div>
  );
}

/** Context band — leader · your seed (in/out) · the provisional cut summary. */
export function ContextBand({ rows, fieldSize }: { rows: StandingsRow[]; fieldSize: number }) {
  if (rows.length === 0) return null;
  const leader = rows[0]!;
  const me = rows.find((r) => r.isMe);
  const firstOut = rows[fieldSize];
  return (
    <div className="st-band card-2">
      <div className="st-band-cell">
        <span className="t-label text-tertiary">League leader</span>
        <div className="st-band-mgr">
          <b className="st-band-name">{leader.displayName}</b>
          <span className="t-micro text-tertiary mono">
            {leader.w}–{leader.l}
            {leader.d ? `–${leader.d}` : ""} · {leader.points} pts
          </span>
        </div>
      </div>
      {me && (
        <div className="st-band-cell">
          <span className="t-label text-tertiary">Your seed</span>
          <div className="st-band-mgr">
            <b className="st-band-name">
              #{me.rank}{" "}
              <span className={me.qualified ? "st-band-in" : "st-band-out"}>
                {me.qualified ? "in" : "out"}
              </span>
            </b>
            <span className="t-micro text-tertiary mono">
              {me.w}–{me.l}
              {me.d ? `–${me.d}` : ""} · {me.points} pts
            </span>
          </div>
        </div>
      )}
      <div className="st-band-cell">
        <span className="t-label text-tertiary">Provisional cut</span>
        <div className="st-band-mgr">
          <b className="st-band-name">Top {Math.min(fieldSize, rows.length)} qualify</b>
          <span className="t-micro text-tertiary">
            {firstOut ? `${firstOut.displayName} first out` : "field not yet full"} · fixed at the
            group→playoff transition
          </span>
        </div>
      </div>
    </div>
  );
}

/** The cumulative power-record table — header, rows, the provisional cut-line divider after seed N. */
export function CumulativeTable({
  rows,
  fieldSize,
  expandedId,
  onExpand,
}: {
  rows: StandingsRow[];
  fieldSize: number;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
}) {
  return (
    <div className="st-table" role="table" aria-label="Season standings">
      <div className="st-head" role="row">
        <span className="st-c-seed">#</span>
        <span className="st-c-mgr">Manager</span>
        <span className="st-c-rec">W–L–D</span>
        <span className="st-c-pct">Win%</span>
        <span className="st-c-pf">PF</span>
        <span className="st-c-form">Form</span>
        <span className="st-c-move">+/–</span>
        <span className="st-c-chev" aria-hidden="true" />
      </div>
      {rows.map((row, i) => {
        const next = rows[i + 1];
        // Insert the provisional cut line at the qualified→eliminated boundary.
        const showCut = row.qualified && !!next && !next.qualified;
        return (
          <div key={row.managerId}>
            <StandRow
              row={row}
              expanded={expandedId === row.managerId}
              onToggle={() => onExpand(expandedId === row.managerId ? null : row.managerId)}
            />
            {showCut && (
              <div className="st-cutline" role="separator">
                <span className="st-cutline-label">
                  Playoff cut · top {fieldSize} qualify (provisional)
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A within-period matchday ranking row (no expansion — a flat ranking). */
function MatchdayRow({ row }: { row: StandingsRow }) {
  const cls = ["st-mdrow", row.isMe ? "is-me" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} role="row">
      <span className="st-c-seed">
        <span className="st-seed">{row.rank}</span>
      </span>
      <span className="st-c-mgr">
        <MgrAvatar name={row.displayName} />
        <span className="st-mgr-name">{row.displayName}</span>
        {row.isMe && <span className="st-you">YOU</span>}
      </span>
      <span className="st-c-rec">
        <Record w={row.w} l={row.l} d={row.d} />
      </span>
      <span className="st-c-mdpts mono">{row.points}</span>
    </div>
  );
}

/** The matchday tab: a period selector + the selected period's within-period ranking. */
export function MatchdayPanel({
  periods,
  selectedId,
  onSelect,
  rows,
}: {
  periods: StandingsPeriodInput[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  rows: StandingsRow[];
}) {
  if (periods.length === 0) {
    return <p className="st-empty text-secondary">No matchdays have been scored yet.</p>;
  }
  return (
    <div className="st-md">
      <div className="st-mdsel tabs" role="tablist" aria-label="Matchday">
        {periods.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === selectedId}
            className={"tab" + (p.id === selectedId ? " is-active" : "")}
            onClick={() => onSelect(p.id)}
          >
            {p.label}
            {p.live && <span className="st-fc-dot" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="st-table" role="table" aria-label="Matchday ranking">
        <div className="st-head-md" role="row">
          <span className="st-c-seed">#</span>
          <span className="st-c-mgr">Manager</span>
          <span className="st-c-rec">W–L–D</span>
          <span className="st-c-mdpts">Pts</span>
        </div>
        {rows.length === 0 ? (
          <p className="st-empty text-secondary">No scores for this matchday yet.</p>
        ) : (
          rows.map((row) => <MatchdayRow key={row.managerId} row={row} />)
        )}
      </div>
    </div>
  );
}
