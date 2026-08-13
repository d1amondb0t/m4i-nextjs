export type RetrievalConfiguration = {
  strategy: "dense" | "sparse" | "hybrid";
  topK : number; // default = 5
  denseCandidates: number // default = 20;
  sparseCandidates: number // default = 20; 
};

export type RerankingConfiguration = {
  enabled: boolean; // default = false
  strategy: "cross_encoder" | "lexical";
  model: string;
  candidates: number; // default = 20
};

export const DEFAULT_RETRIEVAL_CONFIGURATION = {
  strategy: "dense",
  topK: 5,
  denseCandidates: 20,
  sparseCandidates: 20,
} as const satisfies RetrievalConfiguration;

