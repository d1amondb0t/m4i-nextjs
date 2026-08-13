import { QdrantClient } from "@qdrant/js-client-rest"
import { DEFAULT_STORAGE_CONFIGURATION, StorageConfiguration } from "./storage-types";


abstract class QDrantStore {
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

  abstract ensureCollection(): Promise<void>;
  abstract pointId(): string;
  abstract upsert(): Promise<void>;
  abstract documentIsCurrent(): Promise<boolean>;
  abstract deleteDocument(): Promise<void>;
  abstract denseSearch(): Promise<void>;
  abstract allChunks(): Promise<void>;
  abstract count(): Promise<number>;
  abstract close(): Promise<void>;

}
