import { DocumentChunk } from "../chunking/chunk-type";
import { v5 as uuidv5 } from "uuid";

// node -e "console.log(require('node:crypto').randomUUID())"
const POINT_NAMESPACE = '47129d6b-906b-4c39-98fd-76c3ac5a0060';

export type QdrantLocalStorageConfiguration = {
  host: string;
  port: number;
  url?: never;
  apiKey?: never;
};

export type QdrantCloudStorageConfiguration = {
  url: string;
  apiKey: string;
  host?: never;
  port?: never;
};

export type StorageConfiguration =
  | QdrantLocalStorageConfiguration
  | QdrantCloudStorageConfiguration;

export const DEFAULT_STORAGE_CONFIGURATION = {
  host: "localhost",
  port: 6333,
} as const satisfies StorageConfiguration;

export type SearchResult = {
  chunk: DocumentChunk;
  score: number;
  denseScore: number | null;
  sparseScore: number | null;
}

export function isCloudInstance(config: StorageConfiguration
): config is QdrantCloudStorageConfiguration {
  return typeof config.url === "string";
}

export function pointId(chunk: DocumentChunk): string {
  return uuidv5(chunk.chunkId, POINT_NAMESPACE );
}
