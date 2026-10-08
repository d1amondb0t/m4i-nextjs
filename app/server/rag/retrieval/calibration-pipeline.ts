import { Ollama } from "ollama";

import { DocumentChunker } from "../chunking/chunk-documents";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import { ragPipelineConfigurationFromEnvironment } from "../pipeline/rag-pipeline-helper";
import { Retriever } from "./retrieval";
import { QdrantStore } from "../storage/vector-storage";
import {
  DEFAULT_RERANKING_CONFIGURATION,
  type RerankingConfiguration,
  type RetrievalConfiguration,
  type RetrievalScope,
} from "@/types/retrieval-types";
import type {
  RagPipelineConfiguration,
  RagPipelineDependencies,
} from "@/types/rag-pipeline-type";
import { validateQuestion } from "@/types/rag-pipeline-type";

export type CalibrationOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
  embeddingModel?: string;
  retrieval?: Partial<RetrievalConfiguration>;
  reranking?: Partial<RerankingConfiguration>;
};

export function calibrationConfiguration(
  input: unknown,
  base = ragPipelineConfigurationFromEnvironment(),
): {
  rag: RagPipelineConfiguration;
  reranking: RerankingConfiguration;
} {
  if (input === undefined || input === null) input = {};
  if (typeof input !== "object" || Array.isArray(input))
    throw new Error("Configuration must be an object.");
  const options = input as CalibrationOptions;
  const retrieval = options.retrieval ?? {};
  const reranking = options.reranking ?? {};
  if (
    typeof retrieval !== "object" ||
    Array.isArray(retrieval) ||
    typeof reranking !== "object" ||
    Array.isArray(reranking)
  )
    throw new Error("Retrieval and reranking configurations must be objects.");
  const chunkSize = options.chunkSize ?? base.chunking.wordSize;
  const chunkOverlap = options.chunkOverlap ?? base.chunking.overlapWords;
  if (
    !Number.isSafeInteger(chunkSize) ||
    chunkSize <= 0 ||
    !Number.isSafeInteger(chunkOverlap) ||
    chunkOverlap < 0 ||
    chunkOverlap >= chunkSize
  )
    throw new Error(
      "Chunk size must be positive and overlap must be smaller than chunk size.",
    );
  if (
    options.embeddingModel !== undefined &&
    (typeof options.embeddingModel !== "string" ||
      !options.embeddingModel.trim())
  )
    throw new Error("embeddingModel must be a non-empty string.");
  const topK = retrieval.topK ?? 20;

  if (!Number.isSafeInteger(topK) || topK <= 0 || topK > 100)
    throw new Error("retrieval.topK must be between 1 and 100.");
  const strategy = retrieval.strategy ?? "dense";

  if (strategy !== "dense" && strategy !== "sparse")
    throw new Error("Only dense and sparse retrieval are implemented.");
  const enabled = reranking.enabled ?? false;

  if (typeof enabled !== "boolean")
    throw new Error("reranking.enabled must be boolean.");
  const rerankingStrategy = reranking.strategy ?? "cross_encoder";

  if (rerankingStrategy !== "cross_encoder")
    throw new Error("Only cross_encoder reranking is implemented.");
  const rerankingModel =
    reranking.model ?? DEFAULT_RERANKING_CONFIGURATION.model;

  if (typeof rerankingModel !== "string" || !rerankingModel.trim())
    throw new Error("reranking.model must be a non-empty string.");
  const candidates = reranking.candidates ?? Math.max(20, topK);

  if (
    !Number.isSafeInteger(candidates) ||
    candidates < topK ||
    candidates > 100
  )
    throw new Error("reranking.candidates must be between topK and 100.");
  return {
    rag: {
      ...base,
      chunking: { wordSize: chunkSize, overlapWords: chunkOverlap },
      embeddingModel: options.embeddingModel?.trim() || base.embeddingModel,
      retrieval: { ...base.retrieval, strategy, topK },
    },
    reranking: {
      enabled,
      strategy: rerankingStrategy,
      model: rerankingModel.trim(),
      candidates,
    },
  };
}

export class CalibrationPipeline {
  constructor(
    private readonly configuration: ReturnType<typeof calibrationConfiguration>,
    private readonly dependencies: Pick<
      RagPipelineDependencies,
      "chunker" | "embedder" | "store" | "retriever"
    > = {},
  ) {}

  async run(documents: readonly File[], questions: readonly string[]) {
    if (documents.length === 0)
      throw new Error("At least one document is required.");
    if (questions.length === 0)
      throw new Error("At least one question is required.");
    for (const question of questions) {
      const error =
        typeof question === "string"
          ? validateQuestion(question)
          : "Questions must be strings.";
      if (error) throw new Error(error);
    }
    const config = this.configuration.rag;
    const ollama = new Ollama(
      config.ollamaHost ? { host: config.ollamaHost } : undefined,
    );
    const embedder =
      this.dependencies.embedder ??
      new OllamaEmbedder(
        config.embeddingModel,
        config.embeddingBatchSize,
        config.queryPrefix,
        ollama,
      );
    const store =
      this.dependencies.store ??
      new QdrantStore(config.storage, config.collection);
    const retriever =
      this.dependencies.retriever ??
      new Retriever(
        store as QdrantStore,
        embedder as OllamaEmbedder,
        config.retrieval,
        this.configuration.reranking,
      );
    const chunker =
      this.dependencies.chunker ?? new DocumentChunker(config.chunking);
    const chunks = await chunker.chunkDocuments(documents);
    const vectors = await embedder.embed(chunks.map((chunk) => chunk.text));
    await store.upsert(chunks, vectors);
    const scope: RetrievalScope = {
      documentIds: [...new Set(chunks.map((chunk) => chunk.documentId))],
      indexFingerprints: [
        ...new Set(chunks.map((chunk) => chunk.metadata.indexFingerprint)),
      ],
    };
    const results = [];
    for (const question of questions) {
      const matches = await retriever.retrieve(question.trim(), scope);
      results.push({
        question,
        matches: matches.map(({ chunk, score }, index) => ({
          rank: index + 1,
          score,
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          source: chunk.source,
          page: chunk.page,
          chunk: chunk.number,
          text: chunk.text,
        })),
      });
    }
    return { indexedChunks: chunks.length, results };
  }
}
