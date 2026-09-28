import { describe, expect, it } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import type { SearchResult } from "../storage/storage-types";
import { DEFAULT_RRF_K, reciprocalRankFusion } from "./fusion";

function result(
  chunkId: string,
  score: number,
  kind: "dense" | "sparse" = "dense",
): SearchResult {
  return {
    chunk: {
      chunkId,
      documentId: "document-1",
      source: "report.pdf",
      sourceHash: "hash",
      page: 1,
      number: 1,
      text: `passage ${chunkId}`,
      metadata: { contentType: "pdf", indexFingerprint: "fingerprint", wordCount: 2 },
    } satisfies DocumentChunk,
    score,
    denseScore: kind === "dense" ? score : null,
    sparseScore: kind === "sparse" ? score : null,
  };
}

const ids = (results: readonly SearchResult[]) => results.map((r) => r.chunk.chunkId);

describe("reciprocalRankFusion", () => {
  it("ranks a chunk found by both retrievers above one found by either", () => {
    const dense = [result("a", 0.9), result("b", 0.8)];
    const sparse = [result("b", 12, "sparse"), result("c", 9, "sparse")];

    expect(ids(reciprocalRankFusion([dense, sparse]))).toEqual(["b", "a", "c"]);
  });

  it("fuses on rank, so incomparable score scales do not matter", () => {
    // BM25 scores dwarf cosine scores; only the ordering should count.
    const dense = [result("a", 0.99), result("b", 0.98)];
    const sparse = [result("b", 4200, "sparse"), result("a", 1, "sparse")];
    const fused = reciprocalRankFusion([dense, sparse]);

    expect(fused[0].score).toBeCloseTo(1 / (DEFAULT_RRF_K + 1) + 1 / (DEFAULT_RRF_K + 2), 12);
    expect(new Set(ids(fused))).toEqual(new Set(["a", "b"]));
  });

  it("carries dense and sparse scores through the fusion", () => {
    const fused = reciprocalRankFusion([
      [result("a", 0.9)],
      [result("a", 7, "sparse")],
    ]);

    expect(fused[0].denseScore).toBe(0.9);
    expect(fused[0].sparseScore).toBe(7);
  });

  it("returns an empty list when nothing was retrieved", () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("rejects a non-positive smoothing constant", () => {
    expect(() => reciprocalRankFusion([[result("a", 1)]], 0)).toThrow(
      "The RRF smoothing constant must be a positive number.",
    );
  });
});
