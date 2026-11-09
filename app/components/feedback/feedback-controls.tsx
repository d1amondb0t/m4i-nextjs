"use client";

import { useState, useSyncExternalStore } from "react";

import type { FeedbackTargetType, Verdict } from "@/types/feedback-types";
import {
  MAX_COMMENT_LENGTH,
  feedbackKey,
} from "@/app/server/feedback/feedback-helper";
import {
  VERDICT_LABELS,
  draftKey,
  readStorage,
  subscribeToStorage,
  writeStorage,
} from "./review-helper";
import type { FeedbackController } from "./use-feedback";

const VERDICT_STYLES: Record<Verdict, string> = {
  accepted: "border-emerald-600 bg-emerald-600 text-white",
  relevant: "border-emerald-600 bg-emerald-600 text-white",
  rejected: "border-rose-600 bg-rose-600 text-white",
  irrelevant: "border-rose-600 bg-rose-600 text-white",
  should_have_been_used: "border-amber-500 bg-amber-500 text-white",
};

type FeedbackControlsProps = {
  controller: FeedbackController;
  targetType: FeedbackTargetType;
  targetId: number;
  verdicts: readonly Verdict[];
  commentPrompt: string;
  alwaysShowComment?: boolean;
};

export function FeedbackControls({
  controller,
  targetType,
  targetId,
  verdicts,
  commentPrompt,
  alwaysShowComment = false,
}: FeedbackControlsProps) {
  const key = feedbackKey(targetType, targetId);
  const entry = controller.feedback[key];
  const saveState = controller.saveStates[key];
  const error = controller.errors[key];
  // An unsaved comment survives a reload through localStorage.
  const storedDraft = useSyncExternalStore(
    subscribeToStorage,
    () => readStorage(draftKey(key)),
    () => null,
  );
  const [editedComment, setEditedComment] = useState<string | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const comment = editedComment ?? storedDraft ?? entry?.comment ?? "";

  function changeComment(value: string) {
    setEditedComment(value);
    writeStorage(draftKey(key), value);
  }

  function discardDraft() {
    writeStorage(draftKey(key), null);
    setEditedComment(null);
  }

  async function choose(verdict: Verdict) {
    const saved =
      entry?.verdict === verdict
        ? await controller.clear(targetType, targetId)
        : await controller.save(targetType, targetId, verdict, comment);

    if (saved) discardDraft();
  }

  async function saveComment() {
    if (!entry || comment.trim() === entry.comment) return;
    if (await controller.save(targetType, targetId, entry.verdict, comment)) {
      discardDraft();
    }
  }

  const showComment =
    alwaysShowComment ||
    commentOpen ||
    Boolean(storedDraft || entry?.comment) ||
    entry?.verdict === "rejected";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {verdicts.map((verdict) => (
          <button
            key={verdict}
            type="button"
            onClick={() => choose(verdict)}
            aria-pressed={entry?.verdict === verdict}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              entry?.verdict === verdict
                ? VERDICT_STYLES[verdict]
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
            }`}
          >
            {VERDICT_LABELS[verdict]}
          </button>
        ))}
        {!showComment && (
          <button
            type="button"
            onClick={() => setCommentOpen(true)}
            className="text-xs text-zinc-500 underline-offset-2 hover:underline"
          >
            Add a comment
          </button>
        )}
        <span className="text-[11px] text-zinc-400" aria-live="polite">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : ""}
        </span>
      </div>
      {showComment && (
        <div>
          <textarea
            value={comment}
            onChange={(event) => changeComment(event.target.value)}
            onBlur={saveComment}
            maxLength={MAX_COMMENT_LENGTH}
            rows={2}
            placeholder={commentPrompt}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs leading-5 text-zinc-800 outline-none focus:border-blue-500"
          />
          {!entry && comment.trim() && (
            <p className="text-[11px] text-amber-700">
              Choose {verdicts.map((v) => VERDICT_LABELS[v]).join(" or ")} to
              save this comment.
            </p>
          )}
        </div>
      )}
      {error && <p className="text-[11px] text-rose-700">{error}</p>}
    </div>
  );
}
