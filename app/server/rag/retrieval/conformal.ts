/**
 * Split-conformal calibration of the retention threshold.
 *
 * The earlier `fitRejectThreshold` picked the highest threshold whose observed
 * loss on the fitting data met the target. Fitting and evaluating on the same
 * data makes that estimate optimistic and provides no guarantee on unseen
 * questions.
 *
 * The exchangeable unit must match the claim: correlated chunks from the same
 * question are not independent calibration questions. Applying this function
 * to question top scores controls question rejection under exchangeability;
 * it does not guarantee evidence recall after accept filtering or a top-k cap.
 *
 * The conformal quantile below is the standard split-conformal construction:
 * calibrate on one split, apply to another, and the coverage guarantee
 * P(retain | relevant) >= 1 - alpha holds in finite samples under exchangeability,
 * without assuming anything about the score's distribution or quality.
 *
 * Note what the guarantee does and does not buy: it controls how many relevant
 * items are retained, not how many irrelevant ones come with them. On a weak
 * score the guarantee still holds exactly — it is met by retaining almost
 * everything.
 */

export type ConformalThreshold = {
  threshold: number;
  /** Calibration points used. Coverage is only meaningful when this is large. */
  calibrationSize: number;
  /**
   * Smallest alpha this sample size can certify, i.e. 1/(n+1). Requesting a
   * tighter alpha than this cannot be honoured by any finite threshold.
   */
  smallestSupportedAlpha: number;
  supported: boolean;
};

/**
 * Threshold that retains at least (1 - alpha) of relevant items.
 *
 * Scores are relevance scores, higher meaning more relevant, so retention is
 * `score >= threshold` and the threshold is a lower quantile of the positives.
 */
export function conformalThreshold(
  positiveScores: readonly number[],
  alpha: number,
): ConformalThreshold {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
    throw new Error("alpha must be strictly between 0 and 1.");
  }

  const n = positiveScores.length;

  if (n === 0) {
    throw new Error("At least one positive score is required to calibrate.");
  }

  const smallestSupportedAlpha = 1 / (n + 1);
  const sorted = [...positiveScores].sort((left, right) => left - right);
  // Rank of the largest score we may drop while still covering 1 - alpha.
  const rank = Math.floor(alpha * (n + 1));

  if (rank < 1) {
    // Too few calibration points to drop anything at this alpha: retain all.
    return {
      threshold: Number.NEGATIVE_INFINITY,
      calibrationSize: n,
      smallestSupportedAlpha,
      supported: false,
    };
  }

  return {
    threshold: sorted[Math.min(rank, n) - 1],
    calibrationSize: n,
    smallestSupportedAlpha,
    supported: true,
  };
}

/**
 * Deterministic two-way split of item indices, so calibration and evaluation
 * use disjoint questions and a rerun reproduces the same split.
 */
export function splitIndices(
  count: number,
  calibrationShare = 0.5,
  seed = 20260908,
): { calibration: number[]; evaluation: number[] } {
  if (calibrationShare <= 0 || calibrationShare >= 1) {
    throw new Error("calibrationShare must be strictly between 0 and 1.");
  }

  const indices = [...Array(count).keys()];
  let state = seed;
  const next = () => {
    // Mulberry32: small, deterministic, adequate for shuffling a split.
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [indices[index], indices[swap]] = [indices[swap], indices[index]];
  }

  const cut = Math.round(count * calibrationShare);

  return {
    calibration: indices.slice(0, cut).sort((a, b) => a - b),
    evaluation: indices.slice(cut).sort((a, b) => a - b),
  };
}
