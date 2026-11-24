import type { RagSource, RankChange } from "@/types/rag-pipeline-type";

import {
  changeAfterReranking,
  changeWithoutReranking,
  rerankingSummary,
} from "./reranking-comparison-helper";
import { RetrievalScoreList } from "./retrieval-score-list";

const TONE_STYLES = {
  gained: {
    card: "border-emerald-300 bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-800",
  },
  lost: {
    card: "border-red-300 bg-red-50",
    badge: "bg-red-100 text-red-800",
  },
  neutral: {
    card: "border-zinc-200 bg-zinc-50",
    badge: "bg-zinc-200 text-zinc-700",
  },
} as const satisfies Record<RankChange["tone"], object>;

function RankedSourceList({
  title,
  description,
  sources,
  rankOf,
  changeOf,
}: {
  title: string;
  description: string;
  sources: readonly RagSource[];
  rankOf: (source: RagSource) => number;
  changeOf: (source: RagSource) => RankChange;
}) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-semibold text-zinc-950">{title}</h4>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      <ol className="mt-3 space-y-3">
        {sources.map((source) => {
          const change = changeOf(source);
          const styles = TONE_STYLES[change.tone];

          return (
            <li
              key={`${source.source}-${source.page}-${source.chunk}`}
              className={`rounded-xl border p-4 ${styles.card}`}
            >
              <div className="flex items-start justify-between gap-2 text-xs text-zinc-500">
                <span className="min-w-0 break-words">
                  <span className="mr-1.5 font-semibold text-zinc-950">
                    #{rankOf(source)}
                  </span>
                  {source.source} · page {source.page} · chunk {source.chunk}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${styles.badge}`}
                >
                  {change.label}
                </span>
              </div>
              <div className="mt-2">
                <RetrievalScoreList scores={source.scores} />
              </div>
              <p className="mt-2 max-h-32 overflow-y-auto text-sm leading-6 text-zinc-700">
                {source.text}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function RerankingComparison({
  sources,
  withoutReranking,
  model,
  candidateCount,
}: {
  sources: readonly RagSource[];
  withoutReranking: readonly RagSource[];
  model: string;
  candidateCount: number;
}) {
  const topK = sources.length;

  return (
    <>
      <p className="mt-1 text-xs text-zinc-500">
        {model} reranked {candidateCount} candidates.{" "}
        {rerankingSummary(sources)}
      </p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <RankedSourceList
          title="Without reranking"
          description="What retrieval alone would have sent to the model."
          sources={withoutReranking}
          rankOf={(source) => source.retrievalRank}
          changeOf={(source) => changeWithoutReranking(source, topK)}
        />
        <RankedSourceList
          title="With reranking"
          description="What the model used for the answer above."
          sources={sources}
          rankOf={(source) => source.rerankedRank}
          changeOf={(source) => changeAfterReranking(source, topK)}
        />
      </div>
    </>
  );
}
