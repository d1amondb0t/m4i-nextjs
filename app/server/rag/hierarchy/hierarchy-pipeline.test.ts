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

function searchResult(): SearchResult {
  return {
    chunk: chunk(),
    score: 0.91,
    denseScore: 0.91,
    sparseScore: null,
  };
}

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
        },
      ],
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
      retriever: { retrieve: vi.fn(async () => [searchResult()]) },
      analyzer: {
        extract: vi.fn(async () => [
          {
            id: "outcome-1",
            kind: "outcome" as const,
            text: "Policy recommendations are adopted",
            explicitness: "explicit" as const,
            evidence: [
              {
                chunkId: "chunk-1",
                quote: "ministry adopted three policy recommendations",
              },
            ],
          },
          {
            id: "indicator-1",
            kind: "indicator" as const,
            text: "Number of policy recommendations adopted",
            explicitness: "derived" as const,
            evidence: [
              {
                chunkId: "chunk-1",
                quote: "three policy recommendations",
              },
            ],
          },
          {
            id: "invented-1",
            kind: "outcome" as const,
            text: "All recommendations are adopted",
            explicitness: "explicit" as const,
            evidence: [{ chunkId: "chunk-1", quote: "all recommendations" }],
          },
        ]),
        validate: vi.fn(async () => [
          {
            candidateId: "outcome-1",
            categoryFit: 0.95,
            typeFit: 0.92,
            evidenceSupport: 0.96,
            specificity: 0.8,
            reason: "Directly supported.",
          },
          {
            candidateId: "indicator-1",
            categoryFit: 0.9,
            typeFit: 0.4,
            evidenceSupport: 0.9,
            specificity: 0.9,
            reason: "The evidence is an output count.",
          },
        ]),
      },
    };
  });

  it("retrieves by leaf and type, grounds citations, validates, and abstains below threshold", async () => {
    const pipeline = new HierarchyPipeline(
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
      DEFAULT_HIERARCHY_CONFIGURATION,
      dependencies,
    );
    const result = await pipeline.run([new File(["content"], "report.txt")], ontology);
    const category = result.framework.dimensions[0].categories[0];

    expect(dependencies.retriever.retrieve).toHaveBeenCalledTimes(2);
    expect(dependencies.retriever.retrieve).toHaveBeenCalledWith(
      expect.any(String),
      ["document-1"],
    );
    expect(vi.mocked(dependencies.retriever.retrieve).mock.calls[0][0]).toContain(
      "achieved or intended change",
    );
    expect(vi.mocked(dependencies.retriever.retrieve).mock.calls[1][0]).toContain(
      "observable, specific measure",
    );
    expect(dependencies.analyzer.validate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "advocacy" }),
      expect.arrayContaining([
        expect.objectContaining({ id: "outcome-1" }),
        expect.objectContaining({ id: "indicator-1" }),
      ]),
      expect.any(Array),
    );
    expect(
      vi.mocked(dependencies.analyzer.validate).mock.calls[0][1].map(
        (candidate) => candidate.id,
      ),
    ).not.toContain("invented-1");
    expect(category.outcomes).toHaveLength(1);
    expect(category.outcomes[0]).toMatchObject({
      text: "Policy recommendations are adopted",
      evidence: [
        {
          source: "report.txt",
          page: 4,
          retrievalScore: 0.91,
        },
      ],
    });
    expect(category.indicators).toEqual([]);
    expect(result.diagnostics[0].rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: "invented-1" }),
        expect.objectContaining({ candidateId: "indicator-1" }),
      ]),
    );
  });

  it("does not call either model stage when retrieval is below threshold", async () => {
    vi.mocked(dependencies.retriever.retrieve).mockResolvedValue([
      { ...searchResult(), score: 0.2, denseScore: 0.2 },
    ]);
    const pipeline = new HierarchyPipeline(
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
      DEFAULT_HIERARCHY_CONFIGURATION,
      dependencies,
    );

    const result = await pipeline.run([new File(["content"], "report.txt")], ontology);

    expect(dependencies.analyzer.extract).not.toHaveBeenCalled();
    expect(dependencies.analyzer.validate).not.toHaveBeenCalled();
    expect(result.framework.dimensions[0].categories[0].outcomes).toEqual([]);
    expect(result.diagnostics[0].retrievedChunks).toBe(0);
  });

  it("assigns an exact cross-category duplicate to the better-fitting category", async () => {
    const duplicateOntology = {
      dimensions: [
        {
          ...ontology.dimensions[0],
          categories: [
            {
              id: "category-a",
              name: "Category A",
              definition: "A broad category.",
            },
            {
              id: "category-b",
              name: "Category B",
              definition: "A more specific category.",
            },
          ],
        },
      ],
    };
    vi.mocked(dependencies.analyzer.extract).mockResolvedValue([
      {
        id: "shared-outcome",
        kind: "outcome",
        text: "Policy recommendations are adopted",
        explicitness: "explicit",
        evidence: [
          {
            chunkId: "chunk-1",
            quote: "ministry adopted three policy recommendations",
          },
        ],
      },
    ]);
    vi.mocked(dependencies.analyzer.validate).mockImplementation(
      async (category) => [
        {
          candidateId: "shared-outcome",
          categoryFit: category.id === "category-b" ? 0.95 : 0.8,
          typeFit: 0.95,
          evidenceSupport: 0.95,
          specificity: 0.9,
          reason: "Supported.",
        },
      ],
    );
    const pipeline = new HierarchyPipeline(
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
      DEFAULT_HIERARCHY_CONFIGURATION,
      dependencies,
    );

    const result = await pipeline.run(
      [new File(["content"], "report.txt")],
      duplicateOntology,
    );
    const [categoryA, categoryB] = result.framework.dimensions[0].categories;

    expect(categoryA.outcomes).toEqual([]);
    expect(categoryB.outcomes).toHaveLength(1);
    expect(result.diagnostics[0].rejected).toContainEqual(
      expect.objectContaining({
        candidateId: "shared-outcome",
        reason: 'Assigned to the better-fitting category "Category B".',
      }),
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.acceptedCandidates)).toEqual([
      0,
      1,
    ]);
  });
});
