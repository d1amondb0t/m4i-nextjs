import type { DatabaseSync } from "node:sqlite";

import type {
  ChunkStatus,
  FeedbackTarget,
  FeedbackTargetType,
  RunSnapshot,
  RunSummary,
  SnapshotChunk,
  SnapshotInput,
  SnapshotItem,
  SnapshotQuestion,
} from "@/types/feedback-types";
import { now, transaction } from "./database.ts";
import { feedbackForRun } from "./feedback-repository.ts";

type RunSummaryRow = {
  id: string;
  mode: RunSummary["mode"];
  created_at: string;
  generation_model: string;
  reranking_model: string;
  embedding_model: string;
  settings_json: string;
  documents: string | null;
  first_question: string | null;
  items: number;
  reviewed_items: number;
};

type QuestionRow = {
  id: number;
  dimension_id: string | null;
  dimension_name: string | null;
  category_id: string | null;
  category_name: string | null;
  category_definition: string | null;
  question: string;
  nearest_ontology_question: string | null;
  nearest_ontology_similarity: number | null;
};

type ItemRow = {
  id: number;
  run_question_id: number;
  kind: SnapshotItem["kind"];
  answer: string;
  explicitness: SnapshotItem["explicitness"];
};

type ChunkRow = {
  id: number;
  run_question_id: number;
  chunk_id: string;
  document_id: string;
  source: string;
  page: number;
  chunk_number: number;
  text: string;
  status: ChunkStatus;
  retrieval_rank: number | null;
  reranked_rank: number | null;
  score: number;
  dense_score: number | null;
  sparse_score: number | null;
  rrf_score: number | null;
  reranker_score: number | null;
};

type EvidenceRow = {
  run_item_id: number;
  run_chunk_id: number;
  quote: string;
};

const RUN_SUMMARY_SELECT = `
  SELECT r.id, r.mode, r.created_at, r.generation_model, r.reranking_model,
         r.embedding_model, r.settings_json,
         (SELECT group_concat(file_name, '\u001f') FROM run_documents WHERE run_id = r.id) AS documents,
         (SELECT question FROM run_questions WHERE run_id = r.id ORDER BY position LIMIT 1) AS first_question,
         (SELECT COUNT(*) FROM run_items WHERE run_id = r.id) AS items,
         (SELECT COUNT(*) FROM feedback f
            WHERE f.run_id = r.id AND f.user_id = r.user_id AND f.target_type = 'run_item') AS reviewed_items
  FROM runs r`;

function toRunSummary(row: RunSummaryRow): RunSummary {
  return {
    id: row.id,
    mode: row.mode,
    createdAt: row.created_at,
    generationModel: row.generation_model,
    rerankingModel: row.reranking_model,
    embeddingModel: row.embedding_model,
    documents: row.documents ? row.documents.split("\u001f") : [],
    firstQuestion: row.first_question ?? "",
    items: row.items,
    reviewedItems: row.reviewed_items,
  };
}

function toSnapshotChunk(row: ChunkRow): SnapshotChunk {
  return {
    id: row.id,
    chunkId: row.chunk_id,
    documentId: row.document_id,
    source: row.source,
    page: row.page,
    chunkNumber: row.chunk_number,
    text: row.text,
    status: row.status,
    retrievalRank: row.retrieval_rank,
    rerankedRank: row.reranked_rank,
    score: row.score,
    scores: {
      denseScore: row.dense_score,
      sparseScore: row.sparse_score,
      rrfScore: row.rrf_score,
      rerankerScore: row.reranker_score,
    },
  };
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();

  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }

  return groups;
}

function insertRun(db: DatabaseSync, input: SnapshotInput): void {
  db.prepare(
    `INSERT INTO runs (id, job_id, user_id, collection, mode, generation_model,
       reranking_model, embedding_model, settings_json, prompt_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.runId,
    input.jobId,
    input.userId,
    input.collection,
    input.mode,
    input.generationModel,
    input.rerankingModel,
    input.embeddingModel,
    JSON.stringify(input.settings),
    input.promptHash,
    now(),
  );

  const documentStatement = db.prepare(
    "INSERT OR IGNORE INTO run_documents (run_id, document_id, file_name) VALUES (?, ?, ?)",
  );
  for (const document of input.documents) {
    documentStatement.run(input.runId, document.documentId, document.fileName);
  }
}

function insertQuestions(db: DatabaseSync, input: SnapshotInput): void {
  const questionStatement = db.prepare(
    `INSERT INTO run_questions (run_id, position, dimension_id, dimension_name,
       category_id, category_name, category_definition, question,
       nearest_ontology_question, nearest_ontology_similarity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const chunkStatement = db.prepare(
    `INSERT INTO run_chunks (run_id, run_question_id, position, chunk_id, document_id,
       source, page, chunk_number, text, status, retrieval_rank, reranked_rank,
       score, dense_score, sparse_score, rrf_score, reranker_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const itemStatement = db.prepare(
    `INSERT INTO run_items (run_id, run_question_id, position, kind, answer, explicitness)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const evidenceStatement = db.prepare(
    "INSERT INTO run_evidence (run_item_id, run_chunk_id, position, quote) VALUES (?, ?, ?, ?)",
  );

  input.questions.forEach((question, questionPosition) => {
    const questionId = Number(
      questionStatement.run(
        input.runId,
        questionPosition,
        question.dimensionId,
        question.dimensionName,
        question.categoryId,
        question.categoryName,
        question.categoryDefinition,
        question.question,
        question.nearestOntologyQuestion,
        question.nearestOntologySimilarity,
      ).lastInsertRowid,
    );

    const runChunkIds = new Map<string, number>();
    question.chunks.forEach((chunk, chunkPosition) => {
      if (runChunkIds.has(chunk.chunkId)) return;

      const { lastInsertRowid } = chunkStatement.run(
        input.runId,
        questionId,
        chunkPosition,
        chunk.chunkId,
        chunk.documentId,
        chunk.source,
        chunk.page,
        chunk.chunkNumber,
        chunk.text,
        chunk.status,
        chunk.retrievalRank,
        chunk.rerankedRank,
        chunk.score,
        chunk.scores.denseScore,
        chunk.scores.sparseScore,
        chunk.scores.rrfScore,
        chunk.scores.rerankerScore,
      );
      runChunkIds.set(chunk.chunkId, Number(lastInsertRowid));
    });

    question.items.forEach((item, itemPosition) => {
      const itemId = Number(
        itemStatement.run(
          input.runId,
          questionId,
          itemPosition,
          item.kind,
          item.answer,
          item.explicitness,
        ).lastInsertRowid,
      );

      item.evidence.forEach((evidence, evidencePosition) => {
        const runChunkId = runChunkIds.get(evidence.chunkId);

        if (runChunkId === undefined) {
          throw new Error(
            `Evidence cites chunk ${evidence.chunkId}, which is not in the snapshot for "${question.question}".`,
          );
        }

        evidenceStatement.run(
          itemId,
          runChunkId,
          evidencePosition,
          evidence.quote,
        );
      });
    });
  });
}

export function insertSnapshot(db: DatabaseSync, input: SnapshotInput): void {
  insertRun(db, input);
  insertQuestions(db, input);
}

export function saveSnapshot(db: DatabaseSync, input: SnapshotInput): void {
  transaction(db, () => insertSnapshot(db, input));
}

export function listRuns(db: DatabaseSync, userId: number): RunSummary[] {
  return (
    db
      .prepare(
        `${RUN_SUMMARY_SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC`,
      )
      .all(userId) as RunSummaryRow[]
  ).map(toRunSummary);
}

export function loadSnapshot(
  db: DatabaseSync,
  runId: string,
  userId: number,
): RunSnapshot | null {
  const runRow = db
    .prepare(`${RUN_SUMMARY_SELECT} WHERE r.id = ? AND r.user_id = ?`)
    .get(runId, userId) as RunSummaryRow | undefined;

  if (!runRow) return null;

  const questionRows = db
    .prepare("SELECT * FROM run_questions WHERE run_id = ? ORDER BY position")
    .all(runId) as QuestionRow[];
  const itemsByQuestion = groupBy(
    db
      .prepare("SELECT * FROM run_items WHERE run_id = ? ORDER BY position")
      .all(runId) as ItemRow[],
    (row) => row.run_question_id,
  );
  const chunksByQuestion = groupBy(
    db
      .prepare("SELECT * FROM run_chunks WHERE run_id = ? ORDER BY position")
      .all(runId) as ChunkRow[],
    (row) => row.run_question_id,
  );
  const evidenceByItem = groupBy(
    db
      .prepare(
        `SELECT e.run_item_id, e.run_chunk_id, e.quote FROM run_evidence e
         JOIN run_items i ON i.id = e.run_item_id
         WHERE i.run_id = ? ORDER BY e.position`,
      )
      .all(runId) as EvidenceRow[],
    (row) => row.run_item_id,
  );

  const questions: SnapshotQuestion[] = questionRows.map((row) => ({
    id: row.id,
    dimensionId: row.dimension_id,
    dimensionName: row.dimension_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryDefinition: row.category_definition,
    question: row.question,
    nearestOntologyQuestion: row.nearest_ontology_question,
    nearestOntologySimilarity: row.nearest_ontology_similarity,
    items: (itemsByQuestion.get(row.id) ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      answer: item.answer,
      explicitness: item.explicitness,
      evidence: (evidenceByItem.get(item.id) ?? []).map((evidence) => ({
        runChunkId: evidence.run_chunk_id,
        quote: evidence.quote,
      })),
    })),
    chunks: (chunksByQuestion.get(row.id) ?? []).map(toSnapshotChunk),
  }));

  return {
    run: {
      ...toRunSummary(runRow),
      settings: JSON.parse(runRow.settings_json) as Record<string, unknown>,
    },
    questions,
    feedback: feedbackForRun(db, runId, userId),
  };
}

export function findFeedbackTarget(
  db: DatabaseSync,
  targetType: FeedbackTargetType,
  targetId: number,
  userId: number,
): FeedbackTarget | null {
  if (targetType === "run_item") {
    const row = db
      .prepare(
        `SELECT i.run_id FROM run_items i JOIN runs r ON r.id = i.run_id
         WHERE i.id = ? AND r.user_id = ?`,
      )
      .get(targetId, userId) as { run_id: string } | undefined;

    return row ? { targetType, runId: row.run_id } : null;
  }

  const row = db
    .prepare(
      `SELECT c.run_id, c.status FROM run_chunks c JOIN runs r ON r.id = c.run_id
       WHERE c.id = ? AND r.user_id = ?`,
    )
    .get(targetId, userId) as
    { run_id: string; status: ChunkStatus } | undefined;

  return row ? { targetType, runId: row.run_id, status: row.status } : null;
}
