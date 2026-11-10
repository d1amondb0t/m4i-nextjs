import { resolve } from "node:path";
import { Ollama } from "ollama";

import type {
  Chunker,
  Embedder,
  PipelineRetriever,
  RagPipelineConfiguration,
  Store,
} from "@/types/rag-pipeline-type";
import type { RetrievalScope } from "@/types/retrieval-types";
import {
  type ExtractedHierarchyMatch,
  type FrameworkCategory,
  type FrameworkOntology,
  type HierarchyCategoryDiagnostics,
  type HierarchyCategoryResult,
  type HierarchyConfiguration,
  type HierarchyPipelineResult,
  type QuestionRetrieval,
} from "@/types/hierarchy-types";
import { mapWithConcurrency } from "../concurrency-helper";
import { DocumentChunker } from "../chunking/chunk-documents";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import { ragPipelineConfigurationFromEnvironment } from "../pipeline/rag-pipeline-helper";
import { Retriever } from "../retrieval/retrieval";
import { QdrantStore } from "../storage/vector-storage";
import {
  evidenceIsGrounded,
  hierarchyConfigurationFor,
  hierarchyRetrievedChunk,
  parseFrameworkOntology,
} from "./hierarchy-helper";
import {
  type HierarchyAnalyzer,
  OllamaHierarchyAnalyzer,
} from "./ollama-hierarchy-analyzer";

export type HierarchyPipelineDependencies = {
  chunker?: Chunker;
  embedder?: Embedder;
  store?: Store;
  retriever?: PipelineRetriever;
  analyzer?: HierarchyAnalyzer;
};

const POSITIVE_INTEGER_SETTINGS = [
  "topKPerQuery",
  "maxContextWords",
  "retrievalConcurrency",
  "analysisConcurrency",
  "analyzerContextTokens",
] as const satisfies readonly (keyof HierarchyConfiguration)[];

function validateConfiguration(configuration: HierarchyConfiguration): void {
  for (const [name, value] of Object.entries(configuration)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number.`);
    }
  }

  for (const name of POSITIVE_INTEGER_SETTINGS) {
    if (
      !Number.isSafeInteger(configuration[name]) ||
      configuration[name] <= 0
    ) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }

  if (
    configuration.minimumRetrievalScore < 0 ||
    configuration.minimumRetrievalScore > 1
  ) {
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
    configuration: HierarchyConfiguration = hierarchyConfigurationFor(
      ragConfiguration.reranking,
    ),
    dependencies: HierarchyPipelineDependencies = {},
  ) {
    validateConfiguration(configuration);
    this.configuration = configuration;

    const client = new Ollama(
      ragConfiguration.ollamaHost
        ? { host: ragConfiguration.ollamaHost }
        : undefined,
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

    this.chunker =
      dependencies.chunker ?? new DocumentChunker(ragConfiguration.chunking);
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
          ...ragConfiguration.reranking,
          enabled: true,
        },
        client,
      );
    this.analyzer =
      dependencies.analyzer ??
      new OllamaHierarchyAnalyzer(
        ragConfiguration.generation.model,
        resolve("prompts/hierarchy-extract.txt"),
        configuration.maxContextWords,
        configuration.analyzerContextTokens,
        client,
      );
  }

  private async retrieveOntology(
    ontology: FrameworkOntology,
    scope: RetrievalScope,
  ): Promise<Map<string, QuestionRetrieval[]>> {
    const jobs = ontology.dimensions.flatMap((dimension) =>
      dimension.categories.flatMap((category) =>
        category.questions.map((question) => ({
          categoryId: category.id,
          question,
        })),
      ),
    );
    // Retrieve and rerank with the question alone: adding the category
    // definition and include/exclude lists made every tested cross-encoder
    // close to random. The analyzer still receives the full category.
    const results = await mapWithConcurrency(
      jobs,
      this.configuration.retrievalConcurrency,
      async ({ question }) =>
        (await this.retriever.retrieve(question, scope)).filter(
          (result) => result.score >= this.configuration.minimumRetrievalScore,
        ),
    );

    const retrievals = new Map<string, QuestionRetrieval[]>();
    jobs.forEach(({ categoryId, question }, index) => {
      const questions = retrievals.get(categoryId) ?? [];
      questions.push({ question, results: results[index] });
      retrievals.set(categoryId, questions);
    });
    return retrievals;
  }

  private async matchCandidates(
    categories: readonly FrameworkCategory[],
    retrievals: ReadonlyMap<string, QuestionRetrieval[]>,
  ): Promise<Map<string, ExtractedHierarchyMatch[][]>> {
    const jobs = categories.flatMap((category) =>
      retrievals
        .get(category.id)!
        .map((retrieval) => ({ category, retrieval })),
    );
    const candidates = await mapWithConcurrency(
      jobs,
      this.configuration.analysisConcurrency,
      async ({ category, retrieval }) =>
        retrieval.results.length === 0
          ? []
          : this.analyzer.match(
              category,
              retrieval.question,
              retrieval.results,
            ),
    );

    const byCategory = new Map<string, ExtractedHierarchyMatch[][]>();
    jobs.forEach(({ category }, index) => {
      const questions = byCategory.get(category.id) ?? [];
      questions.push(candidates[index]);
      byCategory.set(category.id, questions);
    });
    return byCategory;
  }

  private analyzeCategory(
    category: FrameworkCategory,
    retrievals: readonly QuestionRetrieval[],
    candidatesPerQuestion: readonly ExtractedHierarchyMatch[][],
  ): {
    category: HierarchyCategoryResult;
    diagnostics: HierarchyCategoryDiagnostics;
  } {
    const matches: HierarchyCategoryResult["matches"] = [];
    const retrievedChunkIds = new Set<string>();
    const diagnostics: HierarchyCategoryDiagnostics = {
      categoryId: category.id,
      retrievedChunks: 0,
      matchedQuestions: 0,
      matchedCandidates: 0,
      questions: [],
      rejected: [],
    };

    for (const [index, { question, results }] of retrievals.entries()) {
      for (const result of results) retrievedChunkIds.add(result.chunk.chunkId);
      const questionDiagnostics = {
        question,
        retrievedChunks: results.length,
        chunks: results.map(hierarchyRetrievedChunk),
        generatedCandidates: 0,
        acceptedCandidates: 0,
      };
      diagnostics.questions.push(questionDiagnostics);
      if (results.length === 0) continue;

      const candidates = candidatesPerQuestion[index];
      questionDiagnostics.generatedCandidates = candidates.length;

      const resultsByChunkId = new Map(
        results.map((result) => [result.chunk.chunkId, result]),
      );
      const seenPassages = new Set<string>();
      for (const match of candidates) {
        if (!evidenceIsGrounded(match, resultsByChunkId)) {
          diagnostics.rejected.push({
            question,
            reason:
              "A cited chunk or verbatim evidence quote was not present in retrieval.",
          });
          continue;
        }
        const passageKey = match.evidence
          .map(
            (evidence) =>
              `${evidence.chunkId}:${evidence.quote.replace(/\s+/g, " ").trim().toLowerCase()}`,
          )
          .sort()
          .join("|");
        if (seenPassages.has(passageKey)) {
          diagnostics.rejected.push({
            question,
            reason: "Duplicate quoted passage for this question.",
          });
          continue;
        }
        seenPassages.add(passageKey);

        matches.push({
          question,
          explicitness: match.explicitness,
          reason: match.reason,
          evidence: match.evidence.map((evidence) => ({
            ...hierarchyRetrievedChunk(resultsByChunkId.get(evidence.chunkId)!),
            quote: evidence.quote,
          })),
        });
        questionDiagnostics.acceptedCandidates += 1;
      }
    }

    diagnostics.retrievedChunks = retrievedChunkIds.size;
    diagnostics.matchedQuestions = new Set(
      matches.map((match) => match.question),
    ).size;
    diagnostics.matchedCandidates = matches.length;
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
    const vectors = await this.embedder.embed(
      chunks.map((chunk) => chunk.text),
    );
    await this.store.upsert(chunks, vectors);
    const scope = {
      documentIds: [...new Set(chunks.map((chunk) => chunk.documentId))],
      indexFingerprints: [
        ...new Set(chunks.map((chunk) => chunk.metadata.indexFingerprint)),
      ],
    } satisfies RetrievalScope;

    // Reranker and generation models do not fit in VRAM together, so all
    // reranking finishes before the first generation to avoid swapping them.
    const retrievals = await this.retrieveOntology(ontology, scope);
    const candidates = await this.matchCandidates(
      ontology.dimensions.flatMap((dimension) => dimension.categories),
      retrievals,
    );

    const dimensions: HierarchyPipelineResult["framework"]["dimensions"] = [];
    const diagnostics: HierarchyCategoryDiagnostics[] = [];

    for (const dimension of ontology.dimensions) {
      const categories: HierarchyCategoryResult[] = [];
      for (const category of dimension.categories) {
        const result = this.analyzeCategory(
          category,
          retrievals.get(category.id)!,
          candidates.get(category.id)!,
        );
        categories.push(result.category);
        diagnostics.push(result.diagnostics);
      }
      dimensions.push({ ...dimension, categories });
    }

    return { chunks, diagnostics, framework: { dimensions } };
  }
}
