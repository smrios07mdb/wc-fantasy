"use client";
/**
 * Presentational pieces for the /players browser — ported from `design/design_reference/players/
 * Players.html` (the `.pl-*` row vocabulary, frame 6) into the codebase's conventions (typed props,
 * ds.css classes). No IO, no data fetching; `PlayersClient` owns all state.
 *
 * ATOMS ARE LOCAL BY DESIGN: `PlPos` renders the GLOBAL `.pos` badge (ds.css) and `PlKit` renders the
 * route-scoped `.pl-kit` code-on-tint chip (players.css) — neither depends on any waivers CSS, so
 * /players imports EXACTLY ONE thing from /waivers: the shared view-only card (`FaPlayerCardSheet`).
 * That keeps the cross-module coupling to the single documented seam. (The design's flag-gradient KIT
 * library was never ported into the app — the code-on-pos-tint chip matches the shipped /waivers look
 * we hand off to.)
 */
import type { Position } from "@app/shared";
import type { AcquisitionWindow } from "@app/faab";
import type { PlPlayer } from "./types";
import type { Availability, PosFilter, SortDir } from "./playersLogic";
import { shouldShowBidTrailer } from "./playersLogic";

// ── icons (ported 1:1 from the design's `I` glyphs) ─────────────────────────────────────────────
export function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}
function IconSort() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l-3 3M17 4l3 3" opacity=".9" />
    </svg>
  );
}
function IconBid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M12 5v14M8 9h5.5a2.5 2.5 0 0 1 0 5H8m0 3h6" />
    </svg>
  );
}
function IconEmpty() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3M8.5 11h5" />
    </svg>
  );
}

// ── atoms ───────────────────────────────────────────────────────────────────────────────────────
/** Position badge — the GLOBAL `.pos` classes (ds.css); no route CSS needed. */
export function PlPos({ p }: { p: Position }) {
  return <span className={`pos pos-${p}`}>{p}</span>;
}

/** Nation code on a position-tinted chip (the no-image kit fallback, route-scoped `.pl-kit`). */
export function PlKit({ player }: { player: PlPlayer }) {
  const code = (player.nation ?? "—").slice(0, 3).toUpperCase();
  return (
    <span
      className={`pl-kit pos-${player.position}`}
      title={player.nation ?? undefined}
      aria-hidden="true"
    >
      {code}
    </span>
  );
}

/**
 * Ownership chip: Free agent = accent (cobalt); a manager = muted; YOU = accent + "· you". Accent
 * marks *you* + the FA (a primary way in), never a functional state — per BRAND/design.
 */
export function OwnerChip({
  player,
  viewerManagerId,
}: {
  player: PlPlayer;
  viewerManagerId: string;
}) {
  if (player.owner === null) return <span className="pl-own pl-own-fa">Free agent</span>;
  if (player.owner.managerId === viewerManagerId)
    return <span className="pl-own pl-own-me">{player.owner.name} · you</span>;
  return <span className="pl-own pl-own-mgr">{player.owner.name}</span>;
}

// ── the row (design frame 6 `.pl-row`) ───────────────────────────────────────────────────────────
/**
 * One player row. The whole row (minus the trailer) is a BUTTON that opens the shared view-only card;
 * the bid trailer is a SIBLING `<a>` (never nested in the button — valid HTML + the FaPickRow
 * sibling-control precedent), so tapping it navigates to /waivers?bid= without also opening the card.
 * The trailer only appears for a claimable free agent while the window is open — and it only HANDS
 * OFF; acquisition itself is single-sourced on /waivers.
 */
export function PlayerRow({
  player,
  viewerManagerId,
  windowPhase,
  now,
  onOpen,
}: {
  player: PlPlayer;
  viewerManagerId: string;
  windowPhase: AcquisitionWindow | null;
  now: Date;
  onOpen: (player: PlPlayer) => void;
}) {
  const mine = player.owner?.managerId === viewerManagerId;
  const elim = !player.nationAlive;
  const showTrailer = shouldShowBidTrailer(player, windowPhase, now);
  return (
    <div className={"pl-row" + (mine ? " mine" : "") + (elim ? " is-elim" : "")}>
      <button
        className="pl-row-tap"
        onClick={() => onOpen(player)}
        aria-label={`View ${player.name}’s player card`}
      >
        <span className="pl-pos">
          <PlPos p={player.position} />
        </span>
        <PlKit player={player} />
        <span className="pl-idc">
          <span className="pl-name">{player.name}</span>
          <span className="pl-sub">
            <span className="pl-flagname">{player.nation ?? "—"}</span>
            {elim && <span className="pl-elimtag">Eliminated</span>}
          </span>
        </span>
        <span className="pl-right">
          <OwnerChip player={player} viewerManagerId={viewerManagerId} />
          <span className="pl-pts">
            <b>{player.seasonPoints ?? "—"}</b>
            <span>PTS</span>
          </span>
        </span>
      </button>
      {showTrailer && (
        <a
          className="pl-bid"
          href={`/waivers?bid=${player.id}`}
          aria-label={`Place a bid on ${player.name}`}
        >
          <IconBid />
          <span>Bid</span>
        </a>
      )}
    </div>
  );
}

// ── toolbar pieces ───────────────────────────────────────────────────────────────────────────────
export function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="pl-search">
      <IconSearch />
      <input
        className="pl-search-input"
        type="search"
        placeholder="Search players"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search players"
      />
    </div>
  );
}

const POSITIONS: readonly PosFilter[] = ["ALL", "GK", "DEF", "MID", "FWD"];
export function PositionSegmented({
  value,
  onChange,
}: {
  value: PosFilter;
  onChange: (v: PosFilter) => void;
}) {
  return (
    <div className="pl-seg" role="tablist" aria-label="Filter by position">
      {POSITIONS.map((p) => (
        <button
          key={p}
          className={p === value ? "on" : ""}
          role="tab"
          aria-selected={p === value}
          onClick={() => onChange(p)}
        >
          {p === "ALL" ? "All" : p}
        </button>
      ))}
    </div>
  );
}

const AVAILABILITY: readonly { key: Availability; label: string }[] = [
  { key: "all", label: "All" },
  { key: "fa", label: "Free agents" },
  { key: "rostered", label: "Rostered" },
  { key: "mine", label: "Mine" },
];
export function AvailabilityFilter({
  value,
  onChange,
}: {
  value: Availability;
  onChange: (v: Availability) => void;
}) {
  return (
    <div className="pl-chiprow" role="group" aria-label="Filter by availability">
      {AVAILABILITY.map((a) => (
        <button
          key={a.key}
          className={"pl-fchip" + (a.key === value ? " on" : "")}
          aria-pressed={a.key === value}
          onClick={() => onChange(a.key)}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function ActiveTeamsToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={"pl-toggle" + (on ? " on" : "")}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span>Active teams</span>
      <span className="pl-sw" aria-hidden="true" />
    </button>
  );
}

/** List-meta row: "Showing N of M" + the sortable Season-pts control (default desc; toggles). */
export function ListMeta({
  shown,
  total,
  sortDir,
  onToggleSort,
}: {
  shown: number;
  total: number;
  sortDir: SortDir;
  onToggleSort: () => void;
}) {
  return (
    <div className="pl-listmeta">
      <span className="pl-count">
        Showing <b>{shown}</b> of {total.toLocaleString()}
      </span>
      <button
        className="pl-sort"
        onClick={onToggleSort}
        aria-label={`Sort by season points, ${sortDir === "desc" ? "high to low" : "low to high"} (toggle)`}
      >
        Season pts <IconSort />
        <span className="pl-sort-dir" aria-hidden="true">
          {sortDir === "desc" ? "↓" : "↑"}
        </span>
      </button>
    </div>
  );
}

export function StatusLine({ children }: { children: React.ReactNode }) {
  return <div className="pl-status">{children}</div>;
}

/** Paged reveal — "Load 25 more". Rendered only when more rows remain. */
export function Pager({
  remaining,
  total,
  onMore,
}: {
  remaining: number;
  total: number;
  onMore: () => void;
}) {
  if (remaining <= 0) return null;
  const next = Math.min(25, remaining);
  return (
    <div className="pl-pager">
      <button className="pl-loadmore" onClick={onMore}>
        Load {next} more
      </button>
      <small>{total.toLocaleString()} players in the pool</small>
    </div>
  );
}

/** Empty state (design frame 5) — names the active filters + one-tap clear. */
export function EmptyState({
  filterLabels,
  onClear,
}: {
  filterLabels: string[];
  onClear: () => void;
}) {
  return (
    <div className="pl-empty">
      <div className="glyph">
        <IconEmpty />
      </div>
      <h3>No players match</h3>
      <p>
        {filterLabels.length > 0 ? (
          <>
            Nothing matches <b>{filterLabels.join(" · ")}</b>. Try widening your filters.
          </>
        ) : (
          <>No players in the pool yet.</>
        )}
      </p>
      {filterLabels.length > 0 && (
        <button className="clr" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
