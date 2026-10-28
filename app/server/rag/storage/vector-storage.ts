import { QdrantClient } from "@qdrant/js-client-rest";
import {
  DEFAULT_STORAGE_CONFIGURATION,
  SearchResult,
  StorageConfiguration,
} from "./storage-types";
import { DocumentChunk } from "@/types/chunk-type";
import type { RetrievalScope } from "@/types/retrieval-types";
import { pointId, retrievalFilter, scopeIsEmpty } from "./storage-helper";

const UPSERT_BATCH_SIZE = 100;

/**
 * Options for Qdrant's server-side BM25. avg_len is the expected document length
 * in tokens after stopword removal; Qdrant's default of 256 overweights short
 * chunks. Structured ~200-word passages average about 100 such tokens.
 * Document weights are fixed at upsert, so re-index after changing these.
 */
export type Bm25Options = { language: string; avg_len: number };

export const DEFAULT_BM25_OPTIONS = {
  language: "english",
  avg_len: 100,
} as const satisfies Bm25Options;

/** Reciprocal-rank fusion constant, as in the retrieval benchmark. */
const RRF_K = 60;

export class QdrantStore {
  private readonly client: QdrantClient;

  constructor(
    private config: StorageConfiguration = DEFAULT_STORAGE_CONFIGURATION,
    private readonly collection = "rag_test", // to modify in production for different collections and client names
    client?: QdrantClient,
    private readonly bm25: Bm25Options = DEFAULT_BM25_OPTIONS,
  ) {
    this.client = client ?? new QdrantClient(config);
  }

  async exists(): Promise<boolean> {
    return (await this.client.collectionExists(this.collection)).exists;
  }

  async upsert(
    chunks: DocumentChunk[],
    denseVectors: number[][],
  ): Promise<void> {
    if (chunks.length === 0) {
      throw new Error("At least one chunk is required for storage.");
    }

    if (chunks.length !== denseVectors.length) {
      throw new Error("Every chunk must have exactly one dense vector.");
    }

    const vector = denseVectors[0]?.length ?? 0;

    if (
      vector === 0 ||
      denseVectors.some((denseVector) => denseVector.length !== vector)
    ) {
      throw new Error(
        "Dense vectors must be non-empty and have equal dimensions.",
      );
    }

    await this.ensureCollection(vector);

    for (let start = 0; start < chunks.length; start += UPSERT_BATCH_SIZE) {
      const batch = chunks.slice(start, start + UPSERT_BATCH_SIZE);

      await this.client.upsert(this.collection, {
        wait: true,
        points: batch.map((chunk, index) => ({
          id: pointId(chunk),
          vector: {
            dense: denseVectors[start + index],
            sparse: {
              text: chunk.text,
              model: "qdrant/bm25",
              options: { ...this.bm25 },
            },
          },
          payload: { ...chunk },
        })),
      });
    }
  }

  private async assertVectorSize(expectedSize: number): Promise<void> {
    const info = await this.client.getCollection(this.collection);
    const vectors = info.config.params.vectors;
    const existingSize =
      vectors && "size" in vectors ? vectors.size : vectors?.dense?.size;

    if (existingSize === undefined) {
      throw new Error(
        `Collection ${this.collection} has no "dense" vector configuration`,
      );
    }

    if (existingSize !== expectedSize) {
      throw new Error(
        `Collection "${this.collection}" uses ${existingSize}-dimensional vectors, but the embedder returned ${expectedSize}. Re-index the collection.`,
      );
    }
  }

  async ensureCollection(
    vectorSize: number,
    recreate: boolean = false,
  ): Promise<void> {
    if (!Number.isSafeInteger(vectorSize) || vectorSize <= 0) {
      throw new RangeError("vectorSize must be a positve integer");
    }

    const collectionExists = await this.exists();

    if (collectionExists && !recreate) {
      await this.assertVectorSize(vectorSize);
      return;
    }

    if (recreate && collectionExists) {
      await this.client.deleteCollection(this.collection);
    }

    await this.client.createCollection(this.collection, {
      vectors: {
        dense: {
          size: vectorSize,
          distance: "Cosine",
        },
      },
      sparse_vectors: {
        sparse: {
          modifier: "idf",
        },
      },
    });
  }

  // Semantic Matching
  async denseSearch(
    queryVector: number[],
    limit: number,
    scope?: RetrievalScope,
  ): Promise<SearchResult[]> {
    if (scopeIsEmpty(scope)) return [];

    const filter = retrievalFilter(scope);

    const response = await this.client.query(this.collection, {
      query: queryVector,
      using: "dense",
      limit,
      with_payload: true,
      ...(filter ? { filter } : {}),
    });

    return response.points.map((point) => {
      if (!point.payload)
        throw new Error(`Qdrant point ${point.id} has no payload`);

      return {
        chunk: point.payload as DocumentChunk,
        score: point.score,
        denseScore: point.score,
        sparseScore: null,
      };
    });
  }

  // Exact Key-Word Matching
  async sparseSearch(query: string, limit: number, scope?: RetrievalScope) {
    if (scopeIsEmpty(scope)) return [];

    const filter = retrievalFilter(scope);

    const response = await this.client.query(this.collection, {
      query: {
        text: query,
        model: "qdrant/bm25",
        options: { ...this.bm25 },
      },
      using: "sparse",
      limit,
      with_payload: true,
      ...(filter ? { filter } : {}),
    });

    return response.points.map((point) => {
      if (!point.payload)
        throw new Error(`Qdrant point ${point.id} has no payload`);

      return {
        chunk: point.payload as DocumentChunk,
        score: point.score,
        denseScore: null,
        sparseScore: point.score,
      };
    });
  }
  // Dense and BM25 candidates fused by reciprocal rank
  async hybridSearch(
    queryVector: number[],
    query: string,
    limit: number,
    candidates: { dense: number; sparse: number },
    scope?: RetrievalScope,
  ): Promise<SearchResult[]> {
    if (scopeIsEmpty(scope)) return [];

    const filter = retrievalFilter(scope);
    const scoped = filter ? { filter } : {};

    const response = await this.client.query(this.collection, {
      prefetch: [
        {
          query: queryVector,
          using: "dense",
          limit: candidates.dense,
          ...scoped,
        },
        {
          query: {
            text: query,
            model: "qdrant/bm25",
            options: { ...this.bm25 },
          },
          using: "sparse",
          limit: candidates.sparse,
          ...scoped,
        },
      ],
      query: { rrf: { k: RRF_K } },
      limit,
      with_payload: true,
      ...scoped,
    });

    return response.points.map((point) => {
      if (!point.payload)
        throw new Error(`Qdrant point ${point.id} has no payload`);

      return {
        chunk: point.payload as DocumentChunk,
        score: point.score,
        denseScore: null,
        sparseScore: null,
      };
    });
  }

  // abstract documentIsCurrent(): Promise<boolean>;
  // abstract deleteDocument(): Promise<void>;
  // abstract allChunks(): Promise<void>;
  // abstract count(): Promise<number>;
}
