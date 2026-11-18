import type {
  ChunkStatus,
  FeedbackEntry,
  JobView,
  QuoteSplit,
  RunMode,
  SnapshotQuestion,
  Verdict,
} from "@/types/feedback-types";
import type { PipelineStage } from "@/types/progress-types";
import { feedbackKey } from "@/app/server/feedback/feedback-helper";

export const ACTIVE_JOB_KEY = "m4i.activeJob";

export const POLL_INTERVAL_MS = 3_000;

export const VERDICT_LABELS: Record<Verdict, string> = {
  accepted: "Accept",
  rejected: "Reject",
  relevant: "Relevant",
  irrelevant: "Irrelevant",
  should_have_been_used: "Should have been used",
};

export const CHUNK_STATUS_LABELS: Record<ChunkStatus, string> = {
  sent: "Sent to the model",
  below_cutoff: "Below the reranker cutoff",
  outside_top_k: "Outside the top ranked chunks",
};

export const MODE_LABELS: Record<
  RunMode,
  { title: string; running: string; items: string }
> = {
  rag: {
    title: "Your question",
    running: "Answering your question",
    items: "answer",
  },
  ontology: {
    title: "Ontology run",
    running: "Running the ontology",
    items: "matches",
  },
  indicators: {
    title: "Indicator outcomes",
    running: "Finding outcome indicators",
    items: "matches and indicators",
  },
};

const MODE_STAGES: Record<RunMode, readonly PipelineStage[]> = {
  rag: ["indexing", "retrieving", "answering"],
  ontology: ["indexing", "retrieving", "matching"],
  indicators: [
    "indexing",
    "retrieving",
    "matching",
    "indicator_retrieval",
    "indicator_analysis",
  ],
};

export const STAGE_LABELS: Record<
  PipelineStage,
  { label: string; unit: string | null }
> = {
  indexing: { label: "Reading and indexing your documents", unit: null },
  retrieving: {
    label: "Finding and reranking passages for each question",
    unit: "questions",
  },
  answering: { label: "Writing the answer", unit: null },
  matching: {
    label: "Matching passages to the framework",
    unit: "questions",
  },
  indicator_retrieval: {
    label: "Finding passages for each indicator",
    unit: "indicators",
  },
  indicator_analysis: {
    label: "Reading outcome indicators per category",
    unit: "categories",
  },
};

export type ReviewCounts = {
  items: number;
  reviewedItems: number;
  rejectedItems: number;
  labelledChunks: number;
};

export function sameOriginPath(next: string | null, origin: string): string {
  if (!next) return "/";

  // Parsing catches tricks such as "/\t/evil.com" and "/\evil.com".
  const target = new URL(next, origin);
  return target.origin === origin
    ? `${target.pathname}${target.search}${target.hash}`
    : "/";
}

export function countLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function itemKey(id: number): string {
  return feedbackKey("run_item", id);
}

export function chunkKey(id: number): string {
  return feedbackKey("run_chunk", id);
}

export function draftKey(key: string): string {
  return `m4i.draft.${key}`;
}

export function reviewCounts(
  questions: readonly SnapshotQuestion[],
  feedback: Readonly<Record<string, FeedbackEntry>>,
): ReviewCounts {
  const items = questions.flatMap((question) => question.items);
  const chunks = questions.flatMap((question) => question.chunks);

  return {
    items: items.length,
    reviewedItems: items.filter((item) => feedback[itemKey(item.id)]).length,
    rejectedItems: items.filter(
      (item) => feedback[itemKey(item.id)]?.verdict === "rejected",
    ).length,
    labelledChunks: chunks.filter((chunk) => feedback[chunkKey(chunk.id)])
      .length,
  };
}

export type CategoryGroup = {
  key: string;
  dimensionName: string;
  categoryName: string;
  categoryDefinition: string;
  questions: SnapshotQuestion[];
};

export function groupByCategory(
  questions: readonly SnapshotQuestion[],
): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();

  for (const question of questions) {
    const key = `${question.dimensionId}/${question.categoryId}`;
    const group = groups.get(key) ?? {
      key,
      dimensionName: question.dimensionName ?? "",
      categoryName: question.categoryName ?? "",
      categoryDefinition: question.categoryDefinition ?? "",
      questions: [],
    };
    group.questions.push(question);
    groups.set(key, group);
  }

  return [...groups.values()];
}

export function jobStep(job: JobView): string | null {
  if (!job.stage) return null;

  const stages = MODE_STAGES[job.mode];
  return `Step ${stages.indexOf(job.stage) + 1} of ${stages.length}`;
}

function stageDetail(job: JobView): string {
  const { label, unit } = STAGE_LABELS[job.stage!];
  return unit && job.progressTotal > 0
    ? `${label}: ${job.progressDone} of ${job.progressTotal} ${unit}`
    : label;
}

export function jobProgressLabel(job: JobView): string {
  if (job.status === "queued") {
    return job.queuePosition > 0
      ? `Waiting for ${job.queuePosition} run${job.queuePosition === 1 ? "" : "s"} ahead of yours.`
      : "Starting…";
  }

  if (job.status === "running") {
    return job.stage ? `${stageDetail(job)}.` : "Starting…";
  }

  if (job.status === "done") return "Done.";

  const error = job.error ?? "The run failed.";
  return job.stage
    ? `Failed while ${stageDetail(job).toLowerCase()}. ${error}`
    : error;
}

export function jobPercent(job: JobView): number {
  if (job.status === "done") return 100;
  if (!job.stage) return 0;

  const stages = MODE_STAGES[job.mode];
  const withinStage =
    job.progressTotal > 0 ? job.progressDone / job.progressTotal : 0;
  return Math.round(
    ((stages.indexOf(job.stage) + withinStage) / stages.length) * 100,
  );
}

export function isActiveJob(job: JobView): boolean {
  return job.status === "queued" || job.status === "running";
}

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked or full; drafts are a convenience only.
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitAroundQuote(
  text: string,
  quote: string,
): QuoteSplit | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const pattern = new RegExp(words.map(escapeRegExp).join("\\s+"), "i");
  const found = pattern.exec(text);
  if (!found) return null;

  return {
    before: text.slice(0, found.index),
    quote: found[0],
    after: text.slice(found.index + found[0].length),
  };
}
