import { QdrantClient } from "@qdrant/js-client-rest"
import { DEFAULT_STORAGE_CONFIGURATION, SearchResult, StorageConfiguration } from "./storage-types";
import { DocumentChunk } from "../chunking/chunk-type";
import { pointId } from "./storage-helper";

export class QdrantStore {
  private readonly client: QdrantClient;

  constructor(
    private config: StorageConfiguration = DEFAULT_STORAGE_CONFIGURATION,
    private readonly collection = "rag_test", // to modify in production for different collections and client names
    client?: QdrantClient
  ) {
    this.client = client ?? new QdrantClient(config);
  }

  async exists(): Promise<boolean> {
    return (await this.client.collectionExists(this.collection)).exists;
  }

  async upsert(chunks: DocumentChunk[], denseVectors: number[][]): Promise<void> {
    const vector = denseVectors[0].length;

    await this.ensureCollection(vector);

    await this.client.upsert(this.collection, {
      wait: true,
      points: chunks.map((chunk, index) => ({
        id: pointId(chunk),
        vector: {
          dense: denseVectors[index],
          sparse: {
            text: chunk.text,
            model: "qdrant/bm25",
            options: {
              language: "english",
            },
          },
        },
        payload: { ...chunk },
      })),
    });
  }

  private async assertVectorSize(expectedSize: number): Promise<void> {
    const info = await this.client.getCollection(this.collection);
    const vectors = info.config.params.vectors;
    const existingSize =
      vectors && "size" in vectors
        ? vectors.size
        : vectors?.dense?.size;

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

  async ensureCollection(vectorSize: number, recreate: boolean = false): Promise<void> {
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
          distance: "Cosine"
        }
      },
      sparse_vectors: {
        sparse: {
          modifier: "idf",
        }
      },
    });
  }

  // Semantic Matching
  async denseSearch(queryVector: number[], limit: number): Promise<SearchResult[]> {
    const response = await this.client.query(this.collection, {
      query: queryVector,
      using: "dense",
      limit,
      with_payload: true
    });

    return response.points.map((point) => {
      if (!point.payload) throw new Error(`Qdrant point ${point.id} has no payload`);

      return {
        chunk: point.payload as DocumentChunk,
        score: point.score,
        denseScore: point.score,
        sparseScore: null
      };
    });
  }

  // Exact Key-Word Matching
  async sparseSearch(query: string, limit: number) {
    const response = await this.client.query(this.collection, {
      query: {
        text: query,
        model: "qdrant/bm25",
        options: {
          language: "english",
        },
      },
      using: "sparse",
      limit,
      with_payload: true,
    });

    return response.points.map((point) => {
      if (!point.payload) throw new Error(`Qdrant point ${point.id} has no payload`);

      return {
        chunk: point.payload as DocumentChunk,
        score: point.score,
        denseScore: null,
        sparseScore: point.score
      };
    });
  }

  async hybridSearch(query: string, queryVector: number[], limit: number) { }

  // abstract documentIsCurrent(): Promise<boolean>;
  // abstract deleteDocument(): Promise<void>;
  // abstract allChunks(): Promise<void>;
  // abstract count(): Promise<number>;
}
