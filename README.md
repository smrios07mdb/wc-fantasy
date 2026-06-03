# WC Fantasy

A standalone web app for a **private friends' World Cup fantasy league** (~12 managers, one
~month-long tournament, ~104 matches): snake draft with unique player ownership, per-match
lock-on-play, head-to-head all-play-all group stage, guillotine playoffs on a reduced roster,
and FAAB waivers.

Guiding constraint: **"boring and reliable" over clever.** The scale is tiny — every choice is
the well-trodden default, not the scalable-to-millions one.

## Project brain (source of truth)

These four files at the repo root are the locked spec. Read them before changing behavior.

- [PROJECT.md](PROJECT.md) — overview, surfaces, working protocol, status
- [ARCHITECTURE.md](ARCHITECTURE.md) — **the build spec** (stack, topology, ingestion, data model)
- [DECISIONS.md](DECISIONS.md) — running decision log across all themes
- [SCORING.md](SCORING.md) — the locked, build-ready scoring model

## Workspace layout

pnpm-workspaces monorepo, TypeScript end-to-end:

```
apps/
  web/        Next.js (App Router) + React + Tailwind — SSR + API route handlers
  worker/     long-running Node service — ingestion scheduler / FAAB batch / scraper (skeleton)
packages/
  db/         Prisma schema, generated client, migrations — the one place the DB is defined
  shared/     shared TS enums & domain types — imported by every app + package
  scoring/    the scoring engine (stub: scorePlayerMatch throws NotImplemented)
  feed/        BALLDONTLIE FIFA WC client + response types (stub: signatures throw NotImplemented)
```

Shared types are the reliability lever: scoring rules, lock logic, feed shapes, and the API
contract all import from `@app/shared`, so they cannot drift apart.

## Prerequisites

- **Node ≥ 20** (developed on Node 25)
- **pnpm 10** — `corepack enable && corepack prepare pnpm@10.33.0 --activate`, or `npm i -g pnpm`
- **PostgreSQL 14+** for migrations — a Supabase project, or local Postgres / Docker:
  ```bash
  docker run --name wcfantasy-pg -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=wcfantasy -p 5432:5432 -d postgres:16
  ```

## Setup

```bash
cp .env.example .env          # fill in DATABASE_URL / DIRECT_URL (+ Supabase, feed keys)
pnpm install                  # installs all workspaces; postinstall runs `prisma generate`
```

## Database (migrations)

The schema lives in `packages/db/prisma/schema.prisma`. Apply migrations to a fresh Postgres:

```bash
pnpm db:migrate               # prisma migrate dev — creates every table, the partial unique
                              # ownership index, the lineup-lock trigger, FAAB check constraints,
                              # and the faab_bid RLS policies (raw-SQL migration)
pnpm db:generate              # regenerate the Prisma client after a schema change
pnpm db:studio                # browse the DB in Prisma Studio
```

## Run

```bash
pnpm dev:web                  # Next.js dev server — http://localhost:3000
                              #   health check: GET http://localhost:3000/api/health -> {"ok":true}
pnpm dev:worker               # worker: boots, logs structured startup, idles on a no-op tick
```

**Env loading:** Prisma (`db:*`) and the worker read the repo-root `.env`. The Next app reads its
own `apps/web/.env*` (Next convention), so it ignores the root file — the skeleton web app needs no
env, but to exercise `/api/db-check` in dev either `export DATABASE_URL=…` or add `apps/web/.env.local`.
A later prompt unifies app config. In production, the host (Render/Supabase) injects env vars directly.

## Workspace-wide checks (what CI runs)

```bash
pnpm typecheck                # tsc --noEmit across every package (strict mode)
pnpm build                    # builds @app/db (generate), @app/web (next build), @app/worker
pnpm lint                     # eslint across the repo
pnpm format                   # prettier --write
```

## Status

Foundation prompt (scaffold + full DB schema) implemented. Scoring engine, feed ingestion,
FAAB batch, draft controller, Realtime, auth UI, and the "vs the field" screen are stubs/seams
left for later prompts (search the tree for `TODO(prompt-NN)`).
