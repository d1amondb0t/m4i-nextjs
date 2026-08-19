import type { SearchResult } from "../storage/storage-types";
import {
  MAX_HIERARCHY_CATEGORIES,
  MAX_HIERARCHY_DIMENSIONS,
  type ExtractedHierarchyCandidate,
  type FrameworkCategory,
  type FrameworkDimension,
  type FrameworkOntology,
  type HierarchyConfiguration,
  type HierarchyItemKind,
  type HierarchyValidation,
} from "@/types/hierarchy-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  value: unknown,
  location: string,
  maximumLength = 2_000,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${location} must be a non-empty string.`);
  }

  const text = value.trim();

  if (text.length > maximumLength) {
    throw new Error(`${location} must be ${maximumLength} characters or fewer.`);
  }

  return text;
}

function optionalTextList(value: unknown, location: string): string[] | undefined {
  if (value === undefined) return undefined;

  if (!Array.isArray(value)) {
    throw new Error(`${location} must be an array of strings.`);
  }

  return value.map((entry, index) =>
    requiredText(entry, `${location}[${index}]`, 500),
  );
}

function parseCategory(value: unknown, location: string): FrameworkCategory {
  if (!isRecord(value)) {
    throw new Error(`${location} must be an object.`);
  }

  return {
    id: requiredText(value.id, `${location}.id`, 100),
    name: requiredText(value.name, `${location}.name`, 200),
    definition: requiredText(value.definition, `${location}.definition`),
    include: optionalTextList(value.include, `${location}.include`),
    exclude: optionalTextList(value.exclude, `${location}.exclude`),
  };
}

function parseDimension(value: unknown, location: string): FrameworkDimension {
  if (!isRecord(value)) {
    throw new Error(`${location} must be an object.`);
  }

  if (!Array.isArray(value.categories) || value.categories.length === 0) {
    throw new Error(`${location}.categories must contain at least one category.`);
  }

  return {
    id: requiredText(value.id, `${location}.id`, 100),
    name: requiredText(value.name, `${location}.name`, 200),
    definition: requiredText(value.definition, `${location}.definition`),
    categories: value.categories.map((category, index) =>
      parseCategory(category, `${location}.categories[${index}]`),
    ),
  };
}

export function parseFrameworkOntology(value: unknown): FrameworkOntology {
  if (!isRecord(value) || !Array.isArray(value.dimensions)) {
    throw new Error("Ontology must contain a dimensions array.");
  }

  if (value.dimensions.length === 0) {
    throw new Error("Ontology must contain at least one dimension.");
  }

  if (value.dimensions.length > MAX_HIERARCHY_DIMENSIONS) {
    throw new Error(
      `Ontology must contain no more than ${MAX_HIERARCHY_DIMENSIONS} dimensions.`,
    );
  }

  const dimensions = value.dimensions.map((dimension, index) =>
    parseDimension(dimension, `dimensions[${index}]`),
  );
  const categoryCount = dimensions.reduce(
    (count, dimension) => count + dimension.categories.length,
    0,
  );

  if (categoryCount > MAX_HIERARCHY_CATEGORIES) {
    throw new Error(
      `Ontology must contain no more than ${MAX_HIERARCHY_CATEGORIES} categories.`,
    );
  }

  const dimensionIds = new Set<string>();
  const categoryIds = new Set<string>();

  for (const dimension of dimensions) {
    if (dimensionIds.has(dimension.id)) {
      throw new Error(`Dimension id "${dimension.id}" is duplicated.`);
    }
    dimensionIds.add(dimension.id);

    for (const category of dimension.categories) {
      if (categoryIds.has(category.id)) {
        throw new Error(`Category id "${category.id}" is duplicated.`);
      }
      categoryIds.add(category.id);
    }
  }

  return { dimensions };
}

function list(label: string, values: readonly string[] | undefined): string {
  return values?.length ? `\n${label}: ${values.join("; ")}.` : "";
}

export function buildCategoryQuery(
  dimension: FrameworkDimension,
  category: FrameworkCategory,
  kind: HierarchyItemKind,
): string {
  const target =
    kind === "outcome"
      ? "Find evidence of an achieved or intended change resulting from the work. Do not return activities or counts of activities as outcomes."
      : "Find evidence for an observable, specific measure that can assess change. It may be an explicitly named indicator or a measure directly derivable from the evidence.";

  return [
    `Dimension: ${dimension.name}. ${dimension.definition}`,
    `Category: ${category.name}. ${category.definition}${list("Include", category.include)}${list("Exclude", category.exclude)}`,
    target,
  ].join("\n");
}

export function mergeSearchResults(
  resultGroups: readonly (readonly SearchResult[])[],
  minimumScore: number,
): SearchResult[] {
  const merged = new Map<string, SearchResult>();

  for (const result of resultGroups.flat()) {
    if (result.score < minimumScore) continue;

    const current = merged.get(result.chunk.chunkId);

    if (!current || result.score > current.score) {
      merged.set(result.chunk.chunkId, result);
    }
  }

  return [...merged.values()].sort((left, right) => right.score - left.score);
}

export function buildHierarchyContext(
  results: readonly SearchResult[],
  maximumWords: number,
): string {
  const sections: string[] = [];
  let wordsUsed = 0;

  for (const result of results) {
    const words = result.chunk.text.trim().split(/\s+/).filter(Boolean);
    const remaining = maximumWords - wordsUsed;

    if (remaining <= 0) break;

    sections.push(
      [
        `[Chunk ${result.chunk.chunkId}] [Source: ${result.chunk.source}] [Page ${result.chunk.page}]`,
        words.slice(0, remaining).join(" "),
      ].join("\n"),
    );
    wordsUsed += Math.min(words.length, remaining);
  }

  return sections.join("\n\n");
}

function normalizedEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

export function evidenceIsGrounded(
  candidate: ExtractedHierarchyCandidate,
  resultsByChunkId: ReadonlyMap<string, SearchResult>,
): boolean {
  return (
    candidate.evidence.length > 0 &&
    candidate.evidence.every((evidence) => {
      const result = resultsByChunkId.get(evidence.chunkId);
      const quote = normalizedEvidenceText(evidence.quote);

      return Boolean(
        result &&
          quote &&
          normalizedEvidenceText(result.chunk.text).includes(quote),
      );
    })
  );
}

export function validationPasses(
  validation: HierarchyValidation,
  configuration: HierarchyConfiguration,
): boolean {
  return (
    validation.categoryFit >= configuration.minimumCategoryFit &&
    validation.typeFit >= configuration.minimumTypeFit &&
    validation.evidenceSupport >= configuration.minimumEvidenceSupport &&
    validation.specificity >= configuration.minimumSpecificity
  );
}

export function normalizedCandidateText(text: string): string {
  return text
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
