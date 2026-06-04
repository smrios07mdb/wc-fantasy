/**
 * PURE BALLDONTLIE-vs-Sofascore fallback-quality math (ARCHITECTURE.md §3 "Action for Code"). Rows in,
 * stats out — no IO. Gauges how good the `balldontlie` fallback is vs the calibrated `scrape` primary;
 * it does NOT change the resolver or gate anything. Sofascore stays primary regardless.
 */
export interface RatingPair {
  scrape: number;
  balldontlie: number;
}
export interface ComparisonSummary {
  n: number;
  meanDiff: number; // mean(scrape − balldontlie) — sign shows systematic bias
  meanAbsDiff: number;
  maxAbsDiff: number;
  correlation: number | null; // Pearson; null when undefined (n=0 or zero variance)
  /** abs-diff histogram: how many pairs fall in [0,0.5), [0.5,1), [1,2), [2,∞). */
  distribution: { lt05: number; lt1: number; lt2: number; ge2: number };
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function compareRatings(pairs: readonly RatingPair[]): ComparisonSummary {
  const n = pairs.length;
  const distribution = { lt05: 0, lt1: 0, lt2: 0, ge2: 0 };
  if (n === 0) {
    return { n: 0, meanDiff: 0, meanAbsDiff: 0, maxAbsDiff: 0, correlation: null, distribution };
  }

  const diffs = pairs.map((p) => p.scrape - p.balldontlie);
  const abs = diffs.map(Math.abs);
  for (const a of abs) {
    if (a < 0.5) distribution.lt05++;
    else if (a < 1) distribution.lt1++;
    else if (a < 2) distribution.lt2++;
    else distribution.ge2++;
  }

  const xs = pairs.map((p) => p.scrape);
  const ys = pairs.map((p) => p.balldontlie);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  const correlation = denom === 0 ? null : sxy / denom;

  return {
    n,
    meanDiff: mean(diffs),
    meanAbsDiff: mean(abs),
    maxAbsDiff: Math.max(...abs),
    correlation,
    distribution,
  };
}
