import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import type { SnapshotChunkInput, SnapshotInput } from "@/types/feedback-types";
import { openDatabase } from "./database";
import { MIGRATIONS } from "./schema";
import { recordDocuments } from "./documents-repository";
import {
  deleteFeedback,
  exportChunkRows,
  exportFeedbackRows,
  exportQuestionRows,
  upsertFeedback,
} from "./feedback-repository";
import {
  claimNextJob,
  completeJob,
  createJob,
  failInterruptedJobs,
  findJob,
  queuePosition,
  updateJobProgress,
} from "./jobs-repository";
import {
  findFeedbackTarget,
  listRuns,
  loadSnapshot,
  saveSnapshot,
} from "./runs-repository";
import {
  createUser,
  findUserByAccessCode,
  resetAccessCode,
} from "./users-repository";

function chunk(
  chunkId: string,
  status: SnapshotChunkInput["status"],
): SnapshotChunkInput {
  return {
    chunkId,
    documentId: "document-1",
    source: "report.pdf",
    page: 3,
    chunkNumber: 7,
    text: `Text of ${chunkId}`,
    status,
    retrievalRank: 2,
    rerankedRank: 1,
    score: 0.8,
    scores: {
      denseScore: 0.6,
      sparseScore: null,
      rrfScore: 0.9,
      rerankerScore: 0.8,
    },
  };
}

function snapshot(userId: number, jobId: string, runId: string): SnapshotInput {
  return {
    runId,
    jobId,
    userId,
    collection: "m4i_alice",
    mode: "rag",
    generationModel: "qwen",
    rerankingModel: "zerank",
    embeddingModel: "bge",
    settings: { topK: 5 },
    promptHash: "hash",
    documents: [{ documentId: "document-1", fileName: "report.pdf" }],
    questions: [
      {
        dimensionId: null,
        dimensionName: null,
        categoryId: null,
        categoryName: null,
        categoryDefinition: null,
        question: "Was the policy adopted?",
        horizon: null,
        nearestOntologyQuestion: "Which policy changed?",
        nearestOntologySimilarity: 0.42,
        items: [
          {
            kind: "rag_answer",
            answer: "Yes, in 2021.",
            explicitness: null,
            indicator: null,
            evidence: [{ chunkId: "chunk-a", quote: "adopted in 2021" }],
          },
        ],
        chunks: [chunk("chunk-a", "sent"), chunk("chunk-b", "outside_top_k")],
      },
    ],
  };
}

describe("repositories", () => {
  let db: DatabaseSync;
  let alice: number;
  let bob: number;

  function queue(id: string, userId = alice) {
    createJob(db, { id, userId, mode: "rag", question: "q", uploads: [] });
  }

  function savedRun(runId = "run-1", jobId = "job-1") {
    queue(jobId);
    saveSnapshot(db, snapshot(alice, jobId, runId));
    return loadSnapshot(db, runId, alice)!;
  }

  beforeEach(() => {
    db = openDatabase(":memory:");
    alice = createUser(db, "Alice", true).user.id;
    bob = createUser(db, "Bob").user.id;
  });

  it("creates users with their own collection and a code that signs them in", () => {
    const { user, accessCode } = createUser(db, "Carol Smith");

    expect(user).toMatchObject({
      collection: "m4i_carol_smith",
      isAdmin: false,
    });
    expect(findUserByAccessCode(db, accessCode.toLowerCase())).toEqual(user);
    expect(findUserByAccessCode(db, "WRONG-CODE-0000")).toBeNull();

    const replacement = resetAccessCode(db, "Carol Smith");
    expect(findUserByAccessCode(db, accessCode)).toBeNull();
    expect(findUserByAccessCode(db, replacement)).toEqual({
      ...user,
      sessionVersion: user.sessionVersion + 1,
    });
  });

  it("claims jobs one at a time, oldest first, and reports queue positions", () => {
    queue("job-1");
    queue("job-2", bob);
    queue("job-3");

    expect(queuePosition(db, findJob(db, "job-3")!)).toBe(2);
    expect(claimNextJob(db)?.id).toBe("job-1");
    expect(queuePosition(db, findJob(db, "job-2")!)).toBe(1);
    expect(queuePosition(db, findJob(db, "job-3")!)).toBe(2);

    updateJobProgress(db, "job-1", 3, 10);
    expect(findJob(db, "job-1")).toMatchObject({
      status: "running",
      progressDone: 3,
      progressTotal: 10,
    });
  });

  it("fails jobs that were running when the server stopped", () => {
    queue("job-1");
    queue("job-2");
    claimNextJob(db);

    expect(failInterruptedJobs(db)).toEqual(["job-1"]);
    expect(findJob(db, "job-1")).toMatchObject({ status: "failed" });
    expect(findJob(db, "job-2")).toMatchObject({ status: "queued" });
  });

  it("saves a snapshot and loads it back only for its owner", () => {
    const run = savedRun();
    const [question] = run.questions;

    expect(run.run).toMatchObject({
      id: "run-1",
      documents: ["report.pdf"],
      firstQuestion: "Was the policy adopted?",
      items: 1,
      reviewedItems: 0,
      settings: { topK: 5 },
    });
    expect(question.chunks.map((c) => [c.chunkId, c.status])).toEqual([
      ["chunk-a", "sent"],
      ["chunk-b", "outside_top_k"],
    ]);
    expect(question.items[0].evidence).toEqual([
      { runChunkId: question.chunks[0].id, quote: "adopted in 2021" },
    ]);
    expect(question.chunks[0].scores).toEqual(chunk("chunk-a", "sent").scores);
    expect(loadSnapshot(db, "run-1", bob)).toBeNull();
    expect(listRuns(db, bob)).toEqual([]);
  });

  it("rolls the whole snapshot back when evidence cites a missing chunk", () => {
    queue("job-1");
    const broken = snapshot(alice, "job-1", "run-1");
    broken.questions[0].items[0].evidence = [
      { chunkId: "missing", quote: "x" },
    ];

    expect(() => saveSnapshot(db, broken)).toThrow(/missing/);
    expect(listRuns(db, alice)).toEqual([]);
  });

  it("finds feedback targets only inside the user's own runs", () => {
    const run = savedRun();
    const [question] = run.questions;

    expect(
      findFeedbackTarget(db, "run_item", question.items[0].id, alice),
    ).toEqual({
      targetType: "run_item",
      runId: "run-1",
    });
    expect(
      findFeedbackTarget(db, "run_chunk", question.chunks[1].id, alice),
    ).toEqual({
      targetType: "run_chunk",
      runId: "run-1",
      status: "outside_top_k",
    });
    expect(
      findFeedbackTarget(db, "run_item", question.items[0].id, bob),
    ).toBeNull();
  });

  it("keeps one verdict per target, updating it on every click", () => {
    const run = savedRun();
    const itemId = run.questions[0].items[0].id;
    const target = {
      userId: alice,
      runId: "run-1",
      targetType: "run_item" as const,
      targetId: itemId,
    };

    upsertFeedback(db, { ...target, verdict: "accepted", comment: "" });
    upsertFeedback(db, {
      ...target,
      verdict: "rejected",
      comment: "Wrong year.",
    });

    const reloaded = loadSnapshot(db, "run-1", alice)!;
    expect(reloaded.feedback[`run_item:${itemId}`]).toMatchObject({
      verdict: "rejected",
      comment: "Wrong year.",
    });
    expect(reloaded.run.reviewedItems).toBe(1);

    deleteFeedback(db, alice, "run_item", itemId);
    expect(loadSnapshot(db, "run-1", alice)!.feedback).toEqual({});
  });

  it("exports feedback, chunks and questions with their context", () => {
    const run = savedRun();
    const [question] = run.questions;
    upsertFeedback(db, {
      userId: alice,
      runId: "run-1",
      targetType: "run_item",
      targetId: question.items[0].id,
      verdict: "accepted",
      comment: "",
    });
    upsertFeedback(db, {
      userId: alice,
      runId: "run-1",
      targetType: "run_chunk",
      targetId: question.chunks[1].id,
      verdict: "should_have_been_used",
      comment: "Has the date.",
    });

    const feedback = exportFeedbackRows(db);
    expect(feedback).toHaveLength(2);
    expect(feedback[0]).toMatchObject({
      user: "Alice",
      target_type: "run_chunk",
      chunk_id: "chunk-b",
      chunk_status: "outside_top_k",
      question: "Was the policy adopted?",
      item_answer: null,
    });
    expect(feedback[1]).toMatchObject({
      target_type: "run_item",
      item_answer: "Yes, in 2021.",
      item_evidence_quotes: "adopted in 2021",
      chunk_id: null,
    });

    expect(
      exportChunkRows(db).map((row) => [row.chunk_id, row.verdict]),
    ).toEqual([
      ["chunk-a", null],
      ["chunk-b", "should_have_been_used"],
    ]);
    expect(exportQuestionRows(db)).toEqual([
      expect.objectContaining({
        question: "Was the policy adopted?",
        nearest_ontology_similarity: 0.42,
        answer_verdict: "accepted",
        sent_chunks: 1,
        missed_chunks: 1,
      }),
    ]);
  });

  it("records documents once per collection and fingerprint", () => {
    const document = {
      documentId: "document-1",
      userId: alice,
      collection: "m4i_alice",
      fileName: "report.pdf",
      sourceHash: "hash",
      indexFingerprint: "fingerprint",
      chunkCount: 4,
    };

    recordDocuments(db, [document]);
    recordDocuments(db, [{ ...document, chunkCount: 5 }]);

    expect(db.prepare("SELECT chunk_count FROM documents").all()).toEqual([
      { chunk_count: 5 },
    ]);
  });

  it("keeps every run, item and feedback when migrating to indicator runs", () => {
    const directory = mkdtempSync(join(tmpdir(), "m4i-migration-"));
    const path = join(directory, "m4i.sqlite");
    try {
      const old = new DatabaseSync(path);
      old.exec(MIGRATIONS[0]);
      old.exec(MIGRATIONS[1]);
      old.exec("PRAGMA user_version = 2");
      old.exec(`
        INSERT INTO users (id, name, access_code_hash, collection, created_at)
          VALUES (1, 'Alice', 'hash', 'm4i_alice', 'now');
        INSERT INTO jobs (id, user_id, mode, status, uploads_json, created_at)
          VALUES ('job-1', 1, 'ontology', 'done', '[]', 'now');
        INSERT INTO runs (id, job_id, user_id, collection, mode, generation_model,
          reranking_model, embedding_model, settings_json, prompt_hash, created_at)
          VALUES ('run-1', 'job-1', 1, 'm4i_alice', 'ontology', 'g', 'r', 'e', '{}', 'h', 'now');
        INSERT INTO run_questions (id, run_id, position, question) VALUES (1, 'run-1', 0, 'q');
        INSERT INTO run_items (id, run_id, run_question_id, position, kind, answer)
          VALUES (1, 'run-1', 1, 0, 'ontology_match', 'a');
        INSERT INTO run_chunks (id, run_id, run_question_id, position, chunk_id, document_id,
          source, page, chunk_number, text, status, score)
          VALUES (1, 'run-1', 1, 0, 'c', 'd', 's', 1, 1, 't', 'sent', 0.5);
        INSERT INTO run_evidence (run_item_id, run_chunk_id, position, quote) VALUES (1, 1, 0, 'quote');
        INSERT INTO feedback (user_id, run_id, target_type, target_id, verdict, created_at, updated_at)
          VALUES (1, 'run-1', 'run_item', 1, 'accepted', 'now', 'now');
      `);
      old.close();

      const migrated = openDatabase(path);
      const run = loadSnapshot(migrated, "run-1", 1)!;
      expect(run.questions[0]).toMatchObject({ horizon: null });
      expect(run.questions[0].items).toEqual([
        {
          id: 1,
          kind: "ontology_match",
          answer: "a",
          explicitness: null,
          indicator: null,
          evidence: [{ runChunkId: 1, quote: "quote" }],
        },
      ]);
      expect(run.feedback["run_item:1"]).toMatchObject({ verdict: "accepted" });
      expect(migrated.prepare("PRAGMA foreign_keys").get()).toEqual({
        foreign_keys: 1,
      });
      migrated.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("marks a finished job done with its run", () => {
    savedRun();
    completeJob(db, "job-1", "run-1");

    expect(findJob(db, "job-1")).toMatchObject({
      status: "done",
      runId: "run-1",
    });
  });
});
