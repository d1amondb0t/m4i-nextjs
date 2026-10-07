import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import { DEFAULT_RETRIEVAL_CONFIGURATION } from "@/types/retrieval-types";
import type { OllamaEmbedder } from "../embeddings/ollama-embedder";
import type { SearchResult } from "../storage/storage-types";
import type { QdrantStore } from "../storage/vector-storage";
import { Retriever } from "./retrieval";

const transformersMocks = vi.hoisted(() => ({
  modelFromPretrained: vi.fn(),
  tokenizerFromPretrained: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({
  AutoModelForSequenceClassification: {
    from_pretrained: transformersMocks.modelFromPretrained,
  },
  AutoTokenizer: {
    from_pretrained: transformersMocks.tokenizerFromPretrained,
  },
}));

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
    vi.clearAllMocks();
    store = createStoreMock();
    embedder = createEmbedderMock();
    retriever = new Retriever(
      store as unknown as QdrantStore,
      embedder as unknown as OllamaEmbedder,
      DEFAULT_RETRIEVAL_CONFIGURATION,
    );
  });

  describe("crossEncoderRerank", () => {
    it("scores question-chunk pairs and sorts by the cross-encoder score", async () => {
      const first = searchResults()[0];
      const second: SearchResult = {
        ...searchResults()[0],
        chunk: {
          ...chunk(),
          chunkId: "chunk-2",
          text: "more relevant text",
        },
        score: 0.5,
        denseScore: 0.5,
      };
      const tokenizer = vi.fn().mockReturnValue({ input_ids: "features" });
      const model = vi.fn().mockResolvedValue({
        logits: { data: new Float32Array([-0.25, 1.5]) },
      });
      transformersMocks.tokenizerFromPretrained.mockResolvedValue(tokenizer);
      transformersMocks.modelFromPretrained.mockResolvedValue(model);

      const actual = await retriever.crossEncoderRerank("question", [
        first,
        second,
      ]);

      expect(tokenizer).toHaveBeenCalledWith(["question", "question"], {
        text_pair: ["retrieved text", "more relevant text"],
        padding: true,
        truncation: true,
      });
      expect(model).toHaveBeenCalledWith({ input_ids: "features" });
      expect(actual).toEqual([second, first]);
      expect(first.score).toBeCloseTo(1 / (1 + Math.exp(0.25)));
      expect(first.rerankerScore).toBe(first.score);
      expect(second.score).toBeCloseTo(1 / (1 + Math.exp(-1.5)));
      expect(second.rerankerScore).toBe(second.score);
    });

    it("loads and reuses the model lazily", async () => {
      const tokenizer = vi.fn().mockReturnValue({ input_ids: "features" });
      const model = vi.fn().mockResolvedValue({
        logits: { data: new Float32Array([0.75]) },
      });
      transformersMocks.tokenizerFromPretrained.mockResolvedValue(tokenizer);
      transformersMocks.modelFromPretrained.mockResolvedValue(model);

      await retriever.crossEncoderRerank("first", searchResults());
      await retriever.crossEncoderRerank("second", searchResults());

      expect(transformersMocks.modelFromPretrained).toHaveBeenCalledOnce();
      expect(transformersMocks.tokenizerFromPretrained).toHaveBeenCalledOnce();
      expect(transformersMocks.modelFromPretrained).toHaveBeenCalledWith(
        "cross-encoder/ms-marco-MiniLM-L6-v2",
        { local_files_only: true },
      );
    });

    it("does not load the model for an empty result set", async () => {
      const results: SearchResult[] = [];

      await expect(
        retriever.crossEncoderRerank("question", results),
      ).resolves.toBe(results);
      expect(transformersMocks.modelFromPretrained).not.toHaveBeenCalled();
      expect(transformersMocks.tokenizerFromPretrained).not.toHaveBeenCalled();
    });
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

  describe("retrieve", () => {
    it("uses the configured dense strategy and topK", async () => {
      const results = searchResults();
      embedder.embedQuery.mockResolvedValue([0.1, 0.2]);
      store.denseSearch.mockResolvedValue(results);

      await expect(retriever.retrieve("question")).resolves.toBe(results);
      expect(store.denseSearch).toHaveBeenCalledWith([0.1, 0.2], 5);
      expect(store.sparseSearch).not.toHaveBeenCalled();
    });

    it("uses the configured sparse strategy and topK", async () => {
      const results = searchResults();
      store.sparseSearch.mockResolvedValue(results);
      retriever = new Retriever(
        store as unknown as QdrantStore,
        embedder as unknown as OllamaEmbedder,
        {
          ...DEFAULT_RETRIEVAL_CONFIGURATION,
          strategy: "sparse",
          topK: 3,
        },
      );

      await expect(retriever.retrieve("question")).resolves.toBe(results);
      expect(store.sparseSearch).toHaveBeenCalledWith("question", 3);
      expect(embedder.embedQuery).not.toHaveBeenCalled();
    });

    it("reports that hybrid retrieval is not implemented", async () => {
      retriever = new Retriever(
        store as unknown as QdrantStore,
        embedder as unknown as OllamaEmbedder,
        { ...DEFAULT_RETRIEVAL_CONFIGURATION, strategy: "hybrid" },
      );

      await expect(retriever.retrieve("question")).rejects.toThrow(
        "Hybrid retrieval is not implemented yet.",
      );
    });

    it("retrieves candidates, reranks them, and returns topK", async () => {
      const first = searchResults()[0];
      const second: SearchResult = {
        ...searchResults()[0],
        chunk: { ...chunk(), chunkId: "chunk-2", text: "best match" },
      };
      const tokenizer = vi.fn().mockReturnValue({ input_ids: "features" });
      const model = vi.fn().mockResolvedValue({
        logits: { data: new Float32Array([0.1, 2.5]) },
      });
      embedder.embedQuery.mockResolvedValue([0.1, 0.2]);
      store.denseSearch.mockResolvedValue([first, second]);
      transformersMocks.tokenizerFromPretrained.mockResolvedValue(tokenizer);
      transformersMocks.modelFromPretrained.mockResolvedValue(model);
      retriever = new Retriever(
        store as unknown as QdrantStore,
        embedder as unknown as OllamaEmbedder,
        { ...DEFAULT_RETRIEVAL_CONFIGURATION, topK: 1 },
        {
          enabled: true,
          strategy: "cross_encoder",
          model: "cross-encoder/ms-marco-MiniLM-L6-v2",
          candidates: 10,
        },
      );

      await expect(retriever.retrieve("question")).resolves.toEqual([second]);
      expect(store.denseSearch).toHaveBeenCalledWith([0.1, 0.2], 10);
    });
  });
});
