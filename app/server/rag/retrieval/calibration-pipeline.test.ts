import { describe, expect, it, vi } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import { DEFAULT_RAG_PIPELINE_CONFIGURATION } from "../pipeline/rag-pipeline-helper";
import {
  CalibrationPipeline,
  calibrationConfiguration,
} from "./calibration-pipeline";

const chunk: DocumentChunk = {
  chunkId: "chunk-1",
  documentId: "document-1",
  source: "first.pdf",
  sourceHash: "hash-1",
  page: 2,
  number: 3,
  text: "A relevant passage",
  metadata: { contentType: "pdf", indexFingerprint: "index-1", wordCount: 3 },
};

describe("CalibrationPipeline", () => {
  it("indexes once and scopes every question to the submitted documents", async () => {
    const retriever = {
      retrieve: vi.fn(async () => [
        { chunk, score: 0.8, denseScore: 0.8, sparseScore: null },
      ]),
    };
    const store = { upsert: vi.fn(async () => undefined) };
    const pipeline = new CalibrationPipeline(
      calibrationConfiguration({}, DEFAULT_RAG_PIPELINE_CONFIGURATION),
      {
        chunker: { chunkDocuments: vi.fn(async () => [chunk]) },
        embedder: { embed: vi.fn(async () => [[0.1, 0.2]]) },
        store,
        retriever,
      },
    );
    const result = await pipeline.run(
      [new File(["content"], "first.pdf")],
      ["Question one?", "Question two?"],
    );

    expect(store.upsert).toHaveBeenCalledTimes(1);
    expect(retriever.retrieve).toHaveBeenNthCalledWith(1, "Question one?", {
      documentIds: ["document-1"],
      indexFingerprints: ["index-1"],
    });
    expect(retriever.retrieve).toHaveBeenNthCalledWith(2, "Question two?", {
      documentIds: ["document-1"],
      indexFingerprints: ["index-1"],
    });
    expect(result.results.map((entry) => entry.question)).toEqual([
      "Question one?",
      "Question two?",
    ]);
    expect(result.results[0].matches[0]).toMatchObject({
      rank: 1,
      source: "first.pdf",
      text: "A relevant passage",
    });
  });

  it("defaults to top 20 without reranking and rejects unavailable strategies", () => {
    const configuration = calibrationConfiguration(
      {},
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
    );
    expect(configuration.rag.retrieval).toMatchObject({
      strategy: "dense",
      topK: 20,
    });
    expect(configuration.reranking.enabled).toBe(false);
    expect(() =>
      calibrationConfiguration(
        { retrieval: { strategy: "hybrid" } },
        DEFAULT_RAG_PIPELINE_CONFIGURATION,
      ),
    ).toThrow("Only dense and sparse");
  });
});
