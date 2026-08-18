import { Ollama } from "ollama";
import { resolve } from "node:path";

import { type Chunker, type Embedder, type Generator, type PipelineRetriever, type RagPipelineConfiguration, type RagPipelineDependencies, type RagPipelineResult, type Store, validateQuestion, } from "@/types/rag-pipeline-type";
import { DocumentChunker } from "../chunking/chunk-documents";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import { OllamaGenerator } from "../generation/ollama-generator";
import { Retriever } from "../retrieval/retrieval";
import { QdrantStore } from "../storage/vector-storage";
import { ragPipelineConfigurationFromEnvironment } from "./rag-pipeline-helper";

export { DEFAULT_RAG_PIPELINE_CONFIGURATION, positiveInteger, ragPipelineConfigurationFromEnvironment, storageFromEnvironment } from "./rag-pipeline-helper";
export type { RagPipelineConfiguration, RagPipelineDependencies, RagPipelineResult, } from "@/types/rag-pipeline-type";

export class RagPipeline {
  private readonly chunker: Chunker;
  private readonly embedder: Embedder;
  private readonly generator: Generator;
  private readonly retriever: PipelineRetriever;
  private readonly store: Store;

  constructor(
    config: RagPipelineConfiguration = ragPipelineConfigurationFromEnvironment(),
    dependencies: RagPipelineDependencies = {},
  ) {
    const ollamaClient = new Ollama(
      config.ollamaHost ? { host: config.ollamaHost } : undefined,
    );
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
    this.retriever =
      dependencies.retriever ??
      new Retriever(concreteStore, concreteEmbedder, config.retrieval);
    this.generator =
      dependencies.generator ??
      new OllamaGenerator(
        config.generation.model,
        resolve(config.generation.prompt),
        config.generation,
        ollamaClient,
      );
  }

  async run(documents: readonly File[], question: string): Promise<RagPipelineResult> {
    if (documents.length === 0) {
      throw new Error("At least one document is required.");
    }

    const questionError = validateQuestion(question);

    if (questionError) {
      throw new Error(questionError);
    }

    const normalizedQuestion = question.trim();
    const chunks = await this.chunker.chunkDocuments(documents);
    const vectors = await this.embedder.embed(chunks.map((chunk) => chunk.text));

    await this.store.upsert(chunks, vectors);

    const results = await this.retriever.retrieve(normalizedQuestion);
    const answer = await this.generator.generate(normalizedQuestion, results);

    return { answer, chunks, results };
  }
}