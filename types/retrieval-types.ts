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
  model: string;
  candidates: number; // default = 20
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
  // Best of four local cross-encoders on the ontology questions (AUC 0.63).
  model: "mixedbread-ai/mxbai-rerank-xsmall-v1",
  candidates: 20,
} as const satisfies RerankingConfiguration;

export const DEFAULT_RETRIEVAL_CONFIGURATION = {
  strategy: "hybrid",
  topK: 5,
  denseCandidates: 100,
  sparseCandidates: 100,
} as const satisfies RetrievalConfiguration;
