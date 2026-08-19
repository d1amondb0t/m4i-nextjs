import type { DocumentChunk } from "./chunk-type";

export const MAX_HIERARCHY_DIMENSIONS = 20;
export const MAX_HIERARCHY_CATEGORIES = 100;

export type FrameworkCategory = {
  id: string;
  name: string;
  definition: string;
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

export type HierarchyItemKind = "outcome" | "indicator";
export type HierarchyItemExplicitness = "explicit" | "derived";

export type ExtractedHierarchyEvidence = {
  chunkId: string;
  quote: string;
};

export type ExtractedHierarchyCandidate = {
  id: string;
  kind: HierarchyItemKind;
  text: string;
  explicitness: HierarchyItemExplicitness;
  evidence: ExtractedHierarchyEvidence[];
};

export type HierarchyValidation = {
  candidateId: string;
  categoryFit: number;
  typeFit: number;
  evidenceSupport: number;
  specificity: number;
  reason: string;
};

export type HierarchyAssessment = Omit<HierarchyValidation, "candidateId"> & {
  accepted: boolean;
};

export type HierarchyEvidence = {
  chunkId: string;
  source: string;
  page: number;
  chunk: number;
  retrievalScore: number;
  quote: string;
};

export type HierarchyItem = {
  text: string;
  explicitness: HierarchyItemExplicitness;
  evidence: HierarchyEvidence[];
  assessment: HierarchyAssessment;
};

export type HierarchyCategoryResult = FrameworkCategory & {
  outcomes: HierarchyItem[];
  indicators: HierarchyItem[];
};

export type HierarchyDimensionResult = Omit<FrameworkDimension, "categories"> & {
  categories: HierarchyCategoryResult[];
};

export type HierarchyRejection = {
  candidateId: string;
  text: string;
  reason: string;
};

export type HierarchyCategoryDiagnostics = {
  categoryId: string;
  outcomeQuery: string;
  indicatorQuery: string;
  retrievedChunks: number;
  extractedCandidates: number;
  acceptedCandidates: number;
  rejected: HierarchyRejection[];
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
  minimumCategoryFit: number;
  minimumTypeFit: number;
  minimumEvidenceSupport: number;
  minimumSpecificity: number;
  maxContextWords: number;
};

export const DEFAULT_HIERARCHY_CONFIGURATION = {
  topKPerQuery: 12,
  minimumRetrievalScore: 0.45,
  minimumCategoryFit: 0.7,
  minimumTypeFit: 0.7,
  minimumEvidenceSupport: 0.8,
  minimumSpecificity: 0.6,
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
