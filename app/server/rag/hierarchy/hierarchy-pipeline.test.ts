import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentChunk } from "@/types/chunk-type";
import { DEFAULT_HIERARCHY_CONFIGURATION } from "@/types/hierarchy-types";
import type { SearchResult } from "../storage/storage-types";
import { DEFAULT_RAG_PIPELINE_CONFIGURATION } from "../pipeline/rag-pipeline";
import {
  HierarchyPipeline,
  type HierarchyPipelineDependencies,
} from "./hierarchy-pipeline";

function chunk(): DocumentChunk {
  return {
    chunkId: "chunk-1",
    documentId: "document-1",
    source: "report.txt",
    sourceHash: "source-hash",
    page: 4,
    number: 2,
    text: "The ministry adopted three policy recommendations.",
    metadata: {
      contentType: "txt",
      indexFingerprint: "fingerprint",
      wordCount: 7,
    },
  };
}

const scores = {
  denseScore: 0.72,
  sparseScore: 6.4,
  rrfScore: 0.03,
  rerankerScore: 0.91,
};

function searchResult(): SearchResult {
  return { chunk: chunk(), score: 0.91, ...scores };
}

const questions = [
  "Was the policy adopted?",
  "Did the work influence policy?",
  "Who benefited?",
];
const ontology = {
  dimensions: [
    {
      id: "political",
      name: "Political",
      definition: "Policy and governance change.",
      categories: [
        {
          id: "advocacy",
          name: "Advocacy & policy influence",
          definition: "Influence on policy and decision-makers.",
          questions,
        },
      ],
    },
  ],
};

const match = {
  explicitness: "explicit" as const,
  reason: "The report states that the recommendations were adopted.",
  evidence: [
    {
      chunkId: "chunk-1",
      quote: "ministry adopted three policy recommendations",
    },
  ],
};

describe("HierarchyPipeline", () => {
  let dependencies: Required<HierarchyPipelineDependencies>;

  beforeEach(() => {
    dependencies = {
      chunker: { chunkDocuments: vi.fn(async () => [chunk()]) },
      embedder: { embed: vi.fn(async () => [[0.1, 0.2]]) },
      store: { upsert: vi.fn(async () => undefined) },
      retriever: { rankCandidates: vi.fn(async () => [searchResult()]) },
      analyzer: { match: vi.fn(async () => [match]) },
    };
  });

  function pipeline() {
    return new HierarchyPipeline(
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
      DEFAULT_HIERARCHY_CONFIGURATION,
      dependencies,
    );
  }

  it.each([
    [{ retrievalScoreFloor: 0.5 }, "retrievalScoreFloor must be between"],
    [{ relativeRetrievalScore: 1.5 }, "relativeRetrievalScore must be between"],
  ])("rejects an invalid cutoff setting %o", (override, message) => {
    expect(
      () =>
        new HierarchyPipeline(
          DEFAULT_RAG_PIPELINE_CONFIGURATION,
          { ...DEFAULT_HIERARCHY_CONFIGURATION, ...override },
          dependencies,
        ),
    ).toThrow(message);
  });

  it("matches every supplied question, preserving explicit and implicit support", async () => {
    vi.mocked(dependencies.analyzer.match)
      .mockResolvedValueOnce([match])
      .mockResolvedValueOnce([
        {
          ...match,
          explicitness: "implicit",
          reason: "Adoption implies policy influence.",
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await pipeline().run(
      [new File(["content"], "report.txt")],
      ontology,
    );
    const category = result.framework.dimensions[0].categories[0];

    expect(dependencies.chunker.chunkDocuments).toHaveBeenCalledTimes(1);
    expect(dependencies.store.upsert).toHaveBeenCalledTimes(1);
    expect(dependencies.retriever.rankCandidates).toHaveBeenCalledTimes(3);
    for (const question of questions) {
      expect(dependencies.retriever.rankCandidates).toHaveBeenCalledWith(
        question,
        {
          documentIds: ["document-1"],
          indexFingerprints: ["fingerprint"],
        },
      );
      expect(dependencies.analyzer.match).toHaveBeenCalledWith(
        expect.objectContaining({ id: "advocacy" }),
        question,
        [searchResult()],
      );
    }
    expect(category.questions).toEqual(questions);
    expect(
      category.matches.map(({ question, explicitness }) => ({
        question,
        explicitness,
      })),
    ).toEqual([
      { question: questions[0], explicitness: "explicit" },
      { question: questions[1], explicitness: "implicit" },
    ]);
    expect(category.matches[0].evidence).toMatchObject([
      { source: "report.txt", page: 4, scores },
    ]);
    expect(result.diagnostics[0]).toMatchObject({
      retrievedChunks: 1,
      matchedQuestions: 2,
      rejected: [],
    });
  });

  it("finishes reranking across every dimension before the first generation", async () => {
    const calls: string[] = [];
    vi.mocked(dependencies.retriever.rankCandidates).mockImplementation(
      async () => {
        calls.push("retrieve");
        return [searchResult()];
      },
    );
    vi.mocked(dependencies.analyzer.match).mockImplementation(async () => {
      calls.push("generate");
      return [match];
    });
    const twoDimensions = {
      dimensions: ["one", "two"].map((id) => ({
        ...ontology.dimensions[0],
        id,
        categories: [
          { ...ontology.dimensions[0].categories[0], id: `category-${id}` },
        ],
      })),
    };

    await pipeline().run([new File(["content"], "report.txt")], twoDimensions);

    expect(calls).toEqual([
      ...Array<string>(6).fill("retrieve"),
      ...Array<string>(6).fill("generate"),
    ]);
  });

  it("skips the model and preserves empty categories when retrieval is below the cutoff", async () => {
    vi.mocked(dependencies.retriever.rankCandidates).mockResolvedValue([
      { ...searchResult(), score: 0.01, denseScore: 0.01 },
    ]);
    const result = await pipeline().run(
      [new File(["content"], "report.txt")],
      ontology,
    );

    expect(dependencies.analyzer.match).not.toHaveBeenCalled();
    expect(result.framework.dimensions[0].categories[0].matches).toEqual([]);
    expect(result.diagnostics[0].retrievedChunks).toBe(0);
  });

  it("keeps chunks dropped by the cutoff and by the top-K limit", async () => {
    const ranked = Array.from({ length: 14 }, (_, index) => ({
      ...searchResult(),
      chunk: { ...chunk(), chunkId: `chunk-${index}` },
      score: index < 10 ? 0.9 : 0.01,
    }));
    vi.mocked(dependencies.retriever.rankCandidates).mockResolvedValue(ranked);

    const result = await pipeline().run(
      [new File(["content"], "report.txt")],
      ontology,
    );
    const [first] = result.retrievals[0].questions;

    expect(result.retrievals[0]).toMatchObject({
      dimensionId: "political",
      categoryId: "advocacy",
    });
    expect(first.results.map((r) => r.chunk.chunkId)).toEqual(
      ranked.slice(0, 10).map((r) => r.chunk.chunkId),
    );
    expect(first.droppedBelowCutoff.map((r) => r.chunk.chunkId)).toEqual([
      "chunk-10",
      "chunk-11",
    ]);
    expect(first.droppedOutsideTopK.map((r) => r.chunk.chunkId)).toEqual([
      "chunk-12",
      "chunk-13",
    ]);
    expect(result.diagnostics[0].questions[0]).toMatchObject({
      candidates: 14,
      droppedBelowCutoff: 2,
      droppedOutsideTopK: 2,
    });
  });

  it("reports progress once per question for retrieval and for analysis", async () => {
    const progress: [number, number][] = [];

    await pipeline().run(
      [new File(["content"], "report.txt")],
      ontology,
      (done, total) => progress.push([done, total]),
    );

    expect(progress).toEqual(Array.from({ length: 7 }, (_, done) => [done, 6]));
  });

  it.each([
    { chunkId: "chunk-1", quote: "invented evidence" },
    {
      chunkId: "unknown-chunk",
      quote: "ministry adopted three policy recommendations",
    },
  ])("rejects ungrounded evidence: $chunkId / $quote", async (evidence) => {
    vi.mocked(dependencies.analyzer.match).mockResolvedValue([
      { ...match, evidence: [evidence] },
    ]);
    const result = await pipeline().run(
      [new File(["content"], "report.txt")],
      ontology,
    );

    expect(result.framework.dimensions[0].categories[0].matches).toEqual([]);
    expect(
      result.diagnostics[0].rejected.map(({ question }) => question),
    ).toEqual(questions);
  });

  it("preserves shared evidence matches across categories and dimensions", async () => {
    const sharedOntology = {
      dimensions: ["one", "two"].map((id) => ({
        ...ontology.dimensions[0],
        id,
        categories: [
          { ...ontology.dimensions[0].categories[0], id: `category-${id}` },
        ],
      })),
    };
    const result = await pipeline().run(
      [new File(["content"], "report.txt")],
      sharedOntology,
    );

    expect(dependencies.analyzer.match).toHaveBeenCalledTimes(6);
    expect(
      result.framework.dimensions.map(
        ({ categories }) => categories[0].matches.length,
      ),
    ).toEqual([3, 3]);
    expect(
      result.diagnostics.map(({ matchedQuestions }) => matchedQuestions),
    ).toEqual([3, 3]);
  });

  it("retains multiple passages per question and rejects an invalid passage independently", async () => {
    const partial = {
      ...match,
      explicitness: "implicit" as const,
      reason:
        "The proposed adoption criterion is relevant without demonstrating an achieved result.",
      evidence: [{ chunkId: "chunk-1", quote: "three policy recommendations" }],
    };
    vi.mocked(dependencies.analyzer.match).mockResolvedValue([
      match,
      { ...match, evidence: [{ chunkId: "chunk-1", quote: "invented quote" }] },
      partial,
    ]);

    const result = await pipeline().run(
      [new File(["content"], "report.txt")],
      ontology,
    );

    expect(result.framework.dimensions[0].categories[0].matches).toHaveLength(
      6,
    );
    expect(result.diagnostics[0]).toMatchObject({
      matchedQuestions: 3,
      matchedCandidates: 6,
    });
    expect(result.diagnostics[0].questions).toEqual(
      questions.map((question) => ({
        question,
        retrievedChunks: 1,
        chunks: [
          {
            chunkId: "chunk-1",
            source: "report.txt",
            page: 4,
            chunk: 2,
            scores,
          },
        ],
        candidates: 1,
        droppedBelowCutoff: 0,
        droppedOutsideTopK: 0,
        generatedCandidates: 3,
        acceptedCandidates: 2,
      })),
    );
    expect(result.diagnostics[0].rejected).toHaveLength(3);
  });

  it("removes repeated passages within a question while retaining reuse across questions", async () => {
    vi.mocked(dependencies.analyzer.match).mockResolvedValue([
      match,
      { ...match, reason: "Another explanation of the same passage." },
    ]);
    const result = await pipeline().run(
      [new File(["content"], "report.txt")],
      ontology,
    );

    expect(result.framework.dimensions[0].categories[0].matches).toHaveLength(
      3,
    );
    expect(result.diagnostics[0].rejected).toEqual(
      questions.map((question) => ({
        question,
        reason: "Duplicate quoted passage for this question.",
      })),
    );
  });
});
