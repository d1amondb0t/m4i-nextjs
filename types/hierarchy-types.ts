import type { DocumentChunk } from "./chunk-type";

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

export type HierarchyEvidence = {
  chunkId: string;
  source: string;
  page: number;
  chunk: number;
  retrievalScore: number;
  quote: string;
};

export type HierarchyMatch = Omit<ExtractedHierarchyMatch, "evidence"> & {
  question: string;
  evidence: HierarchyEvidence[];
};

export type HierarchyCategoryResult = FrameworkCategory & {
  matches: HierarchyMatch[];
};

export type HierarchyDimensionResult = Omit<FrameworkDimension, "categories"> & {
  categories: HierarchyCategoryResult[];
};

export type HierarchyCategoryDiagnostics = {
  categoryId: string;
  retrievedChunks: number;
  matchedQuestions: number;
  matchedCandidates: number;
  questions: {
    question: string;
    retrievedChunks: number;
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
};

export const DEFAULT_HIERARCHY_CONFIGURATION = {
  topKPerQuery: 12,
  minimumRetrievalScore: 0.45,
  maxContextWords: 4_000,
} as const satisfies HierarchyConfiguration;

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
