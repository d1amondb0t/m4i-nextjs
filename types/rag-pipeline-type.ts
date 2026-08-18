import type { SearchResult, StorageConfiguration } from "@/app/server/rag/storage/storage-types";
import type { ChunkConfiguration, DocumentChunk } from "./chunk-type";
import type { GenerationConfiguration } from "./generation-type";
import type { RetrievalConfiguration } from "./retrieval-types";

export const MAX_QUESTION_LENGTH = 2_000;

export type Chunker = {
  chunkDocuments(files: readonly File[]): Promise<DocumentChunk[]>;
};

export type Embedder = {
  embed(texts: readonly string[]): Promise<number[][]>;
};

export type Store = {
  upsert(chunks: DocumentChunk[], vectors: number[][]): Promise<void>;
};

export type PipelineRetriever = {
  retrieve(question: string): Promise<SearchResult[]>;
};

export type Generator = {
  generate(question: string, results: SearchResult[]): Promise<string>;
};

export type RagPipelineDependencies = {
  chunker?: Chunker;
  embedder?: Embedder;
  generator?: Generator;
  retriever?: PipelineRetriever;
  store?: Store;
};

export type RagPipelineResult = {
  answer: string;
  chunks: DocumentChunk[];
  results: SearchResult[];
};


export type RagPipelineConfiguration = {
  chunking: ChunkConfiguration;
  collection: string;
  embeddingBatchSize: number;
  embeddingModel: string;
  generation: GenerationConfiguration;
  ollamaHost?: string;
  queryPrefix: string;
  retrieval: RetrievalConfiguration;
  storage: StorageConfiguration;
};

export type RagSource = {
  source: string;
  page: number;
  chunk: number;
  score: number;
  text: string;
};

export type RagPipelineResponse =
  | {
    ok: true;
    answer: string;
    indexedChunks: number;
    sources: RagSource[];
  }
  | {
    ok: false;
    message: string;
    };

export function validateQuestion(question: string): string | null {
  if (!question.trim()) {
    return "Enter a question about the selected documents.";
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return `Question must be ${MAX_QUESTION_LENGTH.toLocaleString()} characters or fewer.`;
  }

  return null;
}
