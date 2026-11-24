import type {
  HierarchyCategoryDiagnostics,
  HierarchyRetrievedChunk,
} from "@/types/hierarchy-types";
import { RetrievalScoreList } from "./retrieval-score-list";

type QuestionDiagnostics = HierarchyCategoryDiagnostics["questions"][number];

function ChunkRows({ chunks }: { chunks: readonly HierarchyRetrievedChunk[] }) {
  return (
    <ul className="mt-1 space-y-1 border-l border-zinc-100 pl-3">
      {chunks.map((chunk) => (
        <li key={chunk.chunkId}>
          <p className="text-zinc-400">
            {chunk.source} · page {chunk.page} · chunk {chunk.chunk}
          </p>
          <RetrievalScoreList scores={chunk.scores} />
        </li>
      ))}
    </ul>
  );
}

function DroppedChunks({
  label,
  chunks,
}: {
  label: string;
  chunks: readonly HierarchyRetrievedChunk[];
}) {
  if (chunks.length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-zinc-500">
        Dropped: {label} ({chunks.length})
      </summary>
      <ChunkRows chunks={chunks} />
    </details>
  );
}

export function HierarchyQuestionFunnel({
  question,
}: {
  question: QuestionDiagnostics;
}) {
  const topRanked = question.chunks.length + question.droppedBelowCutoff.length;
  const cutoff = question.cutoff.toFixed(3);

  return (
    <li>
      <p className="font-medium text-zinc-800">{question.question}</p>
      <p className="mt-0.5 text-zinc-500">
        {question.candidates} candidates → {topRanked} top ranked →{" "}
        {question.retrievedChunks} above the {cutoff} cutoff →{" "}
        {question.generatedCandidates} proposed → {question.acceptedCandidates}{" "}
        retained
      </p>
      {question.chunks.length > 0 && (
        <div className="mt-2">
          <p className="text-zinc-500">
            Sent to analyzer ({question.chunks.length})
          </p>
          <ChunkRows chunks={question.chunks} />
        </div>
      )}
      <DroppedChunks
        label={`below the ${cutoff} cutoff`}
        chunks={question.droppedBelowCutoff}
      />
      <DroppedChunks
        label={`outside the top ${topRanked}`}
        chunks={question.droppedOutsideTopK}
      />
    </li>
  );
}
