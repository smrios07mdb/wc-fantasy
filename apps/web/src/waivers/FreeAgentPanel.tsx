"use client";
/**
 * The INSTANT $0 free-agency panel — the Waivers tab's acquisition surface while a period is in its
 * free-agency phase (post-batch, pre-first-kickoff). Unlike a sealed bid (which waits for the next batch),
 * picking a free agent here applies the add/drop IMMEDIATELY, first-come, via `POST /api/faab/free-agent`
 * (the parent owns the round-trip + `router.refresh()`). This closes the Prompt-48 gap: the route existed
 * and was tested, but no UI ever called it, so players could not be transacted in the FA window.
 *
 * Reuses the sealed composer's building blocks verbatim — `claimableFreeAgents` (cutoff-open + filtered
 * pool), `droppableRoster` (unlocked squad, weakest-first), and the `KitChip`/`NationFlag`/`Pos` atoms —
 * so the FA list and the bid form behave identically; only the right rail differs (no amount/budget: the
 * cost is $0, with a drop required only once the squad is full).
 *
 * `enabled` is false in the locked phase: the list still browses but "Add free agent" is disabled (the
 * acquisition window is closed). The offered pool is the SNAPSHOT-eligible free agents the loader resolves
 * with the same predicate the grant re-checks — a list/route mismatch only ever falls through to the
 * server's `fa-conflict` (409), which the parent surfaces.
 */
import { useState } from "react";
import { type Position } from "@app/shared";
import type { WvClaim, WvPlayer } from "./types";
import {
  claimableFreeAgents,
  droppableRoster,
  freeAgentNations,
  pendingBidCountByPlayer,
  watchedFreeAgents,
} from "./waiversLogic";
import { CutoffTag, FaPickRow, IconStar, KitChip, NationFlag, Pos } from "./components";
import { NationFilter } from "@/components/NationFilter";

const POS_FILTERS: ReadonlyArray<"ALL" | Position> = ["ALL", "GK", "DEF", "MID", "FWD"];

export interface FaGrantPayload {
  addId: string;
  /** null only when the squad has an open slot (no drop required). */
  dropId: string | null;
}

export function FreeAgentPanel({
  enabled,
  initialSelected = null,
  rosterCap,
  freeAgents,
  claims,
  roster,
  lockedPlayerIds,
  now,
  batchAt = null,
  submitting,
  errorMessage,
  onGrant,
  onOpen,
  watched,
  onToggleStar,
}: {
  /** false in the locked phase → browse only, "Add" disabled. */
  enabled: boolean;
  /** Seed the row selection (PLAYERS-1 `/waivers?bid=` deep-link, free-agency phase) — the SAME
   *  `setSelected` path a row tap drives, just seeded at mount. The parent passes a player it has
   *  ALREADY resolved as claimable (`resolveBidDeepLink`). */
  initialSelected?: WvPlayer | null;
  /** The league's CURRENT-PHASE squad cap (15 group / 9 playoff), threaded from the server loader via
   *  `rosterCapForPlayoffPhase` so the "squad full" gate matches the cap the engine enforces. A 9-man
   *  playoff squad must read FULL here (it was hardcoded `SQUAD_SIZE = 15`, the 2026-06-28 R32 409 bug). */
  rosterCap: number;
  freeAgents: readonly WvPlayer[];
  claims: readonly WvClaim[];
  roster: readonly WvPlayer[];
  lockedPlayerIds: readonly string[];
  now: Date;
  /** The current period's effective batch instant. In the FA phase there is no sealed batch, so the
   *  parent passes null and each player's kickoff is the sole bound ("to kickoff") — kept for parity. */
  batchAt?: Date | null;
  submitting: boolean;
  errorMessage: string | null;
  onGrant: (payload: FaGrantPayload) => void;
  /** Opens the view-only player card for a row (sibling control — never selects for acquisition). */
  onOpen: (player: WvPlayer) => void;
  /** The viewer's starred player ids (T2 — private watchlist): drives the row star + "Watched" filter. */
  watched: ReadonlySet<string>;
  /** Toggle a player's private star (a sibling control — never selects for acquisition). */
  onToggleStar: (player: WvPlayer) => void;
}) {
  const [selected, setSelected] = useState<WvPlayer | null>(initialSelected);
  const [dropId, setDropId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<"ALL" | Position>("ALL");
  const [nation, setNation] = useState<string | "ALL">("ALL");
  const [watchedOnly, setWatchedOnly] = useState(false);

  const nations = freeAgentNations(freeAgents);
  const base = claimableFreeAgents(freeAgents, now, { query, position, nation });
  // S2 (speculative bids): badge each pool row with the viewer's live claim count (empty in FA phase).
  const bidCounts = pendingBidCountByPlayer(claims);
  // "Watched only" narrows the (already cutoff/position/nation-filtered) pool to the viewer's stars.
  const fas = watchedOnly ? watchedFreeAgents(base, watched) : base;
  const drops = droppableRoster(roster, lockedPlayerIds);
  // A full squad must drop a player to add one (the engine's `drop-required` rule); an open slot may not.
  // FULL is keyed on the threaded PHASE cap (15 group / 9 playoff), NOT a hardcoded SQUAD_SIZE — the
  // playoff cap-parity fix (a 9-man playoff squad is full at 9, was wrongly read non-full against 15).
  const squadFull = roster.length >= rosterCap;
  const valid = enabled && !!selected && (!squadFull || !!dropId);

  return (
    <section className="wv-fa" aria-label="Free agents">
      <div className="wv-fa-head">
        <span className="t-label">Free agents · instant pickup</span>
        <span className="t-micro text-tertiary">
          {enabled
            ? "Add now for $0 — applied immediately, first-come."
            : "The acquisition window is locked for this period."}
        </span>
      </div>

      <div className="wv-comp-body">
        {/* left: browse the snapshot-eligible pool */}
        <div className="wv-comp-pick">
          <div className="wv-comp-search">
            <input
              className="input wv-comp-input"
              placeholder="Search free agents…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div className="wv-comp-seg">
            {POS_FILTERS.map((f) => (
              <button
                key={f}
                className={"wv-seg-btn" + (position === f ? " is-active" : "")}
                onClick={() => setPosition(f)}
              >
                {f === "ALL" ? "All" : f}
              </button>
            ))}
          </div>
          <div className="wv-comp-filters">
            <NationFilter nations={nations} value={nation} onChange={setNation} />
            <button
              type="button"
              className={"chip wv-watch-chip" + (watchedOnly ? " is-active" : "")}
              aria-pressed={watchedOnly}
              onClick={() => setWatchedOnly((v) => !v)}
            >
              <IconStar filled={watchedOnly} /> Watched
            </button>
          </div>
          <div className="wv-comp-list">
            {fas.length === 0 && (
              <div className="wv-comp-empty t-sm text-tertiary">
                {watchedOnly ? "No watched free agents match." : "No free agents match."}
              </div>
            )}
            {fas.slice(0, 40).map((p) => (
              <FaPickRow
                key={p.id}
                player={p}
                selected={selected?.id === p.id}
                watched={watched.has(p.id)}
                pendingBidCount={bidCounts.get(p.id) ?? 0}
                onSelect={setSelected}
                onOpen={onOpen}
                onToggleStar={onToggleStar}
              />
            ))}
          </div>
        </div>

        {/* right: confirm the instant add (+ drop when the squad is full) */}
        <div className="wv-comp-config">
          {!selected ? (
            <div className="wv-comp-placeholder t-sm text-tertiary">
              Pick a free agent to add him instantly for $0.
            </div>
          ) : (
            <>
              <div className="wv-comp-fixed">
                <span className="t-label">Adding</span>
                <div className="wv-comp-selplayer">
                  <KitChip player={selected} />
                  <NationFlag nation={selected.nation} />
                  <div>
                    <b className="wv-name">{selected.shortName}</b>
                    <div className="wv-comp-selmeta">
                      <Pos p={selected.position} />
                      <CutoffTag player={selected} now={now} batchAt={batchAt} />
                    </div>
                  </div>
                </div>
              </div>

              {squadFull && (
                <div className="wv-comp-field">
                  <span className="t-label">
                    Drop to make room{" "}
                    <span className="text-tertiary">
                      · squad full {roster.length}/{rosterCap}
                    </span>
                  </span>
                  <div className="wv-drop-pick">
                    {drops.length === 0 && (
                      <span className="t-sm text-tertiary">
                        No droppable players — every squad player is locked by play.
                      </span>
                    )}
                    {drops.map((p) => (
                      <button
                        key={p.id}
                        className={"wv-drop-opt" + (dropId === p.id ? " is-sel" : "")}
                        onClick={() => setDropId(p.id)}
                      >
                        <KitChip player={p} sm />
                        <NationFlag nation={p.nation} />
                        <Pos p={p.position} />
                        <span className="wv-drop-optname">{p.shortName}</span>
                        <span className="t-micro text-tertiary">
                          {p.seasonPoints === null ? "—" : `${p.seasonPoints} pts`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {errorMessage && <div className="wv-comp-error">{errorMessage}</div>}

              <div className="wv-comp-actions">
                <button
                  className="btn btn-primary"
                  disabled={!valid || submitting}
                  onClick={() => onGrant({ addId: selected.id, dropId: squadFull ? dropId : null })}
                >
                  {submitting ? "Adding…" : "Add free agent"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
