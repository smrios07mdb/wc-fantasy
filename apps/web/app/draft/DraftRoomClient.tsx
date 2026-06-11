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
  type DraftRowChange,
  type PickRowChange,
} from "../../src/draft/reducer";
import {
  subscribeDraft,
  POLLING_FALLBACK_MS,
  type RealtimeClientLike,
} from "../../src/draft/realtime";
import { submitDraftPick } from "../../src/draft/pickClient";
import { fetchDraftState } from "../../src/draft/stateClient";
import { handleResume, startPolling } from "../../src/draft/resilience";
import {
  AvailableList,
  Board,
  ClockBar,
  Lobby,
  PresenceRow,
  QueuePanel,
  RosterPanel,
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
  const [submittingQueue, setSubmittingQueue] = useState(false);
  const [toggling, setToggling] = useState(false);
  // Tracks the last successfully saved queue for optimistic-revert on POST failure.
  const lastSavedQueueRef = useRef<string[]>(initialState.myQueue);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [nation, setNation] = useState<string | "ALL">("ALL");
  const [railTab, setRailTab] = useState<"available" | "queue" | "roster">("available");
  const [showBoardMobile, setShowBoardMobile] = useState(false);
  const toastSeq = useRef(0);
  // Monotonic id for authoritative re-fetches, so a slow earlier response can't overwrite newer state.
  const refetchSeq = useRef(0);
  // Latest access token — kept current by resubscribe so resume handlers can re-subscribe without
  // reading stale closure state. (onAuthStateChange closure would be stale inside event listeners.)
  const currentTokenRef = useRef<string | null>(null);
  // Mirrors the Realtime channel's SUBSCRIBED state in a ref (React state is stale inside event handlers).
  const connectedRef = useRef(false);

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
      // Mirror the latest token so resume event handlers can re-subscribe without stale closure state.
      currentTokenRef.current = accessToken;
      connectedRef.current = false;
      unsubscribe?.();
      unsubscribe = undefined;
      // Gate on an available session: an anon subscription joins but receives no row-change frames.
      if (cancelled || !accessToken) return;
      unsubscribe = subscribeDraft(
        supabase as unknown as RealtimeClientLike,
        draftId,
        { sessionManagerId },
        {
          onStatus: (status) => {
            connectedRef.current = status === "SUBSCRIBED";
            setConnected(status === "SUBSCRIBED");
          },
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
    // H2 (token expiry) is handled here: TOKEN_REFRESHED triggers resubscribe → subscribeDraft →
    // setAuth(newToken) before the channel re-joins, so RLS never sees a stale/expired JWT.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      resubscribe(session?.access_token ?? null);
    });

    // H1 (backgrounding) + §5 (polling backstop): event listeners + interval that self-heal the board
    // without a manual re-entry. The deps object uses closures that always read the latest ref values.
    const fetchStateFn = (): Promise<DraftRowChange | null> =>
      fetchDraftState({ fetch: (input, init) => fetch(input, init) });
    const applyPatchFn = (patch: DraftRowChange) => setState((s) => applyDraftRowChange(s, patch));

    const resumeDeps = {
      isHidden: () => document.hidden,
      isConnected: () => connectedRef.current,
      resubscribe: () => resubscribe(currentTokenRef.current),
      fetchState: fetchStateFn,
      applyPatch: applyPatchFn,
    };

    const onVisible = () => void handleResume(resumeDeps);
    const onOnline = () => void handleResume(resumeDeps);
    const onPageShow = (e: Event) => {
      if ((e as PageTransitionEvent).persisted) void handleResume(resumeDeps);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);

    const stopPolling = startPolling({
      isHidden: () => document.hidden,
      fetchState: fetchStateFn,
      applyPatch: applyPatchFn,
      pollingMs: POLLING_FALLBACK_MS,
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      stopPolling();
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

  const handleTimerToggle = useCallback(
    async (enabled: boolean) => {
      setToggling(true);
      setState((s) => ({ ...s, timerEnabled: enabled }));
      try {
        const res = await fetch("/api/draft/timer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) {
          setState((s) => ({ ...s, timerEnabled: !enabled }));
          pushToast({
            kind: "warn",
            title: "Toggle failed",
            sub: "Could not update timer setting",
          });
        }
        // Success: Realtime broadcast confirms the DB change shortly after.
      } catch {
        setState((s) => ({ ...s, timerEnabled: !enabled }));
        pushToast({ kind: "warn", title: "Toggle failed", sub: "Network error" });
      } finally {
        setToggling(false);
      }
    },
    [pushToast],
  );

  const submitQueue = useCallback(
    async (playerIds: string[]) => {
      const prev = lastSavedQueueRef.current;
      setState((s) => ({ ...s, myQueue: playerIds }));
      setSubmittingQueue(true);
      try {
        const res = await fetch("/api/draft/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerIds }),
        });
        if (res.ok) {
          lastSavedQueueRef.current = playerIds;
        } else {
          const b = (await res.json().catch(() => ({}))) as Record<string, string>;
          setState((s) => ({ ...s, myQueue: prev }));
          pushToast({
            kind: "warn",
            title: "Queue not saved",
            sub: b.error ?? `Error ${res.status}`,
          });
        }
      } catch {
        setState((s) => ({ ...s, myQueue: prev }));
        pushToast({ kind: "warn", title: "Queue not saved", sub: "Network error" });
      } finally {
        setSubmittingQueue(false);
      }
    },
    [pushToast],
  );

  const onQueueToggle = useCallback(
    (playerId: string) => {
      const current = state.myQueue;
      const next = current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId];
      void submitQueue(next);
    },
    [state.myQueue, submitQueue],
  );

  const onQueueRemove = useCallback(
    (playerId: string) => {
      void submitQueue(state.myQueue.filter((id) => id !== playerId));
    },
    [state.myQueue, submitQueue],
  );

  const onQueueReorder = useCallback(
    (playerIds: string[]) => {
      void submitQueue(playerIds);
    },
    [submitQueue],
  );

  const handleClockUpdate = useCallback(async (seconds: number) => {
    const res = await fetch("/api/draft/clock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as Record<string, string>;
      throw new Error(b.error ?? `Error ${res.status}`);
    }
    setState((s) => ({ ...s, draftPickSeconds: seconds }));
    // If timer is enabled, the draft row deadline update broadcasts via Realtime automatically.
  }, []);

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
  const complete = state.status === "complete";
  const mobileTabs = ["board", "available", "queue", "roster"] as const;
  const completeTabs = ["board", "squad"] as const;
  const railTabs = ["available", "queue", "roster"] as const;

  return (
    <div className={"dr" + (showBoardMobile ? " show-board" : "")}>
      {/* De-branded draft STATUS strip. The brand lockup (trophy · "XI" · league name) now lives ONCE in
          the AppShell topbar (Prompt 20 / BRAND.md §5), so the body's former "W" logo square + "Snake
          Draft" wordmark were removed here to stop doubling it. This strip keeps only the draft-LOCAL
          context: the phase line, the connection pill, and presence ("who's online"). */}
      <div className="dr-top">
        <div className="dr-status">
          {/* TODO(confirm): the de-branded strip label. The design's `.dr-top` carried the brand the
              shell now owns; "Snake draft" is a restrained screen-context label, not a second brand mark. */}
          <b className="t-sm">Snake draft</b>
          <span className="t-micro text-tertiary" style={{ letterSpacing: ".08em" }}>
            {phaseLine}
          </span>
        </div>
        <ConnPill connected={connected} />
        {state.sessionManagerIsCommissioner && state.status === "active" && (
          <>
            <button
              className="btn-secondary btn-sm"
              onClick={() => void handleTimerToggle(!state.timerEnabled)}
              disabled={toggling}
            >
              {state.timerEnabled ? "Disable clock" : "Enable clock"}
            </button>
            <ForcePickButton />
          </>
        )}
        {state.sessionManagerIsCommissioner && (
          <ClockEditor currentSeconds={state.draftPickSeconds} onUpdate={handleClockUpdate} />
        )}
        <div style={{ flex: 1 }} />
        <PresenceRow managers={state.managers} onlineIds={onlineIds} />
      </div>

      {live && <ClockBar state={state} />}
      {state.status === "active" && <Ticker state={state} />}

      {state.status === "pending" && <Lobby state={state} onlineIds={onlineIds} />}

      {complete && (
        <>
          <div className="dr-mtabs">
            {completeTabs.map((t) => (
              <button
                key={t}
                className={"tab" + ((t === "board") === showBoardMobile ? " is-active" : "")}
                onClick={() => setShowBoardMobile(t === "board")}
              >
                {t === "board" ? "Board" : "Your squad"}
              </button>
            ))}
          </div>
          <div className="dr-body">
            <div className="dr-boardwrap">
              <Board state={state} onlineIds={onlineIds} />
            </div>
            <div className="dr-rail">
              <div className="dr-railhead">
                <div className="t-label" style={{ padding: "2px 0" }}>
                  Your squad
                </div>
              </div>
              <div className="dr-railscroll">
                <RosterPanel state={state} />
              </div>
            </div>
          </div>
        </>
      )}

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
                    nation={nation}
                    setNation={setNation}
                    onDraft={(p) => void makePick(p)}
                    submittingPlayerId={submittingPlayerId}
                    onQueueToggle={onQueueToggle}
                    submittingQueue={submittingQueue}
                  />
                )}
                {railTab === "queue" && (
                  <QueuePanel
                    state={state}
                    onDraft={(p) => void makePick(p)}
                    submittingPlayerId={submittingPlayerId}
                    onQueueRemove={onQueueRemove}
                    onQueueReorder={onQueueReorder}
                    submittingQueue={submittingQueue}
                  />
                )}
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

// ─────────────────────────────── commissioner controls ───────────────────────────────

function ForcePickButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleForce() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/force-pick", { method: "POST" });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as Record<string, string>;
        setError(b.error ?? `Error ${res.status}`);
      }
      // On success: Realtime delivers the pick + pointer advance to all clients.
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        className="btn-secondary btn-sm"
        onClick={() => void handleForce()}
        disabled={loading}
      >
        {loading ? "Forcing…" : "Force pick"}
      </button>
      {error && (
        <p className="t-sm" style={{ color: "var(--error)", marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ClockEditor({
  currentSeconds,
  onUpdate,
}: {
  currentSeconds: number;
  onUpdate: (seconds: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(currentSeconds));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const seconds = parseInt(value, 10);
    if (!Number.isInteger(seconds) || seconds < 15 || seconds > 600) {
      setError("Enter a value between 15 and 600 seconds.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onUpdate(seconds);
    } catch {
      setError("Failed to update clock.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min={15}
        max={600}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          fontSize: 13,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          width: 64,
        }}
        aria-label="Pick clock seconds"
      />
      <span className="t-caption text-secondary">s</span>
      <button
        className="btn-secondary btn-sm"
        onClick={() => void handleSubmit()}
        disabled={loading}
      >
        {loading ? "Saving…" : "Set clock"}
      </button>
      {error && (
        <span className="t-caption" style={{ color: "var(--error)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
