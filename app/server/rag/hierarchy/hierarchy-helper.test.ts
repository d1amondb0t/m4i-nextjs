import { describe, expect, it } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import type { ExtractedHierarchyMatch } from "@/types/hierarchy-types";
import type { SearchResult } from "../storage/storage-types";
import {
  buildCategoryQuery,
  evidenceIsGrounded,
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
  it.each([{ questions: undefined }, { questions: [] }, { questions: [" "] }])(
    "rejects categories without usable questions: $questions", ({ questions }) => {
    expect(() => parseFrameworkOntology({
      dimensions: [{
        id: "political",
        name: "Political",
        definition: "Policy and governance.",
        categories: [{ id: "advocacy", name: "Advocacy", definition: "Policy influence.", questions }],
      }],
    })).toThrow(/questions/);
    },
  );

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
                questions: [" Was the policy adopted? "],
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
              questions: ["Was the policy adopted?"],
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
            categories: [{ id: "shared", name: "A", definition: "A.", questions: ["A?"] }],
          },
          {
            id: "two",
            name: "Two",
            definition: "Second.",
            categories: [{ id: "shared", name: "B", definition: "B.", questions: ["B?"] }],
          },
        ],
      }),
    ).toThrow('Category id "shared" is duplicated.');
  });
});

describe("category retrieval helpers", () => {
  it("uses the supplied question with dimension and category context", () => {
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
        questions: ["Was the policy adopted?"],
        include: ["government engagement"],
        exclude: ["general awareness"],
      },
      "Was the policy adopted?",
    );

    expect(query).toContain("Dimension: Political");
    expect(query).toContain("Category: Advocacy");
    expect(query).toContain("Include: government engagement");
    expect(query).toContain("Exclude: general awareness");
    expect(query).toContain("Question: Was the policy adopted?");
  });

  it("requires every model citation and quote to exist in retrieved evidence", () => {
    const retrieved = result("a", 0.9, "The ministry adopted three recommendations.");
    const match: ExtractedHierarchyMatch = {
      explicitness: "implicit",
      reason: "Adoption supports policy influence.",
      evidence: [
        {
          chunkId: "a",
          quote: "ministry adopted three recommendations",
        },
      ],
    };

    expect(evidenceIsGrounded(match, new Map([["a", retrieved]]))).toBe(true);
    expect(
      evidenceIsGrounded(
        { ...match, evidence: [{ chunkId: "a", quote: "invented evidence" }] },
        new Map([["a", retrieved]]),
      ),
    ).toBe(false);
  });
});
