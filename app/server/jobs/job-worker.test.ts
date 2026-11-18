import type { DatabaseSync } from "node:sqlite";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import type { RunMode } from "@/types/feedback-types";
import type {
  FrameworkOntology,
  HierarchyEvidence,
  HierarchyPipelineResult,
} from "@/types/hierarchy-types";
import type {
  IndicatorOntology,
  IndicatorPipelineResult,
} from "@/types/indicator-types";
import type { RagPipelineResult } from "@/types/rag-pipeline-type";
import type { RerankedResult } from "@/types/retrieval-types";
import { openDatabase } from "../db/database";
import { claimNextJob, createJob, findJob } from "../db/jobs-repository";
import { listRuns, loadSnapshot } from "../db/runs-repository";
import { createUser } from "../db/users-repository";
import { DEFAULT_RAG_PIPELINE_CONFIGURATION } from "../rag/pipeline/rag-pipeline-helper";
import type { SearchResult } from "../rag/storage/storage-types";
import type { JobRunnerDependencies } from "./job-runner";
import { JobWorker } from "./job-worker";

type RagRun = ReturnType<JobRunnerDependencies["ragPipeline"]>["run"];
type HierarchyRun = ReturnType<
  JobRunnerDependencies["hierarchyPipeline"]
>["run"];
type IndicatorRun = ReturnType<
  JobRunnerDependencies["indicatorPipeline"]
>["run"];

function chunk(chunkId: string): DocumentChunk {
  return {
    chunkId,
    documentId: "document-1",
    source: "report.pdf",
    sourceHash: "source-hash",
    page: 2,
    number: Number(chunkId.replace(/\D/g, "")),
    text: `Text of ${chunkId}`,
    metadata: {
      contentType: "pdf",
      indexFingerprint: "fingerprint",
      wordCount: 3,
    },
  };
}

function result(chunkId: string, score: number): SearchResult {
  return {
    chunk: chunk(chunkId),
    score,
    denseScore: 0.5,
    sparseScore: null,
    rrfScore: 0.7,
    rerankerScore: score,
  };
}

function ranked(chunkId: string, score: number, rank: number): RerankedResult {
  return { ...result(chunkId, score), retrievalRank: rank, rerankedRank: rank };
}

const ontology: FrameworkOntology = {
  dimensions: [
    {
      id: "political",
      name: "Political",
      definition: "Policy change.",
      categories: [
        {
          id: "advocacy",
          name: "Advocacy",
          definition: "Influence on policy.",
          questions: ["Was the policy adopted?", "Who was engaged?"],
        },
      ],
    },
  ],
};

function evidence(chunkId: string, quote: string): HierarchyEvidence {
  return {
    chunkId,
    quote,
    source: "report.pdf",
    page: 2,
    chunk: Number(chunkId.replace(/\D/g, "")),
    scores: {
      denseScore: 0.5,
      sparseScore: null,
      rrfScore: 0.7,
      rerankerScore: 0.9,
    },
  };
}

const indicatorOntology: IndicatorOntology = {
  dimensions: [
    {
      ...ontology.dimensions[0],
      categories: [
        {
          ...ontology.dimensions[0].categories[0],
          outcomes: (["short_term", "medium_term"] as const).map((horizon) => ({
            id: `${horizon}_outcome`,
            horizon,
            statement: `The ${horizon} outcome.`,
            indicators: [
              {
                id: `${horizon}_indicator`,
                name: `The ${horizon} indicator`,
                question: `Did the ${horizon} indicator change?`,
                answerType: "yes_no" as const,
              },
            ],
          })),
        },
      ],
    },
  ],
};

const [shortTerm, mediumTerm] =
  indicatorOntology.dimensions[0].categories[0].outcomes;

const indicatorResult: IndicatorPipelineResult = {
  categories: [
    {
      dimensionId: "political",
      categoryId: "advocacy",
      categoryName: "Advocacy",
      triggeringMatches: [],
      bestRerankerScore: 0.9,
      ungroundedDocumentIndicators: 0,
      horizons: [
        {
          horizon: "short_term",
          outcome: shortTerm,
          documentIndicators: [
            {
              horizon: "short_term",
              name: "Officials trained",
              value: "27 officials",
              evidence: evidence("chunk-1", "27 officials were trained"),
            },
          ],
          usedPredefined: false,
          answers: [],
          context: [result("chunk-1", 0.9)],
        },
        {
          horizon: "medium_term",
          outcome: mediumTerm,
          documentIndicators: [],
          usedPredefined: true,
          answers: [
            {
              indicatorId: "medium_term_indicator",
              basis: "reported",
              answer: "yes",
              rationale: "The law passed.",
              confidence: "high",
              indicator: mediumTerm.indicators[0],
              horizon: "medium_term",
              evidence: evidence("chunk-2", "the law passed"),
              groundingFailed: false,
            },
          ],
          context: [result("chunk-2", 0.4), result("chunk-1", 0.3)],
        },
      ],
    },
  ],
  skippedCategories: [{ categoryId: "budgets", bestRerankerScore: 0.2 }],
};

const ragResult: RagPipelineResult = {
  answer: "Yes, it was adopted.",
  candidateCount: 3,
  chunks: [chunk("chunk-1"), chunk("chunk-2"), chunk("chunk-3")],
  rerankingModel: "zerank",
  results: [ranked("chunk-1", 0.9, 1)],
  withoutReranking: [ranked("chunk-2", 0.4, 1)],
  outsideTopK: [ranked("chunk-2", 0.4, 2), ranked("chunk-3", 0.1, 3)],
};

const hierarchyResult: HierarchyPipelineResult = {
  chunks: [chunk("chunk-1"), chunk("chunk-2")],
  diagnostics: [],
  framework: {
    dimensions: [
      {
        ...ontology.dimensions[0],
        categories: [
          {
            ...ontology.dimensions[0].categories[0],
            matches: [
              {
                question: "Was the policy adopted?",
                explicitness: "explicit",
                reason: "The report says it was adopted.",
                evidence: [
                  {
                    chunkId: "chunk-1",
                    quote: "adopted",
                    source: "report.pdf",
                    page: 2,
                    chunk: 1,
                    scores: {
                      denseScore: 0.5,
                      sparseScore: null,
                      rrfScore: 0.7,
                      rerankerScore: 0.9,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  retrievals: [
    {
      dimensionId: "political",
      categoryId: "advocacy",
      questions: [
        {
          question: "Was the policy adopted?",
          cutoff: 0.3,
          results: [result("chunk-1", 0.9)],
          droppedBelowCutoff: [result("chunk-2", 0.1)],
          droppedOutsideTopK: [],
        },
        {
          question: "Who was engaged?",
          cutoff: 0.3,
          results: [],
          droppedBelowCutoff: [],
          droppedOutsideTopK: [result("chunk-2", 0.05)],
        },
      ],
    },
  ],
};

describe("JobWorker", () => {
  let db: DatabaseSync;
  let userId: number;
  let runner: JobRunnerDependencies;
  let removeUploads: Mock<(jobId: string) => Promise<void>>;
  let ragRun: Mock<RagRun>;
  let hierarchyRun: Mock<HierarchyRun>;
  let indicatorRun: Mock<IndicatorRun>;
  let logs: string[];

  function worker() {
    return new JobWorker({
      db,
      runner,
      loadUploads: async () => [new File(["text"], "report.pdf")],
      removeUploads,
      log: (message) => logs.push(message),
    });
  }

  function queue(id: string, mode: RunMode) {
    createJob(db, {
      id,
      userId,
      mode,
      question: mode === "rag" ? "Was it adopted?" : null,
      uploads: [{ file: "0.pdf", name: "report.pdf", type: "application/pdf" }],
    });
  }

  beforeEach(() => {
    db = openDatabase(":memory:");
    userId = createUser(db, "Alice").user.id;
    removeUploads = vi.fn(async () => {});
    logs = [];
    ragRun = vi.fn<RagRun>(async (_documents, _question, onProgress) => {
      onProgress("answering", 1, 1);
      return ragResult;
    });
    hierarchyRun = vi.fn<HierarchyRun>(async () => hierarchyResult);
    indicatorRun = vi.fn<IndicatorRun>(async () => indicatorResult);
    runner = {
      configuration: () => DEFAULT_RAG_PIPELINE_CONFIGURATION,
      ontology: () => ontology,
      ragPipeline: vi.fn(() => ({ run: ragRun })),
      hierarchyPipeline: vi.fn(() => ({ run: hierarchyRun })),
      indicatorOntology: () => ({
        file: "ontology-v2.json",
        ontology: indicatorOntology,
      }),
      indicatorPipeline: vi.fn(() => ({ run: indicatorRun })),
      embedder: () => ({
        embed: async (texts: readonly string[]) =>
          texts.map((text) =>
            text === "Who was engaged?"
              ? [0, 1]
              : text === "Was it adopted?"
                ? [0.1, 1]
                : [1, 0],
          ),
      }),
      promptHash: () => "prompt-hash",
    };
  });

  it("runs a RAG job in the user's collection and saves what was shown", async () => {
    queue("job-1", "rag");
    await worker().wake();

    const job = findJob(db, "job-1")!;
    expect(job).toMatchObject({
      status: "done",
      stage: "answering",
      progressDone: 1,
    });
    expect(runner.ragPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "m4i_alice" }),
    );

    const run = loadSnapshot(db, job.runId!, userId)!;
    const [question] = run.questions;
    expect(run.run).toMatchObject({ mode: "rag", documents: ["report.pdf"] });
    expect(question).toMatchObject({
      question: "Was it adopted?",
      nearestOntologyQuestion: "Who was engaged?",
    });
    expect(question.items).toMatchObject([{ answer: "Yes, it was adopted." }]);
    expect(question.chunks.map((c) => [c.chunkId, c.status])).toEqual([
      ["chunk-1", "sent"],
      ["chunk-2", "outside_top_k"],
      ["chunk-3", "outside_top_k"],
    ]);
    expect(removeUploads).toHaveBeenCalledWith("job-1");
    expect(
      db
        .prepare("SELECT document_id, collection, chunk_count FROM documents")
        .all(),
    ).toEqual([
      { document_id: "document-1", collection: "m4i_alice", chunk_count: 3 },
    ]);
  });

  it("saves every ontology question with its matches and dropped chunks", async () => {
    queue("job-1", "ontology");
    await worker().wake();

    const run = loadSnapshot(db, findJob(db, "job-1")!.runId!, userId)!;
    const [adopted, engaged] = run.questions;

    expect(adopted).toMatchObject({
      dimensionName: "Political",
      categoryName: "Advocacy",
      categoryDefinition: "Influence on policy.",
    });
    expect(adopted.items).toMatchObject([
      { kind: "ontology_match", explicitness: "explicit" },
    ]);
    expect(adopted.items[0].evidence).toEqual([
      { runChunkId: adopted.chunks[0].id, quote: "adopted" },
    ]);
    expect(adopted.chunks.map((c) => [c.status, c.rerankedRank])).toEqual([
      ["sent", 1],
      ["below_cutoff", 2],
    ]);
    expect(engaged.items).toEqual([]);
    expect(engaged.chunks.map((c) => c.status)).toEqual(["outside_top_k"]);
  });

  it("saves the matches and every indicator horizon of an indicator run", async () => {
    queue("job-1", "indicators");
    await worker().wake();

    const run = loadSnapshot(db, findJob(db, "job-1")!.runId!, userId)!;
    expect(hierarchyRun).toHaveBeenCalledWith(
      expect.anything(),
      indicatorOntology,
      expect.any(Function),
    );
    expect(run.run.mode).toBe("indicators");
    expect(run.run.settings.indicators).toEqual({
      ontologyFile: "ontology-v2.json",
      gate: expect.objectContaining({ minimumRerankerScore: 0.7 }),
      triggeredCategories: [{ categoryId: "advocacy", bestRerankerScore: 0.9 }],
      skippedCategories: [{ categoryId: "budgets", bestRerankerScore: 0.2 }],
    });

    const [adopted, , short, medium] = run.questions;
    expect(adopted.items).toMatchObject([{ kind: "ontology_match" }]);
    expect(short).toMatchObject({
      horizon: "short_term",
      question: "The short_term outcome.",
      categoryDefinition: "Influence on policy.",
    });
    expect(short.items).toEqual([
      {
        id: expect.any(Number),
        kind: "document_indicator",
        answer: "27 officials",
        explicitness: null,
        indicator: { source: "document", name: "Officials trained" },
        evidence: [
          {
            runChunkId: short.chunks[0].id,
            quote: "27 officials were trained",
          },
        ],
      },
    ]);
    expect(medium.items[0]).toMatchObject({
      kind: "indicator_answer",
      answer: "yes",
      indicator: {
        source: "predefined",
        indicatorId: "medium_term_indicator",
        basis: "reported",
        groundingFailed: false,
      },
      evidence: [{ runChunkId: medium.chunks[0].id, quote: "the law passed" }],
    });
    expect(medium.chunks.map((c) => [c.chunkId, c.rerankedRank])).toEqual([
      ["chunk-2", 1],
      ["chunk-1", 2],
    ]);
  });

  it("records the stage on the job and logs each stage with its duration", async () => {
    hierarchyRun.mockImplementationOnce(
      async (_documents, _ontology, onProgress) => {
        onProgress("matching", 0, 2);
        onProgress("matching", 2, 2);
        return hierarchyResult;
      },
    );
    indicatorRun.mockImplementationOnce(
      async (_ontology, _hierarchy, onProgress) => {
        onProgress("indicator_analysis", 1, 1);
        return indicatorResult;
      },
    );
    queue("job-1", "indicators");
    await worker().wake();

    expect(findJob(db, "job-1")).toMatchObject({
      stage: "indicator_analysis",
      progressDone: 1,
      progressTotal: 1,
    });
    expect(logs).toEqual([
      "Job job-1 (indicators) started.",
      "Job job-1 (indicators) started matching: 2 steps.",
      expect.stringMatching(/^Job job-1 finished matching in [\d.]+s\.$/),
      "Job job-1 (indicators) started indicator_analysis: 1 steps.",
      expect.stringMatching(/^Job job-1 finished as run .+ in [\d.]+s\.$/),
    ]);
  });

  it("logs the stage a job failed in", async () => {
    ragRun.mockImplementationOnce(async (_documents, _question, onProgress) => {
      onProgress("answering", 0, 1);
      throw new Error("Ollama is not running");
    });
    queue("job-1", "rag");
    await worker().wake();

    expect(findJob(db, "job-1")).toMatchObject({ stage: "answering" });
    expect(logs.at(-1)).toMatch(
      /^Job job-1 failed during answering after [\d.]+s: Ollama is not running$/,
    );
  });

  it("marks a failed run and still removes its uploads", async () => {
    ragRun.mockRejectedValueOnce(new Error("Ollama is not running"));
    queue("job-1", "rag");
    await worker().wake();

    expect(findJob(db, "job-1")).toMatchObject({
      status: "failed",
      error: "Ollama is not running",
    });
    expect(listRuns(db, userId)).toEqual([]);
    expect(removeUploads).toHaveBeenCalledWith("job-1");
  });

  it("runs queued jobs one after another, never two at once", async () => {
    let running = 0;
    let mostAtOnce = 0;
    ragRun.mockImplementation(async () => {
      running += 1;
      mostAtOnce = Math.max(mostAtOnce, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return ragResult;
    });
    queue("job-1", "rag");
    queue("job-2", "rag");
    const jobs = worker();

    await Promise.all([jobs.wake(), jobs.wake()]);
    queue("job-3", "rag");
    await jobs.wake();

    expect(ragRun).toHaveBeenCalledTimes(3);
    expect(mostAtOnce).toBe(1);
    expect(
      ["job-1", "job-2", "job-3"].map((id) => findJob(db, id)!.status),
    ).toEqual(["done", "done", "done"]);
  });

  it("removes the uploads of jobs a restart interrupted", () => {
    queue("job-1", "rag");
    claimNextJob(db);
    worker();

    expect(findJob(db, "job-1")).toMatchObject({ status: "failed" });
    expect(removeUploads).toHaveBeenCalledWith("job-1");
  });

  it("records nothing when the snapshot cannot be saved", async () => {
    db.exec(
      "CREATE TRIGGER no_runs BEFORE INSERT ON runs BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );
    queue("job-1", "rag");
    await worker().wake();

    expect(findJob(db, "job-1")).toMatchObject({
      status: "failed",
      error: "disk full",
      runId: null,
    });
    expect(db.prepare("SELECT * FROM documents").all()).toEqual([]);
  });

  it("keeps the answer when the nearest ontology question cannot be found", async () => {
    runner.embedder = () => ({
      embed: async () => {
        throw new Error("Embedding model is not pulled");
      },
    });
    queue("job-1", "rag");
    await worker().wake();

    const run = loadSnapshot(db, findJob(db, "job-1")!.runId!, userId)!;
    expect(run.questions[0]).toMatchObject({
      nearestOntologyQuestion: null,
      nearestOntologySimilarity: null,
    });
  });
});
