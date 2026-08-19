import { describe, expect, it } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import type { ExtractedHierarchyCandidate } from "@/types/hierarchy-types";
import type { SearchResult } from "../storage/storage-types";
import {
  buildCategoryQuery,
  evidenceIsGrounded,
  mergeSearchResults,
  parseFrameworkOntology,
} from "./hierarchy-helper";

function result(chunkId: string, score: number, text = "Policy adoption increased."): SearchResult {
  const chunk: DocumentChunk = {
    chunkId,
    documentId: "document-1",
    source: "report.txt",
    sourceHash: "source-hash",
    page: 1,
    number: 1,
    text,
    metadata: {
      contentType: "txt",
      indexFingerprint: "fingerprint",
      wordCount: text.split(/\s+/).length,
    },
  };

  return {
    chunk,
    score,
    denseScore: score,
    sparseScore: null,
  };
}

describe("parseFrameworkOntology", () => {
  it("normalizes a valid ontology", () => {
    expect(
      parseFrameworkOntology({
        dimensions: [
          {
            id: " political ",
            name: " Political ",
            definition: " Policy and governance. ",
            categories: [
              {
                id: "advocacy",
                name: "Advocacy",
                definition: "Policy influence.",
                include: [" government engagement "],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      dimensions: [
        {
          id: "political",
          name: "Political",
          definition: "Policy and governance.",
          categories: [
            {
              id: "advocacy",
              name: "Advocacy",
              definition: "Policy influence.",
              include: ["government engagement"],
              exclude: undefined,
            },
          ],
        },
      ],
    });
  });

  it("rejects duplicate category IDs across dimensions", () => {
    expect(() =>
      parseFrameworkOntology({
        dimensions: [
          {
            id: "one",
            name: "One",
            definition: "First.",
            categories: [{ id: "shared", name: "A", definition: "A." }],
          },
          {
            id: "two",
            name: "Two",
            definition: "Second.",
            categories: [{ id: "shared", name: "B", definition: "B." }],
          },
        ],
      }),
    ).toThrow('Category id "shared" is duplicated.');
  });
});

describe("category retrieval helpers", () => {
  it("uses dimension, category, inclusion, and target type in a leaf query", () => {
    const query = buildCategoryQuery(
      {
        id: "political",
        name: "Political",
        definition: "Policy and governance.",
        categories: [],
      },
      {
        id: "advocacy",
        name: "Advocacy",
        definition: "Policy influence.",
        include: ["government engagement"],
        exclude: ["general awareness"],
      },
      "indicator",
    );

    expect(query).toContain("Dimension: Political");
    expect(query).toContain("Category: Advocacy");
    expect(query).toContain("Include: government engagement");
    expect(query).toContain("Exclude: general awareness");
    expect(query).toContain("observable, specific measure");
  });

  it("filters by score, deduplicates chunks, and keeps the strongest score", () => {
    const merged = mergeSearchResults(
      [[result("a", 0.7), result("b", 0.4)], [result("a", 0.9), result("c", 0.8)]],
      0.5,
    );

    expect(merged.map(({ chunk, score }) => [chunk.chunkId, score])).toEqual([
      ["a", 0.9],
      ["c", 0.8],
    ]);
  });

  it("requires every model citation and quote to exist in retrieved evidence", () => {
    const retrieved = result("a", 0.9, "The ministry adopted three recommendations.");
    const candidate: ExtractedHierarchyCandidate = {
      id: "candidate-1",
      kind: "indicator",
      text: "Number of recommendations adopted",
      explicitness: "derived",
      evidence: [
        {
          chunkId: "a",
          quote: "ministry adopted three recommendations",
        },
      ],
    };

    expect(evidenceIsGrounded(candidate, new Map([["a", retrieved]]))).toBe(true);
    expect(
      evidenceIsGrounded(
        { ...candidate, evidence: [{ chunkId: "a", quote: "invented evidence" }] },
        new Map([["a", retrieved]]),
      ),
    ).toBe(false);
  });
});
