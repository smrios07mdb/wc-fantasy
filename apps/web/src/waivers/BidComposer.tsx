"use client";
/**
 * The bid composer modal — place a NEW sealed claim or EDIT an existing one. Two-panel layout per the
 * design: left = claimable free-agent picker (search + position filter), right = amount stepper + drop
 * picker + rules. Validates inline against the SAME budget rule the engine enforces (`composerMaxBid` =
 * budget − other pending), so a valid form never produces an over-budget 409.
 *
 * On EDIT the add target is FIXED (the route ignores a changed add — change-the-add = cancel+resubmit),
 * so the FA picker is locked to the bid's current add and only amount/drop are editable.
 */
import { useState } from "react";
import type { Position } from "@app/shared";
import type { WvClaim, WvPlayer } from "./types";
import {
  claimableFreeAgents,
  composerMaxBid,
  droppableRoster,
  freeAgentNations,
  watchedFreeAgents,
} from "./waiversLogic";
import {
  CutoffTag,
  FaPickRow,
  IconStar,
  KitChip,
  NationFlag,
  Pos,
  Refund,
  Sealed,
} from "./components";
import { NationFilter } from "@/components/NationFilter";

const POS_FILTERS: ReadonlyArray<"ALL" | Position> = ["ALL", "GK", "DEF", "MID", "FWD"];

export interface BidPayload {
  addId: string;
  /** null only when the squad has an open slot below the phase cap (no drop required). */
  dropId: string | null;
  amount: number;
}

export function BidComposer({
  editClaim,
  initialSelected = null,
  rosterCap,
  now,
  freeAgents,
  claims,
  roster,
  lockedPlayerIds,
  faabBudget,
  submitting,
  errorMessage,
  onClose,
  onSubmit,
  onOpen,
  watched,
  onToggleStar,
}: {
  editClaim: WvClaim | null;
  /** Seed the FA picker's selection (PLAYERS-1 `/waivers?bid=` deep-link) — the SAME `setSelected`
   *  path a row tap drives, just seeded at mount. Ignored on edit (the add target is fixed). The
   *  parent passes a player it has ALREADY resolved as claimable (`resolveBidDeepLink`). */
  initialSelected?: WvPlayer | null;
  /** The league's CURRENT-PHASE squad cap (15 group / 9 playoff), threaded from the server loader — the
   *  drop-required gate keys on it, parity with {@link FreeAgentPanel}. The composer previously ALWAYS
   *  required a drop (a hidden "full 15" assumption); a below-cap playoff squad must NOT be forced into
   *  an unnecessary 1-for-1. Group squads are always exactly full, so group behaviour is unchanged. */
  rosterCap: number;
  now: Date;
  freeAgents: readonly WvPlayer[];
  claims: readonly WvClaim[];
  roster: readonly WvPlayer[];
  lockedPlayerIds: readonly string[];
  faabBudget: number;
  submitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (payload: BidPayload) => void;
  /** Opens the view-only player card for a picker row (sibling control — never selects to bid). */
  onOpen: (player: WvPlayer) => void;
  /** The viewer's starred player ids (T2 — private watchlist): drives the row star + "Watched" filter. */
  watched: ReadonlySet<string>;
  /** Toggle a player's private star (a sibling control — never selects to bid). */
  onToggleStar: (player: WvPlayer) => void;
}) {
  const [selected, setSelected] = useState<WvPlayer | null>(
    editClaim ? editClaim.add : initialSelected,
  );
  const [amount, setAmount] = useState<number>(editClaim ? editClaim.amount : 1);
  const [dropId, setDropId] = useState<string | null>(editClaim?.drop?.id ?? null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<"ALL" | Position>("ALL");
  const [nation, setNation] = useState<string | "ALL">("ALL");
  const [watchedOnly, setWatchedOnly] = useState(false);

  const editingBidId = editClaim?.bidId ?? null;
  const nations = editClaim ? [] : freeAgentNations(freeAgents);
  const baseFas = editClaim
    ? []
    : claimableFreeAgents(freeAgents, claims, now, { query, position, nation, editingBidId });
  // "Watched only" narrows the (already cutoff/position/nation-filtered) pool to the viewer's stars.
  const fas = watchedOnly ? watchedFreeAgents(baseFas, watched) : baseFas;
  const drops = droppableRoster(roster, lockedPlayerIds);
  const maxBid = composerMaxBid(faabBudget, claims, editingBidId);
  // A drop is required only once the squad is at the PHASE cap (15 group / 9 playoff) — parity with the
  // engine's `drop-required` rule + FreeAgentPanel. Below cap, a bid may reinforce an open slot.
  const squadFull = roster.length >= rosterCap;
  const valid = !!selected && (!squadFull || !!dropId) && amount >= 0 && amount <= maxBid;

  const clamp = (n: number) => Math.max(0, Math.min(maxBid, n));

  return (
    <div
      className="wv-scrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Waiver claim"
    >
      <div className="wv-composer" onClick={(e) => e.stopPropagation()}>
        <div className="wv-comp-head">
          <b className="wv-comp-title">{editClaim ? "Edit claim" : "New waiver claim"}</b>
          <button className="wv-icon-btn" onClick={onClose} aria-label="Close">
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="wv-comp-body">
          {/* left: pick a free agent (locked on edit) */}
          <div className="wv-comp-pick">
            {editClaim ? (
              <div className="wv-comp-fixed">
                <span className="t-label">Claiming</span>
                <div className="wv-comp-selplayer">
                  <KitChip player={editClaim.add} />
                  <NationFlag nation={editClaim.add.nation} />
                  <div>
                    <b className="wv-name">{editClaim.add.shortName}</b>
                    <div className="wv-comp-selmeta">
                      <Pos p={editClaim.add.position} />
                      <CutoffTag player={editClaim.add} now={now} />
                    </div>
                  </div>
                </div>
                <p className="t-micro text-tertiary">
                  To claim a different player, cancel this claim and place a new one.
                </p>
              </div>
            ) : (
              <>
                <div className="wv-comp-search">
                  <input
                    className="input wv-comp-input"
                    placeholder="Search free agents…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
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
                      {watchedOnly
                        ? "No watched free agents match."
                        : "No claimable free agents match."}
                    </div>
                  )}
                  {fas.slice(0, 40).map((p) => (
                    <FaPickRow
                      key={p.id}
                      player={p}
                      selected={selected?.id === p.id}
                      watched={watched.has(p.id)}
                      onSelect={setSelected}
                      onOpen={onOpen}
                      onToggleStar={onToggleStar}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* right: configure the bid */}
          <div className="wv-comp-config">
            {!selected ? (
              <div className="wv-comp-placeholder t-sm text-tertiary">
                Pick a free agent to configure your sealed bid.
              </div>
            ) : (
              <>
                <label className="wv-comp-field">
                  <span className="t-label">
                    Sealed bid <span className="text-tertiary">· max ${maxBid}</span>
                  </span>
                  <div className="wv-bid-stepper">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setAmount((a) => clamp(a - 1))}
                      aria-label="Decrease bid"
                    >
                      –
                    </button>
                    <input
                      className="input wv-bid-input mono"
                      type="number"
                      min={0}
                      max={maxBid}
                      value={amount}
                      onChange={(e) => setAmount(clamp(Number(e.target.value) || 0))}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setAmount((a) => clamp(a + 1))}
                      aria-label="Increase bid"
                    >
                      +
                    </button>
                  </div>
                </label>

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

                <div className="wv-comp-rules">
                  <div className="wv-comp-rule">
                    <Sealed />
                    Sealed — rivals never see your bid amount
                  </div>
                  <div className="wv-comp-rule">
                    <Refund />
                    Voided + refunded if his match kicks off before the batch
                  </div>
                </div>

                {errorMessage && <div className="wv-comp-error">{errorMessage}</div>}

                <div className="wv-comp-actions">
                  <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={!valid || submitting}
                    onClick={() =>
                      onSubmit({ addId: selected.id, dropId: squadFull ? dropId : null, amount })
                    }
                  >
                    {submitting ? "Saving…" : editClaim ? "Save claim" : "Queue sealed bid"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
