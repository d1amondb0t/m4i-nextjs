import type { RetrievalScores } from "@/types/retrieval-types";

const SCORE_FIELDS = [
  {
    key: "denseScore",
    label: "Dense",
    digits: 3,
    description: "Cosine similarity between the question and chunk embeddings.",
  },
  {
    key: "sparseScore",
    label: "BM25",
    digits: 3,
    description: "Keyword match score. It has no fixed upper limit.",
  },
  {
    key: "rrfScore",
    label: "RRF",
    digits: 4,
    description:
      "Reciprocal rank fusion of the dense and BM25 rankings. At most about 0.033.",
  },
  {
    key: "rerankerScore",
    label: "Rerank",
    digits: 3,
    description:
      "Cross-encoder relevance between the question and chunk, 0 to 1.",
  },
] as const;

export function RetrievalScoreList({ scores }: { scores: RetrievalScores }) {
  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-zinc-500">
      {SCORE_FIELDS.map(({ key, label, digits, description }) => (
        <div key={key} className="flex gap-1" title={description}>
          <dt>{label}</dt>
          <dd className="font-medium text-zinc-700">
            {scores[key]?.toFixed(digits) ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
