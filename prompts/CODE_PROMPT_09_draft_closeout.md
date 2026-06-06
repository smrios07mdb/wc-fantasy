# Claude Code — Prompt 09: Draft-room closeout — lobby→active client flip + autopick empty-ranking fallback

> Paste into Claude Code with the four brain files in the repo root (`PROJECT.md`, `ARCHITECTURE.md`,
> `DECISIONS.md`, `SCORING.md`), the **`design/` reference** (`design/CLAUDE.md`,
> `design/COMPONENT_MAP.md`, `design/design_reference/draft/*` + `shell/*`), and Prompts 01–08 in place.
> **Branch off `main`** (canonical — it carries the mock-draft brain-file updates; commit `5e46588`).
> **ARCHITECTURE.md §5 (Real-time layer → Live draft room)** and **DECISIONS.md → "Mock-draft session —
> open items & known issues"** are the spec for this prompt. The draft already ran end-to-end live (60
> picks, autopick + manual, two-browser streaming verified); this prompt closes the **two remaining open
> items** so the draft room is launch-solid. The WC opens June 11.

---

## Context (read first)
The Prompt-08 draft room was exercised end-to-end against live Supabase + Render and **works**: server
authoritative `draft`/`draft_pick`, worker tick autopicks ~1s after `pick_deadline_at` expiry, the ~30s
window is real (the earlier "born-expired" was a **read-timing artifact — RESOLVED, do not reopen, do
not touch the deadline logic**), manual picks record, and picks stream across two clients. Read
**DECISIONS.md → "Mock-draft session — open items & known issues"**; this prompt addresses exactly two
entries from it:

1. **lobby→active client flip** — *open, narrowed to the status-change subscription.*
2. **autopick empty-ranking fallback** — *pre-launch hardening.*

State of the build relevant here (all on `main`):
- **`packages/draft`** (Prompt 06) — pure-core controller behind a `DraftStore` port: `submitPick`,
  `tickDraft`, `startDraft`, snake ordering, `autopick` (**queue → best-available by
  `player.default_rank`, NULLS LAST**), `DraftError` family, `memoryStore` + `prismaStore`. **Do not
  change any signature.**
- **Draft-room screen + Realtime** (Prompt 08, `apps/web`) — authed board, server-synced countdown,
  Supabase Realtime subscription on **Postgres changes to `draft` and `draft_pick`** + presence. The
  on-screen countdown is presentation only; `pick_deadline_at` + the worker tick are the truth.
- **`apps/worker/src/draft.ts`** — drives `tickDraft` on a short interval (done in Prompt 08). **Not in
  scope here; leave it alone.**
- `player.default_rank` exists (migration from the Prompt-08 track), populated at provision time
  (~1,252 rows in the mock run).

Guiding constraint, non-negotiable: **"boring and reliable" over clever**, **server-authoritative**.
The brain files win where this prompt disagrees; `design/CLAUDE.md` governs UI integration. If a detail
is ambiguous, follow §5 / the design reference, or leave a `// TODO(prompt-NN):` / `// TODO(confirm):` —
do **not** invent product rules. Per the working-protocol **verification-discipline rule**: in your
report, state only what you directly verified; label anything non-observable (Render/Realtime/live DB)
as an inference to confirm.

## Scope of THIS prompt — two items, nothing else

### Part A — lobby→active client flip (P0, launch blocker)
**Symptom (verified live):** a client already on the draft page in the **lobby/waiting** view does **not**
re-render into the **active draft board** when the commissioner starts the draft — the
`draft.status` transition `pending → active` doesn't flip the view without a manual refresh. The issue is
narrowed to the **status-change subscription**: the existing Realtime handler re-syncs pick state
(`current_pick_no` / `current_manager_id` / `pick_deadline_at` / new `draft_pick` rows) but the
**lobby-vs-active view gate is derived once on load and not re-derived on the `draft.status` UPDATE**.

**Fix (presentation re-sync; server stays authoritative):**
- Ensure the `draft`-row UPDATE subscription handler **re-derives the lobby/active view from the
  authoritative `draft.status`** on every broadcast (and re-fetches the draft row if the payload is
  partial), so a `pending → active` change flips **all** connected lobby clients into the live board with
  **no manual refresh**. Cover the symmetric states too if the design defines them (`complete` → results
  view; `paused` if it exists). Do **not** trust the client clock or invent new statuses — read what
  `draft.status` already is.
- Keep it within the existing subscription (don't add a second channel). If the current filter excludes
  the status column or the handler discards non-pick updates, that's the line to fix. Match the lobby and
  active surfaces in `design/design_reference/draft/*` + `shell/*`.

### Part B — autopick empty-ranking fallback (P1, pre-launch hardening)
**Why:** the first mock-draft attempt stuck on pick 1 because the autopick best-available path had no
ordered candidate (ranks not yet populated). Provisioning now populates `default_rank`, but a
provisioning miss should **never** be able to re-stick the draft.

**Fix (pure core; signature unchanged):**
- Make `autopick` **total**: when the queue is empty **and** `default_rank` is null/absent for every
  undrafted candidate, still return a **deterministic, roster-legal, undrafted** player via a stable
  final tiebreak (e.g. ascending `player.id`). Order of preference stays: **queue → `default_rank` (NULLS
  LAST) → stable id tiebreak**. Given a non-empty undrafted-and-legal pool, autopick **must** return a
  player — never nothing, never throw "no candidate."
- This lives in `packages/draft` (pure). If the ranking is read through a `getDefaultRanking`-style seam,
  confirm it reads `player.default_rank` at runtime and isn't an empty stub; the totality guard is the
  belt-and-suspenders on top.

## Explicitly OUT of scope (do not touch)
- **The deadline / clock logic** — `pick_deadline_at` and the worker tick are correct; the born-expired
  report was a read-timing artifact (RESOLVED). Don't "fix" it.
- **`apps/worker/src/draft.ts`**, the worker tick loop, `submitPick` / `tickDraft` / `startDraft` /
  `requireManager` / engine + auth internals — done; **consume**, don't change. No signature churn.
- **Deploy / data provisioning** (Render, real Supabase, migrations, schedule-sync, the rank→draft
  go-live order) — operational track, not this prompt.
- **Lineup flow, "vs the field" screen, FAAB/waivers UI, commissioner/admin surface, group→playoff
  transition, the autopick-queue UI** — later prompts. `packages/feed` stays stubbed; no scraper.

## Tests — TDD-first where it's correctness-critical; keep IO at the edges
Vitest; root `pnpm test` stays green. Extend the existing `apps/web` and `packages/draft` suites.

- **Part B first (the one that would have caught the original stick), `packages/draft`, memory store:**
  - empty queue **+ all `default_rank` null** → `autopick` returns a **definite** undrafted, roster-legal
    player (assert deterministic tiebreak);
  - with ranks present → returns the **lowest `default_rank`** (NULLS LAST honored);
  - excludes already-drafted players; respects the 2/5/5/3 roster legality the controller enforces;
  - non-empty legal pool ⇒ **never** returns null / throws "no candidate."
- **Part A (component or thin integration, mocked Supabase channel):**
  - a simulated `draft` UPDATE broadcast with `status` `pending → active` **flips the rendered view from
    lobby to the active board**, deriving from the authoritative row (not a one-time on-load gate);
  - pick-state re-sync from Prompt 08 still works (no regression);
  - if defined by the design, `complete` flips to the results/closed view. No real network.
- **Purity/edges:** grep-clean that `packages/draft` stays IO-free; Supabase/clock confined to the
  browser client + worker + route (all unchanged).

## Definition of done (verify these pass)
- A lobby client **auto-flips to the live board** on `pending → active` with no manual refresh; `autopick`
  is **total** (queue → `default_rank` NULLS LAST → stable tiebreak) and can't return empty on a non-empty
  legal pool.
- `pnpm db:generate && pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm
  test` green (+ the new Part A / Part B cases).
- **No signature churn** (`submitPick` / `tickDraft` / `startDraft` / `autopick` / `requireManager` /
  engine); deadline + worker tick untouched; `packages/feed` still stubbed; no scraper.
- No out-of-scope work; UI follows `design/CLAUDE.md` and maps to `design/COMPONENT_MAP.md`.

## Runtime re-verification (only if a live draft/DB is reachable this session; else flag as the gate)
If connected to the same Supabase used for the mock draft: with the draft reset to `pending`, open two
clients in the lobby, start the draft, and confirm **both flip to the live board without refresh**; then
confirm a normal pick/advance/autopick cycle still streams (no regression to the verified behavior). If
the live DB/Render isn't wired in this session, **say so** and leave the two-browser flip check as the
provision-time gate — label live/Realtime state as an inference to confirm, per the verification rule.

## Commit discipline
- **Branch off `main`** (e.g. `fix/draft-lobby-flip-and-autopick-fallback`). Conventional Commits:
  `fix(web): flip lobby→active on draft.status change` and `fix(draft): make autopick total when ranking
  empty` (one or two commits as cleanest). **No force-push.** Push the branch.
- **Hold the merge for Chat review** — report against the definition of done first; merge to `main` after
  review (the established loop).

## When done
Summarize: the status-change subscription change (which handler/filter, which view-gate now re-derives
from `draft.status`, and which `design/design_reference/draft|shell/*` surfaces it maps to); the
`autopick` totality change + the preference order and tiebreak; the test count + the two new cases + the
purity proof; the exact commands you verified; the runtime flip check (or the explicit reason it's
deferred + the gate); and any `TODO(prompt-NN)` / `TODO(confirm):` left. Do not start the lineup flow,
vs-the-field, FAAB, the admin surface, the playoff transition, the queue UI, or deploy.
