import type {
  FeedbackRequest,
  FeedbackTarget,
  FeedbackTargetType,
  Verdict,
} from "@/types/feedback-types";

export const MAX_COMMENT_LENGTH = 4_000;

const TARGET_TYPES: readonly FeedbackTargetType[] = ["run_item", "run_chunk"];

const VERDICTS: readonly Verdict[] = [
  "accepted",
  "rejected",
  "relevant",
  "irrelevant",
  "should_have_been_used",
];

export function allowedVerdicts(target: FeedbackTarget): readonly Verdict[] {
  if (target.targetType === "run_item") return ["accepted", "rejected"];
  return target.status === "sent"
    ? ["relevant", "irrelevant"]
    : ["should_have_been_used"];
}

export function parseFeedbackTarget(
  value: unknown,
): { targetType: FeedbackTargetType; targetId: number } | string {
  if (typeof value !== "object" || value === null) {
    return "Send feedback as a JSON object.";
  }

  const { targetType, targetId } = value as Record<string, unknown>;

  if (!TARGET_TYPES.includes(targetType as FeedbackTargetType)) {
    return "targetType must be run_item or run_chunk.";
  }

  if (!Number.isSafeInteger(targetId) || (targetId as number) <= 0) {
    return "targetId must be a positive integer.";
  }

  return {
    targetType: targetType as FeedbackTargetType,
    targetId: targetId as number,
  };
}

export function parseFeedbackRequest(value: unknown): FeedbackRequest | string {
  const target = parseFeedbackTarget(value);
  if (typeof target === "string") return target;

  const { verdict, comment } = value as Record<string, unknown>;

  if (!VERDICTS.includes(verdict as Verdict)) {
    return `verdict must be one of ${VERDICTS.join(", ")}.`;
  }

  if (comment !== undefined && typeof comment !== "string") {
    return "comment must be text.";
  }

  if (typeof comment === "string" && comment.length > MAX_COMMENT_LENGTH) {
    return `Comments must be ${MAX_COMMENT_LENGTH.toLocaleString()} characters or fewer.`;
  }

  return {
    ...target,
    verdict: verdict as Verdict,
    comment: typeof comment === "string" ? comment.trim() : "",
  };
}
