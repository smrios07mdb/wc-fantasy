"use client";
/**
 * The /players full-tournament browser — READ-ONLY (PLAYERS-1). Renders the server `PlayersView`
 * snapshot: search + position/availability/nation/active-teams filters (AND-composed, pure helpers in
 * `playersLogic`), a paged 25-row reveal (never the full ~1,200-row DOM), row tap → the SHARED
 * view-only player card (`FaPlayerCardSheet`, the ONE cross-module dep), and — for a claimable free
 * agent while the window is open — a bid trailer that HANDS OFF to /waivers?bid= (no write here).
 *
 * No mutations of any kind: no bid/add/drop/star/watchlist. Acquisition is single-sourced on /waivers.
 */
import { useEffect, useMemo, useState } from "react";
import { NationFilter } from "@/components/NationFilter";
import { FaPlayerCardSheet } from "@/src/waivers/FaPlayerCardSheet";
import "./players.css";
import type { PlayersView, PlPlayer } from "./types";
import {
  DEFAULT_PLAYERS_FILTER,
  activeFilterLabels,
  filterPlayers,
  isWindowOpen,
  pageSlice,
  playersNations,
  sortPlayers,
  type Availability,
  type PlayersFilter,
  type PosFilter,
  type SortDir,
} from "./playersLogic";
import {
  ActiveTeamsToggle,
  AvailabilityFilter,
  EmptyState,
  ListMeta,
  Pager,
  PlayerStatRow,
  PositionSegmented,
  SearchField,
  StatHeader,
  StatusLine,
  SwipeHint,
} from "./components";

export function PlayersClient({ view }: { view: PlayersView }) {
  const [filter, setFilter] = useState<PlayersFilter>(DEFAULT_PLAYERS_FILTER);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [cardPlayer, setCardPlayer] = useState<PlPlayer | null>(null);

  // Live clock — seeded from the server render time so SSR + hydration agree, then ticked so the bid
  // trailer disappears as each player's kickoff (his acquisition cutoff) passes (mirrors WaiversClient).
  const [now, setNow] = useState(() => new Date(view.nowIso));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Any filter/sort change resets the paged reveal to the first page (else a narrowed result could sit
  // on an out-of-range page). Kept off `page` itself so "Load more" doesn't reset.
  useEffect(() => {
    setPage(1);
  }, [filter, sortDir]);

  const nations = useMemo(() => playersNations(view.players), [view.players]);
  const filtered = useMemo(
    () => filterPlayers(view.players, filter, view.viewerManagerId),
    [view.players, filter, view.viewerManagerId],
  );
  const sorted = useMemo(() => sortPlayers(filtered, sortDir), [filtered, sortDir]);
  const visible = useMemo(() => pageSlice(sorted, page), [sorted, page]);

  const patch = (p: Partial<PlayersFilter>) => setFilter((f) => ({ ...f, ...p }));
  const windowOpen = isWindowOpen(view.windowPhase);
  // The current period's effective batch instant (sealed-bid only; null otherwise) — threaded to the
  // shared card's `CutoffTag` so /players shows the ACTIONABLE deadline (min(batch, kickoff)), matching
  // /waivers. Parsed once from the server ISO; a null stays null (kickoff becomes the sole bound).
  const batchAt = view.batchAtIso ? new Date(view.batchAtIso) : null;

  return (
    <div className="pl-app">
      {/* sticky toolbar block */}
      <div className="pl-toolbar">
        <SearchField value={filter.query} onChange={(query) => patch({ query })} />
        <PositionSegmented
          value={filter.position}
          onChange={(position: PosFilter) => patch({ position })}
        />
        <AvailabilityFilter
          value={filter.availability}
          onChange={(availability: Availability) => patch({ availability })}
        />
        <div className="pl-filterrow">
          <NationFilter
            nations={nations}
            value={filter.nation}
            onChange={(nation) => patch({ nation })}
          />
          <ActiveTeamsToggle
            on={filter.activeTeamsOnly}
            onChange={(activeTeamsOnly) => patch({ activeTeamsOnly })}
          />
        </div>
      </div>

      <ListMeta
        shown={visible.length}
        total={filtered.length}
        sortDir={sortDir}
        onToggleSort={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
      />

      <StatusLine>
        {windowOpen ? (
          <>
            <span className="d" style={{ background: "var(--win)" }} />
            <span style={{ color: "var(--win)", fontWeight: 700 }}>Claims open</span> · a free agent
            can be claimed until his match kicks off
          </>
        ) : (
          <>
            <span className="d" style={{ background: "var(--locked)" }} />
            <span style={{ color: "var(--locked)", fontWeight: 700 }}>Claims closed</span>
            {view.windowLabel ? ` · waivers are locked for ${view.windowLabel}` : ""}
          </>
        )}
      </StatusLine>

      {visible.length === 0 ? (
        <EmptyState
          filterLabels={activeFilterLabels(filter)}
          onClear={() => setFilter(DEFAULT_PLAYERS_FILTER)}
        />
      ) : (
        <>
          <SwipeHint />
          {/* One horizontally-scrollable stat table: Player pinned left, Pts pinned right, the stat
              columns swipe (design image 4). Scroll containment (overscroll-behavior) keeps the swipe
              off the page; it widens to a desktop wide-list (image 2) at ≥760px — see players.css. */}
          <div className="mt-scroll" role="table" aria-label="Players">
            <div className="mt-wrap">
              <StatHeader />
              {visible.map((p) => (
                <PlayerStatRow
                  key={p.id}
                  player={p}
                  viewerManagerId={view.viewerManagerId}
                  windowPhase={view.windowPhase}
                  now={now}
                  onOpen={setCardPlayer}
                />
              ))}
            </div>
          </div>
          <Pager
            remaining={sorted.length - visible.length}
            total={filtered.length}
            onMore={() => setPage((p) => p + 1)}
          />
        </>
      )}

      {/* Row tap → the SHARED view-only card. No star (read-only), and its foot points to /waivers —
          the single acquisition surface. `PlPlayer` is a structural superset of the card's `WvPlayer`. */}
      {cardPlayer && (
        <FaPlayerCardSheet
          player={cardPlayer}
          now={now}
          batchAt={batchAt}
          onClose={() => setCardPlayer(null)}
          footNote="View only · acquire from Waivers."
        />
      )}
    </div>
  );
}
