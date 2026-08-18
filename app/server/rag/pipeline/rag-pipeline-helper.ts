import { DEFAULT_CHUNK_CONFIG } from "@/types/chunk-type";
import { DEFAULT_GENERATION_CONFIGURATION } from "@/types/generation-type";
import type { RagPipelineConfiguration } from "@/types/rag-pipeline-type";
import { DEFAULT_RETRIEVAL_CONFIGURATION } from "@/types/retrieval-types";
import { DEFAULT_STORAGE_CONFIGURATION, type StorageConfiguration,} from "../storage/storage-types";

const DEFAULT_COLLECTION = "rag_test";
const DEFAULT_EMBEDDING_MODEL =
  "hf.co/CompendiumLabs/bge-base-en-v1.5-gguf";

export const DEFAULT_RAG_PIPELINE_CONFIGURATION = {
  chunking: DEFAULT_CHUNK_CONFIG,
  collection: DEFAULT_COLLECTION,
  embeddingBatchSize: 16,
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  generation: DEFAULT_GENERATION_CONFIGURATION,
  queryPrefix: "Represent this sentence for searching relevant passages: ",
  retrieval: DEFAULT_RETRIEVAL_CONFIGURATION,
  storage: DEFAULT_STORAGE_CONFIGURATION,
} as const satisfies RagPipelineConfiguration;

export function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function storageFromEnvironment(): StorageConfiguration {
  const url = process.env.QDRANT_URL?.trim();

  if (url) {
    const apiKey = process.env.QDRANT_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("QDRANT_API_KEY is required when QDRANT_URL is set.");
    }

    return { url, apiKey };
  }

  return {
    host: process.env.QDRANT_HOST?.trim() || "localhost",
    port: positiveInteger(process.env.QDRANT_PORT, 6333, "QDRANT_PORT"),
  };
}

export function ragPipelineConfigurationFromEnvironment(): RagPipelineConfiguration {
  return {
    chunking: DEFAULT_CHUNK_CONFIG,
    collection: process.env.QDRANT_COLLECTION?.trim() || DEFAULT_COLLECTION,
    embeddingBatchSize: positiveInteger(
      process.env.OLLAMA_EMBED_BATCH_SIZE,
      16,
      "OLLAMA_EMBED_BATCH_SIZE",
    ),
    embeddingModel:
      process.env.OLLAMA_EMBED_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    generation: {
      ...DEFAULT_GENERATION_CONFIGURATION,
      model:
        process.env.OLLAMA_GENERATION_MODEL?.trim() ||
        DEFAULT_GENERATION_CONFIGURATION.model,
      prompt:
        process.env.RAG_PROMPT_PATH?.trim() ||
        DEFAULT_GENERATION_CONFIGURATION.prompt,
      maxContextWords: positiveInteger(
        process.env.RAG_MAX_CONTEXT_WORDS,
        DEFAULT_GENERATION_CONFIGURATION.maxContextWords,
        "RAG_MAX_CONTEXT_WORDS",
      ),
    },
    ollamaHost: process.env.OLLAMA_HOST?.trim() || undefined,
    queryPrefix:
      process.env.OLLAMA_QUERY_PREFIX ??
      "Represent this sentence for searching relevant passages: ",
    retrieval: DEFAULT_RETRIEVAL_CONFIGURATION,
    storage: storageFromEnvironment(),
  };
}