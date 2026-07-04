"use client";
/**
 * Presentational pieces for the /players browser — ported from `design/design_reference/players/
 * Players.html` into the codebase's conventions (typed props, ds.css classes). No IO, no data fetching;
 * `PlayersClient` owns all state.
 *
 * PLAYERS-1 remediation (reverses the G1 drop): the row is the design's `.mt-*` STAT TABLE — a single
 * horizontally-scrollable grid with the Player cell pinned left and the Pts cell pinned right (design
 * image 4's "← swipe stats"), widening to a desktop wide-list (image 2) at ≥760px. Real statline columns
 * (Pld·Min·G·A·Sh·KP·Tkl); CS + YC render "—" (no in-scope source — see PlStatline). The KIT cell reuses
 * the shared FLAG-KIT primitive `kitOf` (T13/T16 — the same jersey the pitch surfaces use), NOT the
 * waivers text-abbrev chip. Atoms `PlPos`/`OwnerChip` stay local; /players still imports EXACTLY ONE
 * thing from /waivers (the shared card).
 */
import type { Position } from "@app/shared";
import type { AcquisitionWindow } from "@app/faab";
import { kitOf } from "@/src/kit/kitOf";
import { Flag } from "@/app/draft/Flag";
import { toIso2 } from "@/src/draft/flag";
import type { PlPlayer, PlStatline } from "./types";
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

/**
 * The FLAG-KIT jersey square (design's KIT column, images 2/4 render real flags). Reuses the shared
 * `kitOf` primitive (apps/web/src/kit — T13 lineup jerseys / T16 game-detail), so /players uses the
 * SAME flag-kit the pitch surfaces do. GOTCHA (kitOf contract): NEVER set `background-size: cover` —
 * the multi-layer flag backgrounds would collapse. A small emoji `<Flag>` overlays so the cell always
 * carries a flag signal even for a nation outside the kit library (kitOf → neutral surface).
 */
export function PlKit({ player }: { player: PlPlayer }) {
  return (
    <span
      className="pl-kit"
      style={{ background: kitOf(player.nation) }}
      title={player.nation ?? undefined}
      aria-hidden="true"
    >
      <span className="pl-kit-flag">
        <Flag code={toIso2(player.nation ?? "")} label="" />
      </span>
    </span>
  );
}

/**
 * Ownership chip: Free agent = accent (cobalt); a manager = muted; YOU = accent. Accent marks *you* +
 * the FA (a primary way in), never a functional state — per BRAND/design. Compact for the table cell.
 */
export function OwnerChip({
  player,
  viewerManagerId,
}: {
  player: PlPlayer;
  viewerManagerId: string;
}) {
  if (player.owner === null) return <span className="pl-own pl-own-fa">FA</span>;
  if (player.owner.managerId === viewerManagerId)
    return <span className="pl-own pl-own-me">You</span>;
  return (
    <span className="pl-own pl-own-mgr" title={player.owner.name}>
      {player.owner.name}
    </span>
  );
}

// ── the stat table (design frame 1/6 `.mt-*`) ────────────────────────────────────────────────────
/** The stat columns, in the design's order. `key` indexes `PlStatline`; a null value renders "—". */
const STAT_COLUMNS: readonly { key: keyof PlStatline; label: string }[] = [
  { key: "pld", label: "Pld" },
  { key: "min", label: "Min" },
  { key: "goals", label: "G" },
  { key: "assists", label: "A" },
  { key: "shots", label: "Sh" },
  { key: "keyPasses", label: "KP" },
  { key: "cleanSheets", label: "CS" },
  { key: "tackles", label: "Tkl" },
  { key: "yellowCards", label: "YC" },
];

/** A stat cell — a genuine 0 and a null (no source) both read as a muted "—" (the design convention);
 *  a positive count renders the number. Pure, so the render-proof + unit tests can pin it. */
export function statCellText(value: number | null): string {
  return value == null || value === 0 ? "—" : String(value);
}

/** The table header (Player · Own · 9 stat columns · Pts). */
export function StatHeader() {
  return (
    <div className="mt-head mt-cols" role="row">
      <div className="mt-idc">Player</div>
      <div className="mt-owner-h">Own</div>
      {STAT_COLUMNS.map((c) => (
        <div key={c.key}>{c.label}</div>
      ))}
      <div className="mt-end">Pts</div>
    </div>
  );
}

/**
 * One player row in the stat table. The Player cell (pinned left) is the card-opening button; the bid
 * trailer is a SIBLING control inside the pinned-right Pts cell (never nested in the button). The
 * trailer appears only for a claimable free agent while the window is open — and only HANDS OFF to
 * /waivers?bid=; acquisition stays single-sourced on /waivers.
 */
export function PlayerStatRow({
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
    <div className={"mt-row mt-cols" + (mine ? " mine" : "") + (elim ? " is-elim" : "")} role="row">
      <button
        className="mt-idc"
        onClick={() => onOpen(player)}
        aria-label={`View ${player.name}’s player card`}
      >
        <PlPos p={player.position} />
        <PlKit player={player} />
        <span className="nm">
          <b>{player.name}</b>
          <small>
            {player.nation ?? "—"}
            {elim && <span className="mt-out"> · out</span>}
          </small>
        </span>
      </button>
      <div className="mt-owner">
        <OwnerChip player={player} viewerManagerId={viewerManagerId} />
      </div>
      {STAT_COLUMNS.map((c) => {
        const text = statCellText(player.stats[c.key]);
        return (
          <div key={c.key} className={"mt-stat" + (text === "—" ? " zero" : "")}>
            {text}
          </div>
        );
      })}
      <div className="mt-end">
        <span className="p">{player.seasonPoints ?? "—"}</span>
        {showTrailer && (
          <a
            className="mt-bid"
            href={`/waivers?bid=${player.id}`}
            aria-label={`Place a bid on ${player.name}`}
          >
            <IconBid />
          </a>
        )}
      </div>
    </div>
  );
}

/** The one-line swipe hint above the table (design image 4). Decorative — the table works without it. */
export function SwipeHint() {
  return (
    <div className="mt-scrollhint" aria-hidden="true">
      ← swipe stats · tap a player to open the card
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
