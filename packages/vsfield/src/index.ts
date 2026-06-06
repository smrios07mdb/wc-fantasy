/**
 * @app/vsfield — the PURE "vs the field" view-model (ARCHITECTURE.md §5).
 *
 * `buildVsField` turns injected §4 rows into the display model: per-manager running score, the
 * provisional all-play-all record + per-opponent H2H (via the Prompt-04 `comparePeriodPairwise` /
 * `periodRecords` helpers from `@app/recompute` — NOT re-derived here), each manager's
 * starters-yet-to-play counts, and the season view (record + total points + seed from `standing`).
 *
 * No IO/clock/env: the IO edge lives in apps/web (the SSR loader + the authed `GET /api/vsfield`).
 */
export * from "./types";
export { buildVsField } from "./buildVsField";
