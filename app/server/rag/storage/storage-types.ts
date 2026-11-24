import { DocumentChunk } from "@/types/chunk-type";
import type { RetrievalScores } from "@/types/retrieval-types";

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
  QdrantLocalStorageConfiguration | QdrantCloudStorageConfiguration;

export const DEFAULT_STORAGE_CONFIGURATION = {
  host: "localhost",
  port: 6333,
} as const satisfies StorageConfiguration;

export type SearchResult = RetrievalScores & {
  chunk: DocumentChunk;
  score: number;
};
