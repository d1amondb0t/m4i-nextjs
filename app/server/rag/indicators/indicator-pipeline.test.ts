import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import {
  DEFAULT_HIERARCHY_CONFIGURATION,
  type HierarchyPipelineResult,
} from "@/types/hierarchy-types";
import {
  DEFAULT_INDICATOR_CONFIGURATION,
  type OntologyIndicator,
} from "@/types/indicator-types";
import type { SearchResult } from "../storage/storage-types";
import { parseIndicatorOntology } from "./indicator-helper";
import { IndicatorPipeline } from "./indicator-pipeline";
import type { IndicatorAnalyzer } from "./ollama-indicator-analyzer";

const ontology = parseIndicatorOntology(
  JSON.parse(readFileSync(resolve("ontology-political-test.json"), "utf8")),
);

const chunk: DocumentChunk = {
  chunkId: "c1",
  documentId: "document-1",
  source: "report.txt",
  sourceHash: "hash",
  page: 1,
  number: 1,
  text: "The council adopted the ordinance in 2022 and trained 40 officials.",
  metadata: { contentType: "txt", indexFingerprint: "fp", wordCount: 11 },
};
const searchResult: SearchResult = {
  chunk,
  score: 0.9,
  denseScore: 0.5,
  sparseScore: 0.5,
  rrfScore: 0.5,
  rerankerScore: 0.9,
};

function hierarchy(): HierarchyPipelineResult {
  return {
    chunks: [chunk],
    diagnostics: [],
    retrievals: [
      {
        dimensionId: "political",
        categoryId: "advocacy_policy_influence",
        questions: [
          {
            question: "Was it adopted?",
            cutoff: 0.3,
            results: [searchResult],
            droppedBelowCutoff: [],
            droppedOutsideTopK: [],
          },
        ],
      },
    ],
    framework: {
      dimensions: ontology.dimensions.map((dimension) => ({
        ...dimension,
        categories: dimension.categories.map((category) => ({
          ...category,
          matches:
            category.id === "advocacy_policy_influence"
              ? [
                  {
                    question: "Was it adopted?",
                    explicitness: "explicit" as const,
                    reason: "The ordinance was adopted.",
                    evidence: [
                      {
                        chunkId: "c1",
                        source: "report.txt",
                        page: 1,
                        chunk: 1,
                        quote: "adopted the ordinance",
                        scores: {
                          denseScore: 0.5,
                          sparseScore: 0.5,
                          rrfScore: 0.5,
                          rerankerScore: 0.9,
                        },
                      },
                    ],
                  },
                ]
              : [],
        })),
      })),
    },
  };
}

function analyzer(): IndicatorAnalyzer {
  return {
    discover: vi.fn(async () => [
      {
        horizon: "medium_term" as const,
        name: "Ordinance adopted",
        value: "2022",
        chunkId: "c1",
        quote: "adopted the ordinance in 2022",
      },
    ]),
    answer: vi.fn(
      async (_category, _outcome, indicators: readonly OntologyIndicator[]) =>
        indicators.map((indicator) => ({
          indicatorId: indicator.id,
          basis: "inferred" as const,
          answer: "not reported",
          rationale: "Nothing stated.",
          confidence: "low" as const,
          chunkId: "",
          quote: "",
        })),
    ),
  };
}

describe("IndicatorPipeline", () => {
  it("answers predefined indicators only for horizons the document does not cover", async () => {
    const rankCandidates = vi.fn(async () => [searchResult]);
    const fake = analyzer();
    const result = await new IndicatorPipeline(
      { rankCandidates },
      fake,
      DEFAULT_INDICATOR_CONFIGURATION,
      DEFAULT_HIERARCHY_CONFIGURATION,
    ).run(ontology, hierarchy());

    expect(result.categories.map((category) => category.categoryId)).toEqual([
      "advocacy_policy_influence",
    ]);
    expect(result.skippedCategories).toHaveLength(2);
    expect(rankCandidates).toHaveBeenCalledTimes(9);

    const horizons = result.categories[0].horizons;
    expect(horizons.map((horizon) => horizon.usedPredefined)).toEqual([
      true,
      false,
      true,
    ]);
    expect(horizons[1].documentIndicators[0].evidence.quote).toBe(
      "adopted the ordinance in 2022",
    );
    expect(horizons[0].answers).toHaveLength(3);
    expect(fake.answer).toHaveBeenCalledTimes(2);
  });

  it("asks one indicator at a time and answers every horizon when configured", async () => {
    const fake = analyzer();
    await new IndicatorPipeline(
      { rankCandidates: async () => [searchResult] },
      fake,
      {
        ...DEFAULT_INDICATOR_CONFIGURATION,
        fallback: "always",
        answerBatch: "indicator",
      },
      DEFAULT_HIERARCHY_CONFIGURATION,
    ).run(ontology, hierarchy());

    expect(fake.answer).toHaveBeenCalledTimes(9);
  });
});
