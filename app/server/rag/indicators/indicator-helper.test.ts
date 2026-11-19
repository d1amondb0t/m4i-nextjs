import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import type { HierarchyMatch } from "@/types/hierarchy-types";
import type { OntologyIndicator } from "@/types/indicator-types";
import type { SearchResult } from "../storage/storage-types";
import {
  citedChunkId,
  gateCategories,
  groundAnswer,
  groundDocumentIndicators,
  ontologyIndicators,
  parseIndicatorOntology,
  quoteIsInText,
} from "./indicator-helper";

function result(chunkId: string, text: string, score = 0.8): SearchResult {
  const chunk: DocumentChunk = {
    chunkId,
    documentId: "document-1",
    source: "report.txt",
    sourceHash: "hash",
    page: 1,
    number: 1,
    text,
    metadata: { contentType: "txt", indexFingerprint: "fp", wordCount: 5 },
  };
  return {
    chunk,
    score,
    denseScore: 0.5,
    sparseScore: 0.5,
    rrfScore: 0.5,
    rerankerScore: score,
  };
}

function match(
  rerankerScore: number,
  explicitness: HierarchyMatch["explicitness"] = "explicit",
): HierarchyMatch {
  return {
    question: "Was it adopted?",
    explicitness,
    reason: "It was adopted.",
    evidence: [
      {
        chunkId: "c1",
        source: "report.txt",
        page: 1,
        chunk: 1,
        quote: "adopted",
        scores: {
          denseScore: 0.5,
          sparseScore: 0.5,
          rrfScore: 0.5,
          rerankerScore,
        },
      },
    ],
  };
}

const ontology = parseIndicatorOntology(
  JSON.parse(readFileSync(resolve("ontology-political-test.json"), "utf8")),
);

function framework(matchesByCategory: Record<string, HierarchyMatch[]>) {
  return {
    dimensions: ontology.dimensions.map((dimension) => ({
      ...dimension,
      categories: dimension.categories.map((category) => ({
        ...category,
        matches: matchesByCategory[category.id] ?? [],
      })),
    })),
  };
}

const gate = {
  minimumRerankerScore: 0.7,
  requireExplicit: false,
  minimumMatches: 1,
};

describe("parseIndicatorOntology", () => {
  it("reads the political test ontology with three horizons per category", () => {
    expect(ontology.dimensions).toHaveLength(1);
    for (const category of ontology.dimensions[0].categories) {
      expect(category.outcomes.map((outcome) => outcome.horizon)).toEqual([
        "short_term",
        "medium_term",
        "long_term",
      ]);
    }
    expect(ontologyIndicators(ontology)).toHaveLength(27);
  });

  it("rejects a status indicator without options", () => {
    const raw = JSON.parse(
      readFileSync(resolve("ontology-political-test.json"), "utf8"),
    );
    delete raw.dimensions[0].categories[0].outcomes[1].indicators[1].options;
    expect(() => parseIndicatorOntology(raw)).toThrow(/options/);
  });

  it("rejects two outcomes on the same horizon", () => {
    const raw = JSON.parse(
      readFileSync(resolve("ontology-political-test.json"), "utf8"),
    );
    raw.dimensions[0].categories[0].outcomes[1].horizon = "short_term";
    expect(() => parseIndicatorOntology(raw)).toThrow(
      /one outcome per horizon/,
    );
  });
});

describe("gateCategories", () => {
  it("triggers a category only when a match reaches the reranker threshold", () => {
    const { gated, skipped } = gateCategories(
      ontology,
      framework({
        advocacy_policy_influence: [match(0.4), match(0.82)],
        institutional_capacity: [match(0.69)],
      }),
      gate,
    );

    expect(gated.map((category) => category.category.id)).toEqual([
      "advocacy_policy_influence",
    ]);
    expect(gated[0].matches).toHaveLength(1);
    expect(skipped).toEqual([
      { categoryId: "institutional_capacity", bestRerankerScore: 0.69 },
      { categoryId: "participation_representation", bestRerankerScore: 0 },
    ]);
  });

  it("can require explicit matches", () => {
    const { gated } = gateCategories(
      ontology,
      framework({ advocacy_policy_influence: [match(0.9, "implicit")] }),
      { ...gate, requireExplicit: true },
    );
    expect(gated).toEqual([]);
  });
});

describe("grounding", () => {
  const results = new Map([
    ["c1", result("c1", "The council adopted the ordinance in 2022.")],
  ]);
  const indicator: OntologyIndicator = {
    id: "stage",
    name: "Stage",
    question: "How far did it get?",
    answerType: "text",
  };
  const answer = {
    indicatorId: "stage",
    basis: "reported" as const,
    answer: "Adopted",
    rationale: "",
    confidence: "high" as const,
    chunkId: "c1",
    quote: "adopted the  ordinance",
  };

  it("keeps a reported answer whose quote is in the cited chunk", () => {
    const grounded = groundAnswer(answer, indicator, "medium_term", results);
    expect(grounded.basis).toBe("reported");
    expect(grounded.evidence?.quote).toBe("adopted the  ordinance");
    expect(grounded.groundingFailed).toBe(false);
  });

  it("downgrades a reported answer whose quote is missing to inferred", () => {
    const grounded = groundAnswer(
      { ...answer, quote: "passed the law" },
      indicator,
      "medium_term",
      results,
    );
    expect(grounded).toMatchObject({
      basis: "inferred",
      evidence: null,
      groundingFailed: true,
    });
  });

  it("accepts an inferred answer without a citation", () => {
    const grounded = groundAnswer(
      { ...answer, basis: "inferred", chunkId: "", quote: "" },
      indicator,
      "long_term",
      results,
    );
    expect(grounded).toMatchObject({
      basis: "inferred",
      groundingFailed: false,
    });
  });

  it("credits the context chunk that holds the quote when the cited ID is wrong", () => {
    const grounded = groundAnswer(
      { ...answer, chunkId: "Chunk c9" },
      indicator,
      "medium_term",
      results,
    );
    expect(grounded.evidence?.chunkId).toBe("c1");
    expect(grounded.basis).toBe("reported");
  });

  it("drops document indicators with a quote that is not in the chunk", () => {
    const { grounded, ungrounded } = groundDocumentIndicators(
      [
        {
          horizon: "medium_term",
          name: "Ordinance",
          value: "adopted",
          chunkId: "c1",
          quote: "adopted the ordinance",
        },
        {
          horizon: "long_term",
          name: "Turnout",
          value: "49%",
          chunkId: "c1",
          quote: "turnout rose",
        },
      ],
      results,
    );
    expect(grounded.map((indicator) => indicator.name)).toEqual(["Ordinance"]);
    expect(ungrounded).toBe(1);
  });
});

describe("quoteIsInText", () => {
  const text =
    "Result: 18% in the 2024 budget, equal to 6.2 million dollars. The council adopted it.";

  it("ignores a period the model added when it shortened a sentence", () => {
    expect(quoteIsInText("Result: 18% in the 2024 budget.", text)).toBe(true);
  });

  it("accepts sentences stitched together when each one is in the text", () => {
    expect(
      quoteIsInText(
        "Result: 18% in the 2024 budget. The council adopted it.",
        text,
      ),
    ).toBe(true);
  });

  it("treats replacement characters and curly quotes like plain apostrophes", () => {
    expect(
      quoteIsInText(
        "GAO's list includes over 5,000 open recommendations.",
        "GAO�s list includes over 5,000 open recommendations.",
      ),
    ).toBe(true);
  });

  it("rejects quotes too short to identify a passage", () => {
    expect(quoteIsInText("yes", "yes, it was adopted")).toBe(false);
  });

  it("rejects a sentence that is not in the text", () => {
    expect(
      quoteIsInText("Result: 18% in the 2024 budget. Turnout rose.", text),
    ).toBe(false);
  });
});

describe("citedChunkId", () => {
  it("strips the context label the model copies", () => {
    expect(citedChunkId("Chunk abc123")).toBe("abc123");
    expect(citedChunkId("[Chunk abc123]")).toBe("abc123");
    expect(citedChunkId("abc123")).toBe("abc123");
  });
});
