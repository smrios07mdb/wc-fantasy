/**
 * Typed ingestion errors. Mirrors the repo convention (the Prompt-06 `DraftError` / Prompt-07
 * `AuthError` families): subclass Error, carry typed `readonly` fields, set `this.name`.
 *
 * {@link FeedShapeMismatchError} is the fail-loud signal a pure mapper raises when a feed row is
 * structurally wrong for the documented GOAT shape (a required field absent/mistyped, or the
 * nested-vs-flat object confusion that has bitten these mappers before). The ingest pipeline catches
 * it PER ITEM, logs loudly, and continues — one malformed row must never halt the whole batch.
 */

/** Base class for every ingestion-layer rejection (lets callers catch the family in one place). */
export class IngestError extends Error {}

/**
 * A feed row does not match the documented GOAT response shape for its endpoint. `entity` names the
 * endpoint/row kind (e.g. `"match_event"`), `field` the offending field path, `reason` the human
 * explanation, and `context` carries identifying ids (match_id, id) for the log line.
 */
export class FeedShapeMismatchError extends IngestError {
  constructor(
    readonly entity: string,
    readonly field: string,
    readonly reason: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(`feed shape mismatch on ${entity}.${field}: ${reason}`);
    this.name = "FeedShapeMismatchError";
  }
}
