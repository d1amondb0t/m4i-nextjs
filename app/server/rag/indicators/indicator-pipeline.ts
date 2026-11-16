import { resolve } from "node:path";

import type {
  HierarchyConfiguration,
  HierarchyPipelineResult,
} from "@/types/hierarchy-types";
import {
  DEFAULT_INDICATOR_CONFIGURATION,
  type CategoryIndicatorResult,
  type GatedCategory,
  type HorizonResult,
  type IndicatorAnswer,
  type IndicatorConfiguration,
  type IndicatorOntology,
  type IndicatorPipelineResult,
  type OntologyOutcome,
} from "@/types/indicator-types";
import type {
  RagPipelineConfiguration,
  RankingRetriever,
} from "@/types/rag-pipeline-type";
import type { RetrievalScope } from "@/types/retrieval-types";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import {
  hierarchyConfigurationFor,
  splitRankedCandidates,
} from "../hierarchy/hierarchy-helper";
import { createOllamaClient } from "../ollama/ollama-client-helper";
import { Retriever } from "../retrieval/retrieval";
import type { SearchResult } from "../storage/storage-types";
import { QdrantStore } from "../storage/vector-storage";
import {
  categoryContext,
  gateCategories,
  groundAnswer,
  groundDocumentIndicators,
  matchEvidenceResults,
  outcomeContext,
  resultsMap,
  retrievalScopeFor,
  searchResultsByChunkId,
} from "./indicator-helper";
import {
  type IndicatorAnalyzer,
  OllamaIndicatorAnalyzer,
} from "./ollama-indicator-analyzer";

export type IndicatorRetrievals = Map<string, SearchResult[]>;

export class IndicatorPipeline {
  constructor(
    private readonly retriever: RankingRetriever,
    private readonly analyzer: IndicatorAnalyzer,
    private readonly configuration: IndicatorConfiguration,
    private readonly cutoff: HierarchyConfiguration,
  ) {}

  async retrieveIndicators(
    gated: readonly GatedCategory[],
    scope: RetrievalScope,
  ): Promise<IndicatorRetrievals> {
    const retrievals: IndicatorRetrievals = new Map();
    const indicators = gated.flatMap(({ category }) =>
      category.outcomes.flatMap((outcome) => outcome.indicators),
    );

    for (const indicator of indicators) {
      const { results } = splitRankedCandidates(
        await this.retriever.rankCandidates(indicator.question, scope),
        { ...this.cutoff, topKPerQuery: this.configuration.chunksPerIndicator },
      );
      retrievals.set(indicator.id, results);
    }
    return retrievals;
  }

  private async answerOutcome(
    gated: GatedCategory,
    outcome: OntologyOutcome,
    context: readonly SearchResult[],
  ): Promise<IndicatorAnswer[]> {
    const batches =
      this.configuration.answerBatch === "outcome"
        ? [outcome.indicators]
        : outcome.indicators.map((indicator) => [indicator]);
    const resultsByChunkId = resultsMap(context);
    const answers: IndicatorAnswer[] = [];

    for (const indicators of batches) {
      const extracted = await this.analyzer.answer(
        gated.category,
        outcome,
        indicators,
        gated.matches,
        context,
      );
      extracted.forEach((answer, index) =>
        answers.push(
          groundAnswer(
            answer,
            indicators[index],
            outcome.horizon,
            resultsByChunkId,
          ),
        ),
      );
    }
    return answers;
  }

  private async analyzeCategory(
    gated: GatedCategory,
    indicatorResults: IndicatorRetrievals,
    hierarchyResults: ReadonlyMap<string, SearchResult>,
  ): Promise<CategoryIndicatorResult> {
    const { category } = gated;
    const matchResults = matchEvidenceResults(gated.matches, hierarchyResults);
    const discoveryContext = categoryContext(
      category,
      matchResults,
      indicatorResults,
    );
    const discovered = groundDocumentIndicators(
      await this.analyzer.discover(category, gated.matches, discoveryContext),
      resultsMap(discoveryContext),
    );

    const horizons: HorizonResult[] = [];
    for (const outcome of category.outcomes) {
      const documentIndicators = discovered.grounded.filter(
        (indicator) => indicator.horizon === outcome.horizon,
      );
      const usedPredefined =
        this.configuration.fallback === "always" ||
        documentIndicators.length === 0;
      const answers = usedPredefined
        ? await this.answerOutcome(
            gated,
            outcome,
            outcomeContext(outcome, matchResults, indicatorResults),
          )
        : [];
      horizons.push({
        horizon: outcome.horizon,
        outcome,
        documentIndicators,
        usedPredefined,
        answers,
      });
    }

    return {
      dimensionId: gated.dimensionId,
      categoryId: category.id,
      categoryName: category.name,
      triggeringMatches: gated.matches,
      bestRerankerScore: gated.bestRerankerScore,
      ungroundedDocumentIndicators: discovered.ungrounded,
      horizons,
    };
  }

  async analyze(
    gated: readonly GatedCategory[],
    indicatorResults: IndicatorRetrievals,
    hierarchy: Pick<HierarchyPipelineResult, "retrievals">,
  ): Promise<CategoryIndicatorResult[]> {
    const hierarchyResults = searchResultsByChunkId(hierarchy.retrievals);
    const categories: CategoryIndicatorResult[] = [];
    for (const category of gated) {
      categories.push(
        await this.analyzeCategory(
          category,
          indicatorResults,
          hierarchyResults,
        ),
      );
    }
    return categories;
  }

  async run(
    ontology: IndicatorOntology,
    hierarchy: HierarchyPipelineResult,
  ): Promise<IndicatorPipelineResult> {
    const { gated, skipped } = gateCategories(
      ontology,
      hierarchy.framework,
      this.configuration.gate,
    );
    // Rerank every indicator question before the first generation, so the
    // reranker and the generation model are not swapped in and out of VRAM.
    const indicatorResults = await this.retrieveIndicators(
      gated,
      retrievalScopeFor(hierarchy.chunks),
    );
    return {
      categories: await this.analyze(gated, indicatorResults, hierarchy),
      skippedCategories: skipped,
    };
  }
}

export function createIndicatorPipeline(
  ragConfiguration: RagPipelineConfiguration,
  configuration: IndicatorConfiguration = DEFAULT_INDICATOR_CONFIGURATION,
): IndicatorPipeline {
  const hierarchyConfiguration = hierarchyConfigurationFor(
    ragConfiguration.reranking,
  );
  const client = createOllamaClient(ragConfiguration.ollamaHost);
  const retriever = new Retriever(
    new QdrantStore(ragConfiguration.storage, ragConfiguration.collection),
    new OllamaEmbedder(
      ragConfiguration.embeddingModel,
      ragConfiguration.embeddingBatchSize,
      ragConfiguration.queryPrefix,
      client,
    ),
    { ...ragConfiguration.retrieval, topK: configuration.chunksPerIndicator },
    { ...ragConfiguration.reranking, enabled: true },
    client,
  );
  const analyzer = new OllamaIndicatorAnalyzer(
    ragConfiguration.generation.model,
    {
      discover: resolve("prompts/indicator-discover.txt"),
      answer: resolve("prompts/indicator-answer.txt"),
    },
    configuration.maxContextWords,
    configuration.analyzerContextTokens,
    client,
  );
  return new IndicatorPipeline(
    retriever,
    analyzer,
    configuration,
    hierarchyConfiguration,
  );
}
