import { resolve } from "node:path";
import { Ollama } from "ollama";

import type {
  Chunker,
  Embedder,
  PipelineRetriever,
  RagPipelineConfiguration,
  Store,
} from "@/types/rag-pipeline-type";
import { DEFAULT_RERANKING_CONFIGURATION } from "@/types/retrieval-types";
import {
  DEFAULT_HIERARCHY_CONFIGURATION,
  type FrameworkCategory,
  type FrameworkDimension,
  type FrameworkOntology,
  type HierarchyCategoryDiagnostics,
  type HierarchyCategoryResult,
  type HierarchyConfiguration,
  type HierarchyPipelineResult,
} from "@/types/hierarchy-types";
import { DocumentChunker } from "../chunking/chunk-documents";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import { ragPipelineConfigurationFromEnvironment } from "../pipeline/rag-pipeline-helper";
import { Retriever } from "../retrieval/retrieval";
import { QdrantStore } from "../storage/vector-storage";
import {
  buildCategoryQuery,
  evidenceIsGrounded,
  parseFrameworkOntology,
} from "./hierarchy-helper";
import { type HierarchyAnalyzer, OllamaHierarchyAnalyzer } from "./ollama-hierarchy-analyzer";

export type HierarchyPipelineDependencies = {
  chunker?: Chunker;
  embedder?: Embedder;
  store?: Store;
  retriever?: PipelineRetriever;
  analyzer?: HierarchyAnalyzer;
};

function validateConfiguration(configuration: HierarchyConfiguration): void {
  for (const [name, value] of Object.entries(configuration)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number.`);
    }
  }

  if (!Number.isSafeInteger(configuration.topKPerQuery) || configuration.topKPerQuery <= 0) {
    throw new Error("topKPerQuery must be a positive integer.");
  }

  if (!Number.isSafeInteger(configuration.maxContextWords) || configuration.maxContextWords <= 0) {
    throw new Error("maxContextWords must be a positive integer.");
  }

  if (configuration.minimumRetrievalScore < 0 || configuration.minimumRetrievalScore > 1) {
    throw new Error("minimumRetrievalScore must be between 0 and 1.");
  }
}

export class HierarchyPipeline {
  private readonly analyzer: HierarchyAnalyzer;
  private readonly chunker: Chunker;
  private readonly configuration: HierarchyConfiguration;
  private readonly embedder: Embedder;
  private readonly retriever: PipelineRetriever;
  private readonly store: Store;

  constructor(
    ragConfiguration: RagPipelineConfiguration = ragPipelineConfigurationFromEnvironment(),
    configuration: HierarchyConfiguration = DEFAULT_HIERARCHY_CONFIGURATION,
    dependencies: HierarchyPipelineDependencies = {},
  ) {
    validateConfiguration(configuration);
    this.configuration = configuration;

    const client = new Ollama(
      ragConfiguration.ollamaHost ? { host: ragConfiguration.ollamaHost } : undefined,
    );
    const concreteEmbedder = new OllamaEmbedder(
      ragConfiguration.embeddingModel,
      ragConfiguration.embeddingBatchSize,
      ragConfiguration.queryPrefix,
      client,
    );
    const concreteStore = new QdrantStore(
      ragConfiguration.storage,
      ragConfiguration.collection,
    );

    this.chunker = dependencies.chunker ?? new DocumentChunker(ragConfiguration.chunking);
    this.embedder = dependencies.embedder ?? concreteEmbedder;
    this.store = dependencies.store ?? concreteStore;
    this.retriever =
      dependencies.retriever ??
      new Retriever(
        concreteStore,
        concreteEmbedder,
        {
          ...ragConfiguration.retrieval,
          topK: configuration.topKPerQuery,
        },
        {
          ...DEFAULT_RERANKING_CONFIGURATION,
          enabled: true,
        },
      );
    this.analyzer =
      dependencies.analyzer ??
      new OllamaHierarchyAnalyzer(
        ragConfiguration.generation.model,
        resolve("prompts/hierarchy-extract.txt"),
        configuration.maxContextWords,
        client,
      );
  }

  private async processCategory(
    dimension: FrameworkDimension,
    category: FrameworkCategory,
    documentIds: readonly string[],
  ): Promise<{ category: HierarchyCategoryResult; diagnostics: HierarchyCategoryDiagnostics }> {
    const matches: HierarchyCategoryResult["matches"] = [];
    const retrievedChunkIds = new Set<string>();
    const diagnostics: HierarchyCategoryDiagnostics = {
      categoryId: category.id,
      retrievedChunks: 0,
      matchedQuestions: 0,
      rejected: [],
    };

    for (const question of category.questions) {
      const query = buildCategoryQuery(dimension, category, question);
      const results = (await this.retriever.retrieve(query, documentIds)).filter(
        (result) => result.score >= this.configuration.minimumRetrievalScore,
      );
      for (const result of results) retrievedChunkIds.add(result.chunk.chunkId);
      if (results.length === 0) continue;

      const match = await this.analyzer.match(category, question, results);
      if (!match) continue;

      const resultsByChunkId = new Map(
        results.map((result) => [result.chunk.chunkId, result]),
      );
      if (!evidenceIsGrounded(match, resultsByChunkId)) {
        diagnostics.rejected.push({
          question,
          reason: "A cited chunk or verbatim evidence quote was not present in retrieval.",
        });
        continue;
      }

      matches.push({
        question,
        explicitness: match.explicitness,
        reason: match.reason,
        evidence: match.evidence.map((evidence) => {
          const result = resultsByChunkId.get(evidence.chunkId)!;
          return {
            chunkId: evidence.chunkId,
            source: result.chunk.source,
            page: result.chunk.page,
            chunk: result.chunk.number,
            retrievalScore: result.score,
            quote: evidence.quote,
          };
        }),
      });
    }

    diagnostics.retrievedChunks = retrievedChunkIds.size;
    diagnostics.matchedQuestions = matches.length;
    return { category: { ...category, matches }, diagnostics };
  }

  async run(
    documents: readonly File[],
    ontologyInput: FrameworkOntology | unknown,
  ): Promise<HierarchyPipelineResult> {
    if (documents.length === 0) {
      throw new Error("At least one document is required.");
    }

    const ontology = parseFrameworkOntology(ontologyInput);
    const chunks = await this.chunker.chunkDocuments(documents);
    const vectors = await this.embedder.embed(chunks.map((chunk) => chunk.text));
    await this.store.upsert(chunks, vectors);
    const documentIds = [...new Set(chunks.map((chunk) => chunk.documentId))];

    const dimensions: HierarchyPipelineResult["framework"]["dimensions"] = [];
    const diagnostics: HierarchyCategoryDiagnostics[] = [];

    for (const dimension of ontology.dimensions) {
      const categories: HierarchyCategoryResult[] = [];
      for (const category of dimension.categories) {
        const result = await this.processCategory(dimension, category, documentIds);
        categories.push(result.category);
        diagnostics.push(result.diagnostics);
      }
      dimensions.push({ ...dimension, categories });
    }

    return { chunks, diagnostics, framework: { dimensions } };
  }
}
