/**
 * Ranking metrics for comparing retrieval configurations.
 *
 * All of these take the relevance labels of a ranked list, in rank order.
 * Recall is measured against the pooled judgments — the union of everything
 * every configuration retrieved for that question — which is standard TREC
 * pooling practice and the only tractable denominator when the corpus is far
 * too large to judge exhaustively.
 */

export function precisionAtK(labels: readonly boolean[], k: number): number {
  if (k <= 0) return 0;

  const window = labels.slice(0, k);

  return window.length === 0
    ? 0
    : window.filter(Boolean).length / window.length;
}

export function recallAtK(
  labels: readonly boolean[],
  k: number,
  totalRelevant: number,
): number {
  if (totalRelevant <= 0) return 0;

  return labels.slice(0, k).filter(Boolean).length / totalRelevant;
}

/**
 * Binary-gain nDCG. The ideal ranking puts every relevant item first, capped
 * at the pool's relevant count so a list shorter than k is not penalised for
 * items it could not have returned.
 */
export function ndcgAtK(
  labels: readonly boolean[],
  k: number,
  totalRelevant: number,
): number {
  const discount = (rank: number) => 1 / Math.log2(rank + 2);
  const gain = labels
    .slice(0, k)
    .reduce((total, relevant, rank) => (relevant ? total + discount(rank) : total), 0);
  const ideal = Array.from(
    { length: Math.min(k, totalRelevant) },
    (_, rank) => discount(rank),
  ).reduce((total, value) => total + value, 0);

  return ideal === 0 ? 0 : gain / ideal;
}

export function reciprocalRank(labels: readonly boolean[]): number {
  const first = labels.indexOf(true);

  return first === -1 ? 0 : 1 / (first + 1);
}

/**
 * Probability that a randomly chosen relevant item outranks a randomly chosen
 * irrelevant one, by the rank-sum identity. Ties take the average rank, which
 * matters here because weak rerankers pile many items at identical scores.
 */
export function areaUnderCurve(
  observations: readonly { score: number; relevant: boolean }[],
): number {
  const positives = observations.filter(({ relevant }) => relevant).length;
  const negatives = observations.length - positives;

  if (positives === 0 || negatives === 0) return Number.NaN;

  const ordered = [...observations].sort((left, right) => left.score - right.score);
  const ranks = new Array<number>(ordered.length);

  for (let start = 0; start < ordered.length; ) {
    let end = start;

    while (end + 1 < ordered.length && ordered[end + 1].score === ordered[start].score) {
      end += 1;
    }

    const average = (start + end + 2) / 2;

    for (let index = start; index <= end; index += 1) ranks[index] = average;

    start = end + 1;
  }

  const positiveRankSum = ordered.reduce(
    (total, observation, index) => (observation.relevant ? total + ranks[index] : total),
    0,
  );

  return (positiveRankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

export function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}
