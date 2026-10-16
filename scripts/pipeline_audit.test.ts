/**
 * Run representative PDFs through the application's real ingestion and hierarchy
 * retrieval path into a separate Qdrant collection, then read the points back.
 *
 * Collection: AUDIT_COLLECTION (default "pipeline_audit"); it is recreated on each run.
 * Output: calibration/results/pipeline-audit/app_path.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Ollama } from "ollama";
import { QdrantClient } from "@qdrant/js-client-rest";
import { expect, it } from "vitest";

import { DocumentChunker } from "../app/server/rag/chunking/chunk-documents";
import { OllamaEmbedder } from "../app/server/rag/embeddings/ollama-embedder";
import {
  buildCategoryQuery,
  parseFrameworkOntology,
} from "../app/server/rag/hierarchy/hierarchy-helper";
import { DEFAULT_RAG_PIPELINE_CONFIGURATION } from "../app/server/rag/pipeline/rag-pipeline-helper";
import { Retriever } from "../app/server/rag/retrieval/retrieval";
import { pointId } from "../app/server/rag/storage/storage-helper";
import { QdrantStore } from "../app/server/rag/storage/vector-storage";
import { DEFAULT_HIERARCHY_CONFIGURATION } from "../types/hierarchy-types";
import { DEFAULT_RERANKING_CONFIGURATION } from "../types/retrieval-types";

const root = path.resolve(import.meta.dirname, "..");
const collection = process.env.AUDIT_COLLECTION || "pipeline_audit";
const documents = (
  process.env.AUDIT_DOCUMENTS ||
  "education/education-77.pdf,environmental/environmental-72.pdf,political/political-74.pdf,economic/economic-27.pdf,humanitarian_rights/humanitarian_rights-40.pdf"
).split(",");

it("indexes audit documents and retrieves through the hierarchy path", async () => {
  const config = DEFAULT_RAG_PIPELINE_CONFIGURATION;
  const ontology = parseFrameworkOntology(
    JSON.parse(await readFile(path.join(root, "ontology.json"), "utf8")),
  );
  const client = new QdrantClient(config.storage);
  const store = new QdrantStore(config.storage, collection, client);
  const embedder = new OllamaEmbedder(
    config.embeddingModel,
    config.embeddingBatchSize,
    config.queryPrefix,
    new Ollama(),
  );
  const chunker = new DocumentChunker(config.chunking);
  const report: Record<string, unknown>[] = [];
  let recreated = false;

  for (const relative of documents) {
    const [dimensionId, name] = relative.split("/");
    const bytes = await readFile(
      path.join(root, "dataset", dimensionId, "raw", name),
    );
    const file = new File([bytes], name, { type: "application/pdf" });
    const chunks = await chunker.chunkDocuments([file]);
    const vectors = await embedder.embed(chunks.map((chunk) => chunk.text));
    if (!recreated) {
      await store.ensureCollection(vectors[0].length, true);
      recreated = true;
    }
    await store.upsert(chunks, vectors);

    // Read back what Qdrant stored for this document.
    const stored = await client.retrieve(collection, {
      ids: chunks.map(pointId),
      with_payload: true,
      with_vector: true,
    });
    const byId = new Map(stored.map((point) => [String(point.id), point]));
    let textMismatches = 0;
    let emptySparse = 0;
    const sparseSizes: number[] = [];
    for (const chunk of chunks) {
      const point = byId.get(pointId(chunk));
      if (!point || (point.payload as { text?: string }).text !== chunk.text)
        textMismatches += 1;
      const sparse = (
        point?.vector as { sparse?: { indices: number[] } } | undefined
      )?.sparse;
      const size = sparse?.indices.length ?? 0;
      sparseSizes.push(size);
      if (size === 0) emptySparse += 1;
    }
    sparseSizes.sort((left, right) => left - right);

    const scope = {
      documentIds: [chunks[0].documentId],
      indexFingerprints: [chunks[0].metadata.indexFingerprint],
    };
    const reranking = { ...DEFAULT_RERANKING_CONFIGURATION, enabled: true };
    const hierarchyRetriever = new Retriever(
      store,
      embedder,
      {
        ...config.retrieval,
        topK: DEFAULT_HIERARCHY_CONFIGURATION.topKPerQuery,
      },
      reranking,
    );
    const denseRetriever = new Retriever(store, embedder, {
      ...config.retrieval,
      topK: DEFAULT_HIERARCHY_CONFIGURATION.topKPerQuery,
    });
    const probes = [
      ["political", "advocacy_policy_influence"],
      [
        dimensionId,
        ontology.dimensions.find((d) => d.id === dimensionId)!.categories[0].id,
      ],
    ];
    const retrievals = [];
    for (const [dimensionKey, categoryKey] of probes) {
      const dimension = ontology.dimensions.find((d) => d.id === dimensionKey)!;
      const category = dimension.categories.find((c) => c.id === categoryKey)!;
      const question = category.questions[0];
      const query = buildCategoryQuery(dimension, category, question);
      const summarize = (results: Awaited<ReturnType<Retriever["retrieve"]>>) =>
        results.map((result) => ({
          score: Number(result.score.toFixed(4)),
          denseScore:
            result.denseScore === null
              ? null
              : Number(result.denseScore.toFixed(4)),
          page: result.chunk.page,
          words: result.chunk.metadata.wordCount,
          block: result.chunk.metadata.blockType,
          text: result.chunk.text.slice(0, 300),
        }));
      const passed = (results: Awaited<ReturnType<Retriever["retrieve"]>>) =>
        results.filter(
          (result) =>
            result.score >=
            DEFAULT_HIERARCHY_CONFIGURATION.minimumRetrievalScore,
        ).length;
      const reranked = await hierarchyRetriever.retrieve(query, scope);
      // Same path with the bare question instead of the composite category query.
      const bare = await hierarchyRetriever.retrieve(question, scope);
      retrievals.push({
        category: categoryKey,
        question,
        queryWords: query.split(/\s+/).length,
        dense: summarize(await denseRetriever.retrieve(query, scope)),
        reranked: summarize(reranked),
        passedThreshold: passed(reranked),
        bareQuestionReranked: summarize(bare),
        bareQuestionPassedThreshold: passed(bare),
      });
    }

    report.push({
      document: relative,
      chunks: chunks.length,
      storedPoints: stored.length,
      textMismatches,
      emptySparse,
      sparseTermsMedian: sparseSizes[Math.floor(sparseSizes.length / 2)],
      vectorSize: vectors[0].length,
      retrievals,
    });
    expect(stored).toHaveLength(chunks.length);
  }

  const output = path.join(root, "calibration", "results", "pipeline-audit");
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, "app_path.json"),
    JSON.stringify(
      { collection, embeddingModel: config.embeddingModel, report },
      null,
      2,
    ) + "\n",
  );
});
