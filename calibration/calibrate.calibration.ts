/**
 * Calibration harness.
 *
 * Runs the real pipeline over the downloaded corpus, once per ontology
 * question, and turns the resulting reranker scores into:
 *
 *   - an automatic accept threshold, fitted to a target false-accept rate
 *   - an automatic reject threshold, fitted to a target false-reject rate
 *   - an adaptive k, evaluated against the fixed-k baseline
 *
 * Requires live Ollama and Qdrant. Run with `npm run calibrate`. Each stage
 * caches its output under calibration/results/, so an interrupted run resumes
 * from the last completed stage; delete a stage's file to recompute it.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ollama } from "ollama";
import { describe, expect, it } from "vitest";

import { DocumentChunker } from "@/app/server/rag/chunking/chunk-documents";
import { OllamaEmbedder } from "@/app/server/rag/embeddings/ollama-embedder";
import {
  categoryQuestions,
  parseFrameworkOntology,
} from "@/app/server/rag/hierarchy/hierarchy-helper";
import { ragPipelineConfigurationFromEnvironment } from "@/app/server/rag/pipeline/rag-pipeline-helper";
import { adaptiveSelect } from "@/app/server/rag/retrieval/adaptive-k";
import {
  fitThresholds,
  type LabelledScore,
  type ThresholdTargets,
} from "@/app/server/rag/retrieval/threshold-fitting";
import { Retriever } from "@/app/server/rag/retrieval/retrieval";
import type { SearchResult } from "@/app/server/rag/storage/storage-types";
import { QdrantStore } from "@/app/server/rag/storage/vector-storage";
import type { CategoryQuestion } from "@/types/hierarchy-types";
import {
  DEFAULT_RERANKING_CONFIGURATION,
  DEFAULT_RETRIEVAL_CONFIGURATION,
  type AdaptiveRetrievalConfiguration,
} from "@/types/retrieval-types";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "corpus");
const RESULTS = join(HERE, "results");

/** Dedicated collection so calibration never disturbs the rag_test data. */
const COLLECTION = "m4i_calibration";
/** Candidate pool retrieved and reranked per question. */
const CANDIDATES = 20;
/** Passages judged per LLM call. */
const JUDGE_BATCH = 8;
/** Fixed-k baseline that adaptive k is compared against. */
const BASELINE_K = DEFAULT_RETRIEVAL_CONFIGURATION.topK;

/**
 * Fitted against the measured score distribution rather than against a round
 * number. The cross-encoder's reranker AUC on these questions is 0.616, and
 * chunk precision plateaus near 55-60% against a 39% base rate, so a 10%
 * false-accept target is only reachable at 0.99 — which accepts a single chunk
 * across the whole question set. 40% is the tightest target that still admits a
 * usable volume of evidence; see calibration/results/sweep.json for the curve.
 *
 * The false-reject target here only shapes the chunk-level reject fit reported
 * alongside it. The threshold actually shipped is fitted per question, against
 * out-of-scope negatives, in rejection.calibration.ts.
 */
const TARGETS: ThresholdTargets = {
  maximumFalseAcceptRate: 0.4,
  maximumFalseRejectRate: 0.05,
};

// Chosen from calibration/results/adaptive-k-bounds.json: the only setting that
// beats fixed k=5 on all three axes at once — fewer chunks (4.73 vs 5), the same
// relevant chunks per question (2.13), and higher precision (45.3% vs 42.6%).
// The drop-off is deliberately loose: reranker scores here are heavy-tailed near
// zero, so an aggressive relative cut collapses k to 1 and halves recall.
const ADAPTIVE_BOUNDS = { minimumK: 3, maximumK: 12, relativeDropoff: 0.01 };

type ManifestEntry = {
  topic: string;
  dimension: string;
  sourceCollection: string;
  title: string;
  file: string;
  sha256: string;
};

type IndexedDocument = {
  file: string;
  topic: string;
  dimension: string;
  documentId: string;
  chunks: number;
};

type IndexStats = {
  collection: string;
  documents: IndexedDocument[];
  totalChunks: number;
  failures: { file: string; reason: string }[];
};

type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  source: string;
  page: number;
  rank: number;
  score: number;
  denseScore: number | null;
  text: string;
};

type QuestionRetrieval = CategoryQuestion & { retrieved: RetrievedChunk[] };
type LabelledChunk = RetrievedChunk & { relevant: boolean };
type QuestionLabels = CategoryQuestion & { retrieved: LabelledChunk[] };

const configuration = {
  ...ragPipelineConfigurationFromEnvironment(),
  collection: COLLECTION,
};

const ollama = new Ollama(
  configuration.ollamaHost ? { host: configuration.ollamaHost } : undefined,
);

function makeEmbedder() {
  return new OllamaEmbedder(
    configuration.embeddingModel,
    configuration.embeddingBatchSize,
    configuration.queryPrefix,
    ollama,
  );
}

function makeStore() {
  return new QdrantStore(configuration.storage, COLLECTION);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2));
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function loadQuestions(): Promise<CategoryQuestion[]> {
  const ontology = parseFrameworkOntology(
    await readJson(join(HERE, "ontology.json")),
  );

  return categoryQuestions(ontology);
}

/** Manifest can hold two entries for one file when sanitised ids collide. */
async function loadManifest(): Promise<ManifestEntry[]> {
  const manifest = await readJson<{ documents: ManifestEntry[] }>(
    join(CORPUS, "manifest.json"),
  );
  const byFile = new Map<string, ManifestEntry>();

  for (const entry of manifest.documents) {
    if (!byFile.has(entry.file) && existsSync(join(CORPUS, entry.file))) {
      byFile.set(entry.file, entry);
    }
  }

  return [...byFile.values()];
}

const RELEVANCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["passage", "relevant"],
        properties: {
          passage: { type: "number" },
          relevant: { type: "boolean" },
        },
      },
    },
  },
} as const;

const JUDGE_SYSTEM = [
  "You judge whether a passage is relevant to an analyst's question about impact evidence.",
  "",
  "A passage is relevant ONLY if it contains specific information that helps answer the",
  "question: a reported outcome, an indicator or measure, a quantity, a target, a",
  "commitment, or a finding on the question's subject.",
  "",
  "A passage is NOT relevant if it merely mentions the topic in passing, or if it is a",
  "table of contents, a heading list, a reference list, an acknowledgement, a disclaimer,",
  "boilerplate, or page furniture.",
  "",
  "Return one verdict per passage, in the order given, using the passage numbers shown.",
].join("\n");

async function judgeBatch(
  question: string,
  passages: readonly RetrievedChunk[],
): Promise<boolean[]> {
  const listing = passages
    .map((passage, index) => `[Passage ${index + 1}]\n${passage.text}`)
    .join("\n\n");
  const response = await ollama.chat({
    model: configuration.generation.model,
    think: false,
    format: RELEVANCE_SCHEMA,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      {
        role: "user",
        content: `Question: ${question}\n\n${listing}\n\nJudge all ${passages.length} passages.`,
      },
    ],
    options: { temperature: 0 },
  });
  const parsed = JSON.parse(response.message.content) as {
    verdicts?: { passage: number; relevant: boolean }[];
  };

  if (!Array.isArray(parsed.verdicts)) {
    throw new Error("The relevance judge returned no verdicts.");
  }

  // Trust the passage number rather than array position: the model
  // occasionally reorders or drops an entry.
  const byPassage = new Map(
    parsed.verdicts.map((verdict) => [verdict.passage, Boolean(verdict.relevant)]),
  );

  return passages.map((_, index) => byPassage.get(index + 1) ?? false);
}

function observationsOf(labelled: readonly QuestionLabels[]): LabelledScore[] {
  return labelled.flatMap((question) =>
    question.retrieved.map((chunk) => ({
      score: chunk.score,
      relevant: chunk.relevant,
    })),
  );
}

/** Rebuilds SearchResult-shaped objects so adaptiveSelect can be applied. */
function asSearchResults(chunks: readonly LabelledChunk[]): SearchResult[] {
  return chunks.map(
    (chunk) =>
      ({
        chunk: { chunkId: chunk.chunkId, text: chunk.text } as SearchResult["chunk"],
        score: chunk.score,
        denseScore: chunk.denseScore,
        sparseScore: null,
      }) satisfies SearchResult,
  );
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

describe("calibration", () => {
  it("indexes the corpus document by document", async () => {
    await mkdir(RESULTS, { recursive: true });
    const statsPath = join(RESULTS, "index-stats.json");

    if (existsSync(statsPath)) {
      const cached = await readJson<IndexStats>(statsPath);
      log(`[index] cached: ${cached.documents.length} documents, ${cached.totalChunks} chunks`);
      expect(cached.totalChunks).toBeGreaterThan(0);
      return;
    }

    const manifest = await loadManifest();
    const chunker = new DocumentChunker(configuration.chunking);
    const embedder = makeEmbedder();
    const store = makeStore();
    const stats: IndexStats = {
      collection: COLLECTION,
      documents: [],
      totalChunks: 0,
      failures: [],
    };
    let collectionReady = false;

    log(`[index] ${manifest.length} documents from the manifest`);

    for (const [position, entry] of manifest.entries()) {
      const path = join(CORPUS, entry.file);

      try {
        const file = new File([await readFile(path)], basename(entry.file));
        const chunks = await chunker.chunkDocuments([file]);
        const vectors = await embedder.embed(chunks.map((chunk) => chunk.text));

        if (!collectionReady) {
          // Start from a clean collection so a re-index never mixes runs.
          await store.ensureCollection(vectors[0].length, true);
          collectionReady = true;
        }

        await store.upsert(chunks, vectors);
        stats.documents.push({
          file: entry.file,
          topic: entry.topic,
          dimension: entry.dimension,
          documentId: chunks[0].documentId,
          chunks: chunks.length,
        });
        stats.totalChunks += chunks.length;
        log(
          `[index] ${position + 1}/${manifest.length} ${entry.file} -> ${chunks.length} chunks (total ${stats.totalChunks})`,
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        stats.failures.push({ file: entry.file, reason });
        log(`[index] ${position + 1}/${manifest.length} ${entry.file} FAILED: ${reason}`);
      }
    }

    await writeJson(statsPath, stats);
    log(`[index] done: ${stats.documents.length} indexed, ${stats.failures.length} failed, ${stats.totalChunks} chunks`);
    expect(stats.totalChunks).toBeGreaterThan(0);
  });

  it("retrieves and reranks a candidate pool for every ontology question", async () => {
    const retrievalPath = join(RESULTS, "retrieval.json");

    if (existsSync(retrievalPath)) {
      const cached = await readJson<QuestionRetrieval[]>(retrievalPath);
      log(`[retrieve] cached: ${cached.length} questions`);
      expect(cached.length).toBeGreaterThan(0);
      return;
    }

    const questions = await loadQuestions();
    const store = makeStore();
    const embedder = makeEmbedder();
    // topK equals the candidate pool so the reranked list is not trimmed
    // before calibration sees it.
    const retriever = new Retriever(
      store,
      embedder,
      { ...DEFAULT_RETRIEVAL_CONFIGURATION, topK: CANDIDATES },
      { ...DEFAULT_RERANKING_CONFIGURATION, enabled: true, candidates: CANDIDATES },
    );
    const output: QuestionRetrieval[] = [];

    for (const [position, question] of questions.entries()) {
      const results = await retriever.retrieve(question.question);

      output.push({
        ...question,
        retrieved: results.map((result, rank) => ({
          chunkId: result.chunk.chunkId,
          documentId: result.chunk.documentId,
          source: result.chunk.source,
          page: result.chunk.page,
          rank,
          score: result.score,
          denseScore: result.denseScore,
          text: result.chunk.text,
        })),
      });

      log(
        `[retrieve] ${position + 1}/${questions.length} ${question.questionId} -> ${results.length} candidates, top ${results[0]?.score.toFixed(3) ?? "n/a"}`,
      );
    }

    await writeJson(retrievalPath, output);
    expect(output.length).toBe(questions.length);
  });

  it("labels every retrieved chunk with an LLM relevance judge", async () => {
    const labelsPath = join(RESULTS, "labels.json");

    if (existsSync(labelsPath)) {
      const cached = await readJson<QuestionLabels[]>(labelsPath);
      log(`[judge] cached: ${cached.length} questions`);
      expect(cached.length).toBeGreaterThan(0);
      return;
    }

    const retrieval = await readJson<QuestionRetrieval[]>(join(RESULTS, "retrieval.json"));
    const output: QuestionLabels[] = [];

    for (const [position, question] of retrieval.entries()) {
      const verdicts: boolean[] = [];

      for (let start = 0; start < question.retrieved.length; start += JUDGE_BATCH) {
        const batch = question.retrieved.slice(start, start + JUDGE_BATCH);
        verdicts.push(...(await judgeBatch(question.question, batch)));
      }

      const retrieved = question.retrieved.map((chunk, index) => ({
        ...chunk,
        relevant: verdicts[index] ?? false,
      }));

      output.push({ ...question, retrieved });
      log(
        `[judge] ${position + 1}/${retrieval.length} ${question.questionId} -> ${retrieved.filter((c) => c.relevant).length}/${retrieved.length} relevant`,
      );
    }

    await writeJson(labelsPath, output);
    expect(output.length).toBe(retrieval.length);
  });

  it("fits accept/reject thresholds and evaluates adaptive k", async () => {
    const labelled = await readJson<QuestionLabels[]>(join(RESULTS, "labels.json"));
    const global = fitThresholds(observationsOf(labelled), TARGETS);

    const adaptive: AdaptiveRetrievalConfiguration = {
      acceptThreshold: global.accept.threshold,
      rejectThreshold: global.reject.threshold,
      ...ADAPTIVE_BOUNDS,
    };

    // Per-dimension fits show whether one global threshold is defensible.
    const dimensions = [...new Set(labelled.map((question) => question.dimensionId))];
    const perDimension = dimensions.map((dimensionId) => {
      const subset = labelled.filter((question) => question.dimensionId === dimensionId);

      return {
        dimensionId,
        questions: subset.length,
        ...fitThresholds(observationsOf(subset), TARGETS),
      };
    });

    // Adaptive k against the fixed-k baseline, on the same labelled data.
    const perQuestion = labelled.map((question) => {
      const results = asSearchResults(question.retrieved);
      const selection = adaptiveSelect(results, adaptive);
      const relevantByChunkId = new Map(
        question.retrieved.map((chunk) => [chunk.chunkId, chunk.relevant]),
      );
      const relevantIn = (chunks: readonly SearchResult[]) =>
        chunks.filter((result) => relevantByChunkId.get(result.chunk.chunkId)).length;
      const baseline = results.slice(0, BASELINE_K);
      const totalRelevant = question.retrieved.filter((chunk) => chunk.relevant).length;

      return {
        questionId: question.questionId,
        dimensionId: question.dimensionId,
        categoryId: question.categoryId,
        decision: selection.decision,
        k: selection.k,
        topScore: selection.topScore,
        totalRelevant,
        adaptive: {
          selected: selection.k,
          relevant: relevantIn(selection.selected),
          precision: selection.k === 0 ? null : relevantIn(selection.selected) / selection.k,
        },
        baseline: {
          selected: baseline.length,
          relevant: relevantIn(baseline),
          precision: baseline.length === 0 ? null : relevantIn(baseline) / baseline.length,
        },
      };
    });

    const answered = perQuestion.filter((question) => question.decision !== "reject");
    const decisions = {
      accept: perQuestion.filter((q) => q.decision === "accept").length,
      ambiguous: perQuestion.filter((q) => q.decision === "ambiguous").length,
      reject: perQuestion.filter((q) => q.decision === "reject").length,
    };
    const summary = {
      generatedAt: new Date().toISOString(),
      corpus: await readJson<IndexStats>(join(RESULTS, "index-stats.json")).then(
        (stats) => ({
          documents: stats.documents.length,
          chunks: stats.totalChunks,
          failures: stats.failures.length,
        }),
      ),
      questions: labelled.length,
      candidatesPerQuestion: CANDIDATES,
      targets: TARGETS,
      fitted: { ...adaptive },
      global,
      perDimension,
      decisions,
      adaptiveK: {
        mean: mean(answered.map((question) => question.k)),
        min: answered.length === 0 ? 0 : Math.min(...answered.map((question) => question.k)),
        max: answered.length === 0 ? 0 : Math.max(...answered.map((question) => question.k)),
        distribution: answered.reduce<Record<number, number>>((counts, question) => {
          counts[question.k] = (counts[question.k] ?? 0) + 1;
          return counts;
        }, {}),
      },
      comparison: {
        baselineK: BASELINE_K,
        adaptivePrecision: mean(
          answered.flatMap((q) => (q.adaptive.precision === null ? [] : [q.adaptive.precision])),
        ),
        baselinePrecision: mean(
          perQuestion.flatMap((q) => (q.baseline.precision === null ? [] : [q.baseline.precision])),
        ),
        adaptiveRelevantPerQuestion: mean(answered.map((q) => q.adaptive.relevant)),
        baselineRelevantPerQuestion: mean(perQuestion.map((q) => q.baseline.relevant)),
        adaptiveChunksPerQuestion: mean(perQuestion.map((q) => q.k)),
        baselineChunksPerQuestion: BASELINE_K,
      },
      perQuestion,
    };

    await writeJson(join(RESULTS, "thresholds.json"), summary);

    log("");
    log(`  accept threshold  ${adaptive.acceptThreshold.toFixed(4)} (false-accept ${(global.accept.observedRate * 100).toFixed(1)}%, attainable=${global.accept.attainable})`);
    log(`  reject threshold  ${adaptive.rejectThreshold.toFixed(4)} (false-reject ${(global.reject.observedRate * 100).toFixed(1)}%, attainable=${global.reject.attainable})`);
    log(`  decisions         accept ${decisions.accept}, ambiguous ${decisions.ambiguous}, reject ${decisions.reject}`);
    log(`  adaptive k        mean ${summary.adaptiveK.mean.toFixed(2)} (range ${summary.adaptiveK.min}-${summary.adaptiveK.max})`);
    log(`  precision         adaptive ${(summary.comparison.adaptivePrecision * 100).toFixed(1)}% vs fixed-k ${(summary.comparison.baselinePrecision * 100).toFixed(1)}%`);
    log("");

    expect(global.accept.threshold).toBeGreaterThanOrEqual(global.reject.threshold);
    expect(perQuestion.length).toBe(labelled.length);
  });
});
