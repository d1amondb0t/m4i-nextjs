/**
 * Fits the automatic accept and reject thresholds used by `adaptiveSelect`
 * from labelled retrieval scores.
 *
 * The two thresholds are fitted against two different error rates, because
 * they protect against two different mistakes:
 *
 *   accept  — a chunk scored at or above `acceptThreshold` is used without
 *             further checking, so the error that matters is the share of
 *             accepted chunks that are actually irrelevant (false accepts).
 *   reject  — a chunk scored below `rejectThreshold` is discarded outright,
 *             so the error that matters is the share of genuinely relevant
 *             chunks that fall below it (false rejects).
 */

export type LabelledScore = {
  score: number;
  relevant: boolean;
};

export type ThresholdTargets = {
  /** Maximum tolerated share of irrelevant chunks among automatic accepts. */
  maximumFalseAcceptRate: number;
  /** Maximum tolerated share of relevant chunks lost to automatic rejects. */
  maximumFalseRejectRate: number;
};

export type FittedThreshold = {
  threshold: number;
  observedRate: number;
  /** False when no threshold in the observed range meets the target. */
  attainable: boolean;
};

export type FittedThresholds = {
  accept: FittedThreshold;
  reject: FittedThreshold;
  observations: number;
  relevantObservations: number;
  /** Share of observations landing in each band at the fitted thresholds. */
  bands: { accept: number; ambiguous: number; reject: number };
};

export const DEFAULT_THRESHOLD_TARGETS = {
  maximumFalseAcceptRate: 0.1,
  maximumFalseRejectRate: 0.1,
} as const satisfies ThresholdTargets;

function validateTargets(targets: ThresholdTargets): void {
  for (const [name, value] of Object.entries(targets)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${name} must be between 0 and 1.`);
    }
  }
}

function candidateThresholds(observations: readonly LabelledScore[]): number[] {
  return [...new Set(observations.map(({ score }) => score))].sort(
    (left, right) => left - right,
  );
}

/**
 * Lowest threshold whose accepted set is precise enough. Lowest, not highest,
 * because among thresholds that meet the target the lowest accepts the most
 * evidence. Precision is not monotonic in the threshold, so every candidate is
 * tested rather than bisected.
 */
export function fitAcceptThreshold(
  observations: readonly LabelledScore[],
  maximumFalseAcceptRate: number,
): FittedThreshold {
  for (const threshold of candidateThresholds(observations)) {
    const accepted = observations.filter(({ score }) => score >= threshold);

    if (accepted.length === 0) continue;

    const falseAccepts = accepted.filter(({ relevant }) => !relevant).length;
    const rate = falseAccepts / accepted.length;

    if (rate <= maximumFalseAcceptRate) {
      return { threshold, observedRate: rate, attainable: true };
    }
  }

  // Nothing is precise enough: accept nothing, and say so.
  const highest = observations.reduce((max, { score }) => Math.max(max, score), 0);

  return { threshold: Math.min(highest + Number.EPSILON, 1), observedRate: 1, attainable: false };
}

/**
 * Highest threshold that still discards no more than the tolerated share of
 * relevant chunks. The false-reject rate is monotonic in the threshold, so the
 * answer is the target-quantile of the relevant score distribution.
 */
export function fitRejectThreshold(
  observations: readonly LabelledScore[],
  maximumFalseRejectRate: number,
): FittedThreshold {
  const relevant = observations.filter(({ relevant }) => relevant);

  if (relevant.length === 0) {
    return { threshold: 0, observedRate: 0, attainable: false };
  }

  let best: FittedThreshold = { threshold: 0, observedRate: 0, attainable: true };

  for (const threshold of candidateThresholds(observations)) {
    const lost = relevant.filter(({ score }) => score < threshold).length;
    const rate = lost / relevant.length;

    if (rate > maximumFalseRejectRate) break;

    best = { threshold, observedRate: rate, attainable: true };
  }

  return best;
}

export function fitThresholds(
  observations: readonly LabelledScore[],
  targets: ThresholdTargets = DEFAULT_THRESHOLD_TARGETS,
): FittedThresholds {
  validateTargets(targets);

  if (observations.length === 0) {
    throw new Error("At least one labelled observation is required.");
  }

  const accept = fitAcceptThreshold(observations, targets.maximumFalseAcceptRate);
  const rejectFit = fitRejectThreshold(observations, targets.maximumFalseRejectRate);
  // A reject threshold above the accept threshold would leave no ambiguous
  // band and would reject chunks the accept rule would have taken.
  const reject =
    rejectFit.threshold > accept.threshold
      ? { ...rejectFit, threshold: accept.threshold }
      : rejectFit;

  const inAccept = observations.filter(({ score }) => score >= accept.threshold).length;
  const inReject = observations.filter(({ score }) => score < reject.threshold).length;

  return {
    accept,
    reject,
    observations: observations.length,
    relevantObservations: observations.filter(({ relevant }) => relevant).length,
    bands: {
      accept: inAccept / observations.length,
      ambiguous: (observations.length - inAccept - inReject) / observations.length,
      reject: inReject / observations.length,
    },
  };
}
