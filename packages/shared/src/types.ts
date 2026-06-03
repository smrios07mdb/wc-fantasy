import type { RatingSource } from "./enums";

/** Ordered rating-source priority; the resolver returns the first non-null match. */
export type RatingSourcePriority = readonly RatingSource[];

/**
 * Thrown by stubbed engine/feed APIs that are wired into call sites but not yet implemented.
 * Later prompts replace the throwing body without changing signatures (so call sites are stable).
 */
export class NotImplementedError extends Error {
  constructor(what: string, todo?: string) {
    super(todo ? `Not implemented: ${what} (${todo})` : `Not implemented: ${what}`);
    this.name = "NotImplementedError";
  }
}
