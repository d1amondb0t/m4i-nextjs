import type { SearchResult } from "../storage/storage-types";

/**
 * Standard smoothing constant from the original RRF paper. It damps the
 * influence of the very top ranks so one list cannot dominate the fusion.
 */
export const DEFAULT_RRF_K = 60;

/**
 * Fuses ranked result lists by Reciprocal Rank Fusion.
 *
 * RRF works on ranks, not scores, which is the reason to prefer it here: BM25
 * scores are unbounded while cosine similarity sits in [-1, 1], so the two are
 * not comparable without a normalisation step that would itself need fitting.
 *
 * The fused `score` is the RRF score, on its own scale — roughly
 * 1/(k+1) at best. Downstream thresholds must be calibrated against whichever
 * score they will actually see. `denseScore` and `sparseScore` are carried
 * through from whichever input list supplied them.
 */
export function reciprocalRankFusion(
  rankings: readonly (readonly SearchResult[])[],
  k: number = DEFAULT_RRF_K,
): SearchResult[] {
  if (!Number.isFinite(k) || k <= 0) {
    throw new Error("The RRF smoothing constant must be a positive number.");
  }

  const fused = new Map<string, SearchResult>();

  for (const ranking of rankings) {
    for (const [rank, result] of ranking.entries()) {
      const contribution = 1 / (k + rank + 1);
      const current = fused.get(result.chunk.chunkId);

      if (!current) {
        fused.set(result.chunk.chunkId, { ...result, score: contribution });
        continue;
      }

      current.score += contribution;
      current.denseScore = current.denseScore ?? result.denseScore;
      current.sparseScore = current.sparseScore ?? result.sparseScore;
    }
  }

  return [...fused.values()].sort((left, right) => right.score - left.score);
}
