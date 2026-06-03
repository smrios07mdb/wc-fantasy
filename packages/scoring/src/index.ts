/**
 * @app/scoring — the scoring engine.
 *
 * STUB: `scorePlayerMatch` is typed and wired into call sites but throws until a later prompt
 * implements the SCORING.md ladder. Implementing it must NOT change this signature.
 */
import { NotImplementedError } from "@app/shared";
import type { ScoreInput, ScoreBreakdown } from "./types";

export * from "./types";

/**
 * Score one player's match from its resolved inputs (pure function — same inputs, same output).
 * @throws NotImplementedError until the SCORING.md model is implemented.
 */
export function scorePlayerMatch(_input: ScoreInput): ScoreBreakdown {
  throw new NotImplementedError(
    "scorePlayerMatch",
    "TODO(prompt-NN): implement the SCORING.md ladder (rating, buckets, role outcomes, discipline)",
  );
}
