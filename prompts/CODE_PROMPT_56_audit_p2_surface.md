# CODE_PROMPT_56 — Codebase Audit · Pass 3: P2 surface & supply chain (READ-ONLY)

> Run: isolated worktree · **Opus 4.8** · `/effort` → **ultracode** · paste this whole file.

---

## HARD CONSTRAINTS — read first; these bind every subagent you spawn

1. **READ-ONLY.** Zero changes to any existing file — no source, tests, config, migrations, or brain files. Do **not** run the app, start any server, run `pnpm dev` or any build, open a network connection, call any external API (BALLDONTLIE / Sofascore), or connect to any database. Read code statically.
2. **No git.** No commits, branches, staging, pushes, or PRs. Sergio owns every git operation.
3. **One writable location.** You may write only inside `audit/`. The sole deliverable is the report named in OUTPUT below. Any scratch files must also live under `audit/` and be deleted before you finish. On completion the only new file on disk must be that one report.
4. **Report — don't decide, don't fix.** Findings only — no remediations, no decisions. Do not edit `DECISIONS.md` or any brain file. One-line fix *theme* per finding; write no fix code.
5. **Verified vs. suspected.** Never assert a root cause you did not read. If you didn't trace the real code path end-to-end, log it as an **investigation task** with `Confidence: suspected` — not a finding with an asserted cause. Treat anything about Render/env/process/deploy as an **inference to confirm**, never asserted as fact.
6. **Allowed inspection only.** File reads, `rg`/`grep`, `git log`/`git show` (read), optionally `pnpm -w typecheck` / `pnpm lint` for static signal. Nothing that mutates state, writes outside `audit/`, or touches the network/DB.

## Context priming (before any code)

Read these four brain files first and audit the implementation against the **intended contracts** they define:

- `PROJECT.md` · `DECISIONS.md` · `ARCHITECTURE.md` · `SCORING.md`

`ARCHITECTURE.md` carries the auth model (Supabase magic-link + allowlist), the realtime model (server-authoritative Postgres, broadcast on change), and the App Shell / `ds.css` styling decisions.

## Model / effort

Opus 4.8 with **ultracode**. Confirm the session header reads `opus · ultracode` before starting.

---

## SCOPE — Pass 3: P2 surface & supply chain

The lowest-severity catch-all, but it is where an auth hole or a leaked secret would surface — so a real access gap here is still a **P0 finding**. Cover the remaining packages and the platform. Anchor on named symbols; confirm the owning package before reporting.

**Auth & access — `packages/auth` + `apps/web` API routes**
- Supabase Auth magic-link + email allowlist; the allowlist seed path (`seed:allowlist`).
- Every `apps/web` API route (e.g. `POST /api/faab/release` and all siblings) has an identity gate; every commissioner action (the commish CLI in `apps/worker` + any privileged endpoint) has a commissioner gate. Enumerate every mutation route and mark each: identity-gated? commissioner-gated where required? Flag any mutation route missing authorization as **P0**.

**Schema / migrations / RLS — `packages/db`**
- Prisma schema integrity; migration safety on a live DB — flag any destructive or table-locking migration; review the forfeit/lock migrations and `enforce_lineup_lock()` as schema.
- RLS: are tables protected at the DB layer (row-level security policies) or only in app code? List every table relying on app-only protection.

**Next.js boundaries & shell — `apps/web`**
- Server/client split: no secret or server-only data reaching client components; `"use client"` hygiene; loader error / loading / empty states present across the route loaders.
- App Shell (`app/shell/AppShell.tsx`) + the double-loaded `ds.css` cascade and overflow backstops (`.sh-topnav-scroll`; `html, body { overflow-x }`) — confirm no regression vectors.

**Realtime — `packages/vsfield`, `packages/draft` (+ web consumers)**
- Injectable native browser APIs (timers, Realtime subscriptions) use window-bound lambda wrappers, never bare refs; state is server-authoritative in Postgres and broadcast on change (no client-authoritative drift). `vsfield` is LIVE during matches; `draft` realtime is the pattern reference. Flag anything whose only coverage is Node/jsdom tests (green there ≠ browser-safe).

**Feature packages — `packages/pool`, `packages/draft`, `packages/notify`**
- `pool` (player pool / availability) and `draft` (snake draft engine + autopick) correctness — draft is complete, so latent-only, but verify no shared primitive is reused unsafely elsewhere.
- `notify` — access/secret surface; any outbound integration credential handling.

**Build / CI / deploy — repo root**
- The `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` gate wiring (does CI actually run all four?); `[skip render]` discipline; Render service config (label every Render/env claim an inference to confirm).

**Dependencies / secrets — repo-wide**
- Dependency audit for known-vulnerable packages.
- Secret scan: no secrets committed; `.env` / `.env.example` hygiene; the BALLDONTLIE key and Supabase keys never present in tracked files. Flag any hardcoded credential or token as **P0**.

---

## OUTPUT — write `audit/AUDIT_2026-06_p2_surface.md`

1. **Summary table** — finding counts by severity (P0/P1/P2/P3).
2. **Findings** — one block each, in severity order:
   - `ID` (e.g. `F-P2-01`) · `Title`
   - `Severity` — **P0** corrupts live scoring/roster/FAAB or is an access hole · **P1** latent-but-untriggered correctness bug · **P2** maintainability/drift · **P3** nit
   - `Location` — exact `path:line` (multiple if needed)
   - `Observed` — what the code actually does (cite the path you read)
   - `Impact` — concrete effect (access gap, leaked secret, unsafe migration, client drift, etc.)
   - `Confidence` — **verified** (path read end-to-end) or **suspected** (investigation task)
   - `Fix theme` — one line → candidate CODE_PROMPT
   - `Effort` — S / M / L
3. **Investigation tasks** — suspected issues you could not confirm by reading, each with the exact next check needed.
4. **Checks performed** — each scope target above, status + evidence; for auth, include the full mutation-route table (route · identity gate · commissioner gate).
5. **Out of scope this pass** — covered by P0 (integrity) and P1 (ingestion/feed).

No other files. No git. When finished, `git status` must show only `audit/AUDIT_2026-06_p2_surface.md`.
