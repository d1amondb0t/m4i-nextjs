import { resolve } from "node:path";
import { Ollama } from "ollama";

import type {
  Chunker,
  Embedder,
  PipelineRetriever,
  RagPipelineConfiguration,
  Store,
} from "@/types/rag-pipeline-type";
import {
  DEFAULT_HIERARCHY_CONFIGURATION,
  type ExtractedHierarchyCandidate,
  type FrameworkCategory,
  type FrameworkDimension,
  type FrameworkOntology,
  type HierarchyCategoryDiagnostics,
  type HierarchyCategoryResult,
  type HierarchyConfiguration,
  type HierarchyItem,
  type HierarchyItemKind,
  type HierarchyPipelineResult,
  type HierarchyValidation,
} from "@/types/hierarchy-types";
import { DocumentChunker } from "../chunking/chunk-documents";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import { ragPipelineConfigurationFromEnvironment } from "../pipeline/rag-pipeline-helper";
import { Retriever } from "../retrieval/retrieval";
import type { SearchResult } from "../storage/storage-types";
import { QdrantStore } from "../storage/vector-storage";
import {
  buildCategoryQuery,
  evidenceIsGrounded,
  mergeSearchResults,
  normalizedCandidateText,
  parseFrameworkOntology,
  validationPasses,
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

type AcceptedCandidate = {
  id: string;
  kind: HierarchyItemKind;
  item: HierarchyItem;
};

type CategoryDraft = {
  dimension: FrameworkDimension;
  category: FrameworkCategory;
  accepted: AcceptedCandidate[];
  diagnostics: HierarchyCategoryDiagnostics;
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

  for (const [name, value] of Object.entries(configuration)) {
    if (name.startsWith("minimum") && (value < 0 || value > 1)) {
      throw new Error(`${name} must be between 0 and 1.`);
    }
  }
}

function evidenceKey(evidence: HierarchyItem["evidence"][number]): string {
  return `${evidence.chunkId}:${evidence.quote}`;
}

function mergeEvidence(
  left: HierarchyItem["evidence"],
  right: HierarchyItem["evidence"],
): HierarchyItem["evidence"] {
  const merged = new Map(left.map((evidence) => [evidenceKey(evidence), evidence]));

  for (const evidence of right) {
    merged.set(evidenceKey(evidence), evidence);
  }

  return [...merged.values()];
}

function itemFromCandidate(
  candidate: ExtractedHierarchyCandidate,
  validation: HierarchyValidation,
  resultsByChunkId: ReadonlyMap<string, SearchResult>,
  accepted: boolean,
): HierarchyItem {
  return {
    text: candidate.text,
    explicitness: candidate.explicitness,
    evidence: candidate.evidence.map((evidence) => {
      const result = resultsByChunkId.get(evidence.chunkId);

      if (!result) {
        throw new Error(`Validated evidence chunk ${evidence.chunkId} was not retrieved.`);
      }

      return {
        chunkId: result.chunk.chunkId,
        source: result.chunk.source,
        page: result.chunk.page,
        chunk: result.chunk.number,
        retrievalScore: result.score,
        quote: evidence.quote,
      };
    }),
    assessment: {
      accepted,
      categoryFit: validation.categoryFit,
      typeFit: validation.typeFit,
      evidenceSupport: validation.evidenceSupport,
      specificity: validation.specificity,
      reason: validation.reason,
    },
  };
}

function consolidateCandidates(drafts: CategoryDraft[]): void {
  const owners = new Map<string, { draft: CategoryDraft; candidate: AcceptedCandidate }>();

  for (const draft of drafts) {
    const categoryCandidates = new Map<string, AcceptedCandidate>();

    for (const candidate of draft.accepted) {
      const key = `${candidate.kind}:${normalizedCandidateText(candidate.item.text)}`;
      const existing = categoryCandidates.get(key);

      if (!existing) {
        categoryCandidates.set(key, candidate);
        continue;
      }

      const preferred =
        candidate.item.assessment.evidenceSupport >
        existing.item.assessment.evidenceSupport
          ? candidate
          : existing;
      preferred.item.evidence = mergeEvidence(
        existing.item.evidence,
        candidate.item.evidence,
      );
      categoryCandidates.set(key, preferred);
      draft.diagnostics.rejected.push({
        candidateId: preferred === candidate ? existing.id : candidate.id,
        text: preferred === candidate ? existing.item.text : candidate.item.text,
        reason: "Consolidated with an equivalent candidate in the same category.",
      });
    }

    draft.accepted = [...categoryCandidates.values()];
  }

  for (const draft of drafts) {
    for (const candidate of [...draft.accepted]) {
      const key = `${candidate.kind}:${normalizedCandidateText(candidate.item.text)}`;
      const owner = owners.get(key);

      if (!owner) {
        owners.set(key, { draft, candidate });
        continue;
      }

      const candidateFit = candidate.item.assessment.categoryFit;
      const ownerFit = owner.candidate.item.assessment.categoryFit;
      const winner = candidateFit > ownerFit ? { draft, candidate } : owner;
      const loser = winner.candidate === candidate ? owner : { draft, candidate };

      loser.draft.accepted = loser.draft.accepted.filter(
        (entry) => entry !== loser.candidate,
      );
      winner.candidate.item.evidence = mergeEvidence(
        winner.candidate.item.evidence,
        loser.candidate.item.evidence,
      );
      loser.draft.diagnostics.rejected.push({
        candidateId: loser.candidate.id,
        text: loser.candidate.item.text,
        reason: `Assigned to the better-fitting category "${winner.draft.category.name}".`,
      });
      owners.set(key, winner);
    }
  }

  for (const draft of drafts) {
    draft.diagnostics.acceptedCandidates = draft.accepted.length;
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
      new Retriever(concreteStore, concreteEmbedder, {
        ...ragConfiguration.retrieval,
        topK: configuration.topKPerQuery,
      });
    this.analyzer =
      dependencies.analyzer ??
      new OllamaHierarchyAnalyzer(
        ragConfiguration.generation.model,
        resolve("prompts/hierarchy-extract.txt"),
        resolve("prompts/hierarchy-validate.txt"),
        configuration.maxContextWords,
        client,
      );
  }

  private async processCategory(
    dimension: FrameworkDimension,
    category: FrameworkCategory,
    documentIds: readonly string[],
  ): Promise<CategoryDraft> {
    const outcomeQuery = buildCategoryQuery(dimension, category, "outcome");
    const indicatorQuery = buildCategoryQuery(dimension, category, "indicator");
    const [outcomeResults, indicatorResults] = await Promise.all([
      this.retriever.retrieve(outcomeQuery, documentIds),
      this.retriever.retrieve(indicatorQuery, documentIds),
    ]);
    const results = mergeSearchResults(
      [outcomeResults, indicatorResults],
      this.configuration.minimumRetrievalScore,
    );
    const diagnostics: HierarchyCategoryDiagnostics = {
      categoryId: category.id,
      outcomeQuery,
      indicatorQuery,
      retrievedChunks: results.length,
      extractedCandidates: 0,
      acceptedCandidates: 0,
      rejected: [],
    };

    if (results.length === 0) {
      return { dimension, category, accepted: [], diagnostics };
    }

    const extracted = await this.analyzer.extract(category, results);
    diagnostics.extractedCandidates = extracted.length;
    const resultsByChunkId = new Map(
      results.map((result) => [result.chunk.chunkId, result]),
    );
    const grounded = extracted.filter((candidate) => {
      const valid = evidenceIsGrounded(candidate, resultsByChunkId);

      if (!valid) {
        diagnostics.rejected.push({
          candidateId: candidate.id,
          text: candidate.text,
          reason: "A cited chunk or verbatim evidence quote was not present in retrieval.",
        });
      }

      return valid;
    });
    const validations = await this.analyzer.validate(category, grounded, results);
    const validationByCandidateId = new Map(
      validations.map((validation) => [validation.candidateId, validation]),
    );
    const accepted: AcceptedCandidate[] = [];

    for (const candidate of grounded) {
      const validation = validationByCandidateId.get(candidate.id);

      if (!validation) {
        diagnostics.rejected.push({
          candidateId: candidate.id,
          text: candidate.text,
          reason: "The validation stage did not assess this candidate.",
        });
        continue;
      }

      const passes = validationPasses(validation, this.configuration);

      if (!passes) {
        diagnostics.rejected.push({
          candidateId: candidate.id,
          text: candidate.text,
          reason: `Below validation threshold: ${validation.reason}`,
        });
        continue;
      }

      accepted.push({
        id: candidate.id,
        kind: candidate.kind,
        item: itemFromCandidate(candidate, validation, resultsByChunkId, true),
      });
    }

    diagnostics.acceptedCandidates = accepted.length;
    return { dimension, category, accepted, diagnostics };
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

    const drafts: CategoryDraft[] = [];

    for (const dimension of ontology.dimensions) {
      for (const category of dimension.categories) {
        drafts.push(await this.processCategory(dimension, category, documentIds));
      }
    }

    consolidateCandidates(drafts);
    const draftByCategoryId = new Map(
      drafts.map((draft) => [draft.category.id, draft]),
    );

    return {
      chunks,
      diagnostics: drafts.map((draft) => draft.diagnostics),
      framework: {
        dimensions: ontology.dimensions.map((dimension) => ({
          id: dimension.id,
          name: dimension.name,
          definition: dimension.definition,
          categories: dimension.categories.map((category): HierarchyCategoryResult => {
            const draft = draftByCategoryId.get(category.id);
            const accepted = draft?.accepted ?? [];

            return {
              ...category,
              outcomes: accepted
                .filter((candidate) => candidate.kind === "outcome")
                .map((candidate) => candidate.item),
              indicators: accepted
                .filter((candidate) => candidate.kind === "indicator")
                .map((candidate) => candidate.item),
            };
          }),
        })),
      },
    };
  }
}
