---
name: draft-start-layer
description: Prompt 30 — POST /api/draft/start + commissioner Start button in Lobby
metadata:
  type: project
---

Prompt 30: `POST /api/draft/start` commissioner-only route + `StartDraftButton` in `Lobby`.

**Files changed:**

- `apps/web/src/draft/handleStartDraft.ts` — pure testable handler (injected deps: `resolveManager`, `store`, `findDraft`, `now`)
- `apps/web/app/api/draft/start/route.ts` — thin Next.js route wiring real deps
- `apps/web/src/draft/startDraft.test.ts` — 5 unit tests (401/403/409/200-true/200-false)
- `apps/web/app/draft/components.tsx` — `StartDraftButton` local client component + conditional render in `Lobby` behind `state.sessionManagerIsCommissioner`

**Key design:** mirrors `api/draft/timer/route.ts` auth pattern exactly; `startDraft` called unchanged; idempotent (already-active → `{ started: false }`); Realtime delivers the `pending→active` flip to all clients automatically.

**Why:** 973 tests ✓, typecheck ✓, lint ✓, format ✓, next build ✓. Branch: main (unmerged). NEXT = Prompt 31.
