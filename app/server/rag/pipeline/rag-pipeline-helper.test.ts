import { afterEach, describe, expect, it, vi } from "vitest";

import {
  positiveInteger,
  ragPipelineConfigurationFromEnvironment,
  storageFromEnvironment,
} from "./rag-pipeline-helper";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("positiveInteger", () => {
  it("uses the fallback when the value is undefined", () => {
    expect(positiveInteger(undefined, 16, "BATCH_SIZE")).toBe(16);
  });

  it("parses positive safe integers", () => {
    expect(positiveInteger("42", 16, "BATCH_SIZE")).toBe(42);
  });

  it.each(["0", "-1", "1.5", "not-a-number"])(
    "rejects invalid value %s",
    (value) => {
      expect(() => positiveInteger(value, 16, "BATCH_SIZE")).toThrow(
        "BATCH_SIZE must be a positive integer.",
      );
    },
  );
});

describe("storageFromEnvironment", () => {
  it("builds local storage configuration", () => {
    vi.stubEnv("QDRANT_URL", "");
    vi.stubEnv("QDRANT_HOST", " qdrant ");
    vi.stubEnv("QDRANT_PORT", "7000");

    expect(storageFromEnvironment()).toEqual({
      host: "qdrant",
      port: 7000,
    });
  });

  it("builds cloud storage configuration", () => {
    vi.stubEnv("QDRANT_URL", " https://qdrant.example.com ");
    vi.stubEnv("QDRANT_API_KEY", " secret ");

    expect(storageFromEnvironment()).toEqual({
      url: "https://qdrant.example.com",
      apiKey: "secret",
    });
  });

  it("requires an API key for cloud storage", () => {
    vi.stubEnv("QDRANT_URL", "https://qdrant.example.com");
    vi.stubEnv("QDRANT_API_KEY", " ");

    expect(() => storageFromEnvironment()).toThrow(
      "QDRANT_API_KEY is required when QDRANT_URL is set.",
    );
  });
});

describe("ragPipelineConfigurationFromEnvironment", () => {
  it("applies environment overrides", () => {
    vi.stubEnv("QDRANT_URL", "");
    vi.stubEnv("QDRANT_HOST", "qdrant");
    vi.stubEnv("QDRANT_PORT", "7000");
    vi.stubEnv("QDRANT_COLLECTION", "documents");
    vi.stubEnv("OLLAMA_EMBED_BATCH_SIZE", "8");
    vi.stubEnv("OLLAMA_EMBED_MODEL", "embedding-model");
    vi.stubEnv("OLLAMA_GENERATION_MODEL", "generation-model");
    vi.stubEnv("RAG_PROMPT_PATH", "prompts/custom.txt");
    vi.stubEnv("RAG_MAX_CONTEXT_WORDS", "900");
    vi.stubEnv("OLLAMA_HOST", "http://ollama:11434");
    vi.stubEnv("OLLAMA_QUERY_PREFIX", "query: ");

    const configuration = ragPipelineConfigurationFromEnvironment();

    expect(configuration).toMatchObject({
      collection: "documents",
      embeddingBatchSize: 8,
      embeddingModel: "embedding-model",
      generation: {
        model: "generation-model",
        prompt: "prompts/custom.txt",
        maxContextWords: 900,
      },
      ollamaHost: "http://ollama:11434",
      queryPrefix: "query: ",
      storage: {
        host: "qdrant",
        port: 7000,
      },
    });
  });
});
