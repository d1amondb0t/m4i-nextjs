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
              id: "c1",
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
        id: "c1",
        kind: "outcome",
        text: "Policy recommendations are adopted",
        explicitness: "explicit",
        evidence: [{ chunkId: "chunk-1", quote: "recommendations were adopted" }],
      },
    ]);
  });

  it("rejects duplicate candidate IDs", () => {
    const candidate = {
      id: "c1",
      kind: "outcome",
      text: "An outcome",
      explicitness: "explicit",
      evidence: [{ chunkId: "chunk-1", quote: "evidence" }],
    };

    expect(() =>
      parseExtractionResponse(JSON.stringify({ candidates: [candidate, candidate] })),
    ).toThrow('duplicate candidate id "c1"');
  });

  it("rejects validation scores outside zero and one", () => {
    expect(() =>
      parseValidationResponse(
        JSON.stringify({
          assessments: [
            {
              candidateId: "c1",
              categoryFit: 1.1,
              typeFit: 0.9,
              evidenceSupport: 0.9,
              specificity: 0.9,
              reason: "Supported.",
            },
          ],
        }),
      ),
    ).toThrow("invalid c1 categoryFit score");
  });
});
