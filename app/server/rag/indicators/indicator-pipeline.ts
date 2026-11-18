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
import type { PipelineProgress } from "@/types/progress-types";
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
  horizonContext,
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

export const INDICATOR_PROMPT_PATHS = {
  discover: "prompts/indicator-discover.txt",
  answer: "prompts/indicator-answer.txt",
} as const;

const NO_PROGRESS: PipelineProgress = () => {};

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
    onProgress: PipelineProgress = NO_PROGRESS,
  ): Promise<IndicatorRetrievals> {
    const retrievals: IndicatorRetrievals = new Map();
    const indicators = gated.flatMap(({ category }) =>
      category.outcomes.flatMap((outcome) => outcome.indicators),
    );

    onProgress("indicator_retrieval", 0, indicators.length);
    for (const indicator of indicators) {
      const { results } = splitRankedCandidates(
        await this.retriever.rankCandidates(indicator.question, scope),
        { ...this.cutoff, topKPerQuery: this.configuration.chunksPerIndicator },
      );
      retrievals.set(indicator.id, results);
      onProgress("indicator_retrieval", retrievals.size, indicators.length);
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
    const discoveryResults = resultsMap(discoveryContext);
    const discovered = groundDocumentIndicators(
      await this.analyzer.discover(category, gated.matches, discoveryContext),
      discoveryResults,
    );

    const horizons: HorizonResult[] = [];
    for (const outcome of category.outcomes) {
      const documentIndicators = discovered.grounded.filter(
        (indicator) => indicator.horizon === outcome.horizon,
      );
      const usedPredefined =
        this.configuration.fallback === "always" ||
        documentIndicators.length === 0;
      const answerContext = usedPredefined
        ? outcomeContext(outcome, matchResults, indicatorResults)
        : [];
      const answers = usedPredefined
        ? await this.answerOutcome(gated, outcome, answerContext)
        : [];
      horizons.push({
        horizon: outcome.horizon,
        outcome,
        documentIndicators,
        usedPredefined,
        answers,
        context: horizonContext(
          documentIndicators,
          discoveryResults,
          answerContext,
        ),
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
    onProgress: PipelineProgress = NO_PROGRESS,
  ): Promise<CategoryIndicatorResult[]> {
    const hierarchyResults = searchResultsByChunkId(hierarchy.retrievals);
    const categories: CategoryIndicatorResult[] = [];
    onProgress("indicator_analysis", 0, gated.length);
    for (const category of gated) {
      categories.push(
        await this.analyzeCategory(
          category,
          indicatorResults,
          hierarchyResults,
        ),
      );
      onProgress("indicator_analysis", categories.length, gated.length);
    }
    return categories;
  }

  async run(
    ontology: IndicatorOntology,
    hierarchy: HierarchyPipelineResult,
    onProgress: PipelineProgress = NO_PROGRESS,
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
      onProgress,
    );
    return {
      categories: await this.analyze(
        gated,
        indicatorResults,
        hierarchy,
        onProgress,
      ),
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
      discover: resolve(INDICATOR_PROMPT_PATHS.discover),
      answer: resolve(INDICATOR_PROMPT_PATHS.answer),
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
