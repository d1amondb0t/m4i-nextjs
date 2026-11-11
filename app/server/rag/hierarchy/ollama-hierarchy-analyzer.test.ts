import { resolve } from "node:path";
import type { Ollama } from "ollama";
import { describe, expect, it, vi } from "vitest";

import { OllamaHierarchyAnalyzer } from "./ollama-hierarchy-analyzer";
import { parseMatchResponse } from "./ollama-hierarchy-analyzer-helper";

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

describe("OllamaHierarchyAnalyzer", () => {
  it("sends its own context size instead of relying on Ollama's default", async () => {
    const chat = vi.fn(async () => ({
      message: { content: '{"matches":[]}' },
    }));
    const analyzer = new OllamaHierarchyAnalyzer(
      "qwen3.5:9b",
      resolve("prompts/hierarchy-extract.txt"),
      4_000,
      12_288,
      { chat } as unknown as Ollama,
    );

    await analyzer.match(
      {
        id: "advocacy",
        name: "Advocacy & policy influence",
        definition: "Influence on policy and decision-makers.",
        questions: ["Was the policy adopted?"],
      },
      "Was the policy adopted?",
      [],
    );

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { temperature: 0, num_ctx: 12_288 },
      }),
    );
  });
});
