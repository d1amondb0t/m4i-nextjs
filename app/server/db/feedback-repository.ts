import type { DatabaseSync } from "node:sqlite";

import type {
  FeedbackEntry,
  FeedbackTargetType,
  Verdict,
} from "@/types/feedback-types";
import { feedbackKey } from "../feedback/feedback-helper.ts";
import { now } from "./database.ts";

type FeedbackRow = {
  target_type: FeedbackTargetType;
  target_id: number;
  verdict: Verdict;
  comment: string;
  updated_at: string;
};

function toEntry(row: FeedbackRow): FeedbackEntry {
  return {
    verdict: row.verdict,
    comment: row.comment,
    updatedAt: row.updated_at,
  };
}

export function upsertFeedback(
  db: DatabaseSync,
  feedback: {
    userId: number;
    runId: string;
    targetType: FeedbackTargetType;
    targetId: number;
    verdict: Verdict;
    comment: string;
  },
): FeedbackEntry {
  const timestamp = now();
  const row = db
    .prepare(
      `INSERT INTO feedback (user_id, run_id, target_type, target_id, verdict, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, target_type, target_id)
       DO UPDATE SET verdict = excluded.verdict, comment = excluded.comment, updated_at = excluded.updated_at
       RETURNING target_type, target_id, verdict, comment, updated_at`,
    )
    .get(
      feedback.userId,
      feedback.runId,
      feedback.targetType,
      feedback.targetId,
      feedback.verdict,
      feedback.comment,
      timestamp,
      timestamp,
    ) as FeedbackRow;

  return toEntry(row);
}

export function deleteFeedback(
  db: DatabaseSync,
  userId: number,
  targetType: FeedbackTargetType,
  targetId: number,
): void {
  db.prepare(
    "DELETE FROM feedback WHERE user_id = ? AND target_type = ? AND target_id = ?",
  ).run(userId, targetType, targetId);
}

export function feedbackForRun(
  db: DatabaseSync,
  runId: string,
  userId: number,
): Record<string, FeedbackEntry> {
  const rows = db
    .prepare(
      `SELECT target_type, target_id, verdict, comment, updated_at FROM feedback
       WHERE run_id = ? AND user_id = ?`,
    )
    .all(runId, userId) as FeedbackRow[];

  return Object.fromEntries(
    rows.map((row) => [
      feedbackKey(row.target_type, row.target_id),
      toEntry(row),
    ]),
  );
}

export function exportFeedbackRows(
  db: DatabaseSync,
): Record<string, unknown>[] {
  return db
    .prepare(
      `SELECT f.id AS feedback_id, u.name AS user, f.run_id, r.mode,
              r.created_at AS run_created_at, f.updated_at AS feedback_updated_at,
              f.target_type, f.verdict, f.comment,
              q.dimension_id, q.category_id, q.question,
              q.nearest_ontology_question, q.nearest_ontology_similarity,
              i.id AS item_id, i.kind AS item_kind, i.answer AS item_answer,
              i.explicitness AS item_explicitness,
              (SELECT group_concat(e.quote, ' | ') FROM run_evidence e WHERE e.run_item_id = i.id) AS item_evidence_quotes,
              c.id AS run_chunk_id, c.chunk_id, c.document_id, c.source, c.page,
              c.chunk_number, c.status AS chunk_status, c.retrieval_rank,
              c.reranked_rank, c.score, c.dense_score, c.sparse_score,
              c.rrf_score, c.reranker_score,
              (SELECT COUNT(*) FROM run_evidence e WHERE e.run_chunk_id = c.id) AS chunk_cited_by_items,
              c.text AS chunk_text,
              r.generation_model, r.reranking_model, r.embedding_model,
              r.settings_json, r.prompt_hash, r.collection
       FROM feedback f
       JOIN users u ON u.id = f.user_id
       JOIN runs r ON r.id = f.run_id
       LEFT JOIN run_items i ON f.target_type = 'run_item' AND i.id = f.target_id
       LEFT JOIN run_chunks c ON f.target_type = 'run_chunk' AND c.id = f.target_id
       LEFT JOIN run_questions q ON q.id = COALESCE(i.run_question_id, c.run_question_id)
       ORDER BY r.created_at, f.run_id, q.position, f.target_type, f.target_id`,
    )
    .all() as Record<string, unknown>[];
}

export function exportChunkRows(db: DatabaseSync): Record<string, unknown>[] {
  return db
    .prepare(
      `SELECT u.name AS user, r.id AS run_id, r.mode, r.created_at AS run_created_at,
              q.dimension_id, q.category_id, q.question,
              c.id AS run_chunk_id, c.chunk_id, c.document_id, c.source, c.page,
              c.chunk_number, c.status AS chunk_status, c.retrieval_rank,
              c.reranked_rank, c.score, c.dense_score, c.sparse_score,
              c.rrf_score, c.reranker_score,
              (SELECT COUNT(*) FROM run_evidence e WHERE e.run_chunk_id = c.id) AS chunk_cited_by_items,
              f.verdict, f.comment, c.text AS chunk_text, r.reranking_model
       FROM run_chunks c
       JOIN runs r ON r.id = c.run_id
       JOIN users u ON u.id = r.user_id
       JOIN run_questions q ON q.id = c.run_question_id
       LEFT JOIN feedback f ON f.target_type = 'run_chunk' AND f.target_id = c.id AND f.user_id = r.user_id
       ORDER BY r.created_at, r.id, q.position, c.position`,
    )
    .all() as Record<string, unknown>[];
}

export function exportQuestionRows(
  db: DatabaseSync,
): Record<string, unknown>[] {
  return db
    .prepare(
      `SELECT u.name AS user, r.id AS run_id, r.created_at AS run_created_at,
              q.question, q.nearest_ontology_question, q.nearest_ontology_similarity,
              i.answer, f.verdict AS answer_verdict, f.comment AS answer_comment,
              (SELECT COUNT(*) FROM run_chunks c WHERE c.run_question_id = q.id AND c.status = 'sent') AS sent_chunks,
              (SELECT COUNT(*) FROM feedback cf JOIN run_chunks c ON c.id = cf.target_id
                 WHERE cf.target_type = 'run_chunk' AND c.run_question_id = q.id AND cf.verdict = 'relevant') AS relevant_chunks,
              (SELECT COUNT(*) FROM feedback cf JOIN run_chunks c ON c.id = cf.target_id
                 WHERE cf.target_type = 'run_chunk' AND c.run_question_id = q.id AND cf.verdict = 'irrelevant') AS irrelevant_chunks,
              (SELECT COUNT(*) FROM feedback cf JOIN run_chunks c ON c.id = cf.target_id
                 WHERE cf.target_type = 'run_chunk' AND c.run_question_id = q.id AND cf.verdict = 'should_have_been_used') AS missed_chunks,
              (SELECT group_concat(file_name, ' | ') FROM run_documents d WHERE d.run_id = r.id) AS documents,
              r.generation_model, r.reranking_model
       FROM run_questions q
       JOIN runs r ON r.id = q.run_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN run_items i ON i.run_question_id = q.id AND i.kind = 'rag_answer'
       LEFT JOIN feedback f ON f.target_type = 'run_item' AND f.target_id = i.id AND f.user_id = r.user_id
       WHERE r.mode = 'rag'
       ORDER BY q.nearest_ontology_similarity IS NULL, q.nearest_ontology_similarity, r.created_at`,
    )
    .all() as Record<string, unknown>[];
}
