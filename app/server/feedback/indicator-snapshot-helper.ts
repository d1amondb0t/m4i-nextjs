import type {
  IndicatorRunSettings,
  SnapshotItemInput,
  SnapshotQuestionInput,
} from "@/types/feedback-types";
import type {
  DocumentIndicator,
  IndicatorAnswer,
  IndicatorOntology,
  IndicatorPipelineResult,
  MatchGate,
} from "@/types/indicator-types";
import { snapshotChunk } from "./snapshot-helper";

function documentIndicatorItem(
  indicator: DocumentIndicator,
): SnapshotItemInput {
  return {
    kind: "document_indicator",
    answer: indicator.value,
    explicitness: null,
    indicator: { source: "document", name: indicator.name },
    evidence: [
      { chunkId: indicator.evidence.chunkId, quote: indicator.evidence.quote },
    ],
  };
}

function indicatorAnswerItem(answer: IndicatorAnswer): SnapshotItemInput {
  return {
    kind: "indicator_answer",
    answer: answer.answer,
    explicitness: null,
    indicator: {
      source: "predefined",
      indicatorId: answer.indicator.id,
      name: answer.indicator.name,
      question: answer.indicator.question,
      answerType: answer.indicator.answerType,
      basis: answer.basis,
      confidence: answer.confidence,
      rationale: answer.rationale,
      groundingFailed: answer.groundingFailed,
    },
    evidence: answer.evidence
      ? [{ chunkId: answer.evidence.chunkId, quote: answer.evidence.quote }]
      : [],
  };
}

export function indicatorSnapshotQuestions(
  ontology: IndicatorOntology,
  result: IndicatorPipelineResult,
): SnapshotQuestionInput[] {
  const dimensions = new Map(
    ontology.dimensions.map((dimension) => [dimension.id, dimension]),
  );

  return result.categories.flatMap((category) => {
    const dimension = dimensions.get(category.dimensionId)!;
    const definition = dimension.categories.find(
      (entry) => entry.id === category.categoryId,
    )!.definition;

    return category.horizons.map((horizon) => ({
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      categoryDefinition: definition,
      question: horizon.outcome.statement,
      horizon: horizon.horizon,
      nearestOntologyQuestion: null,
      nearestOntologySimilarity: null,
      items: [
        ...horizon.documentIndicators.map(documentIndicatorItem),
        ...horizon.answers.map(indicatorAnswerItem),
      ],
      chunks: horizon.context.map((context, index) =>
        snapshotChunk(context, "sent", null, index + 1),
      ),
    }));
  });
}

export function indicatorRunSettings(
  ontologyFile: string,
  gate: MatchGate,
  result: IndicatorPipelineResult,
): IndicatorRunSettings {
  return {
    ontologyFile,
    gate,
    triggeredCategories: result.categories.map(
      ({ categoryId, bestRerankerScore }) => ({
        categoryId,
        bestRerankerScore,
      }),
    ),
    skippedCategories: result.skippedCategories,
  };
}
