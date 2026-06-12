# Claude Code — Prompt 32: Draft Realtime resilience — resume-on-foreground + token-refresh setAuth + polling backstop

> Paste with the four brain files in the repo root, Prompts 01–30 on main. Branch off current main:
> `fix/draft-realtime-resume`. File-disjoint from Prompt 31 (pool-filter UI) → parallel-safe. Touches
> ONLY the /draft client Realtime/subscription layer + the screen's state-refresh + auth-state wiring +
> the new polling seam. NO engine, NO route/handlePick, NO worker, NO design/visuals, NO countdown
> SOURCE change, NO migration.

## Context / symptom
On mobile the /draft board stops updating; users force-close the PWA and re-enter to get fresh state.
The Realtime subscription (postgres_changes on `draft` + `draft_pick`, presence) has NO resume/reconnect
handling, and the §5 polling fallback (15–30s) was deferred as a `// TODO(confirm):` and never built.
Server is authoritative; the board renders from authoritative row state. Goal: the board self-heals
WITHOUT a manual re-entry.

## Root-cause hypotheses (confirm which apply, then fix the boring way)
- **H1 — backgrounding drops the socket.** Mobile suspends the page on background/lock/app-switch; the
  WebSocket dies and the channel isn't re-established on return → stale board. (Re-entering is what
  currently "fixes" it — we automate that.)
- **H2 — token expiry silently kills RLS delivery.** The Realtime socket needs the current access_token
  (`realtime.setAuth`) to receive postgres_changes on the RLS-scoped draft/draft_pick tables (the
  documented expired/anon-socket → zero-events trap). If setAuth isn't re-called on TOKEN_REFRESHED, the
  socket goes silent after ~1h — and a draft can run past that.

## Scope (priority order; all boring/reliable; server stays authoritative)
1. **Resume on foreground/online (H1).** Add `visibilitychange` + `online` (+ `pageshow`) listeners
   scoped to the draft screen. On visible/online: (a) refetch the authoritative board state ONCE,
   reusing the existing mount read (no new query); (b) check `channel.state` — if not `joined`, tear
   down and re-subscribe via the EXISTING subscription. Idempotent; guard against duplicate channels.
2. **Keep the socket authorized (H2).** Wire `supabase.auth.onAuthStateChange`; on TOKEN_REFRESHED /
   SIGNED_IN call `supabase.realtime.setAuth(session.access_token)`. First CONFIRM whether this is
   already wired (Prompt 07/08) — if so, note + skip.
3. **Polling backstop (build the deferred §5 seam) — load-bearing.** A low-freq interval (default ~15s;
   single `// TODO(confirm):` on cadence) that, while `draft.status = active` AND foregrounded,
   refetches the authoritative board state and re-renders (render is already a pure fn of row state →
   just a re-read, no bespoke merge). PAUSE when backgrounded; STOP on complete. Net: even if Realtime
   is fully dead, the board converges within one interval. (1)+(2) reduce how often we fall back to it.

## Hard constraints
Do NOT change the countdown's server-sync SOURCE (still derives from `pick_deadline_at`, re-synced on
broadcast; the resume/poll refetch feeds the SAME authoritative state — no client-clock deadline). Do
NOT touch the pick path/route/handlePick, the engine, the worker tick, or visuals. Render-from-row-state
contract unchanged — you only ensure fresh rows arrive. No new tables/columns/migrations.

## File-scope (parallel-safety w/ Prompt 31)
Touch ONLY the /draft Realtime/subscription hook + screen state-refresh + auth-state wiring + the new
polling seam. Do NOT touch the available-players filter UI/query (Prompt 31), the route, the worker, or
packages/draft.

## Early-warning seams (STOP and flag)
- setAuth already correctly wired → note + skip (2).
- Resume/poll would need a new server query or a Realtime-payload change → reuse the mount read; if you
  can't, STOP and flag.
- Reconnect risks duplicate channels/listeners → flag your guard.
- Anything would touch the countdown source or the pick path → STOP and flag.

## Tests (mock channel/auth/timers; no real network)
- `visibilitychange`→visible triggers a board refetch + re-subscribe when channel not joined.
- `online` likewise; TOKEN_REFRESHED calls `realtime.setAuth` with the new token.
- Polling interval refetches on a fake timer while active+foregrounded; pauses when hidden; stops on
  complete; no duplicate channels on repeated resume.
- No regression to existing Realtime / lobby→active / countdown tests.

## Definition of done
Board self-heals after background→foreground and after token refresh with NO manual re-entry (the
symptom); polling backstop converges within one interval if Realtime is dead; countdown source / pick
path / engine / worker untouched; /draft stays `ƒ`/AppShell-wrapped;
`pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; build green.

## When done
Which hypotheses confirmed; exactly what you added for resume / setAuth / polling and where; whether
setAuth was already wired; the duplicate-channel guard; test count; exact commands; `git log --oneline -1`
+ `git status`. Branch `fix/draft-realtime-resume`, conventional commit, no force-push, **hold the merge
for Chat's clearance.** Model effort: high. **Two-device live verify (phone background→foreground
mid-draft; the >1h token-expiry case if feasible) is the operator gate before the draft** — flag it; it
can't be fully proven in-session.