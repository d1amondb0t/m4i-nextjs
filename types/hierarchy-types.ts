import type { SearchResult } from "@/app/server/rag/storage/storage-types";
import type { DocumentChunk } from "./chunk-type";
import type { RetrievalScores } from "./retrieval-types";

export const MAX_HIERARCHY_DIMENSIONS = 20;
export const MAX_HIERARCHY_CATEGORIES = 100;

export type FrameworkCategory = {
  id: string;
  name: string;
  definition: string;
  questions: string[];
  include?: string[];
  exclude?: string[];
};

export type FrameworkDimension = {
  id: string;
  name: string;
  definition: string;
  categories: FrameworkCategory[];
};

export type FrameworkOntology = {
  dimensions: FrameworkDimension[];
};

export type ExtractedHierarchyEvidence = {
  chunkId: string;
  quote: string;
};

export type ExtractedHierarchyMatch = {
  explicitness: "explicit" | "implicit";
  reason: string;
  evidence: ExtractedHierarchyEvidence[];
};

export type HierarchyRetrievedChunk = {
  chunkId: string;
  source: string;
  page: number;
  chunk: number;
  scores: RetrievalScores;
};

export type HierarchyEvidence = HierarchyRetrievedChunk & {
  quote: string;
};

export type HierarchyMatch = Omit<ExtractedHierarchyMatch, "evidence"> & {
  question: string;
  evidence: HierarchyEvidence[];
};

export type HierarchyCategoryResult = FrameworkCategory & {
  matches: HierarchyMatch[];
};

export type HierarchyDimensionResult = Omit<
  FrameworkDimension,
  "categories"
> & {
  categories: HierarchyCategoryResult[];
};

export type QuestionRetrieval = {
  question: string;
  results: SearchResult[];
};

export type HierarchyCategoryDiagnostics = {
  categoryId: string;
  retrievedChunks: number;
  matchedQuestions: number;
  matchedCandidates: number;
  questions: {
    question: string;
    retrievedChunks: number;
    chunks: HierarchyRetrievedChunk[];
    generatedCandidates: number;
    acceptedCandidates: number;
  }[];
  rejected: { question: string; reason: string }[];
};

export type HierarchyPipelineResult = {
  framework: {
    dimensions: HierarchyDimensionResult[];
  };
  diagnostics: HierarchyCategoryDiagnostics[];
  chunks: DocumentChunk[];
};

export type HierarchyConfiguration = {
  topKPerQuery: number;
  minimumRetrievalScore: number;
  maxContextWords: number;
  retrievalConcurrency: number;
  analysisConcurrency: number;
  analyzerContextTokens: number;
};

export const DEFAULT_HIERARCHY_CONFIGURATION = {
  topKPerQuery: 12,
  // Reranker probability floor. Rerankers separate relevant passages only
  // weakly on ontology questions, so this drops clear misses and leaves the
  // rest to the analyzer; 0.05 kept 94% of relevant top-12 chunks.
  // TODO (REVIEW minimumRetrievalScore)
  minimumRetrievalScore: 0.05,
  maxContextWords: 4_000,
  // Questions retrieved and analyzed at once. Ollama only runs them together
  // when OLLAMA_NUM_PARALLEL is at least this; beyond that they queue.
  retrievalConcurrency: 4,
  analysisConcurrency: 4,
  // Ollama's default context is 4,096 tokens on GPUs under 24 GB, which cuts
  // off a 4,000-word context. This covers it plus the prompt and the answer.
  analyzerContextTokens: 12_288,
} as const satisfies HierarchyConfiguration;

// zerank-2's probability, sigmoid(logit / 5), sits higher than mxbai's: 0.05
// keeps 99% of irrelevant chunks. 0.3 kept 97% of relevant top-12 chunks on the
// Claude-labelled dev split and dropped 28% of all chunks.
export const ZERANK_MINIMUM_RETRIEVAL_SCORE = 0.3;

export type HierarchyPipelineResponse =
  | {
      ok: true;
      indexedChunks: number;
      framework: HierarchyPipelineResult["framework"];
      diagnostics: HierarchyCategoryDiagnostics[];
    }
  | {
      ok: false;
      message: string;
    };
