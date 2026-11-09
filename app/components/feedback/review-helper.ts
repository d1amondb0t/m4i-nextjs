import type {
  ChunkStatus,
  FeedbackEntry,
  JobStatusResponse,
  SnapshotQuestion,
  Verdict,
} from "@/types/feedback-types";
import { feedbackKey } from "@/app/server/feedback/feedback-helper";

export const ACTIVE_JOB_KEY = "m4i.activeJob";

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

export function jobProgressLabel(
  job: Extract<JobStatusResponse, { ok: true }>["job"],
): string {
  if (job.status === "queued") {
    return job.queuePosition > 0
      ? `Waiting for ${job.queuePosition} run${job.queuePosition === 1 ? "" : "s"} ahead of yours.`
      : "Starting…";
  }

  if (job.status === "running") {
    return job.progressTotal > 0
      ? `${job.progressDone} of ${job.progressTotal} steps done.`
      : "Reading and indexing your documents…";
  }

  return job.status === "done" ? "Done." : (job.error ?? "The run failed.");
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
