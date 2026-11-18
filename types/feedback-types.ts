import type {
  AnswerBasis,
  IndicatorAnswerType,
  MatchGate,
  OutcomeHorizon,
} from "./indicator-types";
import type { PipelineStage } from "./progress-types";
import type { RetrievalScores } from "./retrieval-types";

export const RUN_MODES = ["rag", "ontology", "indicators"] as const;

export type RunMode = (typeof RUN_MODES)[number];

export type JobStatus = "queued" | "running" | "done" | "failed";

export type ChunkStatus = "sent" | "below_cutoff" | "outside_top_k";

export type RunItemKind =
  "rag_answer" | "ontology_match" | "document_indicator" | "indicator_answer";

export type IndicatorItemDetails =
  | { source: "document"; name: string }
  | {
      source: "predefined";
      indicatorId: string;
      name: string;
      question: string;
      answerType: IndicatorAnswerType;
      basis: AnswerBasis;
      confidence: "low" | "medium" | "high";
      rationale: string;
      groundingFailed: boolean;
    };

export type IndicatorRunSettings = {
  ontologyFile: string;
  gate: MatchGate;
  triggeredCategories: { categoryId: string; bestRerankerScore: number }[];
  skippedCategories: { categoryId: string; bestRerankerScore: number }[];
};

export type FeedbackTargetType = "run_item" | "run_chunk";

export type ItemVerdict = "accepted" | "rejected";

export type SentChunkVerdict = "relevant" | "irrelevant";

export type DroppedChunkVerdict = "should_have_been_used";

export type Verdict = ItemVerdict | SentChunkVerdict | DroppedChunkVerdict;

export type User = {
  id: number;
  name: string;
  collection: string;
  isAdmin: boolean;
  sessionVersion: number;
};

export type JobUpload = {
  file: string;
  name: string;
  type: string;
};

export type Job = {
  id: string;
  userId: number;
  mode: RunMode;
  status: JobStatus;
  question: string | null;
  uploads: JobUpload[];
  stage: PipelineStage | null;
  progressDone: number;
  progressTotal: number;
  error: string | null;
  runId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type JobStatusResponse =
  | {
      ok: true;
      job: Pick<
        Job,
        | "id"
        | "mode"
        | "status"
        | "progressDone"
        | "progressTotal"
        | "error"
        | "runId"
      > & { queuePosition: number };
    }
  | { ok: false; message: string };

export type CreateJobResponse =
  { ok: true; jobId: string } | { ok: false; message: string };

export type DocumentRecord = {
  documentId: string;
  userId: number;
  collection: string;
  fileName: string;
  sourceHash: string;
  indexFingerprint: string;
  chunkCount: number;
};

export type SnapshotChunkInput = {
  chunkId: string;
  documentId: string;
  source: string;
  page: number;
  chunkNumber: number;
  text: string;
  status: ChunkStatus;
  retrievalRank: number | null;
  rerankedRank: number | null;
  score: number;
  scores: RetrievalScores;
};

export type SnapshotItemInput = {
  kind: RunItemKind;
  answer: string;
  explicitness: "explicit" | "implicit" | null;
  indicator: IndicatorItemDetails | null;
  evidence: { chunkId: string; quote: string }[];
};

export type SnapshotQuestionInput = {
  dimensionId: string | null;
  dimensionName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryDefinition: string | null;
  question: string;
  horizon: OutcomeHorizon | null;
  nearestOntologyQuestion: string | null;
  nearestOntologySimilarity: number | null;
  items: SnapshotItemInput[];
  chunks: SnapshotChunkInput[];
};

export type RunSettings = Record<string, unknown>;

export type SnapshotInput = {
  runId: string;
  jobId: string;
  userId: number;
  collection: string;
  mode: RunMode;
  generationModel: string;
  rerankingModel: string;
  embeddingModel: string;
  settings: RunSettings;
  promptHash: string;
  documents: { documentId: string; fileName: string }[];
  questions: SnapshotQuestionInput[];
};

export type SnapshotChunk = Omit<SnapshotChunkInput, "documentId"> & {
  id: number;
  documentId: string;
};

export type SnapshotItem = {
  id: number;
  kind: RunItemKind;
  answer: string;
  explicitness: "explicit" | "implicit" | null;
  indicator: IndicatorItemDetails | null;
  evidence: { runChunkId: number; quote: string }[];
};

export type SnapshotQuestion = Omit<
  SnapshotQuestionInput,
  "items" | "chunks"
> & {
  id: number;
  items: SnapshotItem[];
  chunks: SnapshotChunk[];
};

export type QuoteSplit = { before: string; quote: string; after: string };

export type FeedbackEntry = {
  verdict: Verdict;
  comment: string;
  updatedAt: string;
};

export type RunSummary = {
  id: string;
  mode: RunMode;
  createdAt: string;
  generationModel: string;
  rerankingModel: string;
  embeddingModel: string;
  documents: string[];
  firstQuestion: string;
  items: number;
  reviewedItems: number;
};

export type RunSnapshot = {
  run: RunSummary & { settings: RunSettings };
  questions: SnapshotQuestion[];
  feedback: Record<string, FeedbackEntry>;
};

export type FeedbackRequest = {
  targetType: FeedbackTargetType;
  targetId: number;
  verdict: Verdict;
  comment?: string;
};

export type FeedbackResponse =
  { ok: true; feedback: FeedbackEntry | null } | { ok: false; message: string };

export type FeedbackTarget =
  | { targetType: "run_item"; runId: string }
  | { targetType: "run_chunk"; runId: string; status: ChunkStatus };
