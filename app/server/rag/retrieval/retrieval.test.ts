import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentChunk } from "@/types/chunk-type";
import type { OllamaEmbedder } from "../embeddings/ollama-embedder";
import type { QdrantStore } from "../storage/vector-storage";
import type { SearchResult } from "../storage/storage-types";
import { Retriever } from "./retrieval";
import { DEFAULT_RETRIEVAL_CONFIGURATION } from "@/types/retrieval-types";

function createStoreMock() {
  return {
    denseSearch: vi.fn(),
    sparseSearch: vi.fn(),
  };
}

function createEmbedderMock() {
  return {
    embedQuery: vi.fn(),
  };
}

function chunk(): DocumentChunk {
  return {
    documentId: "document-1",
    source: "notes.txt",
    sourceHash: "source-hash",
    chunkId: "chunk-1",
    page: 1,
    number: 0,
    text: "retrieved text",
    metadata: {
      contentType: "txt",
      indexFingerprint: "index-fingerprint",
      wordCount: 2,
    },
  };
}

function searchResults(): SearchResult[] {
  return [
    {
      chunk: chunk(),
      score: 0.9,
      denseScore: 0.9,
      sparseScore: null,
    },
  ];
}

describe("Retriever", () => {
  let store: ReturnType<typeof createStoreMock>;
  let embedder: ReturnType<typeof createEmbedderMock>;
  let retriever: Retriever;

  beforeEach(() => {
    store = createStoreMock();
    embedder = createEmbedderMock();
    retriever = new Retriever(
      store as unknown as QdrantStore,
      embedder as unknown as OllamaEmbedder,
      DEFAULT_RETRIEVAL_CONFIGURATION,
    );
  });

  describe("dense", () => {
    it("searches with the generated vector and returns the store results unchanged", async () => {
      const vector = [0.1, 0.2, 0.3];
      const results = searchResults();
      embedder.embedQuery.mockResolvedValue(vector);
      store.denseSearch.mockResolvedValue(results);

      const actual = await retriever.dense("question", 5);

      expect(embedder.embedQuery).toHaveBeenCalledOnce();
      expect(store.denseSearch).toHaveBeenCalledWith(vector, 5);
      expect(actual).toBe(results);
    });

    it("does not search when embedding fails", async () => {
      const error = new Error("Embedding failed");
      embedder.embedQuery.mockRejectedValue(error);

      await expect(retriever.dense("question", 5)).rejects.toBe(error);
      expect(store.denseSearch).not.toHaveBeenCalled();
    });

    it("propagates dense search errors", async () => {
      const error = new Error("Dense search failed");
      embedder.embedQuery.mockResolvedValue([0.1, 0.2]);
      store.denseSearch.mockRejectedValue(error);

      await expect(retriever.dense("question", 5)).rejects.toBe(error);
    });

    it("returns an empty result array unchanged", async () => {
      const results: SearchResult[] = [];
      embedder.embedQuery.mockResolvedValue([0.1, 0.2]);
      store.denseSearch.mockResolvedValue(results);

      await expect(retriever.dense("question", 5)).resolves.toBe(results);
    });
  });

  describe("sparse", () => {
    it("sparse search and returns the store results unchanged", async () => {
      const results = searchResults();
      store.sparseSearch.mockResolvedValue(results);

      const actual = await retriever.sparse("question", 7);

      expect(store.sparseSearch).toHaveBeenCalledWith("question", 7);
      expect(embedder.embedQuery).not.toHaveBeenCalled();
      expect(actual).toBe(results);
    });

    it("propagates sparse search errors", async () => {
      const error = new Error("Sparse search failed");
      store.sparseSearch.mockRejectedValue(error);

      await expect(retriever.sparse("question", 7)).rejects.toBe(error);
    });

    it("returns an empty result array unchanged", async () => {
      const results: SearchResult[] = [];
      store.sparseSearch.mockResolvedValue(results);

      await expect(retriever.sparse("question", 7)).resolves.toBe(results);
    });
  });
});