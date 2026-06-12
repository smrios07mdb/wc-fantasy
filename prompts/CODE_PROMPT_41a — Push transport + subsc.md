CODE_PROMPT_41a — Push transport + subscription + notification preferences + Settings UI (inert sender)

Paste into a fresh Claude Code thread with the four brain files in repo root (PROJECT.md, ARCHITECTURE.md, DECISIONS.md, SCORING.md) + BRAND.md, and Prompts 01–39 on main. Branch off main (feat/notify-transport). Brain files win over this prompt on any conflict. If a detail is ambiguous, leave a // TODO(confirm): naming the section — do not invent product rules. Guiding constraint: "boring and reliable" over clever, server-authoritative, two-vendor (Render + Supabase).

Context (read first): Read the Prompt-18 entry (PWA identity: manifest/icons/metadata only — no service worker exists yet) and the Prompt-39 entry (/settings route + gated-route pattern: client island → POST → getSessionManager() → 401/403/400/409/200 map; the AppShell "Notifications" seam is still TODO(confirm)). This prompt builds the push transport + preference model + UI only. No trigger fires in this prompt — landed inert, the same way the faab/period-close crons were (plumbing green, logic later). Triggers are 41b.
Scope of THIS prompt:

Service worker — plain apps/web/public/sw.js (served at root /sw.js), handling push (show notification from JSON payload) and notificationclick (focus/open the app). No next-pwa dependency — manual registration via a tiny client island. Don't touch the manifest or Prompt-18 metadata.
New shared package @app/notify (packages/notify), consumed by the web route now and the worker in 41b:

sendPush(subscription, payload) — thin web-push wrapper (VAPID).
dispatchToManager(store, managerId, kind, subjectId, payload) — reads the manager's preference + subscriptions, writes the notification_sent ledger row, sends only if the pref is on and the ledger insert wins (idempotent). Built + unit-tested here but called by nothing yet (41b wires triggers). Keep IO behind a thin store port, mirroring DraftStore.


Migration (additive) — three tables, RLS:

push_subscription (manager_id, endpoint UNIQUE, p256dh, auth, created_at) — RLS self-only (insert/select/delete where manager_id = caller).
notification_preference (manager_id PK, draft_turn bool, player_not_starting bool, match_starting bool, all DEFAULT true) — RLS self-only; lazily upserted-with-defaults on first read (no provisioning change).
notification_sent (manager_id, kind text, subject_id text, sent_at, UNIQUE(manager_id, kind, subject_id)) — service-role write only, no client RLS read (leave a // TODO(confirm): seam if a history UI is ever wanted). This unique constraint is the load-bearing idempotency guard for 41b's polling triggers.
Embed the RLS self-tests in-migration per the Theme-F precedent, using valid UUID literals and the UUID-returning shim (not the plain-Postgres text shim — the auth.uid() cast trap).


Gated routes (mirror Prompt-39 exactly — framework-agnostic handler + thin route + injected resolveManager):

POST /api/notifications/subscribe / …/unsubscribe — write/remove a push_subscription (self-only).
POST /api/notifications/preferences — validate + write the three booleans.
POST /api/notifications/test — send a test push to the caller's own subscriptions via sendPush directly (bypass the ledger — proves transport end-to-end). 401/403/400/200 paths.


Settings UI — fill the AppShell Notifications TODO(confirm) seam: a "Notifications" SubCard with three toggles + an "Enable browser notifications" button (requests permission, registers /sw.js, subscribes with the VAPID public key, POSTs to /subscribe) and a "Send test" button. Client island mirroring SettingsClient; reuse ds.css (no gold; toggles/Save are the only accents). Point the seam at the section; touch only that seam.
VAPID env wiring — NEXT_PUBLIC_VAPID_PUBLIC_KEY (client), VAPID_PRIVATE_KEY + VAPID_SUBJECT (server). Document the operator key-gen step (npx web-push generate-vapid-keys) in the handoff summary; do NOT commit keys. Note in render.yaml comments that both web and worker need the private key (sync:false), worker for 41b.

Out of scope (leave seams intact): the three triggers (draft-turn / player-not-starting / match-starting) — 41b; any worker hot-path edit (draft tick, ingest, scheduler); email; notification-history UI; any postgres_changes / publication / RLS-broadcast edit (push is server→device — this sidesteps the RLS-publication trap, state that explicitly); scoring/recompute/draft/lineup/vsfield internals.
Tests (pnpm -w typecheck && lint && format:check && test + pnpm --filter web build exit 0):

Pure: preference validator; push-payload builder.
@app/notify: dispatchToManager — pref-off → no send; pref-on + first call → sends + ledger row; second identical call → ledger insert loses → no-op (idempotency).
Routes: 401/403/400/200 for subscribe/unsubscribe/preferences/test (mirror handlePick/handleDisplayNameRename).
RLS self-test (UUID shim): a manager can't read/write another's subscription or preference.
Smoke: SW registers; the three toggles render from current prefs; "Enable" wires the permission→subscribe path (mock the SW/PushManager).
Flag live-deploy-only items (real permission prompt, actual delivery to a device, installed-PWA push on iOS/Android) as inferences to confirm.

Brain-file updates (you do these on this branch — part of the handoff):

DECISIONS.md — new theme: notifications = Web Push via PWA (no new vendor; email deferred + why); 41a/41b split; the three tables + the notification_sent idempotency ledger; self-only RLS; no-publication rationale; iOS = installed-PWA-only / Android in-browser-or-PWA.
PROJECT.md — Prompt 41a running-log entry (files, routes, package, migration, test delta, branch/merge note, live-deploy inferences).
ARCHITECTURE.md — §1/routes: the new routes + /sw.js + @app/notify; §4: the three tables + invariants; §2: VAPID env on web+worker. Note the worker gains the @app/notify dep but no behavior until 41b.
SCORING.md — untouched; state so explicitly.

Definition of done: SW registers and shows a test push end-to-end on a real deploy; subscribe/unsubscribe/preferences persist self-only; dispatchToManager is idempotent and unused by any trigger; Settings Notifications section renders + toggles persist; full gate + web build exit 0; no out-of-scope churn (worker hot paths / ingestion / scoring / Realtime untouched). When done: report git log --oneline -1 + git status; conventional commit, no force-push, hold merge for Chat clearance; flag 41b (wire the three triggers) as next. Do not start 41b.