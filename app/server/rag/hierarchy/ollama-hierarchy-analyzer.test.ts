import { describe, expect, it } from "vitest";

import { parseMatchResponse } from "./ollama-hierarchy-analyzer-helper";

const match = {
  explicitness: "explicit",
  reason: "The report directly states adoption.",
  evidence: [{ chunkId: "chunk-1", quote: "recommendations were adopted" }],
};

describe("hierarchy model response parsing", () => {
  it.each(["explicit", "implicit"])("preserves %s question matches", (explicitness) => {
    expect(parseMatchResponse(JSON.stringify({ matches: [{ ...match, explicitness }] })))
      .toEqual([{ ...match, explicitness }]);
  });

  it("allows no match when the question is unsupported", () => {
    expect(parseMatchResponse('{"matches":[]}')).toEqual([]);
  });

  it("rejects the old derived-indicator classification", () => {
    expect(() => parseMatchResponse(JSON.stringify({
      matches: [{ ...match, explicitness: "derived" }],
    }))).toThrow("invalid match explicitness");
  });

  it("requires evidence for a match", () => {
    expect(() => parseMatchResponse(JSON.stringify({
      matches: [{ ...match, evidence: [] }],
    }))).toThrow("match without evidence");
  });

  it("rejects missing matches and malformed JSON", () => {
    expect(() => parseMatchResponse("{}")).toThrow("omitted match");
    expect(() => parseMatchResponse("not-json")).toThrow("invalid JSON");
  });
});
