import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the Prompt-22 /draft re-skin. The repo's Vitest run has no DOM/JSX
// transform (by design — see components/Brand.test.ts + the landing/shell smokes), so we verify the
// re-skin's load-bearing CONTRACTS from source rather than mounting. Component compilation is covered by
// `tsc --noEmit` + `next build`; visual fidelity is confirmed on the live deploy. The behaviours the
// re-skin must PRESERVE are already unit-tested at the right altitude — board.test.ts (isMyTurn / buildBoard
// / filters / counts), countdown.test.ts (server-derived clock), reducer.test.ts (lobby→active flip),
// handlePick.test.ts + pickClient.test.ts (typed DraftError). Here we guard that the *visual* re-skin
// de-duplicated the brand, kept the view-state branch + every active-board region wired, and didn't touch
// the make-pick gate, the server-synced countdown source, the typed-error surface, the gold-free palette,
// or the dynamic (ƒ) shape.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const client = read("draft/DraftRoomClient.tsx");
const components = read("draft/components.tsx");
const css = read("draft/draft.css");
const layout = read("draft/layout.tsx");
const page = read("draft/page.tsx");

describe("draft re-skin — the body brand lockup is de-duplicated (the shell owns the brand)", () => {
  it("drops the body `.dr-logo` 'W' square + `.dr-brand` wordmark — no second brand mark", () => {
    expect(client).not.toContain('className="dr-logo"');
    expect(client).not.toContain('className="dr-brand"');
    // the trophy/"XI" brand belongs to the AppShell topbar (BrandBadge), never the draft body
    expect(client).not.toContain("BrandBadge");
    // the now-unused CSS rules are gone too (comments may still mention them historically)
    expect(css).not.toMatch(/^\.dr-logo\s*\{/m);
    expect(css).not.toMatch(/^\.dr-brand\s*\{/m);
  });

  it("keeps `.dr-top` as a de-branded status strip — phase line + connection + presence", () => {
    expect(client).toContain('className="dr-status"');
    expect(css).toMatch(/^\.dr-status\s*\{/m);
    expect(client).toContain("phaseLine");
    expect(client).toContain("<ConnPill");
    expect(client).toContain("<PresenceRow");
  });
});

describe("draft re-skin — the view-state → region branch is preserved (presentation only)", () => {
  it("renders lobby for pending, summary for complete, the live board for active/paused", () => {
    expect(client).toContain('state.status === "pending" && <Lobby');
    expect(client).toContain('state.status === "complete" && <Summary');
    expect(client).toContain('state.status === "active" || state.status === "paused"');
  });

  it("keeps every active-board region wired (board, clock, ticker, available, roster, queue)", () => {
    expect(client).toContain("<Board state={state}");
    expect(client).toContain("<ClockBar state={state}");
    expect(client).toContain("<Ticker state={state}");
    expect(client).toContain("<AvailableList");
    expect(client).toContain("<RosterPanel");
    expect(client).toContain("<QueuePanel");
  });
});

describe("draft re-skin — preserves the behaviours it restyles (no mechanism change)", () => {
  it("gates the make-pick CTA on the on-the-clock manager (the pure isMyTurn predicate)", () => {
    expect(components).toContain("isMyTurn as isMyTurnFn");
    expect(components).toContain("const mine = isMyTurnFn(state);");
    expect(components).toContain("disabled={!mine || submitting}");
  });

  it("renders the countdown from the SERVER pick_deadline_at — never the client clock", () => {
    expect(components).toContain("state.pickDeadlineAt");
    expect(components).toContain("useServerCountdown(deadlineMs)");
    // the local `now` is sampled only to animate against the server deadline (countdownView is pure)
    expect(components).toContain("countdownView(deadlineMs, now)");
  });

  it("surfaces the typed DraftError message in the restyled toast on a failed pick", () => {
    expect(client).toContain("res.error.message");
    expect(client).toContain("Pick not made");
  });
});

describe("draft queue editor — toggle + remove wiring (Prompt 32)", () => {
  it("AvailableList accepts onQueueToggle and submittingQueue props", () => {
    expect(components).toContain("onQueueToggle: (playerId: string) => void");
    expect(components).toContain("submittingQueue: boolean");
    expect(components).toContain("onQueueToggle(p.id)");
  });

  it("QueuePanel accepts onQueueRemove and submittingQueue props", () => {
    expect(components).toContain("onQueueRemove: (playerId: string) => void");
    expect(components).toContain("onQueueRemove(p.id)");
  });

  it("queue toggle button is disabled when submittingQueue or draft is complete", () => {
    expect(components).toContain('submittingQueue || state.status === "complete"');
  });

  it("queue remove button is disabled when submittingQueue", () => {
    expect(components).toContain("disabled={submittingQueue}");
  });

  it("DraftRoomClient passes onQueueToggle, onQueueRemove, and submittingQueue to components", () => {
    expect(client).toContain("onQueueToggle={onQueueToggle}");
    expect(client).toContain("onQueueRemove={onQueueRemove}");
    expect(client).toContain("submittingQueue={submittingQueue}");
  });

  it("submitQueue reverts state.myQueue on a failed POST", () => {
    expect(client).toContain("lastSavedQueueRef");
    expect(client).toContain("Queue not saved");
    expect(client).toContain("/api/draft/queue");
  });

  it("TODO(prompt-NN: queue editor) comment is removed", () => {
    expect(components).not.toContain("TODO(prompt-NN: queue editor)");
  });
});

describe("draft queue drag-to-reorder (Prompt 33)", () => {
  it("QueuePanel accepts onQueueReorder prop", () => {
    expect(components).toContain("onQueueReorder: (playerIds: string[]) => void");
    expect(components).toContain("onQueueReorder(");
  });

  it("drag is disabled (draggable={false}) when submittingQueue is true", () => {
    expect(components).toContain("draggable={!submittingQueue}");
  });

  it("DraftRoomClient passes onQueueReorder to QueuePanel", () => {
    expect(client).toContain("onQueueReorder={onQueueReorder}");
    expect(client).toContain("const onQueueReorder = useCallback(");
  });
});

describe("draft pool UX — queue-row draft button (Prompt 31)", () => {
  it("QueuePanel accepts onDraft and submittingPlayerId props", () => {
    expect(components).toContain("onDraft: (player: DraftPlayer) => void");
    expect(components).toContain("submittingPlayerId: string | null");
  });

  it("QueuePanel renders a Draft button for each row, gated on mine + submitting", () => {
    expect(components).toContain("const mine = isMyTurnFn(state)");
    expect(components).toContain("disabled={!mine || submitting}");
    expect(components).toContain("onClick={() => onDraft(p)");
  });

  it("DraftRoomClient passes onDraft and submittingPlayerId to QueuePanel", () => {
    expect(client).toContain("onDraft={(p) => void makePick(p)}");
    expect(client).toContain("submittingPlayerId={submittingPlayerId}");
  });
});

describe("draft pool UX — country filter on available pool (Prompt 31)", () => {
  it("AvailableList accepts nation and setNation props", () => {
    expect(components).toContain('nation: string | "ALL"');
    expect(components).toContain('setNation: (n: string | "ALL") => void');
  });

  it("AvailableList passes nation to filterAvailable", () => {
    expect(components).toContain(
      "filterAvailable(state.availablePlayers, { query, position, nation })",
    );
  });

  it("nation filter chips rendered for distinct pool nations with an All option", () => {
    expect(components).toContain("nations.map((code) =>");
    expect(components).toContain('setNation("ALL")');
    expect(components).toContain("setNation(code)");
    expect(components).toContain("nationName(code)");
  });

  it("DraftRoomClient owns nation state and passes it to AvailableList", () => {
    expect(client).toContain("const [nation, setNation] = useState");
    expect(client).toContain("nation={nation}");
    expect(client).toContain("setNation={setNation}");
  });

  it("nation chips use cobalt --accent chip pattern, no gold", () => {
    // chips share the same .chip/.chip.is-active class as position chips — no bespoke colour
    expect(components).toContain('className={"chip" + (nation === code ? " is-active" : "")}');
  });
});

describe("draft Realtime resilience (Prompt 32 — resume + polling)", () => {
  it("H2 confirmed wired: setAuth is called on every re-subscribe via onAuthStateChange (no new impl)", () => {
    // resubscribe(token) → subscribeDraft → client.realtime.setAuth(token); TOKEN_REFRESHED fires this.
    expect(client).toContain("onAuthStateChange");
    expect(client).toContain("resubscribe(session?.access_token ?? null)");
  });

  it("H1: visibilitychange listener registered and removed in useEffect cleanup", () => {
    expect(client).toContain('addEventListener("visibilitychange"');
    expect(client).toContain('removeEventListener("visibilitychange"');
  });

  it("H1: online listener registered and removed for network-restore resume", () => {
    expect(client).toContain('addEventListener("online"');
    expect(client).toContain('removeEventListener("online"');
  });

  it("H1: pageshow listener registered and removed for bfcache restore", () => {
    expect(client).toContain('addEventListener("pageshow"');
    expect(client).toContain('removeEventListener("pageshow"');
  });

  it("§5: polling backstop wired with POLLING_FALLBACK_MS cadence and cleanup", () => {
    expect(client).toContain("POLLING_FALLBACK_MS");
    expect(client).toContain("startPolling(");
    expect(client).toContain("stopPolling()");
  });

  it("currentTokenRef stores the latest access token for resume re-subscription", () => {
    expect(client).toContain("currentTokenRef");
    expect(client).toContain("currentTokenRef.current = accessToken");
  });

  it("connectedRef mirrors channel SUBSCRIBED state for event-handler resume guard", () => {
    expect(client).toContain("connectedRef");
    expect(client).toContain('connectedRef.current = status === "SUBSCRIBED"');
  });
});

describe("draft re-skin — colour + shape invariants (BRAND.md §1, ARCHITECTURE §5)", () => {
  it("keeps draft.css fully tokenised — no literal hex, so no gold can leak into the body", () => {
    // Every colour resolves through the gold-free ds.css tokens (--accent cobalt, --live red, --pos-*
    // with slate GK). A raw hex would be the only way gold could re-enter the body — assert there are none.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("stays AppShell-wrapped (brand from the shell) on the dark cobalt surface", () => {
    expect(layout).toContain('<AppShell active="draft"');
    expect(layout).toContain('data-accent="cobalt"');
  });

  it("keeps /draft dynamic (ƒ) — server-authoritative, force-dynamic", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });
});
