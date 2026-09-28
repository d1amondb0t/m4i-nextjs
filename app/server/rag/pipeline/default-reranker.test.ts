import { afterEach, describe, expect, it, vi } from "vitest";
import { Ollama } from "ollama";

import { DEFAULT_HIERARCHY_CONFIGURATION } from "@/types/hierarchy-types";
import type { DocumentChunk } from "@/types/chunk-type";
import { OllamaEmbedder } from "../embeddings/ollama-embedder";
import { HierarchyPipeline } from "../hierarchy/hierarchy-pipeline";
import { QdrantStore } from "../storage/vector-storage";
import { DEFAULT_RAG_PIPELINE_CONFIGURATION, RagPipeline } from "./rag-pipeline";

const chunk: DocumentChunk = {
  chunkId: "chunk", documentId: "doc", source: "report.txt", sourceHash: "hash",
  page: 1, number: 1, text: "The ministry adopted three recommendations.",
  metadata: { contentType: "txt", indexFingerprint: "fp", wordCount: 7 },
};

describe("default pipeline reranker wiring", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["rag", "hierarchy"] as const)("%s passes its Ollama client to the real default retriever", async (kind) => {
    vi.spyOn(OllamaEmbedder.prototype, "embedQuery").mockResolvedValue([1, 0]);
    const result = { chunk, score: 0.8, denseScore: 0.8, sparseScore: null };
    vi.spyOn(QdrantStore.prototype, "denseSearch").mockResolvedValue([result]);
    vi.spyOn(QdrantStore.prototype, "sparseSearch").mockResolvedValue([{ ...result, denseScore: null, sparseScore: 0.8 }]);
    const chat = vi.spyOn(Ollama.prototype, "chat").mockResolvedValue({
      message: { role: "assistant", content: '{"ratings":[{"passage":1,"relevance":9}]}' },
    } as never);
    const dependencies = {
      chunker: { chunkDocuments: vi.fn(async () => [chunk]) },
      embedder: { embed: vi.fn(async () => [[1, 0]]) },
      store: { upsert: vi.fn(async () => undefined) },
    };
    const files = [new File([chunk.text], "report.txt")];

    if (kind === "rag") {
      const pipeline = new RagPipeline(DEFAULT_RAG_PIPELINE_CONFIGURATION, {
        ...dependencies, generator: { generate: vi.fn(async () => "Answer") },
      });
      const output = await pipeline.run(files, "What was adopted?");
      expect(output.results[0].rerankerScore).toBe(0.9);
    } else {
      const pipeline = new HierarchyPipeline(DEFAULT_RAG_PIPELINE_CONFIGURATION, DEFAULT_HIERARCHY_CONFIGURATION, {
        ...dependencies, analyzer: { extract: vi.fn(async () => []), validate: vi.fn(async () => []) },
      });
      await pipeline.run(files, { dimensions: [{ id: "policy", name: "Policy", definition: "Policy change", categories: [
        { id: "adoption", name: "Adoption", definition: "Adoption of recommendations" },
      ] }] });
    }
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ model: "qwen3.5:9b-q4_K_M" }));
  });
});
