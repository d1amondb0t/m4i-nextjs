import type {
  PreTrainedModel,
  PreTrainedTokenizer,
} from "@huggingface/transformers";

export type RetrievalConfiguration = {
  strategy: "dense" | "sparse" | "hybrid";
  topK: number; // default = 5
  denseCandidates: number; // hybrid only; default = 100
  sparseCandidates: number; // hybrid only; default = 100
};

export type RerankingConfiguration = {
  enabled: boolean;
  strategy: "cross_encoder" | "lexical";
  runtime: "transformers" | "ollama"; // ollama: zerank-2 score-head model
  model: string;
  candidates: number; // default = 20
};

export type RetrievalScores = {
  denseScore: number | null;
  sparseScore: number | null;
  rrfScore: number | null;
  rerankerScore: number | null;
};

export type OllamaTokenLogprob = {
  token: string;
  logprob: number;
};

export type OllamaLogprobs = {
  logprobs?: { top_logprobs?: OllamaTokenLogprob[] }[];
};

export type RetrievalScope = {
  documentIds?: readonly string[];
  indexFingerprints?: readonly string[];
  /** Headers, footers and references are excluded unless this is true. */
  includeAuxiliary?: boolean;
};

export type CrossEncoder = {
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer;
};

export const DEFAULT_RERANKING_CONFIGURATION = {
  enabled: false,
  strategy: "cross_encoder",
  runtime: "transformers",
  // Best of four local cross-encoders on the ontology questions (AUC 0.63).
  model: "mixedbread-ai/mxbai-rerank-xsmall-v1",
  candidates: 20,
} as const satisfies RerankingConfiguration;

// zerank-2 still finds relevant chunks past the hybrid top 20: with 50
// candidates the hierarchy matcher made 47% more relevant matches than mxbai
// with 20 on two calibration batches, while mxbai with 50 made fewer.
export const ZERANK_RERANKING_CANDIDATES = 50;

export const DEFAULT_RETRIEVAL_CONFIGURATION = {
  strategy: "hybrid",
  topK: 5,
  denseCandidates: 100,
  sparseCandidates: 100,
} as const satisfies RetrievalConfiguration;
