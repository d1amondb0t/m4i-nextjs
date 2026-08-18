import { resolve } from "node:path";
import type { Ollama } from "ollama";
import { describe, expect, it } from "vitest";

import type { SearchResult } from "../storage/storage-types";
import { OllamaGenerator } from "./ollama-generator";

function result(text: string): SearchResult {
  return {
    chunk: {
      chunkId: "chunk-1",
      documentId: "document-1",
      source: "notes.txt",
      sourceHash: "source-hash",
      page: 1,
      number: 1,
      text,
      metadata: {
        contentType: "txt",
        indexFingerprint: "fingerprint",
        wordCount: text.split(/\s+/).length,
      },
    },
    score: 1,
    denseScore: 1,
    sparseScore: null,
  };
}

describe("OllamaGenerator.buildContext", () => {
  it("keeps a result shorter than the context budget", () => {
    const generator = new OllamaGenerator(
      "model",
      resolve("prompts/grounded.txt"),
      {
        model: "model",
        temperature: 0,
        prompt: "prompts/grounded.txt",
        sentencesPerChunk: 0,
        maxContextWords: 10,
      },
      {} as Ollama,
    );

    expect(generator.buildContext("question", [result("one two three")])).toContain(
      "one two three",
    );
  });

  it("truncates a result to the remaining context budget", () => {
    const generator = new OllamaGenerator(
      "model",
      resolve("prompts/grounded.txt"),
      {
        model: "model",
        temperature: 0,
        prompt: "prompts/grounded.txt",
        sentencesPerChunk: 0,
        maxContextWords: 3,
      },
      {} as Ollama,
    );

    const context = generator.buildContext("question", [
      result("one two three four five"),
    ]);

    expect(context).toContain("one two three");
    expect(context).not.toContain("four five");
  });
});
