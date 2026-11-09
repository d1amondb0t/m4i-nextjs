import type { DocumentChunk } from "@/types/chunk-type";
import type {
  ChunkStatus,
  DocumentRecord,
  SnapshotChunkInput,
  SnapshotQuestionInput,
  User,
} from "@/types/feedback-types";
import type {
  FrameworkOntology,
  HierarchyPipelineResult,
  QuestionRetrieval,
} from "@/types/hierarchy-types";
import type { RagPipelineResult } from "@/types/rag-pipeline-type";
import type { RerankedResult } from "@/types/retrieval-types";
import { retrievalScores } from "../rag/storage/storage-helper";
import type { SearchResult } from "../rag/storage/storage-types";

export type NearestOntologyQuestion = {
  question: string;
  similarity: number;
} | null;

function snapshotChunk(
  result: SearchResult,
  status: ChunkStatus,
  retrievalRank: number | null,
  rerankedRank: number | null,
): SnapshotChunkInput {
  return {
    chunkId: result.chunk.chunkId,
    documentId: result.chunk.documentId,
    source: result.chunk.source,
    page: result.chunk.page,
    chunkNumber: result.chunk.number,
    text: result.chunk.text,
    status,
    retrievalRank,
    rerankedRank,
    score: result.score,
    scores: retrievalScores(result),
  };
}

function rankedSnapshotChunk(result: RerankedResult, status: ChunkStatus) {
  return snapshotChunk(
    result,
    status,
    result.retrievalRank,
    result.rerankedRank,
  );
}

export function ragSnapshotQuestions(
  question: string,
  result: RagPipelineResult,
  nearest: NearestOntologyQuestion,
): SnapshotQuestionInput[] {
  return [
    {
      dimensionId: null,
      dimensionName: null,
      categoryId: null,
      categoryName: null,
      categoryDefinition: null,
      question: question.trim(),
      nearestOntologyQuestion: nearest?.question ?? null,
      nearestOntologySimilarity: nearest?.similarity ?? null,
      items: [
        {
          kind: "rag_answer",
          answer: result.answer,
          explicitness: null,
          evidence: [],
        },
      ],
      chunks: [
        ...result.results.map((chunk) => rankedSnapshotChunk(chunk, "sent")),
        ...result.outsideTopK.map((chunk) =>
          rankedSnapshotChunk(chunk, "outside_top_k"),
        ),
      ],
    },
  ];
}

function questionChunks(retrieval: QuestionRetrieval): SnapshotChunkInput[] {
  // The three lists come from one reranked list, in this order.
  const ordered: [SearchResult, ChunkStatus][] = [
    ...retrieval.results.map((r) => [r, "sent"] as [SearchResult, ChunkStatus]),
    ...retrieval.droppedBelowCutoff.map(
      (r) => [r, "below_cutoff"] as [SearchResult, ChunkStatus],
    ),
    ...retrieval.droppedOutsideTopK.map(
      (r) => [r, "outside_top_k"] as [SearchResult, ChunkStatus],
    ),
  ];
  const rerankedRanks = new Map(
    [...ordered]
      .sort(([a], [b]) => b.score - a.score)
      .map(([result], index) => [result.chunk.chunkId, index + 1]),
  );

  return ordered.map(([result, status]) =>
    snapshotChunk(
      result,
      status,
      null,
      rerankedRanks.get(result.chunk.chunkId)!,
    ),
  );
}

export function ontologySnapshotQuestions(
  ontology: FrameworkOntology,
  result: HierarchyPipelineResult,
): SnapshotQuestionInput[] {
  const retrievals = new Map(
    result.retrievals.map((category) => [category.categoryId, category]),
  );
  const categories = new Map(
    result.framework.dimensions.flatMap((dimension) =>
      dimension.categories.map((category) => [category.id, category]),
    ),
  );

  return ontology.dimensions.flatMap((dimension) =>
    dimension.categories.flatMap((category) => {
      const questionRetrievals = retrievals.get(category.id)?.questions ?? [];
      const matches = categories.get(category.id)?.matches ?? [];

      return questionRetrievals.map((retrieval) => ({
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        categoryId: category.id,
        categoryName: category.name,
        categoryDefinition: category.definition,
        question: retrieval.question,
        nearestOntologyQuestion: null,
        nearestOntologySimilarity: null,
        items: matches
          .filter((match) => match.question === retrieval.question)
          .map((match) => ({
            kind: "ontology_match" as const,
            answer: match.reason,
            explicitness: match.explicitness,
            evidence: match.evidence.map(({ chunkId, quote }) => ({
              chunkId,
              quote,
            })),
          })),
        chunks: questionChunks(retrieval),
      }));
    }),
  );
}

export function runDocuments(
  chunks: readonly DocumentChunk[],
): { documentId: string; fileName: string }[] {
  const documents = new Map<string, string>();

  for (const chunk of chunks) {
    documents.set(chunk.documentId, chunk.source);
  }

  return [...documents].map(([documentId, fileName]) => ({
    documentId,
    fileName,
  }));
}

export function documentRecords(
  chunks: readonly DocumentChunk[],
  user: User,
): DocumentRecord[] {
  const records = new Map<string, DocumentRecord>();

  for (const chunk of chunks) {
    const key = `${chunk.documentId}:${chunk.metadata.indexFingerprint}`;
    const record = records.get(key);

    if (record) {
      record.chunkCount += 1;
      continue;
    }

    records.set(key, {
      documentId: chunk.documentId,
      userId: user.id,
      collection: user.collection,
      fileName: chunk.source,
      sourceHash: chunk.sourceHash,
      indexFingerprint: chunk.metadata.indexFingerprint,
      chunkCount: 1,
    });
  }

  return [...records.values()];
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export function nearestQuestion(
  vector: readonly number[],
  questions: readonly { question: string; vector: readonly number[] }[],
): NearestOntologyQuestion {
  let best: NearestOntologyQuestion = null;

  for (const candidate of questions) {
    const similarity = cosineSimilarity(vector, candidate.vector);
    if (!best || similarity > best.similarity) {
      best = { question: candidate.question, similarity };
    }
  }

  return best;
}

export function ontologyQuestions(ontology: FrameworkOntology): string[] {
  return [
    ...new Set(
      ontology.dimensions.flatMap((dimension) =>
        dimension.categories.flatMap((category) => category.questions),
      ),
    ),
  ];
}
