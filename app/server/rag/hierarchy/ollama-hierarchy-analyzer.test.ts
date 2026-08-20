import { describe, expect, it } from "vitest";

import {
  parseExtractionResponse,
  parseValidationResponse,
} from "./ollama-hierarchy-analyzer";

describe("hierarchy model response parsing", () => {
  it("parses structured extraction output", () => {
    expect(
      parseExtractionResponse(
        JSON.stringify({
          candidates: [
            {
              kind: "outcome",
              text: "Policy recommendations are adopted",
              explicitness: "explicit",
              evidence: [{ chunkId: "chunk-1", quote: "recommendations were adopted" }],
            },
          ],
        }),
      ),
    ).toEqual([
      {
        id: "candidate-1",
        kind: "outcome",
        text: "Policy recommendations are adopted",
        explicitness: "explicit",
        evidence: [{ chunkId: "chunk-1", quote: "recommendations were adopted" }],
      },
    ]);
  });

  it("assigns unique IDs even if a model response contains duplicate ID fields", () => {
    const candidate = (text: string) => ({
      id: "duplicate-model-id",
      kind: "outcome",
      text,
      explicitness: "explicit",
      evidence: [{ chunkId: "chunk-1", quote: "evidence" }],
    });

    expect(
      parseExtractionResponse(
        JSON.stringify({ candidates: [candidate("First"), candidate("Second")] }),
      ).map(({ id }) => id),
    ).toEqual(["candidate-1", "candidate-2"]);
  });

  it("rejects validation scores outside zero and one", () => {
    expect(() =>
      parseValidationResponse(
        JSON.stringify({
          assessments: [
            {
              categoryFit: 1.1,
              typeFit: 0.9,
              evidenceSupport: 0.9,
              specificity: 0.9,
              reason: "Supported.",
            },
          ],
        }),
        ["candidate-1"],
      ),
    ).toThrow("invalid candidate-1 categoryFit score");
  });

  it("matches validation assessments to server IDs by array order", () => {
    expect(
      parseValidationResponse(
        JSON.stringify({
          assessments: [
            {
              categoryFit: 0.8,
              typeFit: 0.9,
              evidenceSupport: 1,
              specificity: 0.7,
              reason: "First.",
            },
            {
              categoryFit: 0.7,
              typeFit: 0.8,
              evidenceSupport: 0.9,
              specificity: 0.6,
              reason: "Second.",
            },
          ],
        }),
        ["candidate-1", "candidate-2"],
      ).map(({ candidateId }) => candidateId),
    ).toEqual(["candidate-1", "candidate-2"]);
  });

  it("rejects a validation response with the wrong assessment count", () => {
    expect(() =>
      parseValidationResponse(JSON.stringify({ assessments: [] }), ["candidate-1"]),
    ).toThrow("returned 0 assessments for 1 candidates");
  });
});
