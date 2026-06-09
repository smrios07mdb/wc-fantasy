"use client";

/**
 * Draft-room presentational components — ported from design/design_reference/draft/app.jsx, wired to the
 * live view model ({@link DraftRoomState} + the pure board/countdown logic) instead of the prototype's
 * mock data. The demo scaffold (sim bar, bot picks, the local mock clock, mock pool generator) is GONE:
 * the countdown is server-derived ({@link useServerCountdown} off `pick_deadline_at`), picks come from
 * the gated route + Realtime, and presence is live. ds.css supplies the tokens + generic classes;
 * draft.css supplies the `.dr-*` layout. These render — they hold no draft truth.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Position } from "@app/shared";
import { SQUAD_COMPOSITION } from "@app/shared";
import type { DraftManager, DraftPlayer, DraftRoomState } from "../../src/draft/types";
import {
  buildBoard,
  filterAvailable,
  isMyTurn as isMyTurnFn,
  onTheClockManager,
  positionCounts,
  rosterFor,
  roundForPick,
  POSITION_FILTERS,
} from "../../src/draft/board";
import { countdownView, type CountdownView } from "../../src/draft/countdown";
import { flagStyle, nationName } from "./flags";
import { reorderQueue } from "../../src/draft/queueReorder";

// ─────────────────────────────────────────── atoms ───────────────────────────────────────────

export function Flag({ nat, lg }: { nat: string | null; lg?: boolean }) {
  return (
    <span
      className={"flag" + (lg ? " flag-lg" : "")}
      style={flagStyle(nat)}
      title={nationName(nat)}
    />
  );
}

export function Pos({ p }: { p: Position }) {
  return <span className={"pos pos-" + p}>{p}</span>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return name.slice(0, 2);
}
function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 42% 46%)`;
}

export function Avatar({
  manager,
  size = "md",
  ring,
  online,
}: {
  manager: DraftManager;
  size?: "sm" | "md" | "lg";
  ring?: boolean;
  online?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${size}${ring ? " presence-ring" : ""}`}
      style={{ background: colorFor(manager.id), color: "#fff" }}
      title={manager.displayName}
    >
      {initials(manager.displayName)}
      {!ring && <span className={"presence-dot" + (online ? " is-online" : "")} />}
    </span>
  );
}

const SearchIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

// ─────────────────────────────────────── countdown hook ──────────────────────────────────────

/**
 * The on-screen clock: PRESENTATION ONLY. It samples a local `now` a few times a second and derives the
 * remaining time from the server `deadlineMs` via the pure {@link countdownView}; when `deadlineMs`
 * changes (a Realtime broadcast re-syncs it), the view re-derives. The deadline truth + its enforcement
 * are server-side (the worker tick), NEVER this clock (ARCHITECTURE.md §5).
 */
export function useServerCountdown(deadlineMs: number | null): CountdownView {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadlineMs === null) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [deadlineMs]);
  return countdownView(deadlineMs, now);
}

// ───────────────────────────────────────── clock bar ─────────────────────────────────────────

export function ClockBar({ state }: { state: DraftRoomState }) {
  const deadlineMs =
    state.timerEnabled && state.pickDeadlineAt ? new Date(state.pickDeadlineAt).getTime() : null;
  const cd = useServerCountdown(deadlineMs);
  const mine = isMyTurnFn(state);
  const manager = onTheClockManager(state);
  if (state.status === "complete" || state.currentPickNo === null || !manager) return null;

  const round = roundForPick(state.currentPickNo, state.managers.length);
  const clockColor = cd.isUrgent ? "var(--live)" : mine ? "var(--accent)" : "var(--text-primary)";

  return (
    <div
      className={
        "dr-clockbar" +
        (mine ? " is-mine" : "") +
        (state.timerEnabled && cd.isUrgent ? " is-urgent" : "")
      }
    >
      <div className="dr-onclock">
        <Avatar manager={manager} size="md" ring={mine} online />
        <div>
          <div className="t-h3" style={{ fontWeight: 700 }}>
            {mine ? "You're on the clock" : `${manager.displayName} is on the clock`}
          </div>
          <div className="t-caption text-tertiary">
            Pick {state.currentPickNo} · Round {round + 1} ·{" "}
            {round % 2 === 0 ? "→ forward" : "← snake back"}
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      {state.timerEnabled ? (
        <>
          <div
            className="dr-clk"
            style={{ color: clockColor }}
            aria-label={`${cd.label} remaining`}
          >
            {cd.label}
          </div>
          <ServerTimeNote />
        </>
      ) : (
        <div className="dr-no-clock">No clock</div>
      )}
    </div>
  );
}

function ServerTimeNote() {
  return (
    <span
      className="t-micro text-tertiary"
      style={{ display: "flex", alignItems: "center", gap: 5 }}
      title="The deadline is server-authoritative — the worker enforces it"
    >
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
      </svg>
      server time
    </span>
  );
}

// ───────────────────────────────────────── recent ticker ─────────────────────────────────────

export function Ticker({ state }: { state: DraftRoomState }) {
  const n = state.managers.length;
  const mgr = (id: string) => state.managers.find((m) => m.id === id);
  const recent = [...state.picks].sort((a, b) => b.pickNo - a.pickNo).slice(0, 12);
  if (recent.length === 0) {
    return (
      <div className="dr-ticker">
        <span className="t-caption text-tertiary">
          No picks yet — waiting for the first selection…
        </span>
      </div>
    );
  }
  return (
    <div className="dr-ticker">
      <span className="t-label" style={{ alignSelf: "center", marginRight: 4 }}>
        Recent
      </span>
      {recent.map((p) => {
        const m = mgr(p.managerId);
        const round = roundForPick(p.pickNo, n);
        return (
          <div className="dr-tick" key={p.pickNo}>
            <span className="mono t-micro text-tertiary">
              {round + 1}.{((p.pickNo - 1) % n) + 1}
            </span>
            {p.player && <Flag nat={p.player.country} />}
            {p.player && <Pos p={p.player.position} />}
            <b className="t-sm">{p.player?.lastName ?? p.player?.displayName ?? "—"}</b>
            <span className="t-caption text-tertiary">
              → {m?.displayName ?? "?"}
              {p.isAuto && " (auto)"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────── board ─────────────────────────────────────────

export function Board({ state, onlineIds }: { state: DraftRoomState; onlineIds: Set<string> }) {
  const board = buildBoard(state);
  const n = state.managers.length;
  const cols = `60px repeat(${n}, minmax(108px,1fr))`;
  return (
    <div className="dr-board" style={{ gridTemplateColumns: cols, minWidth: 60 + n * 110 }}>
      <div />
      {state.managers.map((m) => (
        <div
          key={m.id}
          className={
            "dr-colhead" +
            (m.id === state.currentManagerId ? " is-current" : "") +
            (m.isMe ? " is-me" : "")
          }
        >
          <Avatar manager={m} size="sm" online={onlineIds.has(m.id)} />
          <span className="t-micro" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
            {m.isMe ? "You" : m.displayName}
          </span>
        </div>
      ))}
      {board.rows.map((row) => (
        <BoardRow key={row.round} row={row} />
      ))}
    </div>
  );
}

function BoardRow({ row }: { row: ReturnType<typeof buildBoard>["rows"][number] }) {
  return (
    <>
      <div className="dr-rlabel">
        <div style={{ textAlign: "right" }}>
          R{row.round + 1}
          <div className="dr-snake">{row.direction === "forward" ? "→" : "←"}</div>
        </div>
      </div>
      {row.cells.map((cell) => {
        const pick = cell.pick;
        return (
          <div
            key={cell.col}
            className={
              "dr-cell" +
              (pick?.player ? " tint-" + pick.player.position : pick ? "" : " is-empty") +
              (cell.isCurrent ? " is-current" : "")
            }
          >
            {pick && pick.player ? (
              <>
                <div className="cell-top">
                  <Pos p={pick.player.position} />
                  <Flag nat={pick.player.country} />
                  <span className="pk">{cell.pickNo}</span>
                </div>
                <b className="cell-name">
                  {pick.player.firstName ? pick.player.firstName[0] + ". " : ""}
                  {pick.player.lastName ?? pick.player.displayName}
                </b>
              </>
            ) : (
              <>
                <div className="cell-top">
                  <span className="pk" style={{ marginLeft: 0 }}>
                    {cell.pickNo}
                  </span>
                </div>
                {cell.isCurrent ? (
                  <b className="cell-name" style={{ color: "var(--accent)" }}>
                    On the clock…
                  </b>
                ) : (
                  <span className="t-caption text-tertiary">—</span>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

// ───────────────────────────────────────────── rail ──────────────────────────────────────────

export function AvailableList({
  state,
  query,
  setQuery,
  position,
  setPosition,
  nation,
  setNation,
  onDraft,
  submittingPlayerId,
  onQueueToggle,
  submittingQueue,
}: {
  state: DraftRoomState;
  query: string;
  setQuery: (q: string) => void;
  position: Position | "ALL";
  setPosition: (p: Position | "ALL") => void;
  nation: string | "ALL";
  setNation: (n: string | "ALL") => void;
  onDraft: (player: DraftPlayer) => void;
  submittingPlayerId: string | null;
  onQueueToggle: (playerId: string) => void;
  submittingQueue: boolean;
}) {
  const mine = isMyTurnFn(state);
  const nations = useMemo(
    () =>
      [
        ...new Set(
          state.availablePlayers.map((p) => p.country).filter((c): c is string => c !== null),
        ),
      ].sort((a, b) => nationName(a).localeCompare(nationName(b))),
    [state.availablePlayers],
  );
  const filtered = useMemo(
    () => filterAvailable(state.availablePlayers, { query, position, nation }).slice(0, 80),
    [state.availablePlayers, query, position, nation],
  );
  return (
    <>
      <div className="dr-search">
        <SearchIco />
        <input
          className="input"
          placeholder="Search players or nations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="dr-filters">
        {POSITION_FILTERS.map((f) => (
          <span
            key={f}
            className={"chip" + (position === f ? " is-active" : "")}
            onClick={() => setPosition(f)}
          >
            {f === "ALL" ? "All" : f}
          </span>
        ))}
      </div>
      {nations.length > 0 && (
        <div className="dr-filters">
          <span
            className={"chip" + (nation === "ALL" ? " is-active" : "")}
            onClick={() => setNation("ALL")}
          >
            All
          </span>
          {nations.map((code) => (
            <span
              key={code}
              className={"chip" + (nation === code ? " is-active" : "")}
              onClick={() => setNation(code)}
            >
              {nationName(code)}
            </span>
          ))}
        </div>
      )}
      <div
        className="t-micro text-tertiary"
        style={{ margin: "4px 2px 8px", letterSpacing: ".04em" }}
      >
        BEST AVAILABLE · {filtered.length} shown
      </div>
      {filtered.length === 0 && <Empty label={`No players match “${query || position}”`} />}
      {filtered.map((p, i) => {
        const submitting = submittingPlayerId === p.id;
        const queued = state.myQueue.includes(p.id);
        return (
          <div className="dr-prow" key={p.id}>
            <span className="mono t-micro text-tertiary" style={{ width: 18 }}>
              {i + 1}
            </span>
            <Flag nat={p.country} />
            <Pos p={p.position} />
            <div className="nm">
              <b>{p.displayName}</b>
              <span className="t-caption text-tertiary">{nationName(p.country)}</span>
            </div>
            <button
              className="btn-quiet btn-sm"
              style={{ minHeight: 30, padding: "4px 8px" }}
              disabled={submittingQueue || state.status === "complete"}
              onClick={() => onQueueToggle(p.id)}
            >
              {queued ? "✓" : "＋"}
            </button>
            <button
              className={"btn btn-sm " + (mine && !submitting ? "btn-primary" : "is-disabled")}
              style={{ minHeight: 30, padding: "4px 10px", color: "var(--text-on-accent)" }}
              disabled={!mine || submitting}
              onClick={() => onDraft(p)}
            >
              {submitting ? "…" : "Draft"}
            </button>
          </div>
        );
      })}
    </>
  );
}

export function QueuePanel({
  state,
  onDraft,
  submittingPlayerId,
  onQueueRemove,
  onQueueReorder,
  submittingQueue,
}: {
  state: DraftRoomState;
  onDraft: (player: DraftPlayer) => void;
  submittingPlayerId: string | null;
  onQueueRemove: (playerId: string) => void;
  onQueueReorder: (playerIds: string[]) => void;
  submittingQueue: boolean;
}) {
  const mine = isMyTurnFn(state);
  const byId = new Map(state.availablePlayers.map((p) => [p.id, p]));
  const items = state.myQueue.map((id) => byId.get(id)).filter((p): p is DraftPlayer => Boolean(p));
  const takenCount = state.myQueue.length - items.length;
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  return (
    <>
      <div className="alert alert-info" style={{ marginBottom: 12 }}>
        <div>
          <b>Autopick source.</b> If your clock expires, we draft the top still-available queued
          player that fills a need — then fall back to best available.
        </div>
      </div>
      {items.length === 0 && <Empty label="Your queue is empty." />}
      {items.map((p, i) => {
        const submitting = submittingPlayerId === p.id;
        return (
          <div
            className="dr-qitem"
            key={p.id}
            draggable={!submittingQueue}
            style={dragOverIndex === i ? { opacity: 0.4 } : undefined}
            onDragStart={
              submittingQueue
                ? undefined
                : () => {
                    dragIndex.current = i;
                  }
            }
            onDragOver={
              submittingQueue
                ? undefined
                : (e) => {
                    e.preventDefault();
                    setDragOverIndex(i);
                  }
            }
            onDragLeave={submittingQueue ? undefined : () => setDragOverIndex(null)}
            onDrop={
              submittingQueue
                ? undefined
                : (e) => {
                    e.preventDefault();
                    setDragOverIndex(null);
                    const from = dragIndex.current;
                    if (from === null || from === i) return;
                    onQueueReorder(
                      reorderQueue(
                        items.map((x) => x.id),
                        from,
                        i,
                      ),
                    );
                    dragIndex.current = null;
                  }
            }
            onDragEnd={() => {
              dragIndex.current = null;
              setDragOverIndex(null);
            }}
          >
            <span className="mono t-micro text-tertiary" style={{ width: 16 }}>
              {i + 1}
            </span>
            <Flag nat={p.country} />
            <Pos p={p.position} />
            <div className="nm" style={{ flex: 1 }}>
              <b className="t-sm">{p.lastName ?? p.displayName}</b>{" "}
              <span className="t-caption text-tertiary">{nationName(p.country)}</span>
            </div>
            <button
              className="btn-quiet btn-sm"
              disabled={submittingQueue || i === 0}
              onClick={() =>
                onQueueReorder(
                  reorderQueue(
                    items.map((x) => x.id),
                    i,
                    i - 1,
                  ),
                )
              }
            >
              ↑
            </button>
            <button
              className="btn-quiet btn-sm"
              disabled={submittingQueue || i === items.length - 1}
              onClick={() =>
                onQueueReorder(
                  reorderQueue(
                    items.map((x) => x.id),
                    i,
                    i + 1,
                  ),
                )
              }
            >
              ↓
            </button>
            <button
              className="btn-quiet btn-sm"
              disabled={submittingQueue}
              onClick={() => onQueueRemove(p.id)}
            >
              ✕
            </button>
            <button
              className={"btn btn-sm " + (mine && !submitting ? "btn-primary" : "is-disabled")}
              style={{ minHeight: 30, padding: "4px 10px", color: "var(--text-on-accent)" }}
              disabled={!mine || submitting}
              onClick={() => onDraft(p)}
            >
              {submitting ? "…" : "Draft"}
            </button>
          </div>
        );
      })}
      {takenCount > 0 && (
        <div className="t-caption text-tertiary" style={{ marginTop: 8 }}>
          {takenCount} queued player(s) already drafted — auto-skipped.
        </div>
      )}
    </>
  );
}

export function RosterPanel({ state }: { state: DraftRoomState }) {
  const mine = rosterFor(state, state.sessionManagerId);
  const counts = positionCounts(mine);
  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  return (
    <>
      <div className="dr-needbar" style={{ marginBottom: 14 }}>
        {positions.map((pp) => {
          const done = counts[pp] >= SQUAD_COMPOSITION[pp];
          return (
            <div key={pp} className={"dr-need" + (done ? " done" : "")}>
              <Pos p={pp} />
              <div className="num" style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>
                {counts[pp]}
                <span className="text-tertiary" style={{ fontSize: 12 }}>
                  /{SQUAD_COMPOSITION[pp]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="t-micro text-tertiary" style={{ margin: "2px 2px 8px" }}>
        {mine.length}/15 ROSTERED
      </div>
      {mine.length === 0 && <Empty label="No picks yet. Your squad builds here as you draft." />}
      {positions.map(
        (pp) =>
          mine.filter((p) => p.player?.position === pp).length > 0 && (
            <div key={pp} style={{ marginBottom: 10 }}>
              {mine
                .filter((p) => p.player?.position === pp)
                .map((p) => (
                  <div className="pcard" key={p.pickNo} style={{ marginBottom: 6 }}>
                    <Flag nat={p.player?.country ?? null} />
                    <Pos p={pp} />
                    <div className="stack" style={{ flex: 1 }}>
                      <b className="t-sm">{p.player?.displayName}</b>
                      <span className="t-caption text-tertiary">
                        Pick {p.pickNo}
                        {p.isAuto && " · auto"}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          ),
      )}
    </>
  );
}

export function Empty({ label }: { label: string }) {
  return (
    <div className="card-2" style={{ padding: "22px 16px", textAlign: "center" }}>
      <div className="t-sm" style={{ fontWeight: 600 }}>
        {label}
      </div>
    </div>
  );
}

// ──────────────────────────────────────── lobby + summary ────────────────────────────────────

function StartDraftButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/start", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as Record<string, string>).error ?? `Error ${res.status}`);
      }
      // On success: Realtime delivers the status change; no client action needed.
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button className="btn btn-primary" onClick={handleStart} disabled={loading}>
        {loading ? "Starting…" : "Start draft"}
      </button>
      {error && (
        <p className="t-sm" style={{ color: "var(--error)", marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Lobby({ state, onlineIds }: { state: DraftRoomState; onlineIds: Set<string> }) {
  const ready = state.managers.filter((m) => onlineIds.has(m.id)).length;
  return (
    <div className="dr-center">
      <div className="lobby card" style={{ padding: 24 }}>
        <div className="between" style={{ marginBottom: 6 }}>
          <h2 className="t-h2">Pre-draft lobby</h2>
          <span
            className="pill"
            style={{ background: "var(--success-soft)", color: "var(--success)" }}
          >
            <span className="dot" />
            {ready}/{state.managers.length} online
          </span>
        </div>
        <p className="text-secondary t-sm" style={{ marginTop: 0 }}>
          Snake order is locked. {state.managers.length} managers · {state.draftPickSeconds}s per
          pick · server-authoritative clock. The draft will begin when the commissioner starts it.
        </p>
        <div className="t-label" style={{ marginBottom: 8 }}>
          Draft order
        </div>
        <div className="lobby-order">
          {state.managers.map((m, i) => (
            <div
              className="lobby-orow"
              key={m.id}
              style={
                m.isMe ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : {}
              }
            >
              <span className="mono t-sm text-tertiary" style={{ width: 20 }}>
                {i + 1}
              </span>
              <Avatar manager={m} size="sm" online={onlineIds.has(m.id)} />
              <b className="t-sm" style={{ flex: 1 }}>
                {m.displayName}
                {m.isMe && <span className="t-micro text-tertiary"> (you)</span>}
              </b>
              <span className={"pill " + (onlineIds.has(m.id) ? "pill-win" : "pill-neutral")}>
                {onlineIds.has(m.id) ? "Online" : "Away"}
              </span>
            </div>
          ))}
        </div>
        {state.sessionManagerIsCommissioner && <StartDraftButton />}
      </div>
    </div>
  );
}

export function Summary({ state }: { state: DraftRoomState }) {
  const mine = rosterFor(state, state.sessionManagerId);
  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  return (
    <div className="dr-center">
      <div className="summary">
        <div className="between" style={{ marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="t-label">Draft complete</div>
            <h2 className="t-display-l">Your squad is set.</h2>
          </div>
        </div>
        <div className="sum-grid">
          {positions.map((pp) => (
            <div className="sum-col" key={pp}>
              <h4 className="t-h3">
                <Pos p={pp} />{" "}
                <span className="text-tertiary t-sm">
                  {mine.filter((p) => p.player?.position === pp).length}/{SQUAD_COMPOSITION[pp]}
                </span>
              </h4>
              {mine
                .filter((p) => p.player?.position === pp)
                .map((p) => (
                  <div className="pcard" key={p.pickNo} style={{ marginBottom: 6 }}>
                    <Flag nat={p.player?.country ?? null} />
                    <div className="stack" style={{ flex: 1, minWidth: 0 }}>
                      <b
                        className="t-caption"
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.player?.displayName}
                      </b>
                      <span className="t-micro text-tertiary">Pick {p.pickNo}</span>
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
        <p className="t-caption text-tertiary" style={{ marginTop: 16 }}>
          Next: set your lineup — lock-on-play means a benched 0-minute starter stays swappable
          until he plays.
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────── presence + toasts ────────────────────────────────

export function PresenceRow({
  managers,
  onlineIds,
}: {
  managers: DraftManager[];
  onlineIds: Set<string>;
}) {
  const online = managers.filter((m) => onlineIds.has(m.id));
  return (
    <div className="dr-presence" title="Online managers">
      {online.slice(0, 8).map((m) => (
        <Avatar key={m.id} manager={m} size="sm" online />
      ))}
      <span className="t-caption text-tertiary" style={{ marginLeft: 10 }}>
        {online.length}/{managers.length} online
      </span>
    </div>
  );
}

export interface Toast {
  id: number;
  kind: "success" | "warn" | "info";
  title: string;
  sub?: string;
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="dr-toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            "toast toast-" +
            (t.kind === "warn" ? "warn" : t.kind === "success" ? "success" : "info")
          }
        >
          <span className="ic">{t.kind === "success" ? "✓" : t.kind === "warn" ? "⏱" : "•"}</span>
          <div>
            <b className="t-sm">{t.title}</b>
            {t.sub && <div className="t-caption text-tertiary">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
