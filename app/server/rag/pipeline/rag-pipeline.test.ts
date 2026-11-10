import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import type { RerankedResult } from "@/types/retrieval-types";
import {
  DEFAULT_RAG_PIPELINE_CONFIGURATION,
  RagPipeline,
  type RagPipelineDependencies,
} from "./rag-pipeline";

const retrieverConstructor = vi.hoisted(() => vi.fn());

vi.mock("../retrieval/retrieval", () => ({
  Retriever: class {
    constructor(...args: unknown[]) {
      retrieverConstructor(...args);
    }
  },
}));

function chunk(): DocumentChunk {
  return {
    chunkId: "chunk-1",
    documentId: "document-1",
    source: "notes.txt",
    sourceHash: "source-hash",
    page: 1,
    number: 1,
    text: "The launch date is Friday.",
    metadata: {
      contentType: "txt",
      indexFingerprint: "fingerprint",
      wordCount: 5,
      wordStart: 0,
    },
  };
}

function searchResult(currentChunk: DocumentChunk): RerankedResult {
  return {
    chunk: currentChunk,
    score: 0.92,
    denseScore: 0.92,
    sparseScore: null,
    rrfScore: null,
    rerankerScore: 0.92,
    retrievalRank: 1,
    rerankedRank: 1,
  };
}

describe("RagPipeline", () => {
  let events: string[];
  let dependencies: Required<RagPipelineDependencies>;

  beforeEach(() => {
    events = [];
    const currentChunk = chunk();
    const result = searchResult(currentChunk);

    dependencies = {
      chunker: {
        chunkDocuments: vi.fn(async () => {
          events.push("chunk");
          return [currentChunk];
        }),
      },
      embedder: {
        embed: vi.fn(async () => {
          events.push("embed");
          return [[0.1, 0.2, 0.3]];
        }),
      },
      store: {
        upsert: vi.fn(async () => {
          events.push("store");
        }),
      },
      retriever: {
        retrieveWithComparison: vi.fn(async () => {
          events.push("retrieve");
          return {
            candidateCount: 1,
            reranked: [result],
            withoutReranking: [result],
          };
        }),
      },
      generator: {
        generate: vi.fn(async () => {
          events.push("generate");
          return "The launch date is Friday.";
        }),
      },
    };
  });

  it("runs chunking, embedding, storage, retrieval, and generation in order", async () => {
    const pipeline = new RagPipeline(
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
      dependencies,
    );
    const documents = [new File(["content"], "notes.txt")];

    const result = await pipeline.run(documents, "  When is launch?  ");

    expect(events).toEqual(["chunk", "embed", "store", "retrieve", "generate"]);
    expect(dependencies.chunker.chunkDocuments).toHaveBeenCalledWith(documents);
    expect(dependencies.embedder.embed).toHaveBeenCalledWith([
      "The launch date is Friday.",
    ]);
    expect(dependencies.store.upsert).toHaveBeenCalledWith(result.chunks, [
      [0.1, 0.2, 0.3],
    ]);
    expect(dependencies.retriever.retrieveWithComparison).toHaveBeenCalledWith(
      "When is launch?",
      {
        documentIds: [result.chunks[0].documentId],
        indexFingerprints: [result.chunks[0].metadata.indexFingerprint],
      },
    );
    expect(dependencies.generator.generate).toHaveBeenCalledWith(
      "When is launch?",
      result.results,
    );
    expect(result.answer).toBe("The launch date is Friday.");
    expect(result).toMatchObject({
      candidateCount: 1,
      rerankingModel: DEFAULT_RAG_PIPELINE_CONFIGURATION.reranking.model,
      withoutReranking: result.results,
    });
  });

  it("enables the configured reranker on the pipeline's Ollama client", () => {
    new RagPipeline({
      ...DEFAULT_RAG_PIPELINE_CONFIGURATION,
      reranking: {
        ...DEFAULT_RAG_PIPELINE_CONFIGURATION.reranking,
        runtime: "ollama",
        model: "zerank-2-score",
        candidates: 50,
      },
      ollamaHost: "http://ollama:11434",
    });

    const [, , , reranking, client] = retrieverConstructor.mock.lastCall!;

    expect(reranking).toMatchObject({
      enabled: true,
      runtime: "ollama",
      model: "zerank-2-score",
      candidates: 50,
    });
    expect(client.config.host).toBe("http://ollama:11434");
  });

  it("rejects missing documents before starting work", async () => {
    const pipeline = new RagPipeline(
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
      dependencies,
    );

    await expect(pipeline.run([], "Question")).rejects.toThrow(
      "At least one document is required.",
    );
    expect(events).toEqual([]);
  });

  it("rejects a blank question before starting work", async () => {
    const pipeline = new RagPipeline(
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
      dependencies,
    );

    await expect(
      pipeline.run([new File(["content"], "notes.txt")], "   "),
    ).rejects.toThrow("Enter a question");
    expect(events).toEqual([]);
  });

  it("stops when an earlier stage fails", async () => {
    vi.mocked(dependencies.embedder.embed).mockRejectedValue(
      new Error("Ollama unavailable"),
    );
    const pipeline = new RagPipeline(
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
      dependencies,
    );

    await expect(
      pipeline.run([new File(["content"], "notes.txt")], "Question"),
    ).rejects.toThrow("Ollama unavailable");
    expect(dependencies.store.upsert).not.toHaveBeenCalled();
    expect(
      dependencies.retriever.retrieveWithComparison,
    ).not.toHaveBeenCalled();
    expect(dependencies.generator.generate).not.toHaveBeenCalled();
  });
});
