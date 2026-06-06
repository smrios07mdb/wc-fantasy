"use client";

/**
 * The draft-room CLIENT shell (ARCHITECTURE.md §5). It owns presentation + the two IO touchpoints —
 * the Realtime subscription and the gated pick POST — and nothing else: all draft truth stays
 * server-authoritative. On a broadcast it folds the changed ROW into the snapshot via the pure reducers
 * (`applyDraftRowChange` / `applyPickRowChange`); on a pick it calls the UNCHANGED `POST /api/draft/pick`
 * with the session manager's id and surfaces the typed result. The countdown is rendered locally off
 * `pick_deadline_at`, re-synced on every broadcast — never the client clock (the worker tick enforces it).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SQUAD_SIZE, type Position } from "@app/shared";
import { createClient } from "@/lib/supabase/client";
import type { DraftPlayer, DraftRoomState } from "../../src/draft/types";
import { roundForPick } from "../../src/draft/board";
import {
  applyDraftRowChange,
  applyPickRowChange,
  planDraftBroadcast,
  type PickRowChange,
} from "../../src/draft/reducer";
import { subscribeDraft, type RealtimeClientLike } from "../../src/draft/realtime";
import { submitDraftPick } from "../../src/draft/pickClient";
import { fetchDraftState } from "../../src/draft/stateClient";
import {
  AvailableList,
  Board,
  ClockBar,
  Lobby,
  PresenceRow,
  QueuePanel,
  RosterPanel,
  Summary,
  Ticker,
  Toasts,
  type Toast,
} from "./components";
import { nationName } from "./flags";

/** Safely read the `new` record out of a Supabase postgres_changes payload. */
function newRow(payload: unknown): Record<string, unknown> | null {
  if (payload && typeof payload === "object" && "new" in payload) {
    const n = (payload as { new: unknown }).new;
    if (n && typeof n === "object") return n as Record<string, unknown>;
  }
  return null;
}

function ConnPill({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="pill" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
      <span className="dot" />
      Synced
    </span>
  ) : (
    <span className="pill pill-neutral">
      <span className="dot" />
      Connecting…
    </span>
  );
}

export function DraftRoomClient({ initialState }: { initialState: DraftRoomState }) {
  const [state, setState] = useState<DraftRoomState>(initialState);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(
    () => new Set([initialState.sessionManagerId]),
  );
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [submittingPlayerId, setSubmittingPlayerId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [railTab, setRailTab] = useState<"available" | "queue" | "roster">("available");
  const [showBoardMobile, setShowBoardMobile] = useState(false);
  const toastSeq = useRef(0);
  // Monotonic id for authoritative re-fetches, so a slow earlier response can't overwrite newer state.
  const refetchSeq = useRef(0);

  const draftId = initialState.draftId;
  const sessionManagerId = initialState.sessionManagerId;

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = (toastSeq.current += 1);
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4500);
  }, []);

  // Realtime: subscribe to the authoritative draft + draft_pick changes and presence. The socket MUST
  // carry the user's JWT or RLS silently filters out every postgres_changes frame (draft/draft_pick) —
  // so we (re)subscribe from onAuthStateChange, which fires once the cookie session is hydrated and again
  // on every token refresh, gating on a real token. State stays in Postgres; we re-render from the
  // broadcast row via the pure reducers.
  useEffect(() => {
    const supabase = createClient();
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const resubscribe = (accessToken: string | null) => {
      unsubscribe?.();
      unsubscribe = undefined;
      // Gate on an available session: an anon subscription joins but receives no row-change frames.
      if (cancelled || !accessToken) return;
      unsubscribe = subscribeDraft(
        supabase as unknown as RealtimeClientLike,
        draftId,
        { sessionManagerId },
        {
          onStatus: (status) => setConnected(status === "SUBSCRIBED"),
          onPresence: (ids) => setOnlineIds(new Set([sessionManagerId, ...ids])),
          onDraftChange: (payload) => {
            const plan = planDraftBroadcast(newRow(payload));
            if (plan.kind === "apply") {
              setState((s) => applyDraftRowChange(s, plan.change));
            } else {
              // Partial payload (pointer re-synced but `status` dropped) — re-derive from the
              // authoritative draft row so a lobby client still flips to the live board on start.
              // Only the latest re-fetch may apply: a slow earlier response must not clobber newer state.
              const seq = (refetchSeq.current += 1);
              void fetchDraftState({ fetch: (input, init) => fetch(input, init) }).then((patch) => {
                if (patch && seq === refetchSeq.current) {
                  setState((s) => applyDraftRowChange(s, patch));
                }
              });
            }
          },
          onPickChange: (payload) => {
            const row = newRow(payload);
            if (row) setState((s) => applyPickRowChange(s, row as unknown as PickRowChange));
          },
        },
        accessToken,
      );
    };

    // onAuthStateChange fires INITIAL_SESSION (cookie session hydrated) then TOKEN_REFRESHED/SIGNED_*,
    // so the first subscribe waits for the session and each refresh re-subscribes with the fresh JWT.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      resubscribe(session?.access_token ?? null);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      subscription.unsubscribe();
    };
  }, [draftId, sessionManagerId]);

  const makePick = useCallback(
    async (player: DraftPlayer) => {
      setSubmittingPlayerId(player.id);
      const res = await submitDraftPick(
        { draftId, managerId: sessionManagerId, playerId: player.id },
        { fetch: (input, init) => fetch(input, init) },
      );
      setSubmittingPlayerId(null);
      if (res.ok) {
        // Optimistic: fold my own pick in now (the Realtime echo is idempotent); the pointer + deadline
        // advance arrive on the `draft` row broadcast.
        setState((s) =>
          applyPickRowChange(s, {
            pick_no: res.pick.pickNo,
            manager_id: res.pick.managerId,
            player_id: res.pick.playerId,
            is_auto: res.pick.isAuto,
          }),
        );
        pushToast({
          kind: "success",
          title: `You drafted ${player.displayName}`,
          sub: `${player.position} · ${nationName(player.country)}`,
        });
      } else {
        pushToast({ kind: "warn", title: "Pick not made", sub: res.error.message });
      }
    },
    [draftId, sessionManagerId, pushToast],
  );

  const n = state.managers.length;
  const total = SQUAD_SIZE * n;
  const phaseLine =
    state.status === "pending"
      ? "PRE-DRAFT LOBBY"
      : state.status === "complete"
        ? "DRAFT COMPLETE"
        : state.currentPickNo
          ? `ROUND ${roundForPick(state.currentPickNo, n) + 1} · PICK ${state.currentPickNo} OF ${total}`
          : "DRAFT";

  const live = state.status === "active" || state.status === "paused";
  const mobileTabs = ["board", "available", "queue", "roster"] as const;
  const railTabs = ["available", "queue", "roster"] as const;

  return (
    <div className={"dr" + (showBoardMobile ? " show-board" : "")}>
      <div className="dr-top">
        <div className="dr-brand">
          <div className="dr-logo">W</div>
          <div>
            <div className="display" style={{ fontWeight: 800, fontSize: 15, lineHeight: 1 }}>
              Snake Draft
            </div>
            <div className="t-micro text-tertiary" style={{ letterSpacing: ".08em" }}>
              {phaseLine}
            </div>
          </div>
        </div>
        <ConnPill connected={connected} />
        <div style={{ flex: 1 }} />
        <PresenceRow managers={state.managers} onlineIds={onlineIds} />
      </div>

      {live && <ClockBar state={state} />}
      {state.status === "active" && <Ticker state={state} />}

      {state.status === "pending" && <Lobby state={state} onlineIds={onlineIds} />}
      {state.status === "complete" && <Summary state={state} />}

      {live && (
        <>
          <div className="dr-mtabs">
            {mobileTabs.map((t) => (
              <button
                key={t}
                className={
                  "tab" +
                  ((t === "board" ? showBoardMobile : !showBoardMobile && railTab === t)
                    ? " is-active"
                    : "")
                }
                onClick={() => {
                  if (t === "board") setShowBoardMobile(true);
                  else {
                    setShowBoardMobile(false);
                    setRailTab(t);
                  }
                }}
              >
                {t === "queue"
                  ? `Queue (${state.myQueue.length})`
                  : t[0]!.toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="dr-body">
            <div className="dr-boardwrap">
              <Board state={state} onlineIds={onlineIds} />
            </div>
            <div className="dr-rail">
              <div className="dr-railhead">
                <div className="tabs" style={{ display: "flex", width: "100%" }}>
                  {railTabs.map((t) => (
                    <button
                      key={t}
                      className={"tab" + (railTab === t ? " is-active" : "")}
                      style={{ flex: 1 }}
                      onClick={() => setRailTab(t)}
                    >
                      {t === "available"
                        ? "Available"
                        : t === "queue"
                          ? `Queue (${state.myQueue.length})`
                          : "My roster"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dr-railscroll">
                {railTab === "available" && (
                  <AvailableList
                    state={state}
                    query={query}
                    setQuery={setQuery}
                    position={position}
                    setPosition={setPosition}
                    onDraft={(p) => void makePick(p)}
                    submittingPlayerId={submittingPlayerId}
                  />
                )}
                {railTab === "queue" && <QueuePanel state={state} />}
                {railTab === "roster" && <RosterPanel state={state} />}
              </div>
            </div>
          </div>
        </>
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}
