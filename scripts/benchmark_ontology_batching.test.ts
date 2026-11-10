/**
 * Times the hierarchy (ontology) pipeline on a fixed set of documents and saves
 * its output, so a variant can be compared against the baseline.
 *
 * BENCH_VARIANT  output folder name (default "baseline")
 * BENCH_DOCUMENTS comma-separated dataset paths, e.g. political/political-26.pdf
 * BENCH_SMOKE=1  only the first category, for a quick check
 * BENCH_CONFIG   JSON merged into the hierarchy configuration
 * BENCH_ANALYZER=category  one analyzer call per category (CategoryBatchedAnalyzer)
 * Output: calibration/results/ontology-batching/<variant>/<document>.json
 *
 * Each document gets a freshly recreated collection, because sparse search uses
 * Qdrant's IDF modifier and its scores depend on everything in the collection.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { QdrantClient } from "@qdrant/js-client-rest";
import { Ollama } from "ollama";
import { it } from "vitest";

import { DocumentChunker } from "../app/server/rag/chunking/chunk-documents";
import { hierarchyConfigurationFor } from "../app/server/rag/hierarchy/hierarchy-helper";
import { HierarchyPipeline } from "../app/server/rag/hierarchy/hierarchy-pipeline";
import { ragPipelineConfigurationFromEnvironment } from "../app/server/rag/pipeline/rag-pipeline-helper";
import type {
  HierarchyConfiguration,
  QuestionRetrieval,
} from "../types/hierarchy-types";
import { CategoryBatchedAnalyzer } from "./category-batched-analyzer";

const root = path.resolve(import.meta.dirname, "..");
const variant = process.env.BENCH_VARIANT || "baseline";
const collection = "ontology_batching_bench";
const documents = (
  process.env.BENCH_DOCUMENTS ||
  [
    "political/political-26.pdf",
    "political/political-76.pdf",
    "political/political-97.pdf",
    "economic/economic-99.pdf",
    "economic/economic-60.pdf",
    "economic/economic-14.pdf",
    "social/social-26.pdf",
    "social/social-40.pdf",
    "humanitarian_rights/humanitarian_rights-86.pdf",
    "humanitarian_rights/humanitarian_rights-28.pdf",
  ].join(",")
).split(",");

type OllamaCall = {
  kind: "generate" | "chat" | "embed";
  model: string;
  startMs: number;
  wallMs: number;
  inputs: number;
  numCtx?: number;
  promptTokens?: number;
  evalTokens?: number;
  promptEvalMs?: number;
  evalMs?: number;
  loadMs?: number;
};

type Phase = { name: string; startMs: number; endMs: number };

let calls: OllamaCall[] = [];
let phases: Phase[] = [];
let modelSnapshots: Record<string, unknown> = {};
let onRetrieval: (
  retrievals: Map<string, QuestionRetrieval[]>,
) => void = () => {};

const nanosToMs = (value: unknown) =>
  typeof value === "number" ? value / 1e6 : undefined;

function instrumentOllama(kind: OllamaCall["kind"]) {
  const prototype = Ollama.prototype as unknown as Record<
    string,
    (request: Record<string, unknown>) => Promise<Record<string, unknown>>
  >;
  const original = prototype[kind];
  prototype[kind] = async function (this: Ollama, request) {
    const startMs = performance.now();
    const response = await original.call(this, request);
    const options = request.options as { num_ctx?: number } | undefined;
    calls.push({
      kind,
      model: String(request.model),
      startMs,
      wallMs: performance.now() - startMs,
      inputs: Array.isArray(request.input) ? request.input.length : 1,
      numCtx: options?.num_ctx,
      promptTokens: response.prompt_eval_count as number | undefined,
      evalTokens: response.eval_count as number | undefined,
      promptEvalMs: nanosToMs(response.prompt_eval_duration),
      evalMs: nanosToMs(response.eval_duration),
      loadMs: nanosToMs(response.load_duration),
    });
    return response;
  };
}

async function loadedModels(): Promise<unknown> {
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  return (await fetch(`${host}/api/ps`)).json();
}

function instrumentPhase(
  prototype: object,
  method: string,
  name: string,
  snapshotAfter = false,
) {
  const target = prototype as Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
  const original = target[method];
  target[method] = async function (this: unknown, ...args: unknown[]) {
    const startMs = performance.now();
    const result = await original.apply(this, args);
    phases.push({ name, startMs, endMs: performance.now() });
    if (snapshotAfter) {
      modelSnapshots[name] = await loadedModels();
      onRetrieval(result as Map<string, QuestionRetrieval[]>);
    }
    return result;
  };
}

instrumentOllama("generate");
instrumentOllama("chat");
instrumentOllama("embed");
instrumentPhase(DocumentChunker.prototype, "chunkDocuments", "chunking");
instrumentPhase(
  HierarchyPipeline.prototype,
  "retrieveOntology",
  "retrieval",
  true,
);

function sum(values: (number | undefined)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function summarize(selected: OllamaCall[]) {
  const promptTokens = selected.map((call) => call.promptTokens ?? 0);
  return {
    calls: selected.length,
    wallMsSum: sum(selected.map((call) => call.wallMs)),
    promptTokens: sum(promptTokens),
    maxPromptTokens: Math.max(0, ...promptTokens),
    evalTokens: sum(selected.map((call) => call.evalTokens)),
    promptEvalMs: sum(selected.map((call) => call.promptEvalMs)),
    evalMs: sum(selected.map((call) => call.evalMs)),
    loadMs: sum(selected.map((call) => call.loadMs)),
    numCtx: [...new Set(selected.map((call) => call.numCtx ?? null))],
  };
}

function phaseMs(name: string): number {
  return sum(
    phases
      .filter((phase) => phase.name === name)
      .map((phase) => phase.endMs - phase.startMs),
  );
}

async function ontologyInput(): Promise<unknown> {
  const ontology = JSON.parse(
    await readFile(path.join(root, "ontology.json"), "utf8"),
  );
  if (process.env.BENCH_SMOKE !== "1") return ontology;

  const [dimension] = ontology.dimensions;
  return {
    dimensions: [{ ...dimension, categories: [dimension.categories[0]] }],
  };
}

it(`benchmarks the hierarchy pipeline (${variant})`, async () => {
  const configuration = {
    ...ragPipelineConfigurationFromEnvironment(),
    collection,
  };
  const hierarchyConfiguration: HierarchyConfiguration = {
    ...hierarchyConfigurationFor(configuration.reranking),
    ...JSON.parse(process.env.BENCH_CONFIG || "{}"),
  };
  const qdrant = new QdrantClient(configuration.storage);
  const ontology = await ontologyInput();
  const outputDirectory = path.join(
    root,
    "calibration/results/ontology-batching",
    variant,
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const relative of documents) {
    const [dimensionId, name] = relative.split("/");
    if ((await qdrant.collectionExists(collection)).exists) {
      await qdrant.deleteCollection(collection);
    }
    calls = [];
    phases = [];
    modelSnapshots = {};

    const bytes = await readFile(
      path.join(root, "dataset", dimensionId, "raw", name),
    );
    const file = new File([bytes], name, { type: "application/pdf" });
    const batchedAnalyzer =
      process.env.BENCH_ANALYZER === "category"
        ? new CategoryBatchedAnalyzer(
            configuration.generation.model,
            path.join(root, "prompts/hierarchy-extract.txt"),
            hierarchyConfiguration.maxContextWords,
            Number(process.env.BENCH_BATCH_CONTEXT_TOKENS || 32_768),
            new Ollama(),
          )
        : undefined;
    onRetrieval = (retrievals) => {
      if (batchedAnalyzer) batchedAnalyzer.retrievals = retrievals;
    };
    const pipeline = new HierarchyPipeline(
      configuration,
      hierarchyConfiguration,
      batchedAnalyzer ? { analyzer: batchedAnalyzer } : {},
    );
    const startMs = performance.now();
    const result = await pipeline.run([file], ontology);
    const totalMs = performance.now() - startMs;
    modelSnapshots.analysis = await loadedModels();

    const retrieval = phases.find((phase) => phase.name === "retrieval")!;
    const indexingMs = retrieval.startMs - startMs - phaseMs("chunking");
    const indexingEmbeds = calls.filter(
      (call) => call.kind === "embed" && call.startMs < retrieval.startMs,
    );
    const queryEmbeds = calls.filter(
      (call) => call.kind === "embed" && call.startMs >= retrieval.startMs,
    );
    const matches = result.framework.dimensions.flatMap((dimension) =>
      dimension.categories.flatMap((category) =>
        category.matches.map((match) => ({
          categoryId: category.id,
          question: match.question,
          explicitness: match.explicitness,
          chunkId: match.evidence[0].chunkId,
          quote: match.evidence[0].quote,
          reason: match.reason,
        })),
      ),
    );

    const report = {
      variant,
      document: relative,
      hierarchyConfiguration,
      batchStatistics: batchedAnalyzer?.statistics,
      chunks: result.chunks.length,
      timingsMs: {
        total: totalMs,
        chunking: phaseMs("chunking"),
        indexing: indexingMs,
        retrieval: phaseMs("retrieval"),
        analysis:
          totalMs - phaseMs("chunking") - indexingMs - phaseMs("retrieval"),
      },
      ollama: {
        indexingEmbed: summarize(indexingEmbeds),
        queryEmbed: summarize(queryEmbeds),
        rerank: summarize(calls.filter((call) => call.kind === "generate")),
        analyzer: summarize(calls.filter((call) => call.kind === "chat")),
      },
      analyzerCalls: calls
        .filter((call) => call.kind === "chat")
        .map((call) => ({ ...call, startMs: undefined })),
      loadedModels: modelSnapshots,
      matches,
      diagnostics: result.diagnostics,
    };
    const outputName = `${dimensionId}__${name.replace(/\.pdf$/, "")}.json`;
    await writeFile(
      path.join(outputDirectory, outputName),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `[${variant}] ${relative}: ${(totalMs / 1000).toFixed(1)}s, ${result.chunks.length} chunks, ${matches.length} matches`,
    );
  }
});
