"use client";

import { useState } from "react";

import type {
  ChunkStatus,
  SnapshotChunk,
  SnapshotQuestion,
} from "@/types/feedback-types";
import { ChunkCard } from "./chunk-card";
import { EvidenceQuote } from "./evidence-quote";
import { FeedbackControls } from "./feedback-controls";
import { CHUNK_STATUS_LABELS } from "./review-helper";
import type { FeedbackController } from "./use-feedback";

function ChunkList({
  chunks,
  controller,
  citations,
}: {
  chunks: readonly SnapshotChunk[];
  controller: FeedbackController;
  citations: ReadonlyMap<number, number>;
}) {
  return (
    <ul className="space-y-2">
      {chunks.map((chunk) => (
        <ChunkCard
          key={chunk.id}
          chunk={chunk}
          controller={controller}
          citedBy={citations.get(chunk.id) ?? 0}
        />
      ))}
    </ul>
  );
}

function DroppedChunks({
  chunks,
  controller,
}: {
  chunks: readonly SnapshotChunk[];
  controller: FeedbackController;
}) {
  const [open, setOpen] = useState(false);
  const groups = (["below_cutoff", "outside_top_k"] as ChunkStatus[])
    .map((status) => ({
      status,
      chunks: chunks.filter((chunk) => chunk.status === status),
    }))
    .filter((group) => group.chunks.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-xs font-medium text-zinc-700 hover:text-zinc-950"
      >
        {open ? "▾" : "▸"} Not sent to the model ({chunks.length})
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-[11px] leading-5 text-zinc-500">
            These chunks were retrieved but dropped before the model saw them.
            Mark any that should have been used.
          </p>
          {groups.map((group) => (
            <section key={group.status}>
              <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {CHUNK_STATUS_LABELS[group.status]} ({group.chunks.length})
              </h5>
              <ChunkList
                chunks={group.chunks}
                controller={controller}
                citations={new Map()}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

type QuestionReviewProps = {
  question: SnapshotQuestion;
  controller: FeedbackController;
  answerLabel: string;
  emptyMessage: string;
};

export function QuestionReview({
  question,
  controller,
  answerLabel,
  emptyMessage,
}: QuestionReviewProps) {
  const sent = question.chunks.filter((chunk) => chunk.status === "sent");
  const dropped = question.chunks.filter((chunk) => chunk.status !== "sent");
  const citations = new Map<number, number>();
  const chunksById = new Map(question.chunks.map((chunk) => [chunk.id, chunk]));

  for (const item of question.items) {
    for (const evidence of item.evidence) {
      citations.set(
        evidence.runChunkId,
        (citations.get(evidence.runChunkId) ?? 0) + 1,
      );
    }
  }

  return (
    <div className="space-y-4">
      {question.items.length === 0 ? (
        <p className="rounded-xl bg-zinc-100 px-4 py-3 text-xs text-zinc-600">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-3">
          {question.items.map((item, index) => (
            <li
              key={item.id}
              className="rounded-xl border border-blue-200 bg-blue-50/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                  {answerLabel}
                  {question.items.length > 1 ? ` ${index + 1}` : ""}
                </p>
                {item.explicitness && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    {item.explicitness}
                  </span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-900">
                {item.answer}
              </p>
              {item.evidence.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-blue-100 pt-3">
                  {item.evidence.map((evidence) => (
                    <EvidenceQuote
                      key={`${evidence.runChunkId}-${evidence.quote}`}
                      quote={evidence.quote}
                      chunk={chunksById.get(evidence.runChunkId)}
                    />
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <FeedbackControls
                  controller={controller}
                  targetType="run_item"
                  targetId={item.id}
                  verdicts={["accepted", "rejected"]}
                  commentPrompt="What is wrong or missing? (optional)"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h4 className="mb-2 text-xs font-semibold text-zinc-700">
          Sent to the model ({sent.length})
        </h4>
        {sent.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No chunk passed retrieval for this question.
          </p>
        ) : (
          <ChunkList
            chunks={sent}
            controller={controller}
            citations={citations}
          />
        )}
      </section>

      <DroppedChunks chunks={dropped} controller={controller} />
    </div>
  );
}
