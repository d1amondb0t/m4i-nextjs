import { describe, expect, it } from "vitest";

import {
  analyzerCategory,
  MATCH_SCHEMA,
  parseMatchResponse,
} from "./ollama-hierarchy-analyzer-helper";

describe("hierarchy analyzer category", () => {
  it("sends only the asked question, without include and exclude lists", () => {
    expect(
      analyzerCategory(
        {
          id: "health",
          name: "Health",
          definition: "Changes in health.",
          questions: ["Which health indicators are tracked?", "What changed?"],
          include: ["mortality"],
          exclude: ["budget lines without a health outcome"],
        },
        "Which health indicators are tracked?",
      ),
    ).toEqual({
      id: "health",
      name: "Health",
      definition: "Changes in health.",
      questions: ["Which health indicators are tracked?"],
    });
  });

  it("limits each question to eight matches", () => {
    expect(MATCH_SCHEMA.properties.matches.maxItems).toBe(8);
  });
});

const match = {
  explicitness: "explicit",
  reason: "The report directly states adoption.",
  evidence: [{ chunkId: "chunk-1", quote: "recommendations were adopted" }],
};

describe("hierarchy model response parsing", () => {
  it.each(["explicit", "implicit"])(
    "preserves %s question matches",
    (explicitness) => {
      expect(
        parseMatchResponse(
          JSON.stringify({ matches: [{ ...match, explicitness }] }),
        ),
      ).toEqual([{ ...match, explicitness }]);
    },
  );

  it("allows no match when the question is unsupported", () => {
    expect(parseMatchResponse('{"matches":[]}')).toEqual([]);
  });

  it("rejects the old derived-indicator classification", () => {
    expect(() =>
      parseMatchResponse(
        JSON.stringify({
          matches: [{ ...match, explicitness: "derived" }],
        }),
      ),
    ).toThrow("invalid match explicitness");
  });

  it("requires evidence for a match", () => {
    expect(() =>
      parseMatchResponse(
        JSON.stringify({
          matches: [{ ...match, evidence: [] }],
        }),
      ),
    ).toThrow("match without evidence");
  });

  it("rejects missing matches and malformed JSON", () => {
    expect(() => parseMatchResponse("{}")).toThrow("omitted match");
    expect(() => parseMatchResponse("not-json")).toThrow("invalid JSON");
  });
});
