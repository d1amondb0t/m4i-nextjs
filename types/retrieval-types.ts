import type { PreTrainedModel, PreTrainedTokenizer } from "@huggingface/transformers";

export type RetrievalConfiguration = {
  strategy: "dense" | "sparse" | "hybrid";
  topK : number; // default = 5
  denseCandidates: number; // default = 20
  sparseCandidates: number; // default = 20
};

export type RerankingConfiguration = {
  enabled: boolean;
  strategy: "cross_encoder" | "lexical";
  model: string;
  candidates: number; // default = 20
};

export type CrossEncoder = {
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer;
};

export const DEFAULT_RERANKING_CONFIGURATION = {
  enabled: false,
  strategy: "cross_encoder",
  model: "cross-encoder/ms-marco-MiniLM-L6-v2",
  candidates: 20,
} as const satisfies RerankingConfiguration;

export const DEFAULT_RETRIEVAL_CONFIGURATION = {
  strategy: "dense",
  topK: 5,
  denseCandidates: 20,
  sparseCandidates: 20,
} as const satisfies RetrievalConfiguration;