import type { RetrievalScores } from "@/types/retrieval-types";

const SCORE_FIELDS = [
  {
    key: "denseScore",
    label: "Dense",
    description:
      "Cosine similarity between the question and chunk embeddings. 1.000 means identical direction.",
  },
  {
    key: "sparseScore",
    label: "BM25",
    description:
      "Keyword match relative to the best match for this question. 1.000 is that best match, so compare it only within one question.",
  },
  {
    key: "rrfScore",
    label: "RRF",
    description:
      "Rank fusion of the dense and BM25 searches. 1.000 means ranked first by both.",
  },
  {
    key: "rerankerScore",
    label: "Rerank",
    description:
      "Cross-encoder relevance between the question and chunk, 0 to 1.",
  },
] as const;

export function RetrievalScoreList({ scores }: { scores: RetrievalScores }) {
  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-zinc-500">
      {SCORE_FIELDS.map(({ key, label, description }) => (
        <div key={key} className="flex gap-1" title={description}>
          <dt>{label}</dt>
          <dd className="font-medium text-zinc-700">
            {scores[key]?.toFixed(3) ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
