import type { SearchResult } from "@/app/server/rag/storage/storage-types";
import type { PreTrainedModel, PreTrainedTokenizer } from "@huggingface/transformers";

export type RetrievalConfiguration = {
  strategy: "dense" | "sparse" | "hybrid";
  topK : number; // default = 5
  denseCandidates: number; // default = 20
  sparseCandidates: number; // default = 20
  /** RRF smoothing constant for the hybrid strategy. Defaults to 60. */
  rrfK?: number;
};

export type RerankingConfiguration = {
  enabled: boolean;
  strategy: "cross_encoder" | "lexical" | "llm_pointwise" | "llm_listwise";
  model: string;
  candidates: number; // default = 20
  /**
   * Words of each passage shown to an LLM reranker. Listwise puts every
   * candidate in one prompt, so full chunks overflow a usable context.
   */
  llmPassageWords?: number;
};

export type CrossEncoder = {
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer;
};

/**
 * Experimental default from `npm run experiment`.
 * The primary relevance judge uses this same model, so measured improvements
 * may reflect shared model preferences. Ratings are not calibrated probabilities.
 * See calibration/results/review/report.md for the independent audit.
 */
export const DEFAULT_RERANKING_CONFIGURATION = {
  enabled: true,
  strategy: "llm_pointwise",
  model: "qwen3.5:9b-q4_K_M",
  candidates: 20,
  llmPassageWords: 220,
} as const satisfies RerankingConfiguration;

/**
 * Hybrid by default: across the 48-configuration first-stage grid, RRF fusion
 * averaged 54.9% nDCG@10 against 50.9% for dense and 51.0% for BM25 alone.
 * BM25 matching dense is itself the reason to fuse — they fail on different
 * questions, and the sparse vectors were already being written to Qdrant.
 */
export const DEFAULT_RETRIEVAL_CONFIGURATION = {
  strategy: "hybrid",
  topK: 5,
  denseCandidates: 20,
  sparseCandidates: 20,
} as const satisfies RetrievalConfiguration;

/**
 * Corrective-RAG style verdict for a retrieved candidate set.
 *
 * `accept`    at least one candidate scores at or above the accept threshold.
 * `ambiguous` nothing clears the accept threshold, but the best candidate is
 *             still above the reject threshold, so the caller should widen or
 *             corroborate rather than answer confidently.
 * `reject`    nothing clears the reject threshold; the retrieval carries no
 *             usable evidence and the caller should abstain.
 */
export type RetrievalDecision = "accept" | "ambiguous" | "reject";

export type AdaptiveRetrievalConfiguration = {
  /** Score at or above which a candidate is automatically accepted. */
  acceptThreshold: number;
  /** Score below which a candidate is automatically rejected. */
  rejectThreshold: number;
  /** Never return fewer than this many chunks for a non-rejected question. */
  minimumK: number;
  /** Never return more than this many chunks. */
  maximumK: number;
  /**
   * Stop extending k once a candidate scores below this fraction of the top
   * score, which trims the flat tail that follows a strong match.
   */
  relativeDropoff: number;
};

export type AdaptiveSelection = {
  decision: RetrievalDecision;
  k: number;
  topScore: number;
  aboveAccept: number;
  aboveReject: number;
  selected: SearchResult[];
};

/**
 * Historical exploratory settings from stage5-operating-point.json. That sweep
 * selected its winning bounds on the evaluation split, so its reported gain is
 * not an untouched held-out estimate. See calibration/results/review/report.md.
 *
 * These thresholds are on the pointwise LLM rating scale, which is quantised to
 * tenths. They are NOT transferable to a cross-encoder score, and must be
 * re-fitted (`npm run experiment`) after any change to the reranker.
 *
 * These are selection heuristics, not a conformal evidence-recall guarantee.
 * The application pipelines do not currently call adaptiveSelect.
 */
export const DEFAULT_ADAPTIVE_RETRIEVAL_CONFIGURATION = {
  acceptThreshold: 0.7,
  rejectThreshold: 0.6,
  minimumK: 1,
  maximumK: 8,
  relativeDropoff: 0.01,
} as const satisfies AdaptiveRetrievalConfiguration;
