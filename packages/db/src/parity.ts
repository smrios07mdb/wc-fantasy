/**
 * Compile-time guard: the Prisma-generated enums MUST equal the canonical `@app/shared` unions.
 * If `schema.prisma` and `packages/shared/src/enums.ts` ever drift, this file fails to typecheck.
 * No runtime code — `tsc --noEmit` evaluates it because it lives under `src/`.
 */
import type { $Enums } from "@prisma/client";
import type {
  Position,
  LeagueStatus,
  PeriodKind,
  PeriodStatus,
  DraftStatus,
  BidStatus,
  FaabBatchStatus,
  RatingSource,
  MatchStatus,
  StandingScope,
  RecomputeScope,
} from "@app/shared";

/** True iff A and B are the exact same type (bidirectional, invariant). */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<_T extends true> = true;

// Each line errors if the Prisma enum and the shared union diverge.
type _Position = Expect<Equals<$Enums.Position, Position>>;
type _LeagueStatus = Expect<Equals<$Enums.LeagueStatus, LeagueStatus>>;
type _PeriodKind = Expect<Equals<$Enums.PeriodKind, PeriodKind>>;
type _PeriodStatus = Expect<Equals<$Enums.PeriodStatus, PeriodStatus>>;
type _DraftStatus = Expect<Equals<$Enums.DraftStatus, DraftStatus>>;
type _BidStatus = Expect<Equals<$Enums.BidStatus, BidStatus>>;
type _FaabBatchStatus = Expect<Equals<$Enums.FaabBatchStatus, FaabBatchStatus>>;
type _RatingSource = Expect<Equals<$Enums.RatingSource, RatingSource>>;
type _MatchStatus = Expect<Equals<$Enums.MatchStatus, MatchStatus>>;
type _StandingScope = Expect<Equals<$Enums.StandingScope, StandingScope>>;
type _RecomputeScope = Expect<Equals<$Enums.RecomputeScope, RecomputeScope>>;
