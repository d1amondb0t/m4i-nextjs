import type {
  FrameworkCategory,
  FrameworkDimension,
  HierarchyEvidence,
  HierarchyMatch,
  HierarchyRetrievedChunk,
} from "./hierarchy-types";

export const OUTCOME_HORIZONS = [
  "short_term",
  "medium_term",
  "long_term",
] as const;

export type OutcomeHorizon = (typeof OUTCOME_HORIZONS)[number];

export const INDICATOR_ANSWER_TYPES = [
  "number",
  "percentage",
  "yes_no",
  "status",
  "text",
] as const;

export type IndicatorAnswerType = (typeof INDICATOR_ANSWER_TYPES)[number];

export type OntologyIndicator = {
  id: string;
  name: string;
  question: string;
  answerType: IndicatorAnswerType;
  unit?: string;
  options?: string[];
};

export type OntologyOutcome = {
  id: string;
  horizon: OutcomeHorizon;
  statement: string;
  indicators: OntologyIndicator[];
};

export type IndicatorCategory = FrameworkCategory & {
  outcomes: OntologyOutcome[];
};

export type IndicatorDimension = Omit<FrameworkDimension, "categories"> & {
  categories: IndicatorCategory[];
};

export type IndicatorOntology = {
  dimensions: IndicatorDimension[];
};

export type MatchGate = {
  minimumRerankerScore: number;
  requireExplicit: boolean;
  minimumMatches: number;
};

export const DEFAULT_MATCH_GATE = {
  minimumRerankerScore: 0.7,
  requireExplicit: false,
  minimumMatches: 1,
} as const satisfies MatchGate;

export type FallbackMode = "missing_horizons" | "always";

export type AnswerBatch = "outcome" | "indicator";

export type IndicatorConfiguration = {
  gate: MatchGate;
  fallback: FallbackMode;
  answerBatch: AnswerBatch;
  chunksPerIndicator: number;
  maxContextWords: number;
  analyzerContextTokens: number;
};

export const DEFAULT_INDICATOR_CONFIGURATION = {
  gate: DEFAULT_MATCH_GATE,
  fallback: "missing_horizons",
  answerBatch: "outcome",
  chunksPerIndicator: 4,
  maxContextWords: 3_000,
  analyzerContextTokens: 16_384,
} as const satisfies IndicatorConfiguration;

export type GatedCategory = {
  dimensionId: string;
  category: IndicatorCategory;
  matches: HierarchyMatch[];
  bestRerankerScore: number;
};

export type ExtractedDocumentIndicator = {
  horizon: OutcomeHorizon;
  name: string;
  value: string;
  chunkId: string;
  quote: string;
};

export type DocumentIndicator = Omit<
  ExtractedDocumentIndicator,
  "chunkId" | "quote"
> & {
  evidence: HierarchyEvidence;
};

export type AnswerBasis = "reported" | "inferred" | "unknown";

export type ExtractedIndicatorAnswer = {
  indicatorId: string;
  basis: AnswerBasis;
  answer: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  chunkId: string;
  quote: string;
};

export type IndicatorAnswer = Omit<
  ExtractedIndicatorAnswer,
  "chunkId" | "quote"
> & {
  indicator: OntologyIndicator;
  horizon: OutcomeHorizon;
  evidence: HierarchyEvidence | null;
  groundingFailed: boolean;
};

export type HorizonResult = {
  horizon: OutcomeHorizon;
  outcome: OntologyOutcome;
  documentIndicators: DocumentIndicator[];
  usedPredefined: boolean;
  answers: IndicatorAnswer[];
};

export type CategoryIndicatorResult = {
  dimensionId: string;
  categoryId: string;
  categoryName: string;
  triggeringMatches: HierarchyMatch[];
  bestRerankerScore: number;
  ungroundedDocumentIndicators: number;
  horizons: HorizonResult[];
};

export type IndicatorRetrieval = {
  indicatorId: string;
  chunks: HierarchyRetrievedChunk[];
};

export type IndicatorPipelineResult = {
  categories: CategoryIndicatorResult[];
  skippedCategories: { categoryId: string; bestRerankerScore: number }[];
};

export type IndicatorRunSummary = {
  file: string;
  variant: string;
  seconds: number;
};

export type IndicatorRunResponse =
  | {
      ok: true;
      indexedChunks: number;
      gate: MatchGate;
      result: IndicatorPipelineResult;
      seconds: { hierarchy: number; indicators: number };
    }
  | { ok: false; message: string };

export type SavedIndicatorRunResponse =
  | {
      ok: true;
      gate: MatchGate;
      run: IndicatorRunSummary & IndicatorPipelineResult;
    }
  | { ok: false; message: string };

export type SavedIndicatorRunListResponse =
  | { ok: true; runs: { variant: string; files: string[] }[] }
  | { ok: false; message: string };
