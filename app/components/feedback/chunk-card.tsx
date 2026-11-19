"use client";

import { useState } from "react";

import type { SnapshotChunk } from "@/types/feedback-types";
import { RetrievalScoreList } from "../retrieval-score-list";
import { FeedbackControls } from "./feedback-controls";
import type { FeedbackController } from "./use-feedback";

type ChunkCardProps = {
  chunk: SnapshotChunk;
  controller: FeedbackController;
  citedBy: number;
};

export function ChunkCard({ chunk, controller, citedBy }: ChunkCardProps) {
  const [expanded, setExpanded] = useState(false);
  const sent = chunk.status === "sent";

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-zinc-700">
          {chunk.source} · page {chunk.page} · chunk {chunk.chunkNumber}
          {chunk.rerankedRank !== null && (
            <span className="ml-2 text-zinc-400">
              rank {chunk.rerankedRank}
            </span>
          )}
        </p>
        {citedBy > 0 && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            Cited as evidence
          </span>
        )}
      </div>
      <p
        className={`mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-600 ${
          expanded ? "" : "line-clamp-4"
        }`}
      >
        {chunk.text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-1 text-[11px] font-medium text-blue-700 hover:text-blue-900"
      >
        {expanded ? "Show less" : "Show full chunk"}
      </button>
      <div className="mt-2">
        <RetrievalScoreList scores={chunk.scores} />
      </div>
      <div className="mt-3">
        <FeedbackControls
          controller={controller}
          targetType="run_chunk"
          targetId={chunk.id}
          verdicts={
            sent ? ["relevant", "irrelevant"] : ["should_have_been_used"]
          }
          commentPrompt={
            sent
              ? "Optional: why is this chunk relevant or not?"
              : "Optional: what does this chunk add?"
          }
        />
      </div>
    </li>
  );
}
