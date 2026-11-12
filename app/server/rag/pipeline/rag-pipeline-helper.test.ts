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
    vi.stubEnv("RERANKING_RUNTIME", "ollama");
    vi.stubEnv("RERANKING_MODEL", " reranking-model ");

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
      reranking: {
        enabled: true,
        runtime: "ollama",
        model: "reranking-model",
        candidates: 50,
      },
      storage: {
        host: "qdrant",
        port: 7000,
      },
    });
  });

  it("turns document-question reranking off with RAG_RERANKING=false", () => {
    vi.stubEnv("RERANKING_RUNTIME", "ollama");
    vi.stubEnv("RERANKING_MODEL", "reranking-model");
    vi.stubEnv("RAG_RERANKING", " false ");

    expect(ragPipelineConfigurationFromEnvironment().reranking).toMatchObject({
      enabled: false,
      runtime: "ollama",
    });
  });

  it("defaults to the transformers reranker, turned on", () => {
    vi.stubEnv("RERANKING_RUNTIME", "");
    vi.stubEnv("RERANKING_MODEL", "");
    vi.stubEnv("RAG_RERANKING", "");

    expect(ragPipelineConfigurationFromEnvironment().reranking).toMatchObject({
      enabled: true,
      runtime: "transformers",
      model: "mixedbread-ai/mxbai-rerank-xsmall-v1",
      candidates: 20,
    });
  });

  it("requires a reranking model for the ollama runtime", () => {
    vi.stubEnv("RERANKING_RUNTIME", "ollama");
    vi.stubEnv("RERANKING_MODEL", " ");

    expect(() => ragPipelineConfigurationFromEnvironment()).toThrow(
      "RERANKING_MODEL is required when RERANKING_RUNTIME is ollama.",
    );
  });

  it("rejects an unknown reranking runtime", () => {
    vi.stubEnv("RERANKING_RUNTIME", "vllm");

    expect(() => ragPipelineConfigurationFromEnvironment()).toThrow(
      "RERANKING_RUNTIME must be transformers or ollama.",
    );
  });
});
