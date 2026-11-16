import type { DocumentChunk } from "@/types/chunk-type";
import type {
  CategoryRetrievals,
  HierarchyEvidence,
  HierarchyMatch,
  HierarchyPipelineResult,
} from "@/types/hierarchy-types";
import {
  INDICATOR_ANSWER_TYPES,
  OUTCOME_HORIZONS,
  type DocumentIndicator,
  type ExtractedDocumentIndicator,
  type ExtractedIndicatorAnswer,
  type GatedCategory,
  type IndicatorAnswer,
  type IndicatorAnswerType,
  type IndicatorCategory,
  type IndicatorOntology,
  type MatchGate,
  type OntologyIndicator,
  type OntologyOutcome,
  type OutcomeHorizon,
} from "@/types/indicator-types";
import type { RetrievalScope } from "@/types/retrieval-types";
import type { SearchResult } from "../storage/storage-types";
import {
  hierarchyRetrievedChunk,
  isRecord,
  normalizedEvidenceText,
  parseFrameworkOntology,
  requireNonEmptyText,
} from "../hierarchy/hierarchy-helper";

function requiredString(value: unknown, location: string): string {
  return requireNonEmptyText(value, `${location} must be a non-empty string.`);
}

function parseOptions(value: unknown, location: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error(`${location} must list at least two options.`);
  }
  return value.map((option, index) =>
    requiredString(option, `${location}[${index}]`),
  );
}

function parseIndicator(value: unknown, location: string): OntologyIndicator {
  if (!isRecord(value)) throw new Error(`${location} must be an object.`);

  const answerType = value.answerType as IndicatorAnswerType;
  if (!INDICATOR_ANSWER_TYPES.includes(answerType)) {
    throw new Error(
      `${location}.answerType must be one of ${INDICATOR_ANSWER_TYPES.join(", ")}.`,
    );
  }

  const options = parseOptions(value.options, `${location}.options`);
  if ((answerType === "status") !== Boolean(options)) {
    throw new Error(
      `${location} must have options exactly when its answerType is status.`,
    );
  }

  return {
    id: requiredString(value.id, `${location}.id`),
    name: requiredString(value.name, `${location}.name`),
    question: requiredString(value.question, `${location}.question`),
    answerType,
    ...(value.unit === undefined
      ? {}
      : { unit: requiredString(value.unit, `${location}.unit`) }),
    ...(options ? { options } : {}),
  };
}

function parseOutcome(value: unknown, location: string): OntologyOutcome {
  if (!isRecord(value)) throw new Error(`${location} must be an object.`);

  const horizon = value.horizon as OutcomeHorizon;
  if (!OUTCOME_HORIZONS.includes(horizon)) {
    throw new Error(
      `${location}.horizon must be one of ${OUTCOME_HORIZONS.join(", ")}.`,
    );
  }
  if (!Array.isArray(value.indicators) || value.indicators.length === 0) {
    throw new Error(`${location}.indicators must contain an indicator.`);
  }

  return {
    id: requiredString(value.id, `${location}.id`),
    horizon,
    statement: requiredString(value.statement, `${location}.statement`),
    indicators: value.indicators.map((indicator, index) =>
      parseIndicator(indicator, `${location}.indicators[${index}]`),
    ),
  };
}

function parseOutcomes(value: unknown, location: string): OntologyOutcome[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${location} must contain at least one outcome.`);
  }

  const outcomes = value.map((outcome, index) =>
    parseOutcome(outcome, `${location}[${index}]`),
  );
  const horizons = outcomes.map((outcome) => outcome.horizon);
  if (new Set(horizons).size !== horizons.length) {
    throw new Error(`${location} must have one outcome per horizon.`);
  }
  return outcomes;
}

function requireUniqueIndicatorIds(ontology: IndicatorOntology): void {
  const seen = new Set<string>();
  for (const indicator of ontologyIndicators(ontology)) {
    if (seen.has(indicator.id)) {
      throw new Error(`Indicator id "${indicator.id}" is duplicated.`);
    }
    seen.add(indicator.id);
  }
}

export function parseIndicatorOntology(value: unknown): IndicatorOntology {
  const framework = parseFrameworkOntology(value);
  const rawDimensions = (value as { dimensions: unknown[] }).dimensions;

  const ontology = {
    dimensions: framework.dimensions.map((dimension, dimensionIndex) => {
      const rawCategories = (
        rawDimensions[dimensionIndex] as { categories: unknown[] }
      ).categories;
      return {
        ...dimension,
        categories: dimension.categories.map((category, categoryIndex) => ({
          ...category,
          outcomes: parseOutcomes(
            (rawCategories[categoryIndex] as Record<string, unknown>).outcomes,
            `dimensions[${dimensionIndex}].categories[${categoryIndex}].outcomes`,
          ),
        })),
      };
    }),
  };

  requireUniqueIndicatorIds(ontology);
  return ontology;
}

export function ontologyIndicators(
  ontology: IndicatorOntology,
): OntologyIndicator[] {
  return ontology.dimensions.flatMap((dimension) =>
    dimension.categories.flatMap((category) =>
      category.outcomes.flatMap((outcome) => outcome.indicators),
    ),
  );
}

export function matchRerankerScore(match: HierarchyMatch): number {
  return Math.max(
    0,
    ...match.evidence.map((evidence) => evidence.scores.rerankerScore ?? 0),
  );
}

export function passesGate(match: HierarchyMatch, gate: MatchGate): boolean {
  return (
    matchRerankerScore(match) >= gate.minimumRerankerScore &&
    (!gate.requireExplicit || match.explicitness === "explicit")
  );
}

export function gateCategories(
  ontology: IndicatorOntology,
  framework: HierarchyPipelineResult["framework"],
  gate: MatchGate,
) {
  const matchesByCategory = new Map(
    framework.dimensions.flatMap((dimension) =>
      dimension.categories.map((category) => [category.id, category.matches]),
    ),
  );
  const gated: GatedCategory[] = [];
  const skipped: { categoryId: string; bestRerankerScore: number }[] = [];

  for (const dimension of ontology.dimensions) {
    for (const category of dimension.categories) {
      const matches = matchesByCategory.get(category.id) ?? [];
      const passing = matches
        .filter((match) => passesGate(match, gate))
        .sort((a, b) => matchRerankerScore(b) - matchRerankerScore(a));
      const bestRerankerScore = Math.max(0, ...matches.map(matchRerankerScore));

      if (passing.length >= gate.minimumMatches) {
        gated.push({
          dimensionId: dimension.id,
          category,
          matches: passing,
          bestRerankerScore,
        });
      } else {
        skipped.push({ categoryId: category.id, bestRerankerScore });
      }
    }
  }

  return { gated, skipped };
}

export function searchResultsByChunkId(
  retrievals: readonly CategoryRetrievals[],
): Map<string, SearchResult> {
  const results = new Map<string, SearchResult>();
  for (const category of retrievals) {
    for (const question of category.questions) {
      for (const result of [
        ...question.results,
        ...question.droppedBelowCutoff,
        ...question.droppedOutsideTopK,
      ]) {
        results.set(result.chunk.chunkId, result);
      }
    }
  }
  return results;
}

function uniqueByChunkId(results: readonly SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.chunk.chunkId)) return false;
    seen.add(result.chunk.chunkId);
    return true;
  });
}

export function matchEvidenceResults(
  matches: readonly HierarchyMatch[],
  resultsByChunkId: ReadonlyMap<string, SearchResult>,
): SearchResult[] {
  return uniqueByChunkId(
    matches.flatMap((match) =>
      match.evidence.flatMap((evidence) => {
        const result = resultsByChunkId.get(evidence.chunkId);
        return result ? [result] : [];
      }),
    ),
  );
}

export function outcomeContext(
  outcome: OntologyOutcome,
  matchResults: readonly SearchResult[],
  indicatorResults: ReadonlyMap<string, readonly SearchResult[]>,
): SearchResult[] {
  const indicatorChunks = outcome.indicators
    .flatMap((indicator) => indicatorResults.get(indicator.id) ?? [])
    .sort((a, b) => b.score - a.score);
  return uniqueByChunkId([...indicatorChunks, ...matchResults]);
}

export function categoryContext(
  category: IndicatorCategory,
  matchResults: readonly SearchResult[],
  indicatorResults: ReadonlyMap<string, readonly SearchResult[]>,
): SearchResult[] {
  const perOutcome = category.outcomes.map((outcome) =>
    outcomeContext(outcome, [], indicatorResults),
  );
  const interleaved: SearchResult[] = [];
  for (let rank = 0; perOutcome.some((list) => rank < list.length); rank++) {
    for (const list of perOutcome) {
      if (rank < list.length) interleaved.push(list[rank]);
    }
  }
  return uniqueByChunkId([...matchResults, ...interleaved]);
}

export function citedChunkId(chunkId: string): string {
  return chunkId
    .trim()
    .replace(/^\[?\s*chunk\s*/i, "")
    .replace(/\]$/, "")
    .trim();
}

// PDF text often holds U+FFFD or typographic marks where the model writes
// plain ones, so quote marks, apostrophes and dashes are dropped before
// comparing.
const TYPOGRAPHIC_MARKS = /["'`‘’“”´�‐-―-]/g;

const MINIMUM_QUOTE_CHARACTERS = 12;

function comparableText(value: string): string {
  return normalizedEvidenceText(
    value.normalize("NFKC").replace(TYPOGRAPHIC_MARKS, ""),
  );
}

export function quoteFragments(quote: string): string[] {
  return comparableText(quote.replace(/\.\.\.|…/g, " … "))
    .split(/(?<=[.;!?])\s+|\s*…\s*/)
    .map((fragment) => fragment.replace(/[\s.,;:!?]+$/, ""))
    .filter((fragment) => fragment.length > 0);
}

export function quoteIsInText(quote: string, text: string): boolean {
  const fragments = quoteFragments(quote);
  const normalizedText = comparableText(text);
  return (
    fragments.join(" ").length >= MINIMUM_QUOTE_CHARACTERS &&
    fragments.every((fragment) => normalizedText.includes(fragment))
  );
}

export function groundedEvidence(
  chunkId: string,
  quote: string,
  resultsByChunkId: ReadonlyMap<string, SearchResult>,
): HierarchyEvidence | null {
  const cited = resultsByChunkId.get(citedChunkId(chunkId));
  // Models often quote the right passage but cite a neighbouring chunk ID, or
  // a truncated one, so any context chunk that holds the quote is credited.
  const result =
    cited && quoteIsInText(quote, cited.chunk.text)
      ? cited
      : [...resultsByChunkId.values()].find((candidate) =>
          quoteIsInText(quote, candidate.chunk.text),
        );
  if (!result) return null;
  return { ...hierarchyRetrievedChunk(result), quote: quote.trim() };
}

export function resultsMap(
  results: readonly SearchResult[],
): Map<string, SearchResult> {
  return new Map(results.map((result) => [result.chunk.chunkId, result]));
}

export function groundDocumentIndicators(
  extracted: readonly ExtractedDocumentIndicator[],
  resultsByChunkId: ReadonlyMap<string, SearchResult>,
) {
  const grounded: DocumentIndicator[] = [];
  let ungrounded = 0;
  for (const { chunkId, quote, ...indicator } of extracted) {
    const evidence = groundedEvidence(chunkId, quote, resultsByChunkId);
    if (evidence) grounded.push({ ...indicator, evidence });
    else ungrounded += 1;
  }
  return { grounded, ungrounded };
}

export function groundAnswer(
  { chunkId, quote, ...answer }: ExtractedIndicatorAnswer,
  indicator: OntologyIndicator,
  horizon: OutcomeHorizon,
  resultsByChunkId: ReadonlyMap<string, SearchResult>,
): IndicatorAnswer {
  const cited = Boolean(chunkId && quote);
  const evidence = cited
    ? groundedEvidence(chunkId, quote, resultsByChunkId)
    : null;
  const groundingFailed =
    (cited && !evidence) || (answer.basis === "reported" && !evidence);

  return {
    ...answer,
    basis: answer.basis === "reported" && !evidence ? "inferred" : answer.basis,
    indicator,
    horizon,
    evidence,
    groundingFailed,
  };
}

export function retrievalScopeFor(
  chunks: readonly DocumentChunk[],
): RetrievalScope {
  return {
    documentIds: [...new Set(chunks.map((chunk) => chunk.documentId))],
    indexFingerprints: [
      ...new Set(chunks.map((chunk) => chunk.metadata.indexFingerprint)),
    ],
  };
}
