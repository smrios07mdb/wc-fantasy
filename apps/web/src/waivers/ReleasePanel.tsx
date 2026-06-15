"use client";
/**
 * The playoff trim-down release panel (DECISIONS §D trim-down). A survivor who advanced with a 15-man
 * group squad is capped at the playoff cap (9) the instant the league flips to `playoff`, but every FAAB
 * path forces a net-zero swap — so this is the only way DOWN: select players and drop them outright.
 *
 * It is MOUNTED by `WaiversClient` only when `isPlayoffPhase && isParticipant && roster.length > rosterCap`.
 * It owns ONLY the local selection + the unfillable confirm; the parent owns the `/api/faab/release` fetch.
 * Both deadlines are STATIC timestamps (no countdown / timer): the forfeit bound is the league-wide R32
 * first kickoff (conservative), the reinforcement line reuses the next-batch window. The hard 7-floor and
 * the unfillable-7..cap confirm reuse the SAME `canFieldPlayoffXI` the server's `validateRelease` runs.
 */
import { useMemo, useState } from "react";
import { canFieldPlayoffXI } from "@app/lineup";
import { PLAYOFF_ROSTER, formatInLeagueTz, type Position } from "@app/shared";
import type { WvBatchWindow, WvPlayer } from "./types";
import { droppableRoster } from "./waiversLogic";
import { KitChip, NationFlag, Pos } from "./components";

export interface ReleasePanelProps {
  roster: readonly WvPlayer[];
  lockedPlayerIds: readonly string[];
  rosterCap: number;
  /** ISO of the league-wide R32 first kickoff (the conservative forfeit bound), or null. Static display. */
  forfeitDeadlineIso: string | null;
  /** The next-batch window (the reinforcement line) — reused as a static timestamp. */
  batchWindow: WvBatchWindow | null;
  timezone: string;
  submitting: boolean;
  errorMessage: string | null;
  onRelease: (dropIds: string[], confirmedUnfillable: boolean) => void;
  onOpen?: (player: WvPlayer) => void;
}

export function ReleasePanel({
  roster,
  lockedPlayerIds,
  rosterCap,
  forfeitDeadlineIso,
  batchWindow,
  timezone,
  submitting,
  errorMessage,
  onRelease,
}: ReleasePanelProps) {
  const floor = PLAYOFF_ROSTER.starters; // 7
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmUnfillable, setConfirmUnfillable] = useState(false);

  const droppable = useMemo(
    () => droppableRoster(roster, lockedPlayerIds),
    [roster, lockedPlayerIds],
  );

  const postCount = roster.length - selected.size;
  const postCounts = useMemo(() => {
    const c: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of roster) if (!selected.has(p.id)) c[p.position] += 1;
    return c;
  }, [roster, selected]);

  const belowFloor = selected.size > 0 && postCount < floor;
  const inBand = postCount >= floor && postCount <= rosterCap;
  const unfillable = inBand && !canFieldPlayoffXI(postCounts);
  const canRelease =
    selected.size > 0 && !belowFloor && (!unfillable || confirmUnfillable) && !submitting;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmUnfillable(false); // a changed selection must be re-confirmed
  }

  const fmt = (iso: string | null) => (iso ? formatInLeagueTz(new Date(iso), timezone) : "TBD");

  return (
    <section className="wv-rel" aria-label="Trim your roster to the playoff cap">
      <header className="wv-rel-head">
        <div className="wv-rel-title">
          <b>Trim your squad</b>
          <span className="t-micro text-tertiary">
            Playoff squads carry at most {rosterCap}. Drop players to get under the cap.
          </span>
        </div>
        <span className="wv-rel-count mono is-over">
          {roster.length}/{rosterCap}
        </span>
      </header>

      <div className="wv-rel-deadlines t-micro text-tertiary">
        {/* The league-wide R32 first kickoff is an intentional CONSERVATIVE bound (the earliest possible
            per-player lock; a survivor's own earliest kickoff may be later). */}
        <span>
          Release a played starter before <b>{fmt(forfeitDeadlineIso)}</b> to avoid forfeiting his
          points.
        </span>
        {batchWindow && (
          <span>
            Reinforce at the next batch · <b>{batchWindow.value}</b>
          </span>
        )}
      </div>

      <div className="wv-rel-list" role="group" aria-label="Players to release">
        {droppable.map((p) => {
          const on = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={"wv-rel-row" + (on ? " is-sel" : "")}
              onClick={() => toggle(p.id)}
              aria-pressed={on}
            >
              <span className="wv-rel-check" aria-hidden="true">
                {on ? "✓" : ""}
              </span>
              <KitChip player={p} sm />
              <NationFlag nation={p.nation} />
              <div className="wv-rel-id">
                <b className="wv-name">{p.shortName}</b>
                <span className="t-micro text-tertiary">
                  {p.teamName ?? p.nation ?? ""} ·{" "}
                  {p.seasonPoints === null ? "—" : `${p.seasonPoints} pts`}
                </span>
              </div>
              <Pos p={p.position} />
            </button>
          );
        })}
      </div>

      {belowFloor && (
        <div className="wv-rel-warn is-block" role="alert">
          That leaves {postCount} — below the {floor}-player minimum. Keep at least {floor}.
        </div>
      )}

      {unfillable && !belowFloor && (
        <label className="wv-rel-confirm">
          <input
            type="checkbox"
            checked={confirmUnfillable}
            onChange={(e) => setConfirmUnfillable(e.target.checked)}
          />
          <span>
            The remaining {postCount} can&rsquo;t field a legal playoff XI — release anyway.
          </span>
        </label>
      )}

      {errorMessage && (
        <div className="wv-rel-warn is-block" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="wv-rel-foot">
        <span className="t-micro text-tertiary">
          {selected.size} selected · {postCount} after
        </span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!canRelease}
          onClick={() => onRelease([...selected], unfillable && confirmUnfillable)}
        >
          Release{selected.size > 0 ? ` ${selected.size}` : ""}
        </button>
      </div>
    </section>
  );
}
