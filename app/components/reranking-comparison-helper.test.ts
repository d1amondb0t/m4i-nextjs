import { describe, expect, it } from "vitest";

import type { RagSource } from "@/types/rag-pipeline-type";
import {
  changeAfterReranking,
  changeWithoutReranking,
  rerankingSummary,
} from "./reranking-comparison-helper";

function source(retrievalRank: number, rerankedRank: number): RagSource {
  return {
    source: "report.pdf",
    page: 1,
    chunk: retrievalRank,
    score: 0.5,
    scores: {
      denseScore: 0.5,
      sparseScore: null,
      rrfScore: 0.5,
      rerankerScore: 0.5,
    },
    text: "text",
    retrievalRank,
    rerankedRank,
  };
}

describe("changeAfterReranking", () => {
  it("marks a chunk from outside the top K as new", () => {
    expect(changeAfterReranking(source(12, 1), 5)).toEqual({
      label: "New · was #12",
      tone: "gained",
    });
  });

  it("shows the direction of a move within the top K", () => {
    expect(changeAfterReranking(source(3, 1), 5).label).toBe("▲ was #3");
    expect(changeAfterReranking(source(1, 3), 5).label).toBe("▼ was #1");
  });

  it("treats the last place in the top K as already included", () => {
    expect(changeAfterReranking(source(5, 5), 5)).toEqual({
      label: "Same rank",
      tone: "neutral",
    });
  });
});

describe("changeWithoutReranking", () => {
  it("marks a chunk pushed outside the top K as dropped", () => {
    expect(changeWithoutReranking(source(1, 18), 5)).toEqual({
      label: "Dropped · now #18",
      tone: "lost",
    });
  });

  it("shows the direction of a move within the top K", () => {
    expect(changeWithoutReranking(source(3, 1), 5).label).toBe("▲ now #1");
    expect(changeWithoutReranking(source(1, 3), 5).label).toBe("▼ now #3");
  });

  it("reports an unchanged rank", () => {
    expect(changeWithoutReranking(source(2, 2), 5)).toEqual({
      label: "Same rank",
      tone: "neutral",
    });
  });
});

describe("rerankingSummary", () => {
  it("counts chunks that entered the top K", () => {
    expect(rerankingSummary([source(12, 1), source(1, 2)])).toBe(
      "1 of the top 2 chunks is new.",
    );
    expect(rerankingSummary([source(12, 1), source(9, 2)])).toBe(
      "2 of the top 2 chunks are new.",
    );
  });

  it("distinguishes a reorder from no change", () => {
    expect(rerankingSummary([source(2, 1), source(1, 2)])).toBe(
      "Same top 2 chunks, in a different order.",
    );
    expect(rerankingSummary([source(1, 1), source(2, 2)])).toBe(
      "Same top 2 chunks, in the same order.",
    );
  });
});
