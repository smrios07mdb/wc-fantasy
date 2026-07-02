/**
 * @app/commish-core — the commissioner-override orchestration layer, RELOCATED VERBATIM from
 * `apps/worker/src/commish/{core,roster,lineup,trim}.ts` (Thread 3, mechanical move — zero logic change).
 * Pure / dependency-injected runners shared by the worker CLI (`apps/worker/src/commish/cli.ts`) and the
 * web `/api/commish/*` repair routes. Validation is never re-derived here: the runners reuse `@app/faab` /
 * `@app/lineup` validators + mutation primitives verbatim.
 */
export * from "./core";
export * from "./roster";
export * from "./lineup";
export * from "./trim";
