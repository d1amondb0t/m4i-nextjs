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
  return { chunk: chunk(), score: 0.91, denseScore: 0.91, sparseScore: null };
}

const questions = ["Was the policy adopted?", "Did the work influence policy?", "Who benefited?"];
const ontology = {
  dimensions: [{
    id: "political",
    name: "Political",
    definition: "Policy and governance change.",
    categories: [{
      id: "advocacy",
      name: "Advocacy & policy influence",
      definition: "Influence on policy and decision-makers.",
      questions,
    }],
  }],
};

const match = {
  explicitness: "explicit" as const,
  reason: "The report states that the recommendations were adopted.",
  evidence: [{ chunkId: "chunk-1", quote: "ministry adopted three policy recommendations" }],
};

describe("HierarchyPipeline", () => {
  let dependencies: Required<HierarchyPipelineDependencies>;

  beforeEach(() => {
    dependencies = {
      chunker: { chunkDocuments: vi.fn(async () => [chunk()]) },
      embedder: { embed: vi.fn(async () => [[0.1, 0.2]]) },
      store: { upsert: vi.fn(async () => undefined) },
      retriever: { retrieve: vi.fn(async () => [searchResult()]) },
      analyzer: { match: vi.fn(async () => match) },
    };
  });

  function pipeline() {
    return new HierarchyPipeline(
      DEFAULT_RAG_PIPELINE_CONFIGURATION,
      DEFAULT_HIERARCHY_CONFIGURATION,
      dependencies,
    );
  }

  it("matches every supplied question, preserving explicit and implicit support", async () => {
    vi.mocked(dependencies.analyzer.match)
      .mockResolvedValueOnce(match)
      .mockResolvedValueOnce({ ...match, explicitness: "implicit", reason: "Adoption implies policy influence." })
      .mockResolvedValueOnce(null);

    const result = await pipeline().run([new File(["content"], "report.txt")], ontology);
    const category = result.framework.dimensions[0].categories[0];

    expect(dependencies.chunker.chunkDocuments).toHaveBeenCalledTimes(1);
    expect(dependencies.store.upsert).toHaveBeenCalledTimes(1);
    expect(dependencies.retriever.retrieve).toHaveBeenCalledTimes(3);
    for (const question of questions) {
      expect(dependencies.retriever.retrieve).toHaveBeenCalledWith(
        expect.stringContaining(`Question: ${question}`), ["document-1"],
      );
      expect(dependencies.analyzer.match).toHaveBeenCalledWith(
        expect.objectContaining({ id: "advocacy" }), question, [searchResult()],
      );
    }
    expect(category.questions).toEqual(questions);
    expect(category.matches.map(({ question, explicitness }) => ({ question, explicitness })))
      .toEqual([
        { question: questions[0], explicitness: "explicit" },
        { question: questions[1], explicitness: "implicit" },
      ]);
    expect(category.matches[0].evidence).toMatchObject([{ source: "report.txt", page: 4, retrievalScore: 0.91 }]);
    expect(result.diagnostics[0]).toMatchObject({ retrievedChunks: 1, matchedQuestions: 2, rejected: [] });
  });

  it("skips the model and preserves empty categories when retrieval is below the cutoff", async () => {
    vi.mocked(dependencies.retriever.retrieve).mockResolvedValue([
      { ...searchResult(), score: 0.2, denseScore: 0.2 },
    ]);
    const result = await pipeline().run([new File(["content"], "report.txt")], ontology);

    expect(dependencies.analyzer.match).not.toHaveBeenCalled();
    expect(result.framework.dimensions[0].categories[0].matches).toEqual([]);
    expect(result.diagnostics[0].retrievedChunks).toBe(0);
  });

  it.each([
    { chunkId: "chunk-1", quote: "invented evidence" },
    { chunkId: "unknown-chunk", quote: "ministry adopted three policy recommendations" },
  ])("rejects ungrounded evidence: $chunkId / $quote", async (evidence) => {
    vi.mocked(dependencies.analyzer.match).mockResolvedValue({ ...match, evidence: [evidence] });
    const result = await pipeline().run([new File(["content"], "report.txt")], ontology);

    expect(result.framework.dimensions[0].categories[0].matches).toEqual([]);
    expect(result.diagnostics[0].rejected.map(({ question }) => question)).toEqual(questions);
  });

  it("preserves shared evidence matches across categories and dimensions", async () => {
    const sharedOntology = {
      dimensions: ["one", "two"].map((id) => ({
        ...ontology.dimensions[0], id,
        categories: [{ ...ontology.dimensions[0].categories[0], id: `category-${id}` }],
      })),
    };
    const result = await pipeline().run([new File(["content"], "report.txt")], sharedOntology);

    expect(dependencies.analyzer.match).toHaveBeenCalledTimes(6);
    expect(result.framework.dimensions.map(({ categories }) => categories[0].matches.length))
      .toEqual([3, 3]);
    expect(result.diagnostics.map(({ matchedQuestions }) => matchedQuestions)).toEqual([3, 3]);
  });
});
