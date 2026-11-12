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
  droppedBelowCutoff: SearchResult[];
  droppedOutsideTopK: SearchResult[];
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
    candidates: number;
    droppedBelowCutoff: number;
    droppedOutsideTopK: number;
    generatedCandidates: number;
    acceptedCandidates: number;
  }[];
  rejected: { question: string; reason: string }[];
};

export type CategoryRetrievals = {
  dimensionId: string;
  categoryId: string;
  questions: QuestionRetrieval[];
};

export type HierarchyProgress = (done: number, total: number) => void;

export type HierarchyPipelineResult = {
  framework: {
    dimensions: HierarchyDimensionResult[];
  };
  diagnostics: HierarchyCategoryDiagnostics[];
  chunks: DocumentChunk[];
  retrievals: CategoryRetrievals[];
};

export type HierarchyConfiguration = {
  topKPerQuery: number;
  minimumRetrievalScore: number;
  retrievalScoreFloor: number;
  relativeRetrievalScore: number;
  maxContextWords: number;
};

export const DEFAULT_HIERARCHY_CONFIGURATION = {
  topKPerQuery: 12,
  // Reranker probability floor. Rerankers separate relevant passages only
  // weakly on ontology questions, so this drops clear misses and leaves the
  // rest to the analyzer; 0.05 kept 94% of relevant top-12 chunks.
  // TODO (REVIEW minimumRetrievalScore)
  minimumRetrievalScore: 0.05,
  retrievalScoreFloor: 0.05,
  relativeRetrievalScore: 0,
  maxContextWords: 4_000,
} as const satisfies HierarchyConfiguration;

// zerank-2's probability, sigmoid(logit / 5), sits higher than mxbai's: 0.05
// keeps 99% of irrelevant chunks. A fixed 0.3 kept 97% of relevant top-12
// chunks on the Claude-labelled dev split, but on indicator lists and web pages
// relevant chunks often rank first and still score 0.15-0.3. The cutoff is
// therefore 0.6 of the best score, kept between 0.15 and 0.3: it kept the same
// 97% on the dev and test splits and let 3-4 points more irrelevant chunks
// through.
export const ZERANK_RETRIEVAL_CUTOFF = {
  minimumRetrievalScore: 0.3,
  retrievalScoreFloor: 0.15,
  relativeRetrievalScore: 0.6,
} as const satisfies Partial<HierarchyConfiguration>;

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
