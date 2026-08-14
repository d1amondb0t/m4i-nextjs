import type { QdrantClient } from "@qdrant/js-client-rest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentChunk } from "@/types/chunk-type";
import { pointId } from "./storage-helper";
import { QdrantStore } from "./vector-storage";

const COLLECTION = "documents";

function createClientMock() {
  return {
    collectionExists: vi.fn(),
    getCollection: vi.fn(),
    createCollection: vi.fn(),
    deleteCollection: vi.fn(),
    upsert: vi.fn(),
    query: vi.fn(),
  };
}

type ClientMock = ReturnType<typeof createClientMock>;

function createStore(client: ClientMock, collection = COLLECTION) {
  return new QdrantStore(
    { host: "localhost", port: 6333 },
    collection,
    client as unknown as QdrantClient,
  );
}

function collectionInfo(vectorSize?: number) {
  return {
    config: {
      params: {
        vectors:
          vectorSize === undefined
            ? {}
            : {
              dense: {
                size: vectorSize,
                distance: "Cosine",
              },
            },
      },
    },
  };
}

function chunk(number: number, text: string): DocumentChunk {
  return {
    documentId: "document-1",
    source: "notes.txt",
    sourceHash: "source-hash",
    chunkId: `chunk-${number}`,
    page: 1,
    number,
    text,
    metadata: {
      contentType: "txt",
      indexFingerprint: "index-fingerprint",
      wordCount: text.split(/\s+/).length,
      wordStart: number * 10,
    },
  };
}

describe("QdrantStore", () => {
  let client: ClientMock;
  let store: QdrantStore;

  beforeEach(() => {
    client = createClientMock();
    store = createStore(client);
  });

  describe("exists", () => {
    it.each([true, false])(
      "returns %s when Qdrant reports that result",
      async (exists) => {
        client.collectionExists.mockResolvedValue({ exists });

        await expect(store.exists()).resolves.toBe(exists);
        expect(client.collectionExists).toHaveBeenCalledOnce();
        expect(client.collectionExists).toHaveBeenCalledWith(COLLECTION);
      },
    );

    it("propagates collection existence errors", async () => {
      const error = new Error("Qdrant is unavailable");
      client.collectionExists.mockRejectedValue(error);

      await expect(store.exists()).rejects.toBe(error);
    });
  });

  describe("ensureCollection", () => {
    it.each([0, -1, 1.5, Number.NaN])(
      "rejects invalid vector size %s without contacting Qdrant",
      async (vectorSize) => {
        await expect(store.ensureCollection(vectorSize)).rejects.toThrow(
          RangeError,
        );

        expect(client.collectionExists).not.toHaveBeenCalled();
        expect(client.getCollection).not.toHaveBeenCalled();
        expect(client.deleteCollection).not.toHaveBeenCalled();
        expect(client.createCollection).not.toHaveBeenCalled();
      },
    );

    it("accepts one as the minimum valid vector size", async () => {
      client.collectionExists.mockResolvedValue({ exists: false });
      client.createCollection.mockResolvedValue(true);

      await expect(store.ensureCollection(1)).resolves.toBeUndefined();
      expect(client.createCollection).toHaveBeenCalledWith(
        COLLECTION,
        expect.objectContaining({
          vectors: expect.objectContaining({
            dense: expect.objectContaining({ size: 1 }),
          }),
        }),
      );
    });

    it("keeps an existing collection whose dense vector size matches", async () => {
      client.collectionExists.mockResolvedValue({ exists: true });
      client.getCollection.mockResolvedValue(collectionInfo(384));

      await expect(store.ensureCollection(384)).resolves.toBeUndefined();

      expect(client.getCollection).toHaveBeenCalledWith(COLLECTION);
      expect(client.createCollection).not.toHaveBeenCalled();
      expect(client.deleteCollection).not.toHaveBeenCalled();
    });

    it("rejects an existing collection with a different dense vector size", async () => {
      client.collectionExists.mockResolvedValue({ exists: true });
      client.getCollection.mockResolvedValue(collectionInfo(768));

      await expect(store.ensureCollection(384)).rejects.toThrow(
        `Collection "${COLLECTION}" uses 768-dimensional vectors, but the embedder returned 384. Re-index the collection.`,
      );

      expect(client.createCollection).not.toHaveBeenCalled();
      expect(client.deleteCollection).not.toHaveBeenCalled();
    });

    it("rejects an existing collection without a dense vector", async () => {
      client.collectionExists.mockResolvedValue({ exists: true });
      client.getCollection.mockResolvedValue(collectionInfo());

      await expect(store.ensureCollection(384)).rejects.toThrow(
        `Collection ${COLLECTION} has no "dense" vector configuration`,
      );
    });

    it("propagates collection inspection errors", async () => {
      const error = new Error("Could not inspect collection");
      client.collectionExists.mockResolvedValue({ exists: true });
      client.getCollection.mockRejectedValue(error);

      await expect(store.ensureCollection(384)).rejects.toBe(error);
    });

    it("creates a missing collection with the requested configuration", async () => {
      client.collectionExists.mockResolvedValue({ exists: false });
      client.createCollection.mockResolvedValue(true);

      await store.ensureCollection(384);

      expect(client.createCollection).toHaveBeenCalledWith(COLLECTION, {
        vectors: {
          dense: {
            size: 384,
            distance: "Cosine",
          },
        },
        sparse_vectors: {
          sparse: {
            modifier: "idf",
          },
        },
      });
      expect(client.getCollection).not.toHaveBeenCalled();
      expect(client.deleteCollection).not.toHaveBeenCalled();
    });

    it("propagates collection creation errors", async () => {
      const error = new Error("Could not create collection");
      client.collectionExists.mockResolvedValue({ exists: false });
      client.createCollection.mockRejectedValue(error);

      await expect(store.ensureCollection(384)).rejects.toBe(error);
    });

    it("deletes and recreates an existing collection when requested", async () => {
      client.collectionExists.mockResolvedValue({ exists: true });
      client.deleteCollection.mockResolvedValue(true);
      client.createCollection.mockResolvedValue(true);

      await store.ensureCollection(512, true);

      expect(client.deleteCollection).toHaveBeenCalledWith(COLLECTION);
      expect(client.createCollection).toHaveBeenCalledWith(COLLECTION, {
        vectors: {
          dense: {
            size: 512,
            distance: "Cosine",
          },
        },
        sparse_vectors: {
          sparse: {
            modifier: "idf",
          },
        },
      });
      expect(client.deleteCollection.mock.invocationCallOrder[0]).toBeLessThan(
        client.createCollection.mock.invocationCallOrder[0],
      );
    });

    it("creates without deleting when recreation is requested but the collection is missing", async () => {
      client.collectionExists.mockResolvedValue({ exists: false });
      client.createCollection.mockResolvedValue(true);

      await store.ensureCollection(384, true);

      expect(client.deleteCollection).not.toHaveBeenCalled();
      expect(client.createCollection).toHaveBeenCalledOnce();
    });

    it("does not recreate when collection deletion fails", async () => {
      const error = new Error("Could not delete collection");
      client.collectionExists.mockResolvedValue({ exists: true });
      client.deleteCollection.mockRejectedValue(error);

      await expect(store.ensureCollection(384, true)).rejects.toBe(error);
      expect(client.createCollection).not.toHaveBeenCalled();
    });

    it("propagates an error while creating the replacement collection", async () => {
      const error = new Error("Could not create replacement");
      client.collectionExists.mockResolvedValue({ exists: true });
      client.deleteCollection.mockResolvedValue(true);
      client.createCollection.mockRejectedValue(error);

      await expect(store.ensureCollection(384, true)).rejects.toBe(error);
    });

    it("does not modify collections when the existence check fails", async () => {
      const error = new Error("Could not check collection");
      client.collectionExists.mockRejectedValue(error);

      await expect(store.ensureCollection(384, true)).rejects.toBe(error);
      expect(client.deleteCollection).not.toHaveBeenCalled();
      expect(client.createCollection).not.toHaveBeenCalled();
    });
  });

  describe("upsert", () => {
    it("ensures the collection and constructs the complete upsert request", async () => {
      const chunks = [chunk(0, "first chunk"), chunk(1, "second chunk")];
      const denseVectors = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      const ensureCollection = vi
        .spyOn(store, "ensureCollection")
        .mockResolvedValue();
      client.upsert.mockResolvedValue({ status: "completed" });

      await store.upsert(chunks, denseVectors);

      expect(ensureCollection).toHaveBeenCalledWith(3);
      expect(client.upsert).toHaveBeenCalledWith(COLLECTION, {
        wait: true,
        points: chunks.map((currentChunk, index) => ({
          id: pointId(currentChunk),
          vector: {
            dense: denseVectors[index],
            sparse: {
              text: currentChunk.text,
              model: "qdrant/bm25",
              options: {
                language: "english",
              },
            },
          },
          payload: { ...currentChunk },
        })),
      });
      expect(ensureCollection.mock.invocationCallOrder[0]).toBeLessThan(
        client.upsert.mock.invocationCallOrder[0],
      );
    });

    it("does not upsert when collection preparation fails", async () => {
      const error = new Error("Invalid collection");
      vi.spyOn(store, "ensureCollection").mockRejectedValue(error);

      await expect(
        store.upsert([chunk(0, "text")], [[0.1, 0.2]]),
      ).rejects.toBe(error);
      expect(client.upsert).not.toHaveBeenCalled();
    });

    it("propagates Qdrant upsert errors", async () => {
      const error = new Error("Upsert failed");
      vi.spyOn(store, "ensureCollection").mockResolvedValue();
      client.upsert.mockRejectedValue(error);

      await expect(
        store.upsert([chunk(0, "text")], [[0.1, 0.2]]),
      ).rejects.toBe(error);
    });
  });

  describe("denseSearch", () => {
    it("queries the collection with the requested limit and payloads", async () => {
      client.query.mockResolvedValue({ points: [] });

      await store.denseSearch([0.1, 0.2], 5);

      expect(client.query).toHaveBeenCalledWith(
        COLLECTION,
        expect.objectContaining({
          limit: 5,
          with_payload: true,
        }),
      );
    });

    it("maps dense results and preserves their order", async () => {
      const first = chunk(0, "first");
      const second = chunk(1, "second");
      client.query.mockResolvedValue({
        points: [
          { id: "point-1", payload: first, score: 0.9 },
          { id: "point-2", payload: second, score: 0.7 },
        ],
      });

      await expect(store.denseSearch([0.1, 0.2], 2)).resolves.toEqual([
        {
          chunk: first,
          score: 0.9,
          denseScore: 0.9,
          sparseScore: null,
        },
        {
          chunk: second,
          score: 0.7,
          denseScore: 0.7,
          sparseScore: null,
        },
      ]);
    });

    it("returns an empty array when Qdrant returns no points", async () => {
      client.query.mockResolvedValue({ points: [] });

      await expect(store.denseSearch([0.1], 5)).resolves.toEqual([]);
    });

    it("rejects a dense result without a payload", async () => {
      client.query.mockResolvedValue({
        points: [{ id: "point-7", score: 0.5 }],
      });

      await expect(store.denseSearch([0.1], 5)).rejects.toThrow(
        "Qdrant point point-7 has no payload",
      );
    });

    it("propagates dense query errors", async () => {
      const error = new Error("Dense query failed");
      client.query.mockRejectedValue(error);

      await expect(store.denseSearch([0.1], 5)).rejects.toBe(error);
    });
  });

  describe("sparseSearch", () => {
    it("constructs the expected BM25 sparse query", async () => {
      client.query.mockResolvedValue({ points: [] });

      await store.sparseSearch("search terms", 8);

      expect(client.query).toHaveBeenCalledWith(COLLECTION, {
        query: {
          text: "search terms",
          model: "qdrant/bm25",
          options: {
            language: "english",
          },
        },
        using: "sparse",
        limit: 8,
        with_payload: true,
      });
    });

    it("maps sparse results and preserves their order", async () => {
      const first = chunk(0, "first");
      const second = chunk(1, "second");
      client.query.mockResolvedValue({
        points: [
          { id: "point-1", payload: first, score: 0.8 },
          { id: "point-2", payload: second, score: 0.6 },
        ],
      });

      await expect(store.sparseSearch("terms", 2)).resolves.toEqual([
        {
          chunk: first,
          score: 0.8,
          denseScore: null,
          sparseScore: 0.8,
        },
        {
          chunk: second,
          score: 0.6,
          denseScore: null,
          sparseScore: 0.6,
        },
      ]);
    });

    it("returns an empty array when Qdrant returns no points", async () => {
      client.query.mockResolvedValue({ points: [] });

      await expect(store.sparseSearch("terms", 5)).resolves.toEqual([]);
    });

    it("rejects a sparse result without a payload", async () => {
      client.query.mockResolvedValue({
        points: [{ id: "point-9", score: 0.4, payload: null }],
      });

      await expect(store.sparseSearch("terms", 5)).rejects.toThrow(
        "Qdrant point point-9 has no payload",
      );
    });

    it("propagates sparse query errors", async () => {
      const error = new Error("Sparse query failed");
      client.query.mockRejectedValue(error);

      await expect(store.sparseSearch("terms", 5)).rejects.toBe(error);
    });
  });
});