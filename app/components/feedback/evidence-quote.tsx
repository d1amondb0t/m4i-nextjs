"use client";

import { useState } from "react";

import type { SnapshotChunk } from "@/types/feedback-types";
import { RetrievalScoreList } from "../retrieval-score-list";
import { splitAroundQuote } from "./review-helper";

function FullChunk({ text, quote }: { text: string; quote: string }) {
  const split = splitAroundQuote(text, quote);

  return (
    <p className="mt-2 whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-600">
      {split ? (
        <>
          {split.before}
          <mark className="rounded bg-yellow-100 px-0.5 text-zinc-900">
            {split.quote}
          </mark>
          {split.after}
        </>
      ) : (
        text
      )}
    </p>
  );
}

export function EvidenceQuote({
  quote,
  chunk,
}: {
  quote: string;
  chunk: SnapshotChunk | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="text-xs leading-5 text-zinc-700">
      <p>&ldquo;{quote}&rdquo;</p>
      {chunk && (
        <>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-[11px]">
            <span className="text-zinc-500">
              {chunk.source} · page {chunk.page} · chunk {chunk.chunkNumber}
              {chunk.rerankedRank !== null && (
                <span className="ml-2 text-zinc-400">
                  rank {chunk.rerankedRank}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="font-medium text-blue-700 hover:text-blue-900"
            >
              {expanded ? "▾ Hide full chunk" : "▸ Show full chunk"}
            </button>
          </div>
          <div className="mt-1">
            <RetrievalScoreList scores={chunk.scores} />
          </div>
          {expanded && <FullChunk text={chunk.text} quote={quote} />}
        </>
      )}
    </li>
  );
}
