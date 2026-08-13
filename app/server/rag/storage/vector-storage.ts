import { QdrantClient } from "@qdrant/js-client-rest"
import { DEFAULT_STORAGE_CONFIGURATION, SearchResult, StorageConfiguration } from "./storage-types";
import { DocumentChunk } from "../chunking/chunk-type";


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

  // abstract ensureCollection(): Promise<void>;
  // abstract pointId(): string;
  // abstract upsert(): Promise<void>;
  // abstract documentIsCurrent(): Promise<boolean>;
  // abstract deleteDocument(): Promise<void>;
  // abstract allChunks(): Promise<void>;
  // abstract count(): Promise<number>;
  // abstract close(): Promise<void>;

}
