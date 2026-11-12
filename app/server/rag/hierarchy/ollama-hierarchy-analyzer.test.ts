import { describe, expect, it } from "vitest";

import {
  parseMatchResponse,
  requireCompleteResponse,
} from "./ollama-hierarchy-analyzer-helper";

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

  it("shows how a malformed reply ends", () => {
    expect(() => parseMatchResponse('{"matches":[{"reason":"cut')).toThrow(
      'The reply ends with: "{\\"matches\\":[{\\"reason\\":\\"cut"',
    );
    expect(() => parseMatchResponse("  ")).toThrow("The reply was empty.");
  });
});

describe("hierarchy model completion", () => {
  const completion = {
    model: "qwen3.5:9b-q4_K_M",
    prompt_eval_count: 5685,
    eval_count: 4200,
  };

  it("accepts a reply the model finished", () => {
    expect(() =>
      requireCompleteResponse({ ...completion, done_reason: "stop" }),
    ).not.toThrow();
  });

  it("names the model and token counts when the reply hit the limit", () => {
    expect(() =>
      requireCompleteResponse({ ...completion, done_reason: "length" }),
    ).toThrow(
      "qwen3.5:9b-q4_K_M stopped at its token limit before finishing its reply (5685 prompt tokens, 4200 reply tokens",
    );
  });
});
