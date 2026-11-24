import { resolve } from "node:path";

import {
  type Chunker,
  type ComparingRetriever,
  type Embedder,
  type Generator,
  type RagPipelineConfiguration,
  type RagPipelineDependencies,
  type RagPipelineResult,
  type Store,
  validateQuestion,
} from "@/types/rag-pipeline-type";
import { createOllamaClient } from "../ollama/ollama-client-helper";
import { DocumentChunker } from "../chunking/chunk-documents";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import { OllamaGenerator } from "../generation/ollama-generator";
import { Retriever } from "../retrieval/retrieval";
import { QdrantStore } from "../storage/vector-storage";
import { ragPipelineConfigurationFromEnvironment } from "./rag-pipeline-helper";

export {
  DEFAULT_RAG_PIPELINE_CONFIGURATION,
  positiveInteger,
  ragPipelineConfigurationFromEnvironment,
  storageFromEnvironment,
} from "./rag-pipeline-helper";
export type {
  RagPipelineConfiguration,
  RagPipelineDependencies,
  RagPipelineResult,
} from "@/types/rag-pipeline-type";
import type { PipelineProgress } from "@/types/progress-types";

// Index the documents, retrieve and rerank, generate the answer.

export class RagPipeline {
  private readonly chunker: Chunker;
  private readonly embedder: Embedder;
  private readonly generator: Generator;
  private readonly rerankingModel: string;
  private readonly retriever: ComparingRetriever;
  private readonly store: Store;

  constructor(
    config: RagPipelineConfiguration = ragPipelineConfigurationFromEnvironment(),
    dependencies: RagPipelineDependencies = {},
  ) {
    const ollamaClient = createOllamaClient(config.ollamaHost);
    const concreteEmbedder = new OllamaEmbedder(
      config.embeddingModel,
      config.embeddingBatchSize,
      config.queryPrefix,
      ollamaClient,
    );
    const concreteStore = new QdrantStore(config.storage, config.collection);

    this.chunker = dependencies.chunker ?? new DocumentChunker(config.chunking);
    this.embedder = dependencies.embedder ?? concreteEmbedder;
    this.store = dependencies.store ?? concreteStore;
    this.rerankingModel = config.reranking.model;
    this.retriever =
      dependencies.retriever ??
      new Retriever(
        concreteStore,
        concreteEmbedder,
        config.retrieval,
        config.reranking,
        ollamaClient,
      );
    this.generator =
      dependencies.generator ??
      new OllamaGenerator(
        config.generation.model,
        resolve(config.generation.prompt),
        config.generation,
        ollamaClient,
      );
  }

  async run(
    documents: readonly File[],
    question: string,
    onProgress: PipelineProgress = () => {},
  ): Promise<RagPipelineResult> {
    if (documents.length === 0) {
      throw new Error("At least one document is required.");
    }

    const questionError = validateQuestion(question);

    if (questionError) {
      throw new Error(questionError);
    }

    const normalizedQuestion = question.trim();
    onProgress("indexing", 0, 1);
    const chunks = await this.chunker.chunkDocuments(documents);
    const vectors = await this.embedder.embed(
      chunks.map((chunk) => chunk.text),
    );

    await this.store.upsert(chunks, vectors);
    onProgress("retrieving", 0, 1);

    // Answer from the uploaded documents only, not everything in the collection.
    const { candidateCount, reranked, withoutReranking, outsideTopK } =
      await this.retriever.retrieveWithComparison(normalizedQuestion, {
        documentIds: [...new Set(chunks.map((chunk) => chunk.documentId))],
        indexFingerprints: [
          ...new Set(chunks.map((chunk) => chunk.metadata.indexFingerprint)),
        ],
      });
    onProgress("answering", 0, 1);
    const answer = await this.generator.generate(normalizedQuestion, reranked);
    onProgress("answering", 1, 1);

    return {
      answer,
      candidateCount,
      chunks,
      rerankingModel: this.rerankingModel,
      results: reranked,
      withoutReranking,
      outsideTopK,
    };
  }
}
